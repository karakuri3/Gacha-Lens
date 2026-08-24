import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  MARKET_BOUNDED_PERSISTENCE_POLICIES,
  planMarketBoundedOperations,
  persistMarketBounded,
} from "../lib/domain/market-bounded-write.js";
import { MARKET_BOUNDED_PERSISTENCE_HARD_CAP } from "../lib/domain/market-bounded-selection.js";
import {
  P3_BOUNDED_SEED_CONFIRMATION,
  P3_BOUNDED_SEED_HARD_CAP,
  assertP3BoundedSeedPrewrite,
  buildP3BoundedSeedResult,
  buildP3BoundedSeedRows,
  isEligibleP3BoundedSeedCandidate,
  parseP3BoundedSeedLimit,
  persistP3BoundedSeed,
  selectP3BoundedSeedCandidates,
  validateP3BoundedSeedInvocation,
} from "../lib/domain/market-p3-bounded-seed.js";

const root = process.cwd();
const workflow = fs.readFileSync(path.join(root, ".github/workflows/gacha-market-p3-bounded-seed.yml"), "utf8");
const runner = fs.readFileSync(path.join(root, "scripts/market-p3-bounded-seed.mjs"), "utf8");
const sha = "a".repeat(40);

function candidate(index, overrides = {}) {
  const series = overrides.series_id ?? `series-${index}`;
  return {
    candidate_key: `${index.toString(16).padStart(16, "0")}`,
    source: { provider: "rakuten_ichiba", listing_id: `shop:item-${index}`, public_url: `https://item.rakuten.co.jp/shop/item-${index}/` },
    listing: { title: `Series ${index} Variant ${index}`, price: 500 + index, status: "active", listing_type: "single" },
    target: { variant_id: overrides.variant_id ?? `variant-${index}`, series_id: series, search_query: `Series ${index} Variant ${index}` },
    assessment: { accepted: true, review_required: false, reason: "variant_and_parent_evidence_confirmed", confidence: 0.86 },
    checks: {
      variant_evidence_present: true, parent_series_evidence_present: true, parent_series_exact_evidence_present: true,
      parent_series_discriminator_required: false, parent_series_discriminator_evidence_present: false,
      explicit_label_target_match: true, set_signal_detected: false, multiple_variant_candidates: false,
      explicit_variant_conflict: false, explicit_label_unresolved: false, explicit_label_other_variant_match: false,
      parent_series_edition_conflict: false, catalog_parent_variant_identity_ambiguous: false,
    },
    ...overrides,
  };
}

test("P3 workflow is dispatch-only with fixed contract inputs", () => {
  assert.match(workflow, /^on:\s*\r?\n\s+workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s+(schedule|push|pull_request|workflow_run|repository_dispatch):/m);
  const inputs = workflow.match(/inputs:([\s\S]*?)\r?\n\r?\njobs:/)?.[1] ?? "";
  assert.match(inputs, /expected_main_sha/); assert.match(inputs, /limit/); assert.match(inputs, /confirmation/);
  assert.doesNotMatch(inputs, /(variant_id|series_id|candidate_key|provider|listing_id|public_url|priority|release|source_scope)/);
  assert.match(workflow, /gacha-market-bounded-v2/); assert.match(workflow, /cancel-in-progress:\s*false/);
  assert.match(workflow, /steps\.scan\.outcome == 'success'/);
});

test("P3 runner fixes priority three, released planner APIs, strict retrieval, and run-ID rotation", () => {
  assert.match(runner, /planPriorityThreeSeedSearchQueries/);
  assert.doesNotMatch(runner, /buildMarketSearchQueriesForVariant|planMarketSearchQueries/);
  assert.match(runner, /priority-3-bounded-seed-v1:\$\{runId\}/);
  assert.doesNotMatch(runner, /GITHUB_RUN_ATTEMPT.*rotation|rotation.*GITHUB_RUN_ATTEMPT/);
  assert.match(runner, /MARKET_SOURCE_SCOPES\.PLANNER_APIS/);
  assert.match(runner, /query_profile !== PRIORITY_THREE_SEED_QUERY_PROFILE/);
  assert.match(runner, /manualCanarySelectionOptions/);
  assert.match(runner, /maxVariantsPerSeries: 1/);
  assert.match(runner, /fetchRowsByMatchedVariantIds/);
});

test("exact main and confirmation are mandatory", () => {
  assert.equal(validateP3BoundedSeedInvocation({ event_name: "workflow_dispatch", ref: "refs/heads/main", confirmation: P3_BOUNDED_SEED_CONFIRMATION, expected_main_sha: sha, head_sha: sha, origin_main_sha: sha }), true);
  assert.throws(() => validateP3BoundedSeedInvocation({ event_name: "workflow_dispatch", ref: "refs/heads/main", confirmation: "no", expected_main_sha: sha, head_sha: sha, origin_main_sha: sha }));
  assert.throws(() => validateP3BoundedSeedInvocation({ event_name: "workflow_dispatch", ref: "refs/heads/main", confirmation: P3_BOUNDED_SEED_CONFIRMATION, expected_main_sha: sha, head_sha: sha, origin_main_sha: "b".repeat(40) }));
});

test("limit remains within the explicit P3 cap", () => {
  for (const value of [1, 2, 3, 4, 5]) assert.equal(parseP3BoundedSeedLimit(value), value);
  for (const value of [0, 6, "no"]) assert.throws(() => parseP3BoundedSeedLimit(value));
  assert.equal(P3_BOUNDED_SEED_HARD_CAP, 5);
});

test("selection keeps one strongest safe active single candidate per variant", () => {
  const weaker = candidate(1, { checks: { ...candidate(1).checks, explicit_label_target_match: false }, source: { provider: "rakuten_ichiba", listing_id: "shop:weak", public_url: "https://item.rakuten.co.jp/shop/weak/" } });
  const selected = selectP3BoundedSeedCandidates([weaker, candidate(2, { variant_id: "variant-1", series_id: "series-1" }), candidate(3)], { limit: 5 });
  assert.equal(selected.selected.length, 2);
  assert.equal(selected.selected[0].candidate_key, candidate(2, { variant_id: "variant-1", series_id: "series-1" }).candidate_key);
  assert.equal(selected.one_listing_per_variant, true);
});

for (const [label, mutate] of [
  ["review candidate", (value) => { value.assessment.review_required = true; }],
  ["unsafe set", (value) => { value.checks.set_signal_detected = true; }],
  ["invalid price", (value) => { value.listing.price = 0; }],
  ["sold listing", (value) => { value.listing.status = "sold"; }],
]) test(`${label} cannot enter the P3 persistence pool`, () => {
  const value = candidate(1); mutate(value);
  assert.equal(selectP3BoundedSeedCandidates([value]).selected.length, 0);
});

test("P3 requires a native source listing ID while supported Rakuten and Yahoo identities remain eligible", () => {
  for (const value of [undefined, "", "   "]) {
    const missing = candidate(1); missing.source.listing_id = value;
    assert.equal(isEligibleP3BoundedSeedCandidate(missing), false);
  }
  assert.equal(isEligibleP3BoundedSeedCandidate(candidate(1)), true);
  const yahoo = candidate(2, { source: { provider: "yahoo_shopping", listing_id: "seller:item-2", public_url: "https://store.shopping.yahoo.co.jp/seller/item-2.html" } });
  assert.equal(isEligibleP3BoundedSeedCandidate(yahoo), true);
});

test("selection hard-caps P3 at one variant per parent series independent of profile settings", () => {
  const selection = selectP3BoundedSeedCandidates([
    candidate(1, { series_id: "shared" }), candidate(2, { series_id: "shared" }), candidate(3, { series_id: "other" }),
  ], { limit: 5 });
  assert.deepEqual(selection.selected.map((row) => row.target.series_id).sort(), ["other", "shared"]);
  assert.equal(new Set(selection.selected.map((row) => row.target.series_id)).size, selection.selected.length);
});

test("P3 rows cap at five and preserve one listing and observation per variant", () => {
  const candidates = Array.from({ length: 5 }, (_, index) => candidate(index + 1));
  const rows = buildP3BoundedSeedRows({ candidates, workflow: { run_id: "123", head_sha: sha }, observed_at: "2026-08-24T00:00:00.000Z" });
  assert.equal(rows.listingRows.length, 5); assert.equal(rows.observationRows.length, 5);
  assert.equal(new Set(rows.listingRows.map((row) => row.variant_id)).size, 5);
  assert.throws(() => buildP3BoundedSeedRows({ candidates: [...candidates, candidate(6)], workflow: { run_id: "123", head_sha: sha } }));
});

test("batch prewrite rejects every duplicate and pre-existing evidence before writes", () => {
  const rows = buildP3BoundedSeedRows({ candidates: [candidate(1), candidate(2)], workflow: { run_id: "123", head_sha: sha } });
  assert.equal(assertP3BoundedSeedPrewrite({ rows }), true);
  assert.throws(() => assertP3BoundedSeedPrewrite({ rows, sourceUrlRows: [{ id: "other" }] }));
  assert.throws(() => assertP3BoundedSeedPrewrite({ rows, variantListings: [{ id: "other" }] }));
  assert.throws(() => assertP3BoundedSeedPrewrite({ rows, existingListings: [{ id: rows.listingRows[0].id }] }));
  assert.throws(() => assertP3BoundedSeedPrewrite({ rows, existingObservations: [{ id: rows.observationRows[0].id }] }));
  const duplicate = structuredClone(rows); duplicate.listingRows[1].variant_id = duplicate.listingRows[0].variant_id;
  assert.throws(() => assertP3BoundedSeedPrewrite({ rows: duplicate }));
  const duplicateSeries = structuredClone(rows); duplicateSeries.listingRows[1].series_id = duplicateSeries.listingRows[0].series_id;
  assert.throws(() => assertP3BoundedSeedPrewrite({ rows: duplicateSeries }));
});

test("prewrite rejects evidence associated only through matched_variant_id", () => {
  const rows = buildP3BoundedSeedRows({ candidates: [candidate(1)], workflow: { run_id: "123", head_sha: sha } });
  assert.throws(() => assertP3BoundedSeedPrewrite({ rows, variantListings: [{ id: "legacy", matched_variant_id: rows.listingRows[0].variant_id }] }));
});

test("generic P1 persistence remains hard-capped at exactly two while explicit P3 policy permits five", () => {
  assert.equal(MARKET_BOUNDED_PERSISTENCE_HARD_CAP, 2);
  const rows = buildP3BoundedSeedRows({ candidates: Array.from({ length: 5 }, (_, index) => candidate(index + 1)), workflow: { run_id: "123", head_sha: sha } });
  assert.throws(() => planMarketBoundedOperations({ listingRows: rows.listingRows, observationRows: rows.observationRows }));
  assert.equal(planMarketBoundedOperations({ listingRows: rows.listingRows, observationRows: rows.observationRows, persistencePolicy: MARKET_BOUNDED_PERSISTENCE_POLICIES.p3_seed_v1 }).listings.length, 5);
});

test("P3 shared persistence rolls back the entire batch after observation failure", async () => {
  const rows = buildP3BoundedSeedRows({ candidates: [candidate(1), candidate(2)], workflow: { run_id: "123", head_sha: sha } });
  const store = fakeStore({ failObservation: true });
  await assert.rejects(() => persistP3BoundedSeed({ rows, store }), (error) => error.bounded_result?.rollback?.attempted === true && error.bounded_result.rollback.verified === true);
  assert.equal(store.rows.market_listings.size, 0); assert.equal(store.rows.market_listing_observations.size, 0);
});

test("explicit P3 policy persists and verifies a complete five-variant batch", async () => {
  const rows = buildP3BoundedSeedRows({ candidates: Array.from({ length: 5 }, (_, index) => candidate(index + 1)), workflow: { run_id: "123", head_sha: sha } });
  const store = fakeStore();
  const outcome = await persistP3BoundedSeed({ rows, store });
  assert.equal(outcome.database_writes, 10);
  assert.equal(outcome.database_deltas.market_listings, 5);
  assert.equal(outcome.database_deltas.market_listing_observations, 5);
});

for (const [label, seed] of [
  ["exact existing listing", (store, rows) => store.rows.market_listings.set(rows.listingRows[0].id, structuredClone(rows.listingRows[0]))],
  ["identical listing and observation", (store, rows) => { store.rows.market_listings.set(rows.listingRows[0].id, structuredClone(rows.listingRows[0])); store.rows.market_listing_observations.set(rows.observationRows[0].id, structuredClone(rows.observationRows[0])); }],
  ["existing observation", (store, rows) => store.rows.market_listing_observations.set(rows.observationRows[0].id, structuredClone(rows.observationRows[0]))],
]) test(`P3 insert-only policy rejects ${label} before any write`, async () => {
  const rows = buildP3BoundedSeedRows({ candidates: [candidate(1), candidate(2)], workflow: { run_id: "123", head_sha: sha } });
  const store = fakeStore(); seed(store, rows);
  await assert.rejects(() => persistMarketBounded({ listingRows: rows.listingRows, observationRows: rows.observationRows, store, persistencePolicy: MARKET_BOUNDED_PERSISTENCE_POLICIES.p3_seed_v1 }));
  assert.equal(store.calls.length, 0);
});

test("P1 retains unchanged semantics while keeping the two-row cap", () => {
  const rows = buildP3BoundedSeedRows({ candidates: [candidate(1), candidate(2)], workflow: { run_id: "123", head_sha: sha } });
  const operations = planMarketBoundedOperations({
    listingRows: rows.listingRows,
    observationRows: rows.observationRows,
    existingListings: rows.listingRows.map((row) => structuredClone(row)),
    existingObservations: rows.observationRows.map((row) => structuredClone(row)),
  });
  assert.deepEqual(operations.listings.map((entry) => entry.operation), ["unchanged", "unchanged"]);
  assert.deepEqual(operations.observations.map((entry) => entry.operation), ["unchanged", "unchanged"]);
  assert.equal(MARKET_BOUNDED_PERSISTENCE_HARD_CAP, 2);
});

test("success and failure result artifacts are sanitized", () => {
  const result = buildP3BoundedSeedResult({ workflow: { run_id: "123", head_sha: sha }, requested_limit: 5, selection: { selected: [candidate(1)], safe_candidate_count: 1, one_listing_per_variant: true }, report: { result: { candidate_count: 1, accepted_count: 1, review_count: 0, report_complete: true, truncated_count: 0 } }, before: counts(1), after: counts(2), outcome: { database_writes: 2, database_deltas: { market_listings: 1, market_listing_observations: 1 }, verification: { rows_verified: true, deltas_verified: true }, rollback: {}, operations: { listings: [{ id: "listing", operation: "insert", raw: "secret" }], observations: [] } }, status: "succeeded" });
  assert.doesNotMatch(JSON.stringify(result), /secret|raw/i);
  assert.equal(result.database_writes, 2);
});

test("existing fixed White Eggplant canary remains separate and unchanged", () => {
  const canaryWorkflow = fs.readFileSync(path.join(root, ".github/workflows/gacha-market-seed-canary.yml"), "utf8");
  assert.match(canaryWorkflow, /P3_SEED_CANARY_MAX_CANDIDATES/); assert.match(canaryWorkflow, /config\/market-p3-seed-canary-target\.json/);
  assert.doesNotMatch(canaryWorkflow, /p3-bounded-seed-v1/);
});

function counts(value) { return { market_listings: value, market_listing_observations: value, import_issues: 0, ingestion_runs: 0, review_required: 0, series: 0, variants: 0, stock_reports: 0, restock_events: 0 }; }
function fakeStore({ failObservation = false } = {}) {
  const rows = { market_listings: new Map(), market_listing_observations: new Map(), ingestion_runs: new Map() };
  const calls = [];
  const count = () => counts(rows.market_listings.size);
  count().market_listing_observations = rows.market_listing_observations.size;
  return {
    rows,
    calls,
    fetchRowsByIds: async (table, ids) => ids.map((id) => rows[table].get(id)).filter(Boolean).map((row) => structuredClone(row)),
    fetchCounts: async () => ({ ...counts(rows.market_listings.size), market_listing_observations: rows.market_listing_observations.size }),
    upsertRows: async (table, values) => { calls.push({ table }); if (failObservation && table === "market_listing_observations") throw new Error("forced observation failure"); for (const row of values) rows[table].set(row.id, structuredClone(row)); },
    deleteRowsByIds: async (table, ids) => { let deleted = 0; for (const id of ids) deleted += rows[table].delete(id) ? 1 : 0; return deleted; },
    fetchObservationsByListingIds: async (ids) => [...rows.market_listing_observations.values()].filter((row) => ids.includes(row.listing_id)),
  };
}
