import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  P3_SEED_CANARY_CONFIRMATION,
  assertP3SeedCanaryPrewrite,
  buildP3SeedCanaryResult,
  buildP3SeedCanaryRows,
  loadP3SeedCanaryTarget,
  persistP3SeedCanary,
  selectExactP3SeedCanaryCandidate,
  validateP3SeedCanaryInvocation,
} from "../lib/domain/market-p3-seed-canary.js";
import { isNonAuthoritativeManualMarketAudit } from "../lib/domain/manual-market-audit-diagnostic.js";

const root = process.cwd();
const workflow = fs.readFileSync(path.join(root, ".github/workflows/gacha-market-seed-canary.yml"), "utf8");
const target = loadP3SeedCanaryTarget(fs.readFileSync(path.join(root, "config/market-p3-seed-canary-target.json"), "utf8"));
const sha = "a".repeat(40);

function candidate(overrides = {}) { return { candidate_key: "1234567890abcdef", source: { provider: target.provider, listing_id: target.source_listing_id, public_url: target.public_url }, listing: { title: "【白ナス】つながリングチャーム やさいのようせい", price: 650, status: "active", listing_type: "single" }, target: { variant_id: target.variant_id, series_id: target.series_id, search_query: `${target.series_name} ${target.variant_name} ガチャ` }, assessment: { accepted: true, review_required: false, reason: "variant_and_parent_evidence_confirmed", confidence: 0.86 }, checks: { variant_evidence_present: true, parent_series_evidence_present: true, set_signal_detected: false, multiple_variant_candidates: false, explicit_variant_conflict: false, explicit_label_unresolved: false, parent_series_edition_conflict: false }, ...overrides }; }

test("P3 seed canary workflow is dispatch-only and has no arbitrary target inputs", () => {
  assert.match(workflow, /^on:\s*\r?\n\s+workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s+(schedule|push|pull_request|workflow_run|repository_dispatch):/m);
  const inputs = workflow.match(/inputs:([\s\S]*?)\r?\n\r?\njobs:/)?.[1] ?? "";
  assert.match(inputs, /expected_main_sha/); assert.match(inputs, /confirmation/);
  assert.doesNotMatch(inputs, /(variant_id|series_id|listing_id|provider|public_url)/);
});

test("fixed target accepts only the exact active safe White Eggplant listing", () => assert.equal(selectExactP3SeedCanaryCandidate([candidate()], target).candidate_key, "1234567890abcdef"));

for (const [name, change] of [
  ["sold listing", (c) => { c.listing.status = "sold"; }], ["review", (c) => { c.assessment.review_required = true; }], ["wrong variant", (c) => { c.target.variant_id = "other"; }], ["wrong series", (c) => { c.target.series_id = "other"; }], ["wrong provider", (c) => { c.source.provider = "yahoo_shopping"; }], ["wrong listing", (c) => { c.source.listing_id = "other:1"; }], ["URL mismatch", (c) => { c.source.public_url = "https://item.rakuten.co.jp/other/item/"; }], ["set", (c) => { c.checks.set_signal_detected = true; }], ["explicit conflict", (c) => { c.checks.explicit_variant_conflict = true; }], ["edition conflict", (c) => { c.checks.parent_series_edition_conflict = true; }],
]) test(`${name} fails closed`, () => { const value = candidate(); change(value); assert.throws(() => selectExactP3SeedCanaryCandidate([value], target)); });

test("invocation needs an exact main SHA and confirmation", () => {
  assert.equal(validateP3SeedCanaryInvocation({ event_name: "workflow_dispatch", ref: "refs/heads/main", confirmation: P3_SEED_CANARY_CONFIRMATION, expected_main_sha: sha, head_sha: sha, origin_main_sha: sha }), true);
  assert.throws(() => validateP3SeedCanaryInvocation({ event_name: "workflow_dispatch", ref: "refs/heads/main", confirmation: "no", expected_main_sha: sha, head_sha: sha, origin_main_sha: sha }));
});

test("one fixed candidate builds one deterministic listing and observation only", () => {
  const rows = buildP3SeedCanaryRows({ candidate: candidate(), target, workflow: { run_id: "1", run_attempt: "1", head_sha: sha }, observed_at: "2026-08-24T00:00:00.000Z" });
  assert.equal(rows.listingRows.length, 1); assert.equal(rows.observationRows.length, 1); assert.equal(rows.listingRows[0].variant_id, target.variant_id); assert.equal(rows.listingRows[0].raw.p3_seed_canary.target_digest.length, 64);
});

test("zero-evidence target passes the immediate prewrite gate", () => {
  const rows = buildP3SeedCanaryRows({ candidate: candidate(), target, workflow: { run_id: "1", run_attempt: "1", head_sha: sha } });
  assert.equal(assertP3SeedCanaryPrewrite({ target, rows, variantListings: [], existingListings: [], existingObservations: [] }), true);
});

test("any existing target variant evidence fails closed before writing", () => {
  const rows = buildP3SeedCanaryRows({ candidate: candidate(), target, workflow: { run_id: "1", run_attempt: "1", head_sha: sha } });
  assert.throws(() => assertP3SeedCanaryPrewrite({ target, rows, variantListings: [{ id: "other-market-listing" }] }));
  assert.throws(() => assertP3SeedCanaryPrewrite({ target, rows, existingListings: [{ id: rows.listingRows[0].id }] }));
  assert.throws(() => assertP3SeedCanaryPrewrite({ target, rows, existingObservations: [{ id: rows.observationRows[0].id }] }));
});

for (const price of [0, -1, NaN]) test(`invalid price ${String(price)} fails closed`, () => {
  const value = candidate(); value.listing.price = price;
  assert.throws(() => buildP3SeedCanaryRows({ candidate: value, target, workflow: { run_id: "1", run_attempt: "1", head_sha: sha } }));
});

test("rollback failure result is serializable and sanitized", () => {
  const result = buildP3SeedCanaryResult({
    target, candidate: candidate(), status: "rolled-back", before: counts(10), after: counts(10),
    error: { bounded_result: { database_writes: 0, database_deltas: {}, verification: {}, rollback: { attempted: true, verified: true, listings_deleted: 1, observations_deleted: 1, listings_restored: 0, observations_restored: 0 }, operations: { listings: [{ id: "listing", operation: "insert", raw: "secret" }], observations: [] } } },
  });
  assert.doesNotThrow(() => JSON.stringify(result)); assert.equal(result.rollback.verified, true); assert.doesNotMatch(JSON.stringify(result), /secret|raw/i);
});

test("P3 persistence failure uses the shared compensating rollback", async () => {
  const rows = buildP3SeedCanaryRows({ candidate: candidate(), target, workflow: { run_id: "1", run_attempt: "1", head_sha: sha } });
  const store = fakeStore({ failObservation: true });
  await assert.rejects(() => persistP3SeedCanary({ rows, store }), (error) => error.bounded_result?.rollback?.attempted === true && error.bounded_result.rollback.verified === true);
  assert.equal(store.rows.market_listings.size, 0);
  assert.equal(store.rows.market_listing_observations.size, 0);
});

test("generic Priority 3 seed audit remains non-authoritative", () => assert.equal(isNonAuthoritativeManualMarketAudit({ manual_diagnostic: { kind: "priority_3_seed_read_only", canary_eligible: false, write_eligible: false } }), true));

test("workflow retains one-row budget, rollback, sanitized artifact scanning, and no generic P1 changes", () => {
  const runner = fs.readFileSync(path.join(root, "scripts", "market-p3-seed-canary.mjs"), "utf8");
  assert.match(workflow, /group:\s*gacha-market-bounded-v2/); assert.match(workflow, /cancel-in-progress:\s*false/);
  assert.match(workflow, /P3_SEED_CANARY_MAX_CANDIDATES/); assert.match(runner, /persistP3SeedCanary/); assert.match(runner, /assertP3SeedCanaryPrewrite/); assert.match(workflow, /if:\s*\$\{\{ always\(\) \}\}/); assert.match(workflow, /always\(\) && steps\.scan\.outcome == 'success'/);
  assert.doesNotMatch(workflow, /gacha-ingestion\.yml|gacha-market-bounded-auto\.yml|--mode=canary-write/);
});

function counts(value) { return { market_listings: value, market_listing_observations: value, import_issues: 0, ingestion_runs: 0, review_required: 0, series: 0, variants: 0, stock_reports: 0, restock_events: 0 }; }

function fakeStore({ failObservation = false } = {}) {
  const rows = { market_listings: new Map(), market_listing_observations: new Map(), ingestion_runs: new Map() };
  const count = () => ({ market_listings: rows.market_listings.size, market_listing_observations: rows.market_listing_observations.size, import_issues: 0, ingestion_runs: rows.ingestion_runs.size, review_required: 0, series: 0, variants: 0, stock_reports: 0, restock_events: 0 });
  return {
    rows,
    fetchRowsByIds: async (table, ids) => ids.map((id) => rows[table].get(id)).filter(Boolean).map(structuredClone),
    fetchCounts: async () => count(),
    upsertRows: async (table, values) => { if (failObservation && table === "market_listing_observations") throw new Error("forced observation failure"); for (const row of values) rows[table].set(row.id, structuredClone(row)); },
    deleteRowsByIds: async (table, ids) => { let deleted = 0; for (const id of ids) deleted += rows[table].delete(id) ? 1 : 0; return deleted; },
    fetchObservationsByListingIds: async (ids) => [...rows.market_listing_observations.values()].filter((row) => ids.includes(row.listing_id)),
  };
}
