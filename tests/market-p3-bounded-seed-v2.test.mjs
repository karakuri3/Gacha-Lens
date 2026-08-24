import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { MARKET_BOUNDED_PERSISTENCE_POLICIES, planMarketBoundedOperations } from "../lib/domain/market-bounded-write.js";
import { MARKET_BOUNDED_PERSISTENCE_HARD_CAP } from "../lib/domain/market-bounded-selection.js";
import { P3_BOUNDED_SEED_HARD_CAP, parseP3BoundedSeedLimit } from "../lib/domain/market-p3-bounded-seed.js";
import {
  P3_BOUNDED_SEED_V2_ALLOWED_LIMITS,
  P3_BOUNDED_SEED_V2_CONFIRMATION,
  P3_BOUNDED_SEED_V2_HARD_CAP,
  assertP3BoundedSeedV2Prewrite,
  buildP3BoundedSeedV2Result,
  buildP3BoundedSeedV2Rows,
  calculateP3BoundedSeedNoResultVariants,
  parseP3BoundedSeedV2Limit,
  persistP3BoundedSeedV2,
  selectP3BoundedSeedV2Candidates,
  validateP3BoundedSeedV2Invocation,
} from "../lib/domain/market-p3-bounded-seed-v2.js";

const root = process.cwd();
const workflow = fs.readFileSync(path.join(root, ".github/workflows/gacha-market-p3-bounded-seed-v2.yml"), "utf8");
const v1Workflow = fs.readFileSync(path.join(root, ".github/workflows/gacha-market-p3-bounded-seed.yml"), "utf8");
const runner = fs.readFileSync(path.join(root, "scripts/market-p3-bounded-seed-v2.mjs"), "utf8");
const sha = "a".repeat(40);

function candidate(index, overrides = {}) {
  const series = overrides.series_id ?? `series-${index}`;
  return {
    candidate_key: `${index.toString(16).padStart(16, "0")}`,
    source: { provider: index % 2 ? "rakuten_ichiba" : "yahoo_shopping", listing_id: `shop:item-${index}`, public_url: index % 2 ? `https://item.rakuten.co.jp/shop/item-${index}/` : `https://store.shopping.yahoo.co.jp/shop/item-${index}.html` },
    listing: { title: `Series ${index} Variant ${index}`, price: 500 + index, status: "active", listing_type: "single" },
    target: { variant_id: overrides.variant_id ?? `variant-${index}`, series_id: series, search_query: `Series ${index} Variant ${index}` },
    assessment: { accepted: true, review_required: false, reason: "variant_and_parent_evidence_confirmed", confidence: 0.86 },
    checks: { variant_evidence_present: true, parent_series_evidence_present: true, parent_series_exact_evidence_present: true, parent_series_discriminator_required: false, parent_series_discriminator_evidence_present: false, explicit_label_target_match: true, set_signal_detected: false, multiple_variant_candidates: false, explicit_variant_conflict: false, explicit_label_unresolved: false, explicit_label_other_variant_match: false, parent_series_edition_conflict: false, catalog_parent_variant_identity_ambiguous: false },
    ...overrides,
  };
}

test("P3 v2 workflow is dispatch-only with exact bounded inputs", () => {
  assert.match(workflow, /^on:\s*\r?\n\s+workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s+(schedule|push|pull_request|workflow_run|repository_dispatch):/m);
  const inputs = workflow.match(/inputs:([\s\S]*?)\r?\n\r?\njobs:/)?.[1] ?? "";
  assert.match(inputs, /expected_main_sha/); assert.match(inputs, /limit/); assert.match(inputs, /confirmation/);
  assert.doesNotMatch(inputs, /(variant_id|series_id|candidate_key|provider|listing_id|public_url|priority|release|source_scope)/);
  assert.match(workflow, /10\|25/); assert.match(workflow, /gacha-market-bounded-v2/); assert.match(workflow, /cancel-in-progress:\s*false/);
  assert.match(workflow, /node-version:\s*24/); assert.match(workflow, /timeout-minutes:\s*40/); assert.match(workflow, /steps\.scan\.outcome == 'success'/);
});

test("P3 v2 validation keeps v1 and P1 caps isolated", () => {
  assert.equal(MARKET_BOUNDED_PERSISTENCE_HARD_CAP, 2);
  assert.equal(P3_BOUNDED_SEED_HARD_CAP, 5); assert.deepEqual(P3_BOUNDED_SEED_V2_ALLOWED_LIMITS, [10, 25]); assert.equal(P3_BOUNDED_SEED_V2_HARD_CAP, 25);
  assert.equal(parseP3BoundedSeedLimit(5), 5); assert.throws(() => parseP3BoundedSeedLimit(10));
  for (const limit of [10, 25]) assert.equal(parseP3BoundedSeedV2Limit(limit), limit);
  for (const limit of [1, 5, 26]) assert.throws(() => parseP3BoundedSeedV2Limit(limit));
  assert.equal(validateP3BoundedSeedV2Invocation({ event_name: "workflow_dispatch", ref: "refs/heads/main", confirmation: P3_BOUNDED_SEED_V2_CONFIRMATION, expected_main_sha: sha, head_sha: sha, origin_main_sha: sha }), true);
  assert.throws(() => validateP3BoundedSeedV2Invocation({ event_name: "workflow_dispatch", ref: "refs/heads/main", confirmation: "APPROVE_P3_BOUNDED_SEED_V1", expected_main_sha: sha, head_sha: sha, origin_main_sha: sha }));
  assert.match(v1Workflow, /APPROVE_P3_BOUNDED_SEED_V1/); assert.match(v1Workflow, /1\|2\|3\|4\|5/);
});

test("P3 v2 runner retains fixed strict Priority 3 collection", () => {
  assert.match(runner, /planPriorityThreeSeedSearchQueries/); assert.doesNotMatch(runner, /buildMarketSearchQueriesForVariant|planMarketSearchQueries/);
  assert.match(runner, /MARKET_SOURCE_SCOPES\.PLANNER_APIS/); assert.match(runner, /maxVariantsPerSeries:\s*1/);
  assert.match(runner, /priority-3-bounded-seed-v2:\$\{runId\}/); assert.match(runner, /query_profile !== PRIORITY_THREE_SEED_QUERY_PROFILE/);
  assert.match(runner, /fetchRowsByMatchedVariantIds/); assert.match(runner, /fetchRowsBySourceUrls/);
});

test("P3 v2 selection is deterministic, one-per-variant, and one-per-series", () => {
  const values = Array.from({ length: 30 }, (_, index) => candidate(index + 1));
  values.push(candidate(40, { variant_id: "variant-1", series_id: "series-1", assessment: { accepted: true, review_required: false, reason: "variant_and_parent_evidence_confirmed", confidence: 0.99 } }));
  values.push(candidate(41, { variant_id: "variant-41", series_id: "series-1" }));
  const selected = selectP3BoundedSeedV2Candidates(values, { limit: 25 });
  assert.equal(selected.selected.length, 25); assert.equal(selected.one_listing_per_variant, true); assert.equal(selected.one_variant_per_series, true);
  assert.equal(selected.selected.find((row) => row.target.variant_id === "variant-1")?.candidate_key, candidate(40, { variant_id: "variant-1", series_id: "series-1", assessment: { accepted: true, review_required: false, reason: "variant_and_parent_evidence_confirmed", confidence: 0.99 } }).candidate_key);
});

for (const [label, mutate] of [["sold out", (value) => { value.listing.status = "sold_out"; }], ["preorder", (value) => { value.listing.status = "preorder"; }], ["set", (value) => { value.checks.set_signal_detected = true; }], ["rare non-single", (value) => { value.listing.listing_type = "rare_single"; }], ["missing native ID", (value) => { value.source.listing_id = ""; }], ["invalid URL", (value) => { value.source.public_url = "not-a-url"; }], ["invalid price", (value) => { value.listing.price = 0; }], ["review", (value) => { value.assessment.review_required = true; }], ["edition conflict", (value) => { value.checks.parent_series_edition_conflict = true; }], ["explicit conflict", (value) => { value.checks.explicit_variant_conflict = true; }]]) test(`P3 v2 excludes ${label}`, () => { const value = candidate(1); mutate(value); assert.equal(selectP3BoundedSeedV2Candidates([value], { limit: 10 }).selected.length, 0); });

test("P3 v2 rows and prewrite reject all evidence and duplicate paths before writes", () => {
  const rows = buildP3BoundedSeedV2Rows({ candidates: Array.from({ length: 10 }, (_, index) => candidate(index + 1)), workflow: { run_id: "123", head_sha: sha }, observed_at: "2026-08-25T00:00:00.000Z" });
  assert.equal(rows.listingRows.length, 10); assert.equal(rows.observationRows.length, 10); assert.equal(rows.listingRows[0].raw.p3_bounded_seed.stage, "p3-bounded-seed-v2");
  assert.equal(assertP3BoundedSeedV2Prewrite({ rows }), true);
  for (const key of ["variantListings", "sourceUrlRows", "existingListings", "existingObservations"]) assert.throws(() => assertP3BoundedSeedV2Prewrite({ rows, [key]: [{ id: "existing" }] }));
  const duplicate = structuredClone(rows); duplicate.listingRows[1].series_id = duplicate.listingRows[0].series_id; assert.throws(() => assertP3BoundedSeedV2Prewrite({ rows: duplicate }));
});

test("P3 v2 persists 10 and 25 inserts only, while 26 fails closed", async () => {
  for (const size of [10, 25]) {
    const rows = buildP3BoundedSeedV2Rows({ candidates: Array.from({ length: size }, (_, index) => candidate(index + 1)), workflow: { run_id: `run-${size}`, head_sha: sha } });
    const store = fakeStore(); const outcome = await persistP3BoundedSeedV2({ rows, store });
    assert.equal(outcome.database_writes, size * 2); assert.equal(outcome.database_deltas.market_listings, size); assert.equal(outcome.database_deltas.market_listing_observations, size);
  }
  assert.throws(() => buildP3BoundedSeedV2Rows({ candidates: Array.from({ length: 26 }, (_, index) => candidate(index + 1)), workflow: { run_id: "too-many", head_sha: sha } }));
});

test("P3 v2 insert-only race protection rejects update and unchanged before writes", async () => {
  const rows = buildP3BoundedSeedV2Rows({ candidates: [candidate(1)], workflow: { run_id: "race", head_sha: sha } });
  for (const existing of [structuredClone(rows.listingRows[0]), { ...structuredClone(rows.listingRows[0]), price: 999 }]) {
    const store = fakeStore(); store.rows.market_listings.set(existing.id, existing);
    await assert.rejects(() => persistP3BoundedSeedV2({ rows, store })); assert.equal(store.calls.length, 0);
  }
  assert.equal(planMarketBoundedOperations({ listingRows: rows.listingRows, observationRows: rows.observationRows, persistencePolicy: MARKET_BOUNDED_PERSISTENCE_POLICIES.p3_seed_v2 }).listings[0].operation, "insert");
});

test("P3 v2 result is sanitized and retains no-result diagnostics", () => {
  const result = buildP3BoundedSeedV2Result({ workflow: { run_id: "123", head_sha: sha }, requested_limit: 10, selection: { selected: [candidate(1)], one_listing_per_variant: true, one_variant_per_series: true }, report: { result: { candidate_count: 1, accepted_count: 1, review_count: 0, no_result_variant_count: calculateP3BoundedSeedNoResultVariants(5, 2) } }, before: counts(0), after: counts(0), status: "no-op" });
  assert.equal(result.contract.version, "v2"); assert.equal(result.contract.hard_cap, 25); assert.equal(result.retrieval.no_result_variant_count, 3); assert.doesNotMatch(JSON.stringify(result), /token|secret/i);
});

function counts(value) { return { market_listings: value, market_listing_observations: value, import_issues: 0, ingestion_runs: 0, review_required: 0, series: 0, variants: 0, stock_reports: 0, restock_events: 0 }; }
function fakeStore() { const rows = { market_listings: new Map(), market_listing_observations: new Map(), ingestion_runs: new Map() }; const calls = []; return { rows, calls, fetchRowsByIds: async (table, ids) => ids.map((id) => rows[table].get(id)).filter(Boolean).map((row) => structuredClone(row)), fetchCounts: async () => ({ ...counts(rows.market_listings.size), market_listing_observations: rows.market_listing_observations.size }), upsertRows: async (table, values) => { calls.push({ table }); for (const row of values) rows[table].set(row.id, structuredClone(row)); }, deleteRowsByIds: async (table, ids) => { let deleted = 0; for (const id of ids) deleted += rows[table].delete(id) ? 1 : 0; return deleted; }, fetchObservationsByListingIds: async (ids) => [...rows.market_listing_observations.values()].filter((row) => ids.includes(row.listing_id)) }; }
