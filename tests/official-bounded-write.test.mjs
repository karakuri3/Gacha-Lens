import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  officialCanonicalDigest,
  toOfficialDatabaseRow,
} from "../lib/domain/official-apply-contract.js";
import {
  authorizeOfficialBoundedWrite,
  createOfficialMemoryTransactionAdapter,
  executeOfficialBoundedTransaction,
  findOfficialBoundedLeaks,
  requireOfficialDatabaseUrl,
  selectOfficialBoundedCanary,
} from "../lib/domain/official-bounded-write.js";
import { buildOfficialReadOnlyAudit } from "../lib/domain/official-read-only-audit.js";
import { createOfficialPostgresTransactionAdapter } from "../lib/server/official-bounded-postgres.js";

const HEAD_SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);
const AUDIT_RUN_ID = "123456789";
const writerWorkflow = fs.readFileSync(".github/workflows/gacha-official-bounded-write.yml", "utf8");
const legacyWorkflow = fs.readFileSync(".github/workflows/gacha-ingestion.yml", "utf8");
const marketWorkflow = fs.readFileSync(".github/workflows/gacha-market-bounded-auto.yml", "utf8");
const writerScript = fs.readFileSync("scripts/official-bounded-write.mjs", "utf8");

test("valid schema v3 artifact deterministically selects one safe series", () => {
  const { report } = artifactFixture();
  const selection = selectOfficialBoundedCanary(report);
  assert.equal(report.schema_version, 3);
  assert.equal(selection.ok, true);
  assert.equal(selection.candidate.series_id, "gashapon-4570000000003000");
  assert.equal(selection.candidate.variant_count, 2);
});

test("series apply contract preserves official franchise", () => {
  const { report, record } = artifactFixture();
  const values = report.plan.candidates[0].apply_contract.series.values;

  assert.equal(values.franchise, record.franchise);
  assert.equal(values.franchise, "監査作品");
});

test("writer rejects schema v1 and v2 artifacts", () => {
  for (const schemaVersion of [1, 2]) {
    const { report } = artifactFixture();
    assert.throws(() => authorize({ ...report, schema_version: schemaVersion }), /schema is invalid/);
  }
});

test("writer rejects a tampered artifact digest", () => {
  const { report } = artifactFixture();
  report.plan.candidates[0].series_name = "tampered";
  assert.throws(() => authorize(report), /digest does not match/);
});

test("writer rejects artifact head SHA drift", () => {
  const { report } = artifactFixture();
  assert.throws(() => authorize(report, { headSha: OTHER_SHA, originMainSha: OTHER_SHA }), /main_sha_mismatch/);
});

test("writer rejects approval SHA mismatch", () => {
  const { report } = artifactFixture();
  assert.throws(() => authorize(report, {
    approval: `APPROVE_OFFICIAL_BOUNDED:${OTHER_SHA}:${report.canonical_digest}`,
  }), /approval_mismatch/);
});

test("writer rejects approval digest mismatch", () => {
  const { report } = artifactFixture();
  assert.throws(() => authorize(report, {
    approval: `APPROVE_OFFICIAL_BOUNDED:${HEAD_SHA}:sha256:${"c".repeat(64)}`,
  }), /approval_mismatch/);
});

test("writer rejects an audit that reports database writes", () => {
  const { report } = artifactFixture();
  report.database.writes = 1;
  assert.throws(() => authorize(report), /contains database writes/);
});

test("writer rejects delete and cleanup plans", () => {
  const deletion = artifactFixture().report;
  deletion.plan.would_delete.series = 1;
  assert.throws(() => authorize(deletion), /cleanup or delete/);
  const cleanup = artifactFixture().report;
  cleanup.plan.cleanup_operations = 1;
  assert.throws(() => authorize(cleanup), /cleanup or delete/);
});

test("writer rejects import issue writes", () => {
  const { report } = artifactFixture();
  report.plan.would_insert.import_issues = 1;
  reDigestReport(report);
  assert.throws(() => authorize(report), /import_issue_write_rejected/);
});

test("candidate with more than 12 variants is blocked with zero writes", () => {
  const { report } = artifactFixture({ variantCount: 13 });
  assert.deepEqual(selectOfficialBoundedCanary(report), {
    ok: false,
    candidate: null,
    reason_code: "official_bounded_no_safe_candidate",
  });
  assert.throws(() => authorize(report), /no_safe_candidate/);
});

test("precondition drift rolls back before any write", async () => {
  const fixture = artifactFixture({ existing: true, incomingName: "Updated official name" });
  const authorization = authorize(fixture.report);
  const drifted = structuredClone(fixture.catalog);
  drifted.series[0].name = "DB changed after audit";
  const adapter = createOfficialMemoryTransactionAdapter(drifted);
  const result = await executeOfficialBoundedTransaction({ adapter, authorization, workflow: workflowIdentity() });
  assert.equal(result.final_verdict, "OFFICIAL_BOUNDED_WRITE_ROLLED_BACK");
  assert.equal(result.database_writes, 0);
  assert.equal(result.transaction.rollback_verified, true);
  assert.equal(adapter.snapshot().series[0].name, "DB changed after audit");
});

test("precondition digest detects drift in non-write raw metadata without exposing it", async () => {
  const fixture = artifactFixture({ existing: true, incomingName: "Updated official name" });
  fixture.catalog.series[0].raw = { catalog_revision: 1 };
  fixture.report = buildReport(fixture.record, fixture.catalog);
  const drifted = structuredClone(fixture.catalog);
  drifted.series[0].raw.catalog_revision = 2;
  const result = await executeOfficialBoundedTransaction({
    adapter: createOfficialMemoryTransactionAdapter(drifted),
    authorization: authorize(fixture.report),
    workflow: workflowIdentity(),
  });
  assert.equal(result.final_verdict, "OFFICIAL_BOUNDED_WRITE_ROLLED_BACK");
  assert.equal(result.reason_code, "official_bounded_precondition_drift");
  assert.equal(result.database_writes, 0);
  assert.doesNotMatch(JSON.stringify(fixture.report), /catalog_revision/);
});

test("insert target that already exists rolls back", async () => {
  const fixture = artifactFixture();
  const authorization = authorize(fixture.report);
  const adapter = createOfficialMemoryTransactionAdapter({
    series: [{ ...fixture.report.plan.candidates[0].apply_contract.series.values, name: "collision" }],
  });
  const result = await executeOfficialBoundedTransaction({ adapter, authorization, workflow: workflowIdentity() });
  assert.equal(result.final_verdict, "OFFICIAL_BOUNDED_WRITE_ROLLED_BACK");
  assert.equal(result.reason_code, "official_bounded_insert_identity_exists");
  assert.equal(result.database_writes, 0);
});

test("update target digest mismatch rolls back", async () => {
  const fixture = artifactFixture({ existing: true, incomingName: "Updated official name" });
  const authorization = authorize(fixture.report);
  const drifted = structuredClone(fixture.catalog);
  drifted.series[0].price = 999;
  const result = await executeOfficialBoundedTransaction({
    adapter: createOfficialMemoryTransactionAdapter(drifted),
    authorization,
    workflow: workflowIdentity(),
  });
  assert.equal(result.final_verdict, "OFFICIAL_BOUNDED_WRITE_ROLLED_BACK");
  assert.equal(result.database_writes, 0);
});

test("rerelease payload cannot overwrite canonical release fields", () => {
  const { report } = rereleaseFixture();
  const candidate = report.plan.candidates[0];
  candidate.apply_contract.series.values.release_date = "2026-08-24";
  candidate.apply_contract.series.values.release_month = "8月";
  candidate.apply_contract.series.values.release_week = "第4週";
  reDigestContract(candidate.apply_contract);
  reDigestReport(report);
  assert.throws(() => authorize(report), /no_safe_candidate/);
});

test("valid single series and variants commit as one simulated transaction", async () => {
  const fixture = artifactFixture();
  const result = await executeOfficialBoundedTransaction({
    adapter: createOfficialMemoryTransactionAdapter(),
    authorization: authorize(fixture.report),
    workflow: workflowIdentity(),
  });
  assert.equal(result.final_verdict, "OFFICIAL_BOUNDED_WRITE_COMMITTED");
  assert.equal(result.database_writes, 3);
  assert.deepEqual(result.operations, { series: 1, variants: 2, restock_events: 0 });
  assert.deepEqual(result.committed_operations, {
    series: { insert: 1, update: 0, none: 0 },
    variants: { insert: 2, update: 0, none: 0 },
    restock_events: { insert: 0, update: 0, none: 0 },
  });
  assert.equal(result.deletes, 0);
  assert.equal(result.cleanup_operations, 0);
});

test("valid series-level rerelease commits one official restock event", async () => {
  const fixture = rereleaseFixture();
  const result = await executeOfficialBoundedTransaction({
    adapter: createOfficialMemoryTransactionAdapter(fixture.catalog),
    authorization: authorize(fixture.report),
    workflow: workflowIdentity(),
  });
  assert.equal(result.final_verdict, "OFFICIAL_BOUNDED_WRITE_COMMITTED");
  assert.deepEqual(result.operations, { series: 0, variants: 0, restock_events: 1 });
  const event = fixture.report.plan.candidates[0].apply_contract.restock_event.values;
  assert.equal(event.series_id, fixture.record.id);
  assert.equal(event.variant_id, null);
  assert.equal(event.matched_variant_id, null);
});

test("mid-transaction failure rolls back without partial state", async () => {
  const fixture = artifactFixture();
  const adapter = createOfficialMemoryTransactionAdapter({}, { failAfterWrites: 1 });
  const result = await executeOfficialBoundedTransaction({
    adapter,
    authorization: authorize(fixture.report),
    workflow: workflowIdentity(),
  });
  assert.equal(result.final_verdict, "OFFICIAL_BOUNDED_WRITE_ROLLED_BACK");
  assert.equal(result.database_writes, 0);
  assert.deepEqual(adapter.snapshot(), { series: [], variants: [], restock_events: [] });
});

test("lost COMMIT acknowledgement is always treated as unknown and never rolled back", async () => {
  const fixture = artifactFixture();
  const base = createOfficialMemoryTransactionAdapter();
  let rollbackCalls = 0;

  const adapter = {
    ...base,
    async commit() {
      await base.commit();
      throw new Error("simulated_lost_commit_ack");
    },
    async rollback() {
      rollbackCalls += 1;
    },
  };

  const result = await executeOfficialBoundedTransaction({
    adapter,
    authorization: authorize(fixture.report),
    workflow: workflowIdentity(),
  });

  assert.equal(
    result.final_verdict,
    "OFFICIAL_BOUNDED_WRITE_COMMIT_OUTCOME_UNKNOWN",
  );
  assert.equal(result.transaction.state, "commit_outcome_unknown");
  assert.equal(result.transaction.rollback_attempted, false);
  assert.equal(result.transaction.rollback_verified, false);
  assert.equal(result.database_writes, 3);
  assert.equal(rollbackCalls, 0);
  assert.equal(adapter.snapshot().series.length, 1);
  assert.equal(adapter.snapshot().variants.length, 2);
});

test("post-commit verification failure remains explicitly committed", async () => {
  const fixture = artifactFixture();
  const base = createOfficialMemoryTransactionAdapter();
  let commitCompleted = false;

  const adapter = {
    ...base,
    async readRow(...args) {
      if (commitCompleted) {
        throw new Error("simulated_post_commit_read_failure");
      }

      return base.readRow(...args);
    },
    async commit() {
      await base.commit();
      commitCompleted = true;
    },
  };

  const result = await executeOfficialBoundedTransaction({
    adapter,
    authorization: authorize(fixture.report),
    workflow: workflowIdentity(),
  });

  assert.equal(
    result.final_verdict,
    "OFFICIAL_BOUNDED_WRITE_COMMITTED_POST_VERIFY_FAILED",
  );
  assert.equal(result.transaction.state, "committed_post_verify_failed");
  assert.equal(result.database_writes, 3);
  assert.equal(adapter.snapshot().series.length, 1);
  assert.equal(adapter.snapshot().variants.length, 2);
});

test("identical deterministic rerelease event remains none and authorizes no write", () => {
  const first = rereleaseFixture();
  const inserted = first.report.plan.candidates[0].apply_contract.restock_event.values;
  const catalog = structuredClone(first.catalog);
  catalog.restock_events = [toOfficialDatabaseRow("restock_events", inserted)];
  const second = rereleaseFixture({ catalogOverride: catalog });
  assert.equal(second.report.plan.candidates[0].apply_contract.restock_event.operation, "none");
  assert.throws(() => authorize(second.report), /no_safe_candidate/);
});

test("SQL injection text remains a parameterized value", async () => {
  const fixture = artifactFixture();
  const operation = structuredClone(fixture.report.plan.candidates[0].apply_contract.series);
  operation.values.name = "x'); DELETE FROM public.series; --";
  const queries = [];
  const client = { query: async (query, values = []) => {
    queries.push({ query, values });
    return { rowCount: 1, rows: [] };
  } };
  const adapter = createOfficialPostgresTransactionAdapter(client);
  await adapter.writeRow("series", "insert", operation.values);
  assert.doesNotMatch(queries[0].query, /DELETE FROM/);
  assert.ok(queries[0].query.includes("$1"));
  assert.ok(queries[0].values.includes(operation.values.name));
});

test("missing or invalid SUPABASE_DB_URL fails before a transaction can start", () => {
  assert.throws(() => requireOfficialDatabaseUrl(""), /database_url_missing/);
  assert.throws(() => requireOfficialDatabaseUrl("https://example.com"), /database_url_invalid/);
  assert.equal(requireOfficialDatabaseUrl("postgresql://user:pass@db.example.com:5432/postgres"), "postgresql://user:pass@db.example.com:5432/postgres");
});

test("writer workflow is workflow_dispatch-only with exact bounded inputs", () => {
  assert.match(writerWorkflow, /workflow_dispatch:/);
  assert.doesNotMatch(writerWorkflow, /\bschedule:|\bpush:|\bpull_request:|\bworkflow_run:|\brepository_dispatch:/);
  assert.match(writerWorkflow, /audit_run_id:/);
  assert.match(writerWorkflow, /audit_digest:/);
  assert.match(writerWorkflow, /approval:/);
  assert.doesNotMatch(writerWorkflow, /mode:|cleanup|migration|db:upsert|\bDELETE\b|TRUNCATE/i);
  assert.match(writerWorkflow, /contents: read/);
  assert.match(writerWorkflow, /actions: read/);

  const executeStep = writerWorkflow.match(
    /- name: Execute transactional bounded official write\r?\n([\s\S]*?)\r?\n      - name: Scan sanitized bounded official result/,
  )?.[1] ?? "";

  assert.match(
    executeStep,
    /git fetch --no-tags origin main --depth=1/,
  );
  assert.match(
    executeStep,
    /final_origin_main_sha="\$\(git rev-parse origin\/main\)"/,
  );
  assert.match(
    executeStep,
    /test "\$final_origin_main_sha" = "\$GITHUB_SHA"/,
  );
  assert.doesNotMatch(
    executeStep,
    /steps\.main_sha\.outputs\.origin_main_sha/,
  );
});

test("SUPABASE_DB_URL is scoped only to the writer execution step", () => {
  const occurrences = writerWorkflow.match(/SUPABASE_DB_URL/g) ?? [];
  const executeStep = writerWorkflow.match(/- name: Execute transactional bounded official write\r?\n([\s\S]*?)\r?\n      - name: Scan sanitized bounded official result/)?.[1] ?? "";
  const jobEnv = writerWorkflow.match(/timeout-minutes: 20\r?\n    env:\r?\n([\s\S]*?)\r?\n    steps:/)?.[1] ?? "";
  assert.equal(occurrences.length, 2);
  assert.doesNotMatch(jobEnv, /SUPABASE_DB_URL/);
  assert.match(executeStep, /SUPABASE_DB_URL: \$\{\{ secrets\.SUPABASE_DB_URL \}\}/);
  assert.doesNotMatch(writerWorkflow.slice(0, writerWorkflow.indexOf("Execute transactional bounded official write")), /SUPABASE_DB_URL/);
});

test("writer binds exactly one named audit artifact and emits a run-scoped result artifact", () => {
  assert.match(writerWorkflow, /official-read-only-audit-\$\{\{ inputs\.audit_run_id \}\}/);
  assert.match(writerWorkflow, /run-id: \$\{\{ inputs\.audit_run_id \}\}/);
  assert.match(writerWorkflow, /official-bounded-write-result-\$\{\{ github\.run_id \}\}/);
  assert.match(writerScript, /total_count\) !== 1/);
  assert.match(writerScript, /artifact\.expired === true/);
  assert.match(writerScript, /writeResultFiles\("official-bounded-result", blocked\)/);
});

test("writer and result artifacts expose no arbitrary SQL or credential payload", () => {
  assert.doesNotMatch(writerScript, /set -x|console\.log\([^)]*SUPABASE_DB_URL|\.env\.local/);
  assert.doesNotMatch(writerScript, /DELETE FROM|TRUNCATE|ALTER TABLE|DROP TABLE/i);
  assert.deepEqual(findOfficialBoundedLeaks([
    { name: "result.json", text: JSON.stringify({ final_verdict: "OFFICIAL_BOUNDED_WRITE_READY" }) },
  ], ["postgresql://user:secret@example.com/db"]), []);
  assert.deepEqual(findOfficialBoundedLeaks([
    { name: "result.json", text: JSON.stringify({ password: "secret" }) },
  ]), ["result.json:forbidden_fields"]);
});

test("legacy and market workflows remain isolated from the official writer", () => {
  assert.match(legacyWorkflow, /name: Gacha ingestion/);
  assert.doesNotMatch(legacyWorkflow, /official-bounded-write|SUPABASE_DB_URL/);
  assert.match(marketWorkflow, /name: Gacha Market Bounded Automatic Production/);
  assert.doesNotMatch(marketWorkflow, /official-bounded-write|APPROVE_OFFICIAL_BOUNDED/);
});

function artifactFixture({ variantCount = 2, existing = false, incomingName = null } = {}) {
  const record = officialRecord({ variantCount, name: incomingName || "監査公式シリーズ" });
  const catalog = existing ? existingCatalog(record, { name: incomingName ? "旧公式シリーズ名" : record.name }) : {
    series: [], variants: [], restock_events: [],
  };
  return { record, catalog, report: buildReport(record, catalog) };
}

function rereleaseFixture({ catalogOverride = null } = {}) {
  const record = officialRecord({ rerelease: true });
  const catalog = catalogOverride || existingCatalog(record, {
    release_date: "2020-09-17",
    release_month: "9月",
    release_week: "第3週",
  });
  return { record, catalog, report: buildReport(record, catalog) };
}

function buildReport(record, catalog) {
  const counts = { series: catalog.series.length, variants: catalog.variants.length, restock_events: catalog.restock_events.length, import_issues: 0, review_required: 0, provisional_variants: 0 };
  return buildOfficialReadOnlyAudit({
    snapshot: {
      fetched_at: "2026-08-16T00:00:00.000Z",
      sources: [source("gashapon_schedule", 1), source("gashapon_products", 0), source("takaratomy_search", 1)],
      discovery_records: [record],
      formal_records: [record],
      issue_codes: [],
    },
    catalog,
    databaseBefore: counts,
    databaseAfter: { ...counts },
    workflow: { run_id: AUDIT_RUN_ID, head_sha: HEAD_SHA, event_name: "workflow_dispatch" },
  });
}

function officialRecord({ variantCount = 2, name = "監査公式シリーズ", rerelease = false } = {}) {
  const id = "gashapon-4570000000003000";
  const canonical = rerelease
    ? { release_date: "2020-09-17", release_month: "9月", release_week: "第3週" }
    : { release_date: "2026-08-24", release_month: "8月", release_week: "第4週" };
  return {
    id,
    slug: id,
    name,
    franchise: "監査作品",
    brand: "バンダイ",
    category: "ガシャポン",
    ...canonical,
    price: 400,
    image_url: "https://example.invalid/official.jpg",
    official_url: "https://gashapon.jp/products/detail.php?jan_code=4570000000003000",
    source_type: "official_site",
    review_required: false,
    released: true,
    raw: rerelease ? {
      is_restock: true,
      rerelease: {
        is_rerelease: true,
        original_release: { year: 2020, month: 9, release_date: "2020-09-17", release_month: "9月", release_week: "第3週", precision: "day" },
        current_schedule: { year: 2026, release_date: "2026-08-24", release_month: "8月", release_week: "第4週", precision: "day" },
        evidence_source: "gashapon_detail_note",
        evidence_text: "この商品は再販商品です。2020年9月に発売した商品と同じものです。",
        source_parser: "gashapon_detail_page",
      },
    } : {},
    variants: Array.from({ length: variantCount }, (_, index) => ({
      id: `${id}-${index + 1}`,
      slug: `${id}-${index + 1}`,
      name: `単品${index + 1}`,
      image_url: `https://example.invalid/variant-${index + 1}.jpg`,
      variant_type: "normal",
      review_required: false,
    })),
  };
}

function existingCatalog(record, overrides = {}) {
  const series = {
    id: record.id,
    slug: record.slug,
    name: record.name,
    franchise: record.franchise,
    brand: record.brand,
    category: record.category,
    release_month: record.release_month,
    release_week: record.release_week,
    release_date: record.release_date,
    price: record.price,
    image_url: record.image_url,
    official_url: record.official_url,
    is_released: true,
    source_type: "official_site",
    ...overrides,
  };
  const variants = record.variants.map((variant) => ({
    id: variant.id,
    slug: variant.slug,
    series_id: record.id,
    name: variant.name,
    variant_type: "normal",
    image: variant.image_url,
    released: true,
    price: record.price,
    brand: record.brand,
    release_month: series.release_month,
    release_week: series.release_week,
    release_date: series.release_date,
    official_url: record.official_url,
    source_type: "official_site",
    review_required: false,
  }));
  return { series: [series], variants, restock_events: [] };
}

function source(name, records) {
  return {
    source: name,
    provider: name.startsWith("takaratomy") ? "takaratomy_arts" : "gashapon",
    url: name.startsWith("takaratomy")
      ? "https://www.takaratomy-arts.co.jp/items/gacha/search.html"
      : "https://gashapon.jp/schedule/",
    http_success: true,
    http_status: 200,
    parser_success: true,
    records,
    discovered_urls: 1,
    detail_attempts: name === "gashapon_schedule" ? 1 : 0,
    detail_successes: name === "gashapon_schedule" ? 1 : 0,
    detail_failures: 0,
    formal_lineups: name === "gashapon_schedule" ? 1 : 0,
    zero_lineups: 0,
    issue_codes: [],
    freshness: { state: "current", latest_release_date: "2026-08-24", age_days: 0 },
  };
}

function authorize(report, overrides = {}) {
  return authorizeOfficialBoundedWrite({
    report,
    auditRunId: AUDIT_RUN_ID,
    auditDigest: report.canonical_digest,
    approval: `APPROVE_OFFICIAL_BOUNDED:${HEAD_SHA}:${report.canonical_digest}`,
    headSha: HEAD_SHA,
    originMainSha: HEAD_SHA,
    ...overrides,
  });
}

function workflowIdentity() {
  return { run_id: "999", head_sha: HEAD_SHA };
}

function reDigestContract(contract) {
  const clone = structuredClone(contract);
  delete clone.canonical_digest;
  contract.canonical_digest = officialCanonicalDigest(clone);
}

function reDigestReport(report) {
  const clone = structuredClone(report);
  delete clone.canonical_digest;
  report.canonical_digest = officialCanonicalDigest(clone);
}
