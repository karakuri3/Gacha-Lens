import { officialDatabaseColumns } from "../domain/official-apply-contract.js";
import { canonicalOfficialUrl } from "../domain/official-phase-a3.js";

const VARIANT_COLUMNS = officialDatabaseColumns("variants");
const INSERT_BATCH_SIZE = 100;

export async function executeOfficialPhaseA3VariantTransaction({ client, plan } = {}) {
  if (!client || typeof client.query !== "function") throw phaseA3Error("phase_a3_postgres_client_missing");
  if (!plan || !Array.isArray(plan.targets) || !Array.isArray(plan.variant_rows)) {
    throw phaseA3Error("phase_a3_plan_invalid");
  }

  const seriesIds = plan.targets.map((target) => target.series_id);
  const variantIds = plan.variant_rows.map((row) => row.id);
  let transactionOpen = false;
  let commitAttempted = false;
  let inserted = 0;

  try {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '120s'");
    await client.query("LOCK TABLE public.variants IN SHARE ROW EXCLUSIVE MODE");

    const seriesResult = await client.query(
      "SELECT id, official_url FROM public.series WHERE id = ANY($1::text[]) FOR SHARE",
      [seriesIds],
    );
    if (!Array.isArray(seriesResult.rows) || seriesResult.rows.length !== seriesIds.length) {
      throw phaseA3Error("phase_a3_target_series_missing");
    }

    const expectedUrls = new Map(plan.targets.map((target) => [target.series_id, canonicalOfficialUrl(target.official_url)]));
    for (const row of seriesResult.rows) {
      if (canonicalOfficialUrl(row.official_url) !== expectedUrls.get(row.id)) {
        throw phaseA3Error("phase_a3_target_series_drift");
      }
    }

    const existingReal = await client.query(
      "SELECT id, series_id FROM public.variants WHERE series_id = ANY($1::text[]) AND (variant_type IS NULL OR variant_type <> 'provisional') LIMIT 1",
      [seriesIds],
    );
    if (existingReal.rows?.length) throw phaseA3Error("phase_a3_target_already_detailed");

    const collisions = await client.query(
      "SELECT id FROM public.variants WHERE id = ANY($1::text[]) LIMIT 1",
      [variantIds],
    );
    if (collisions.rows?.length) throw phaseA3Error("phase_a3_variant_identity_collision");

    for (let index = 0; index < plan.variant_rows.length; index += INSERT_BATCH_SIZE) {
      const batch = plan.variant_rows.slice(index, index + INSERT_BATCH_SIZE);
      inserted += await insertVariantBatch(client, batch);
    }

    commitAttempted = true;
    await client.query("COMMIT");
    transactionOpen = false;
    return {
      state: "committed",
      inserted_variants: inserted,
      database_writes: inserted,
      rollback_attempted: false,
      rollback_verified: false,
      reason_code: null,
    };
  } catch (error) {
    if (commitAttempted) {
      return {
        state: "commit_outcome_unknown",
        inserted_variants: inserted,
        database_writes: inserted,
        rollback_attempted: false,
        rollback_verified: false,
        reason_code: error?.reason_code || "phase_a3_commit_outcome_unknown",
      };
    }

    let rollbackVerified = false;
    if (transactionOpen) {
      try {
        await client.query("ROLLBACK");
        rollbackVerified = true;
      } catch {
        rollbackVerified = false;
      }
    }
    return {
      state: "rolled_back",
      inserted_variants: inserted,
      database_writes: 0,
      rollback_attempted: transactionOpen,
      rollback_verified: rollbackVerified,
      reason_code: error?.reason_code || "phase_a3_transaction_failed",
    };
  }
}

async function insertVariantBatch(client, rows) {
  if (!rows.length) return 0;
  const values = [];
  const tuples = rows.map((row, rowIndex) => {
    const placeholders = VARIANT_COLUMNS.map((column, columnIndex) => {
      values.push(row[column]);
      return "$" + (rowIndex * VARIANT_COLUMNS.length + columnIndex + 1);
    });
    return "(" + placeholders.join(", ") + ")";
  });
  const result = await client.query(
    "INSERT INTO public.variants (" + VARIANT_COLUMNS.join(", ") + ") VALUES " + tuples.join(", "),
    values,
  );
  if (result.rowCount !== rows.length) throw phaseA3Error("phase_a3_variant_insert_count_mismatch");
  return result.rowCount;
}

function phaseA3Error(reasonCode) {
  const error = new Error(reasonCode);
  error.reason_code = reasonCode;
  return error;
}
