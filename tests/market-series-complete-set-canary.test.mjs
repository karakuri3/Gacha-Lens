import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  assertSeriesCompleteSetCanaryPrewrite,
  buildSeriesCompleteSetCanaryRows,
  buildSeriesCompleteSetReadiness,
  expectedSeriesCompleteSetCanaryApproval,
  persistSeriesCompleteSetCanary,
  validateSeriesCompleteSetCanaryInvocation,
} from "../lib/domain/market-series-complete-set-canary.js";

const root = process.cwd();
const readinessWorkflow = fs.readFileSync(path.join(root, ".github/workflows/gacha-market-series-complete-set-readiness.yml"), "utf8");
const canaryWorkflow = fs.readFileSync(path.join(root, ".github/workflows/gacha-market-series-complete-set-bounded-canary.yml"), "utf8");
const sha = "a".repeat(40);

function diagnostic(previews = [preview()]) {
  return { kind: "series_complete_set_read_only_diagnostic", workflow: { run_id: "32992698692", head_sha: sha }, complete_set_accepted_count: previews.length, unique_series_with_complete_set_evidence: new Set(previews.map((item) => item.series_id)).size, accepted_preview: previews, database_writes: 0, zero_delta_verified: true, canary_eligible: false, write_eligible: false };
}

function preview(overrides = {}) {
  return { series_id: "series-1", series_name: "Series Complete", listing_type: "complete_set", market_review_type: "full_set", variant_id: null, matched_variant_id: null, source: "yahoo_shopping", source_listing_id: "tarts-y099762", source_url: "https://store.shopping.yahoo.co.jp/example/item.html", title: "Series Complete 全4種セット", price: 1980, status: "active", confidence: 0.94, reason: "series_complete_set_confirmed", formal_lineup_count: 4, detected_complete_count: 4, ...overrides };
}

function counts() { return { market_listings: 58, market_listing_observations: 58, import_issues: 133, ingestion_runs: 209, series: 10221, variants: 23708 }; }

test("readiness selects at most one deterministic safe series without changing the source diagnostic", () => {
  const report = buildSeriesCompleteSetReadiness({ diagnostic: diagnostic([preview({ series_id: "series-2", confidence: 0.9 }), preview()]), auditRunId: "32992698692", headSha: sha, productionCountsBefore: counts(), productionCountsAfter: counts() });
  assert.equal(report.accepted_complete_set_candidate_count, 2);
  assert.equal(report.unique_series_count, 2);
  assert.equal(report.selected_candidate_count, 1);
  assert.equal(report.selected_candidate.series_id, "series-1");
  assert.equal(report.database_writes, 0);
  assert.equal(report.canary_eligible, true);
  assert.equal(report.write_eligible, false);
});

test("only accepted series-complete-set diagnostic evidence can reach a readiness candidate", () => {
  const rejected = preview({ reason: "parent_series_identity_conflict" });
  const rejectedReport = buildSeriesCompleteSetReadiness({ diagnostic: diagnostic([rejected]), auditRunId: "32992698692", headSha: sha, productionCountsBefore: counts(), productionCountsAfter: counts() });
  assert.equal(rejectedReport.canary_eligible, false);
  const report = buildSeriesCompleteSetReadiness({ diagnostic: diagnostic([]), auditRunId: "32992698692", headSha: sha, productionCountsBefore: counts(), productionCountsAfter: counts() });
  assert.equal(report.canary_eligible, false);
  assert.deepEqual(report.blockers, ["no_safe_series_complete_set_candidate"]);
});

test("series-complete-set rows are series scoped and cannot become variant price evidence", () => {
  const readiness = buildSeriesCompleteSetReadiness({ diagnostic: diagnostic(), auditRunId: "32992698692", headSha: sha, productionCountsBefore: counts(), productionCountsAfter: counts() });
  const rows = buildSeriesCompleteSetCanaryRows({ candidate: readiness.selected_candidate, readiness, workflow: { run_id: "99", run_attempt: "1", head_sha: sha }, observedAt: "2026-08-27T00:00:00.000Z" });
  assert.equal(rows.listingRows[0].variant_id, null);
  assert.equal(rows.listingRows[0].matched_variant_id, null);
  assert.equal(rows.observationRows[0].variant_id, null);
  assert.equal(rows.listingRows[0].listing_type, "complete_set");
  assert.equal(rows.listingRows[0].market_review_type, "full_set");
  assert.equal(assertSeriesCompleteSetCanaryPrewrite({ rows, sourceUrlRows: [], variantScopedRows: [] }), true);
  assert.throws(() => assertSeriesCompleteSetCanaryPrewrite({ rows, sourceUrlRows: [{ id: "variant-listing", variant_id: "variant-1" }] }));
});

test("future canary requires one exact readiness candidate, digest, approval, and current main", () => {
  const readiness = buildSeriesCompleteSetReadiness({ diagnostic: diagnostic(), auditRunId: "32992698692", headSha: sha, productionCountsBefore: counts(), productionCountsAfter: counts() });
  const approval = expectedSeriesCompleteSetCanaryApproval({ headSha: sha, readinessDigest: readiness.canonical_digest, candidateDigest: readiness.selected_candidate.canonical_digest });
  assert.equal(validateSeriesCompleteSetCanaryInvocation({ eventName: "workflow_dispatch", ref: "refs/heads/main", expectedMainSha: sha, headSha: sha, originMainSha: sha, readiness, readinessDigest: readiness.canonical_digest, approval }).series_id, "series-1");
  assert.throws(() => validateSeriesCompleteSetCanaryInvocation({ eventName: "workflow_dispatch", ref: "refs/heads/main", expectedMainSha: sha, headSha: sha, originMainSha: "b".repeat(40), readiness, readinessDigest: readiness.canonical_digest, approval }));
});

test("one series canary preserves idempotency and consumes no second approval marker", async () => {
  const readiness = buildSeriesCompleteSetReadiness({ diagnostic: diagnostic(), auditRunId: "32992698692", headSha: sha, productionCountsBefore: counts(), productionCountsAfter: counts() });
  const rows = buildSeriesCompleteSetCanaryRows({ candidate: readiness.selected_candidate, readiness, workflow: { run_id: "99", run_attempt: "1", head_sha: sha } });
  const store = fakeStore();
  const first = await persistSeriesCompleteSetCanary({ rows, store });
  assert.equal(first.listing_writes, 1);
  assert.equal(first.observation_writes, 1);
  await assert.rejects(() => persistSeriesCompleteSetCanary({ rows, store }), (error) => error?.cause?.message === "Canary approval has already been consumed.");
  assert.equal(store.rows.market_listings.size, 1);
  assert.equal(store.rows.market_listing_observations.size, 1);
});

test("new readiness and future canary workflows are dispatch-only and isolated from P3 V2", () => {
  for (const workflow of [readinessWorkflow, canaryWorkflow]) {
    assert.match(workflow, /^on:\s*\r?\n\s+workflow_dispatch:/m);
    assert.doesNotMatch(workflow, /^\s+(schedule|push|pull_request|workflow_run|repository_dispatch):/m);
    assert.doesNotMatch(workflow, /gacha-ingestion\.yml|gacha-market-p3-bounded-seed-v2-auto\.yml/);
  }
  assert.match(canaryWorkflow, /expected_main_sha/);
  assert.match(canaryWorkflow, /APPROVE_SERIES_COMPLETE_SET_CANARY/);
  assert.match(canaryWorkflow, /gacha-market-series-complete-set-manual-canary/);
  assert.match(readinessWorkflow, /MARKET_BACKFILL_WRITE_DISABLED/);
});

function fakeStore() {
  const rows = { market_listings: new Map(), market_listing_observations: new Map() };
  const total = () => ({ market_listings: rows.market_listings.size, market_listing_observations: rows.market_listing_observations.size, import_issues: 0, ingestion_runs: 0, review_required: 0, series: 0, variants: 0, stock_reports: 0, restock_events: 0 });
  return {
    rows,
    fetchConsumedCanaryObservations: async (auditRunId, candidateKeys) => [...rows.market_listing_observations.values()].filter((row) => row.raw?.canary_audit_run_id === auditRunId && candidateKeys.includes(row.raw?.canary_candidate_key)),
    fetchRowsByIds: async (table, ids) => ids.map((id) => rows[table].get(id)).filter(Boolean).map((row) => structuredClone(row)),
    fetchCounts: async () => total(),
    upsertRows: async (table, values) => { for (const value of values) rows[table].set(value.id, structuredClone(value)); },
    deleteRowsByIds: async (table, ids) => { let deleted = 0; for (const id of ids) deleted += rows[table].delete(id) ? 1 : 0; return deleted; },
    fetchObservationsByListingIds: async (ids) => [...rows.market_listing_observations.values()].filter((row) => ids.includes(row.listing_id)),
  };
}
