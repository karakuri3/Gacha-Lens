import fs from "node:fs";
import path from "node:path";
import { deleteRowsByIds, fetchRowCount, fetchRows, upsertRows } from "./supabase-rest.mjs";
import { assertSeriesCompleteSetCanaryPrewrite, buildSeriesCompleteSetCanaryRows, persistSeriesCompleteSetCanary, validateSeriesCompleteSetCanaryInvocation } from "../lib/domain/market-series-complete-set-canary.js";

const options = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith("--") && arg.includes("=")).map((arg) => { const [key, ...rest] = arg.slice(2).split("="); return [key, rest.join("=")]; }));
const readiness = JSON.parse(fs.readFileSync(path.resolve(required(options.readiness, "--readiness")), "utf8"));
const candidate = validateSeriesCompleteSetCanaryInvocation({ eventName: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF, expectedMainSha: options["expected-main-sha"], headSha: process.env.GITHUB_SHA, originMainSha: options["origin-main-sha"], readiness, readinessDigest: process.env.SERIES_COMPLETE_SET_CANARY_READINESS_DIGEST, approval: process.env.SERIES_COMPLETE_SET_CANARY_APPROVAL });
const output = path.resolve(options["output-dir"] || "market-series-complete-set-bounded-canary"); fs.mkdirSync(output, { recursive: true });
const rows = buildSeriesCompleteSetCanaryRows({ candidate, readiness, workflow: { run_id: process.env.GITHUB_RUN_ID, run_attempt: process.env.GITHUB_RUN_ATTEMPT, head_sha: process.env.GITHUB_SHA } });
const store = createStore(rows.listingRows[0].id);
const before = await store.fetchCounts();
try {
  await assertSeriesCompleteSetCanaryPrewrite({ rows, sourceUrlRows: await store.fetchRowsBySourceUrl(rows.listingRows[0].source_url) });
  const outcome = await persistSeriesCompleteSetCanary({ rows, store });
  write({ schema_version: 1, status: "succeeded", selected_candidate: rows.candidate, operations: outcome, production_counts_before: before, production_counts_after: await store.fetchCounts(), database_writes: outcome.database_writes });
} catch (error) {
  write({ schema_version: 1, status: "blocked", selected_candidate: rows.candidate, production_counts_before: before, production_counts_after: await safeCounts(store), database_writes: error?.canaryResult?.listing_writes || error?.canaryResult?.observation_writes ? 1 : 0, rollback: error?.canaryResult?.rollback ?? { attempted: false, verified: false }, reason_code: "series_complete_set_canary_failed" });
  throw error;
}

function createStore(approvedListingId) {
  return {
    fetchRowsByIds: (table, ids) => ids.length ? fetchRows(table, { select: "*", pageSize: 2, params: { id: `in.(${ids.map((id) => `\"${String(id).replaceAll('"', '\\"')}\"`).join(",")})`, order: "id.asc" } }) : [],
    fetchRowsBySourceUrl: (sourceUrl) => fetchRows("market_listings", { select: "id,variant_id,matched_variant_id,source_url", pageSize: 2, params: { source_url: `eq.${sourceUrl}`, order: "id.asc" } }),
    fetchConsumedCanaryObservations: (auditRunId, keys) => fetchRows("market_listing_observations", { select: "raw", pageSize: 2, params: { listing_id: `eq.${approvedListingId}`, order: "id.asc" } }).then((rows) => rows.filter((row) => row.raw?.canary_audit_run_id === auditRunId && keys.includes(row.raw?.canary_candidate_key))),
    fetchCounts: async () => { const tables = ["market_listings", "market_listing_observations", "import_issues", "ingestion_runs", "series", "variants", "stock_reports", "restock_events"]; const values = await Promise.all([...tables.map((table) => fetchRowCount(table)), fetchRowCount("market_listings", { review_required: "eq.true" })]); return Object.fromEntries([...tables, "review_required"].map((key, index) => [key, values[index]])); },
    upsertRows: (table, rows) => upsertRows(table, rows, { label: "market-series-complete-set-canary", allowSchemaFallback: false }),
    deleteRowsByIds: (table, ids, options) => deleteRowsByIds(table, ids, options),
    fetchObservationsByListingIds: (ids) => ids.length ? fetchRows("market_listing_observations", { select: "*", pageSize: 2, params: { listing_id: `in.(${ids.map((id) => `\"${String(id).replaceAll('"', '\\"')}\"`).join(",")})`, order: "id.asc" } }) : [],
  };
}
async function safeCounts(store) { try { return await store.fetchCounts(); } catch { return null; } }
function write(result) { fs.writeFileSync(path.join(output, "market-series-complete-set-bounded-canary-result.json"), `${JSON.stringify(result, null, 2)}\n`); }
function required(value, name) { if (!value) throw new Error(`${name} is required.`); return value; }
