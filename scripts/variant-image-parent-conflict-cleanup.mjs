import { Client } from "pg";
import {
  PARENT_IMAGE_CLEANUP_PRODUCTION_EXPECTATION,
  assertExpectedAfterAudit,
  auditParentImageCleanupRecords,
  buildParentImageCleanupPlan,
  executeParentImageCleanup,
} from "../lib/domain/variant-image-parent-conflict-cleanup.js";

const PROJECT_REF = "vxbrnvfhmzcxehuuzzum";
const BASELINE_MAIN_SHA = "3be94fa2c7636d49da57623796c4751d459496a0";
const [command] = process.argv.slice(2);

if (!["dry-run", "execute", "verify"].includes(command)) {
  fail("expected_dry_run_execute_or_verify");
}

assertOneShotMainIdentity();

const connectionString = requireProductionDatabaseUrl(process.env.SUPABASE_DB_URL);
const client = new Client({
  connectionString,
  application_name: "gacha-variant-parent-image-cleanup",
});

try {
  await client.connect();
  if (command === "dry-run") {
    const result = await runDryRun(client);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (command === "execute") {
    const result = await runExecute(client);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    const result = await runVerify(client);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} finally {
  await client.end().catch(() => {});
}

async function runDryRun(pg) {
  await pg.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await configureTransaction(pg);
    await assertWriteSurface(pg);
    const records = await loadConflictRecords(pg);
    const plan = buildParentImageCleanupPlan(records);
    const report = {
      schema_version: 1,
      mode: "dry-run",
      state: plan.state,
      production_project_ref: PROJECT_REF,
      baseline_main_sha: BASELINE_MAIN_SHA,
      execution_sha: normalizedSha(process.env.GITHUB_SHA),
      audit_input_count: plan.audit.record_count,
      safe_candidate_count: plan.audit.candidate_count,
      candidate_set_sha256: plan.audit.candidate_set_sha256,
      candidate_type_buckets: plan.audit.candidate_type_buckets,
      singleton_ambiguous: plan.audit.rejection_counts?.singleton_ambiguous || 0,
      expected_update_count: plan.expected_write_count,
      batch_size: 200,
      batch_count: Math.ceil(plan.expected_write_count / 200),
      candidate_ids: plan.candidates.map((item) => item.variant_id),
      database_writes: 0,
    };
    await pg.query("ROLLBACK");
    return report;
  } catch (error) {
    await pg.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

async function runExecute(pg) {
  const adapter = createPostgresCleanupAdapter(pg);
  const transactionResult = await executeParentImageCleanup({ adapter, batchSize: 200 });
  const post = await verifyPostState(pg);

  return {
    schema_version: 1,
    mode: "execute",
    production_project_ref: PROJECT_REF,
    baseline_main_sha: BASELINE_MAIN_SHA,
    execution_sha: normalizedSha(process.env.GITHUB_SHA),
    ...transactionResult,
    post_commit_verification: post,
  };
}

async function runVerify(pg) {
  return {
    schema_version: 1,
    mode: "verify",
    production_project_ref: PROJECT_REF,
    baseline_main_sha: BASELINE_MAIN_SHA,
    execution_sha: normalizedSha(process.env.GITHUB_SHA),
    ...(await verifyPostState(pg)),
  };
}

function createPostgresCleanupAdapter(pg) {
  return {
    async begin() {
      await pg.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      await configureTransaction(pg);
    },
    async assertWriteSurface() {
      await assertWriteSurface(pg);
    },
    async readConflictRecords() {
      return loadConflictRecords(pg);
    },
    async cleanBatch(batch) {
      if (!Array.isArray(batch) || !batch.length || batch.length > 500) fail("invalid_cleanup_batch");
      const values = [];
      const placeholders = batch.map((item, index) => {
        const offset = index * 6;
        values.push(
          item.variant_id,
          item.series_id,
          item.expected_image,
          item.expected_parent_image,
          item.variant_type,
          item.expected_sibling_count,
        );
        return `($${offset + 1}::text,$${offset + 2}::text,$${offset + 3}::text,$${offset + 4}::text,$${offset + 5}::text,$${offset + 6}::int)`;
      });

      const query = `
        with expected(variant_id, series_id, expected_image, expected_parent_image, variant_type, sibling_count) as (
          values ${placeholders.join(",")}
        ),
        eligible as (
          select v.id
          from public.variants v
          join expected e
            on e.variant_id = v.id
           and e.series_id = v.series_id
          join public.series s
            on s.id = v.series_id
          where btrim(v.source_type) = 'official_site'
            and v.variant_type = e.variant_type
            and v.image = e.expected_image
            and s.image_url = e.expected_parent_image
            and v.image = s.image_url
            and coalesce(btrim(v.raw->>'image_scope'), '') <> 'variant'
            and v.image ~* '^https?://[^[:space:]]+'
            and s.image_url ~* '^https?://[^[:space:]]+'
            and (
              select count(*)::int
              from public.variants sibling
              where sibling.series_id = v.series_id
            ) = e.sibling_count
            and e.sibling_count > 1
        )
        update public.variants v
        set image = null
        from eligible e
        where v.id = e.id
        returning v.id
      `;

      const result = await pg.query(query, values);
      return result.rows.map((row) => row.id);
    },
    async commit() {
      await pg.query("COMMIT");
    },
    async rollback() {
      await pg.query("ROLLBACK");
    },
  };
}

async function configureTransaction(pg) {
  await pg.query("SET LOCAL lock_timeout = '5s'");
  await pg.query("SET LOCAL statement_timeout = '45s'");
  await pg.query("SET LOCAL idle_in_transaction_session_timeout = '60s'");
}

async function assertWriteSurface(pg) {
  const [columnResult, triggerResult] = await Promise.all([
    pg.query(`
      select is_nullable, is_generated
      from information_schema.columns
      where table_schema='public'
        and table_name='variants'
        and column_name='image'
    `),
    pg.query(`
      select trigger_name
      from information_schema.triggers
      where event_object_schema='public'
        and event_object_table='variants'
        and event_manipulation='UPDATE'
    `),
  ]);

  const imageColumn = columnResult.rows[0];
  if (columnResult.rowCount !== 1 || imageColumn?.is_nullable !== "YES" || imageColumn?.is_generated !== "NEVER") {
    fail("variants_image_contract_drift");
  }
  if (triggerResult.rowCount !== 0) fail("variants_update_trigger_present");
}

async function loadConflictRecords(pg) {
  const result = await pg.query(`
    with sibling_counts as (
      select series_id, count(*)::int as sibling_count
      from public.variants
      group by series_id
    )
    select
      v.id as variant_id,
      v.series_id,
      v.source_type,
      v.variant_type,
      v.image,
      coalesce(v.raw->>'image_scope', '') as image_scope,
      s.id as parent_id,
      s.image_url as parent_image_url,
      s.brand as parent_brand,
      sc.sibling_count
    from public.variants v
    join public.series s on s.id = v.series_id
    join sibling_counts sc on sc.series_id = v.series_id
    where v.image = s.image_url
    order by convert_to(v.id, 'UTF8')
  `);

  return result.rows.map((row) => ({
    variant: {
      id: row.variant_id,
      series_id: row.series_id,
      source_type: row.source_type,
      variant_type: row.variant_type,
      image: row.image,
      image_scope: row.image_scope,
    },
    parent: {
      id: row.parent_id,
      image_url: row.parent_image_url,
      brand: row.parent_brand,
    },
    sibling_count: Number(row.sibling_count),
  }));
}

async function verifyPostState(pg) {
  await pg.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await configureTransaction(pg);
    const records = await loadConflictRecords(pg);
    const audit = auditParentImageCleanupRecords(records);
    assertExpectedAfterAudit(audit, PARENT_IMAGE_CLEANUP_PRODUCTION_EXPECTATION);
    await pg.query("ROLLBACK");
    return {
      safe_candidate_count_after: audit.candidate_count,
      exact_valid_parent_conflicts_after: audit.record_count,
      singleton_ambiguous_after: audit.rejection_counts?.singleton_ambiguous || 0,
      provisional_safe_conflicts_after: audit.candidate_type_buckets.provisional,
      normal_safe_conflicts_after: audit.candidate_type_buckets.normal,
      rare_safe_conflicts_after: audit.candidate_type_buckets.rare,
      secret_safe_conflicts_after: audit.candidate_type_buckets.secret,
    };
  } catch (error) {
    await pg.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

function assertOneShotMainIdentity() {
  if (process.env.GITHUB_EVENT_NAME !== "push") fail("cleanup_event_not_push");
  if (process.env.GITHUB_REF !== "refs/heads/main") fail("cleanup_ref_not_main");
  if (normalizedSha(process.env.GITHUB_EVENT_BEFORE) !== BASELINE_MAIN_SHA) fail("cleanup_baseline_main_mismatch");
  if (!normalizedSha(process.env.GITHUB_SHA)) fail("cleanup_head_sha_invalid");
}

function requireProductionDatabaseUrl(value) {
  const input = String(value || "").trim();
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    fail("database_url_invalid");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) fail("database_url_invalid");
  const identity = `${decodeURIComponent(parsed.username || "")}@${parsed.hostname}`;
  if (!identity.includes(PROJECT_REF)) fail("database_project_ref_mismatch");
  return input;
}

function normalizedSha(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{40}$/.test(normalized) ? normalized : "";
}

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}
