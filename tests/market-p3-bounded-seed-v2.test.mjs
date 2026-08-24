import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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
  for (const [label, mutate] of [
    ["target variant", (value) => { value.listingRows[1].variant_id = value.listingRows[0].variant_id; }],
    ["series", (value) => { value.listingRows[1].series_id = value.listingRows[0].series_id; }],
    ["listing ID", (value) => { value.listingRows[1].id = value.listingRows[0].id; }],
    ["observation ID", (value) => { value.observationRows[1].id = value.observationRows[0].id; }],
    ["canonical source URL", (value) => { value.listingRows[1].source_url = value.listingRows[0].source_url; }],
  ]) {
    const duplicate = structuredClone(rows); mutate(duplicate); assert.throws(() => assertP3BoundedSeedV2Prewrite({ rows: duplicate }), label);
  }
  for (const [label, input] of [
    ["existing variant ID", { variantListings: [{ variant_id: rows.listingRows[0].variant_id }] }],
    ["existing matched variant ID", { variantListings: [{ matched_variant_id: rows.listingRows[0].matched_variant_id }] }],
    ["existing source URL", { sourceUrlRows: [{ source_url: rows.listingRows[0].source_url }] }],
    ["existing listing ID", { existingListings: [{ id: rows.listingRows[0].id }] }],
    ["existing observation ID", { existingObservations: [{ id: rows.observationRows[0].id }] }],
  ]) assert.throws(() => assertP3BoundedSeedV2Prewrite({ rows, ...input }), label);
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

test("P3 v2 full batch write and verification failures roll back 10 and 25 rows", async () => {
  for (const size of [10, 25]) for (const failure of ["market_listings", "market_listing_observations", "verification"]) {
    const rows = buildP3BoundedSeedV2Rows({ candidates: Array.from({ length: size }, (_, index) => candidate(index + 1)), workflow: { run_id: `${failure}-${size}`, head_sha: sha } });
    const store = fakeStore({ failAfterPartialWrite: failure, preservedListing: { id: `preserved-${size}-${failure}`, variant_id: "unrelated" } });
    const error = await captureFailure(() => persistP3BoundedSeedV2({ rows, store }));
    assert.equal(error.bounded_result.rollback.attempted, true); assert.equal(error.bounded_result.rollback.verified, true);
    assert.equal(store.rows.market_listings.size, 1); assert.equal(store.rows.market_listing_observations.size, 0);
    assert.equal(store.rows.market_listings.has(`preserved-${size}-${failure}`), true);
    assert.deepEqual(await store.fetchCounts(), { ...counts(1), market_listing_observations: 0 });
  }
});

test("P3 v2 rollback failure never claims committed variants", async () => {
  const rows = buildP3BoundedSeedV2Rows({ candidates: Array.from({ length: 25 }, (_, index) => candidate(index + 1)), workflow: { run_id: "rollback-failed", head_sha: sha } });
  const store = fakeStore({ failAfterPartialWrite: "market_listing_observations", rollbackIncomplete: true });
  const error = await captureFailure(() => persistP3BoundedSeedV2({ rows, store }));
  assert.equal(error.bounded_result.rollback.attempted, true); assert.equal(error.bounded_result.rollback.verified, false);
  const result = resultFor("rollback-failed", { selected: rows.candidates, error });
  assert.deepEqual(result.selection.persisted_variant_ids, []);
});

test("P3 v2 result separates selected and persisted variants for every outcome", () => {
  const selected = [candidate(1), candidate(2)];
  const rows = buildP3BoundedSeedV2Rows({ candidates: selected, workflow: { run_id: "123", head_sha: sha } });
  const operations = { listings: rows.listingRows.map((entry) => ({ id: entry.id, operation: "insert" })), observations: rows.observationRows.map((entry) => ({ id: entry.id, operation: "insert" })) };
  const succeeded = resultFor("succeeded", { selected, outcome: { operations, verification: { rows_verified: true, deltas_verified: true } } });
  assert.deepEqual(succeeded.selection.persisted_variant_ids, selected.map((entry) => entry.target.variant_id));
  for (const status of ["blocked", "no-op", "rolled-back", "rollback-failed"]) {
    const result = resultFor(status, { selected, outcome: { operations, verification: { rows_verified: true, deltas_verified: true } } });
    assert.equal(result.selection.selected_variant_ids.length, 2); assert.deepEqual(result.selection.persisted_variant_ids, []);
  }
  const unverified = resultFor("succeeded", { selected, outcome: { operations, verification: { rows_verified: false, deltas_verified: true } } });
  assert.deepEqual(unverified.selection.persisted_variant_ids, []);
});

test("P3 v2 runner writes a sanitized blocked artifact before runner-level validation fails", () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "gacha-p3-v2-"));
  try {
    const result = spawnSync(process.execPath, [path.join(root, "scripts/market-p3-bounded-seed-v2.mjs"), "--limit=9", `--output-dir=${output}`], { cwd: root, env: { ...process.env, GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/main" }, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    const artifact = JSON.parse(fs.readFileSync(path.join(output, "market-p3-bounded-seed-v2-result.json"), "utf8"));
    assert.equal(artifact.status, "blocked"); assert.equal(artifact.production_counts_before, null); assert.equal(artifact.production_counts_after, null);
    assert.equal(fs.existsSync(path.join(output, "market-p3-bounded-seed-v2-result.md")), true);
    assert.doesNotMatch(JSON.stringify(artifact), /token|secret/i);
  } finally { fs.rmSync(output, { recursive: true, force: true }); }
});

test("P3 v2 result is sanitized and retains no-result diagnostics", () => {
  const result = resultFor("no-op", { selected: [candidate(1)], report: { result: { candidate_count: 1, accepted_count: 1, review_count: 0, no_result_variant_count: calculateP3BoundedSeedNoResultVariants(5, 2) } } });
  assert.equal(result.contract.version, "v2"); assert.equal(result.contract.hard_cap, 25); assert.equal(result.retrieval.no_result_variant_count, 3); assert.doesNotMatch(JSON.stringify(result), /token|secret/i);
});

function counts(value) { return { market_listings: value, market_listing_observations: value, import_issues: 0, ingestion_runs: 0, review_required: 0, series: 0, variants: 0, stock_reports: 0, restock_events: 0 }; }
function resultFor(status, { selected = [], report = null, outcome = null, error = null } = {}) {
  const rows = selected.length ? buildP3BoundedSeedV2Rows({ candidates: selected, workflow: { run_id: "123", head_sha: sha } }) : null;
  return buildP3BoundedSeedV2Result({ workflow: { run_id: "123", head_sha: sha }, requested_limit: 10, selection: { selected, one_listing_per_variant: true, one_variant_per_series: true }, rows, report, before: counts(0), after: counts(0), outcome, error, status });
}
async function captureFailure(run) { try { await run(); assert.fail("expected bounded persistence to fail"); } catch (error) { return error; } }
function fakeStore({ failAfterPartialWrite = null, rollbackIncomplete = false, preservedListing = null } = {}) {
  const rows = { market_listings: new Map(), market_listing_observations: new Map(), ingestion_runs: new Map() };
  if (preservedListing) rows.market_listings.set(preservedListing.id, structuredClone(preservedListing));
  const calls = []; let verificationFailed = false;
  return {
    rows, calls,
    fetchRowsByIds: async (table, ids) => {
      if (failAfterPartialWrite === "verification" && table === "market_listing_observations" && !verificationFailed && rows.market_listing_observations.size) { verificationFailed = true; return []; }
      return ids.map((id) => rows[table].get(id)).filter(Boolean).map((row) => structuredClone(row));
    },
    fetchCounts: async () => ({ ...counts(rows.market_listings.size), market_listing_observations: rows.market_listing_observations.size }),
    upsertRows: async (table, values) => {
      calls.push({ table });
      if (failAfterPartialWrite === table) { for (const row of values.slice(0, Math.min(3, values.length))) rows[table].set(row.id, structuredClone(row)); throw new Error(`${table} partial failure`); }
      for (const row of values) rows[table].set(row.id, structuredClone(row));
    },
    deleteRowsByIds: async (table, ids) => {
      if (rollbackIncomplete && table === "market_listings") return 0;
      let deleted = 0; for (const id of ids) deleted += rows[table].delete(id) ? 1 : 0; return deleted;
    },
    fetchObservationsByListingIds: async (ids) => [...rows.market_listing_observations.values()].filter((row) => ids.includes(row.listing_id)),
  };
}
