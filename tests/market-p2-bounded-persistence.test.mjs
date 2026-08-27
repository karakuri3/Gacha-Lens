import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  assertMarketP2BoundedPrewrite,
  buildMarketP2BoundedArtifact,
  buildMarketP2BoundedRows,
  expectedMarketP2BoundedApproval,
  MARKET_P2_BOUNDED_POLICY_DIGEST,
  persistMarketP2Bounded,
  selectMarketP2BoundedCandidates,
  validateMarketP2BoundedInvocation,
} from "../lib/domain/market-p2-bounded-persistence.js";
import { MARKET_BOUNDED_PERSISTENCE_POLICIES } from "../lib/domain/market-bounded-write.js";
import { planPriorityTwoDistinctEvidenceQueries } from "../lib/fetchers/market-p2-distinct-evidence-query-planner.js";

const root = path.resolve(import.meta.dirname, "..");
const workflow = fs.readFileSync(path.join(root, ".github/workflows/gacha-market-p2-bounded-manual.yml"), "utf8");
const runner = fs.readFileSync(path.join(root, "scripts/market-p2-bounded-persistence.mjs"), "utf8");
const sha = "a".repeat(40);

test("P2 bounded workflow is dispatch-only, dry-run by default, and has no schedule", () => {
  const trigger = workflow.slice(workflow.indexOf("on:"), workflow.indexOf("permissions:"));
  assert.match(trigger, /workflow_dispatch:/);
  assert.doesNotMatch(trigger, /schedule:|push:|pull_request:|workflow_run:|repository_dispatch:/);
  assert.match(trigger, /default: dry-run/);
  assert.match(trigger, /- dry-run[\s\S]*- canary-write/);
  assert.match(workflow, /case "\$\{\{ inputs\.limit \}\}" in 1\|2\|3\|4\|5/);
  assert.match(workflow, /MARKET_BACKFILL_WRITE_DISABLED: "true"/);
  assert.match(workflow, /id: scan[\s\S]*steps\.scan\.outcome == 'success'/);
  assert.doesNotMatch(workflow, /gacha-ingestion\.yml|workflow enable|workflow disable/);
});

test("P2 bounded invocation requires exact main and exact candidate-bound canary approval", () => {
  assert.deepEqual(validateMarketP2BoundedInvocation({ event_name: "workflow_dispatch", ref: "refs/heads/main", mode: "dry-run", limit: 5, expected_main_sha: sha, head_sha: sha, origin_main_sha: sha, candidate_key: "", approval: "" }), { mode: "dry-run", limit: 5, write_authorized: false, candidate_key: null });
  const key = "1234567890abcdef";
  const approval = expectedMarketP2BoundedApproval(sha, key);
  assert.match(approval, new RegExp(`^APPROVE_MARKET_P2_BOUNDED_CANARY_V1:${MARKET_P2_BOUNDED_POLICY_DIGEST}:${sha}:${key}$`));
  assert.deepEqual(validateMarketP2BoundedInvocation({ event_name: "workflow_dispatch", ref: "refs/heads/main", mode: "canary-write", limit: 5, expected_main_sha: sha, head_sha: sha, origin_main_sha: sha, candidate_key: key, approval }), { mode: "canary-write", limit: 5, write_authorized: true, candidate_key: key });
  assert.throws(() => validateMarketP2BoundedInvocation({ event_name: "workflow_dispatch", ref: "refs/heads/main", mode: "canary-write", limit: 5, expected_main_sha: sha, head_sha: sha, origin_main_sha: sha, candidate_key: key, approval: approval.replace(key, "fedcba0987654321") }));
  assert.throws(() => validateMarketP2BoundedInvocation({ event_name: "workflow_dispatch", ref: "refs/heads/main", mode: "dry-run", limit: 6, expected_main_sha: sha, head_sha: sha, origin_main_sha: sha }));
});

test("selection requires exactly one active existing single and independent provider-issued storefront evidence", () => {
  const c1 = candidate(1, { provider: "rakuten_ichiba", storefront: "new-rakuten" });
  const c2 = candidate(2, { variant: "v2", series: "s2", provider: "yahoo_shopping", storefront: "new-yahoo" });
  const existing = [existingListing({ variant: "v1", provider: "rakuten", storefront: "old-rakuten" }), existingListing({ variant: "v2", provider: "rakuten", storefront: "old-v2" })];
  const selection = selectMarketP2BoundedCandidates({ audit: { candidates: [c1.audit, c2.audit] }, diagnostic: diagnostic([c1, c2]), existingListings: existing, limit: 2 });
  assert.deepEqual(selection.selected_candidate_keys, [c1.key, c2.key]);
  assert.deepEqual(selection.selected.map((entry) => entry.rank_class), ["A", "B"]);
  assert.equal(selection.one_variant_per_series, true);

  const unknown = candidate(3, { variant: "v3", series: "s3", provider: "rakuten_ichiba", storefront: null, independent: "unknown" });
  const duplicateExisting = [existingListing({ variant: "v3", provider: "rakuten", storefront: "old-a" }), existingListing({ variant: "v3", provider: "yahoo_shopping", storefront: "old-b" })];
  assert.equal(selectMarketP2BoundedCandidates({ audit: { candidates: [unknown.audit] }, diagnostic: diagnostic([unknown]), existingListings: duplicateExisting, limit: 2 }).selected.length, 0);
});

test("only fixed Priority 2 released non-provisional coverage enters the exact planner", () => {
  const catalog = {
    variants: [
      { id: "p1", series_id: "s1", name: "One", variant_type: "regular" },
      { id: "p2", series_id: "s2", name: "Two", variant_type: "regular" },
      { id: "p3", series_id: "s3", name: "Three", variant_type: "regular" },
      { id: "prov", series_id: "s4", name: "Provisional", variant_type: "provisional" },
    ],
    series: [{ id: "s1", name: "S1" }, { id: "s2", name: "S2" }, { id: "s3", name: "S3" }, { id: "s4", name: "S4" }],
  };
  catalog.variantById = new Map(catalog.variants.map((row) => [row.id, row]));
  catalog.seriesById = new Map(catalog.series.map((row) => [row.id, row]));
  const row = (variantId, seriesId, priority, overrides = {}) => ({ variantId, seriesId, priority, released: true, activeCount: 1, eligibleListingCount: 1, coverageState: "observed_insufficient", lastCollectionAttemptAt: null, ...overrides });
  const plan = planPriorityTwoDistinctEvidenceQueries(catalog, [row("p1", "s1", 1), row("p2", "s2", 2), row("p3", "s3", 3), row("prov", "s4", 2, { variantType: "provisional" })], { limit: 5, cooldownHours: 0 });
  assert.deepEqual(plan.selected.map((entry) => entry.variantId), ["p2"]);
  const attempts = [plan.queries[0].query, ...plan.queries[0].fallback_queries];
  assert.ok(attempts.length >= 2 && attempts.length <= 3);
  assert.ok(attempts.every((query) => query.includes("S2") && query.includes("Two")));
});

test("inactive, non-distinct, unsafe, set, and non-independent candidates fail closed", () => {
  const base = candidate(20, { storefront: "new-shop" });
  const existing = existingListing({ storefront: "old-shop" });
  const selectedCount = (value, evidence = value.evidence, rows = [existing]) => selectMarketP2BoundedCandidates({ audit: { candidates: [value.audit] }, diagnostic: diagnostic([{ ...value, evidence }]), existingListings: rows, limit: 1 }).selected.length;
  assert.equal(selectedCount(base), 1);
  assert.equal(selectedCount(base, { ...base.evidence, independent_storefront_evidence: false }), 0);
  assert.equal(selectedCount(base, { ...base.evidence, independent_storefront_evidence: "unknown" }), 0);
  assert.equal(selectedCount(base, { ...base.evidence, classification: "accepted_existing" }), 0);
  const unsafe = structuredClone(base); unsafe.audit.assessment.accepted = false;
  assert.equal(selectedCount(unsafe), 0);
  const set = structuredClone(base); set.audit.listing.listing_type = "complete_set"; set.audit.checks.set_signal_detected = true;
  assert.equal(selectedCount(set), 0);
  assert.equal(selectedCount(base, base.evidence, [{ ...existing, status: "sold" }]), 0);
});

test("selection keeps one listing per variant, one variant per series, and the two-write hard cap", () => {
  const values = [
    candidate(21, { variant: "v21", series: "shared", storefront: "new-21" }),
    candidate(22, { variant: "v22", series: "shared", storefront: "new-22" }),
    candidate(23, { variant: "v23", series: "s23", storefront: "new-23" }),
  ];
  const existing = values.map((value) => existingListing({ variant: value.audit.target.variant_id, storefront: `old-${value.key}` }));
  const selection = selectMarketP2BoundedCandidates({ audit: { candidates: values.map((value) => value.audit) }, diagnostic: diagnostic(values), existingListings: existing, limit: 2 });
  assert.equal(selection.selected.length, 2);
  assert.equal(new Set(selection.selected.map((entry) => entry.candidate.target.variant_id)).size, 2);
  assert.equal(new Set(selection.selected.map((entry) => entry.candidate.target.series_id)).size, 2);
  assert.throws(() => selectMarketP2BoundedCandidates({ audit: { candidates: [] }, diagnostic: diagnostic([]), existingListings: [], limit: 3 }));
  assert.equal(MARKET_BOUNDED_PERSISTENCE_POLICIES.p2_distinct_v1.max_candidates, 2);
});

test("ranking does not use price and same-provider different storefront ranks before cross-provider", () => {
  const sameProvider = candidate(4, { price: 9999, storefront: "other-shop" });
  const crossProvider = candidate(5, { price: 1, provider: "yahoo_shopping", storefront: "yahoo-shop" });
  const existing = [existingListing({ variant: "v1", provider: "rakuten", storefront: "current-shop" })];
  crossProvider.audit.target.variant_id = "v1"; crossProvider.audit.target.series_id = "s1";
  const value = selectMarketP2BoundedCandidates({ audit: { candidates: [crossProvider.audit, sameProvider.audit] }, diagnostic: diagnostic([{ ...sameProvider, variant: "v1", series: "s1" }, { ...crossProvider, variant: "v1", series: "s1" }]), existingListings: existing, limit: 1 });
  assert.equal(value.selected[0].candidate.candidate_key, sameProvider.key);
});

test("rows preserve only sanitized storefront provenance and stable single-listing identity", () => {
  const value = candidate(6, { storefront: "safe-shop" });
  value.audit.raw_secret = "must-not-copy";
  const selected = selectedEntry(value, existingListing({ provider: "rakuten", storefront: "old-shop" }));
  const rows = buildMarketP2BoundedRows({ selected: [selected], workflow: { run_id: "100", head_sha: sha }, observed_at: "2026-08-28T00:00:00.000Z" });
  assert.equal(rows.listingRows[0].listing_type, "single");
  assert.equal(rows.listingRows[0].raw.storefront_id, "safe-shop");
  assert.equal(rows.listingRows[0].raw.storefront_identity_source, "rakuten_item_search_shop_code");
  assert.equal(rows.listingRows[0].raw.raw_secret, undefined);
  assert.equal(JSON.stringify(rows).includes("must-not-copy"), false);
  assert.equal(rows.observationRows.length, 1);
});

test("prewrite fails closed on duplicate identity, URL, unknown storefront, and coverage drift", () => {
  const value = candidate(7, { storefront: "safe-shop" });
  const existing = existingListing({ provider: "rakuten", storefront: "old-shop" });
  const selected = selectedEntry(value, existing);
  const rows = buildMarketP2BoundedRows({ selected: [selected], workflow: { run_id: "101", head_sha: sha } });
  const base = { rows, selected: [selected], existingActiveListings: [existing] };
  assert.equal(assertMarketP2BoundedPrewrite(base), true);
  for (const key of ["listingIdConflicts", "observationIdConflicts", "sourceIdentityConflicts", "sourceUrlConflicts"]) assert.throws(() => assertMarketP2BoundedPrewrite({ ...base, [key]: [{ id: "conflict" }] }));
  assert.throws(() => assertMarketP2BoundedPrewrite({ ...base, existingActiveListings: [] }));
  assert.throws(() => assertMarketP2BoundedPrewrite({ ...base, existingActiveListings: [existing, { ...existing, id: "existing-2" }] }));
});

test("bounded persistence inserts exactly one listing and observation then verifies active evidence 1 to 2", async () => {
  const value = candidate(8, { storefront: "safe-shop" });
  const existing = existingListing({ provider: "rakuten", storefront: "old-shop" });
  const selected = selectedEntry(value, existing);
  const rows = buildMarketP2BoundedRows({ selected: [selected], workflow: { run_id: "102", head_sha: sha } });
  const store = fakeStore({ existing, rows });
  const before = await store.fetchCounts();
  const outcome = await persistMarketP2Bounded({ rows, selected: [selected], existingActiveListings: [existing], store, beforeCounts: before });
  assert.equal(outcome.database_writes, 2);
  assert.equal(outcome.operations.listings[0].operation, "insert");
  assert.equal(outcome.operations.observations[0].operation, "insert");
  assert.equal(outcome.postwrite.verified, true);
  assert.equal(outcome.postwrite.target_active_listing_count_after, 2);
  assert.deepEqual(outcome.postwrite.deltas, { market_listings: 1, market_listing_observations: 1, import_issues: 0, ingestion_runs: 0, series: 0, variants: 0, complete_set: 0 });
});

test("unexpected target coverage after write rolls inserted rows back", async () => {
  const value = candidate(9, { storefront: "safe-shop" });
  const existing = existingListing({ provider: "rakuten", storefront: "old-shop" });
  const selected = selectedEntry(value, existing);
  const rows = buildMarketP2BoundedRows({ selected: [selected], workflow: { run_id: "103", head_sha: sha } });
  const store = fakeStore({ existing, rows, suppressNewActive: true });
  const before = await store.fetchCounts();
  await assert.rejects(() => persistMarketP2Bounded({ rows, selected: [selected], existingActiveListings: [existing], store, beforeCounts: before }));
  assert.deepEqual(await store.fetchCounts(), before);
  assert.equal((await store.fetchRowsByIds("market_listings", [rows.listingRows[0].id])).length, 0);
});

test("sanitized artifact keeps merchant identity unknown and dry-run writes zero", () => {
  const value = candidate(10, { storefront: "safe-shop" });
  const selected = selectedEntry(value, existingListing({ provider: "rakuten", storefront: "old-shop" }));
  const counts = countSnapshot(20, 30);
  const artifact = buildMarketP2BoundedArtifact({ workflow: { run_id: "104", head_sha: sha }, mode: "dry-run", status: "dry-run", write_authorized: false, selection: { selected: [selected] }, before: counts, after: counts });
  assert.equal(artifact.database_writes, 0);
  assert.equal(artifact.write_eligible, false);
  assert.equal(artifact.selected_candidates[0].merchant_identity, null);
  assert.equal(artifact.selected_candidates[0].merchant_identity_status, "unknown");
  assert.equal(artifact.selected_candidates[0].status, "active");
  assert.equal(artifact.selected_candidates[0].reason, "variant_and_parent_evidence_confirmed");
  assert.equal(artifact.selected_candidates[0].confidence, 0.9);
  assert.equal(artifact.selected_candidates[0].existing_listing.active_eligible_listing_count_before, 1);
  assert.deepEqual(artifact.write_contract, { listing_inserts: 1, observation_inserts: 1, listing_updates: 0, observation_updates: 0, deletes: 0 });
  assert.equal(JSON.stringify(artifact).includes("seller"), false);
});

test("rollback failure artifact never claims zero writes or a known outcome", () => {
  const value = candidate(11, { storefront: "safe-shop" });
  const selected = selectedEntry(value, existingListing({ provider: "rakuten", storefront: "old-shop" }));
  const counts = countSnapshot(20, 30);
  const artifact = buildMarketP2BoundedArtifact({ workflow: { run_id: "105", head_sha: sha }, mode: "canary-write", status: "rollback-failed", write_authorized: false, selection: { selected: [selected] }, before: counts, after: null, rollback: { attempted: true, verified: false }, reason_code: "priority_2_bounded_persistence_failed" });
  assert.equal(artifact.database_writes, null);
  assert.equal(artifact.write_outcome_unknown, true);
  assert.deepEqual(artifact.rollback, { attempted: true, verified: false });
});

test("runner reuses exact P2 planner and does not introduce P3, generic, or complete-set behavior", () => {
  assert.match(runner, /planPriorityTwoDistinctEvidenceQueries/);
  assert.match(runner, /priority_2_distinct_exact_diagnostic/);
  assert.doesNotMatch(runner, /buildMarketSearchQueriesForVariant|planPriorityThree|complete-set|complete_set_reference/);
  assert.match(runner, /mode === "dry-run"[\s\S]*database_writes: 0/);
  assert.equal(MARKET_BOUNDED_PERSISTENCE_POLICIES.p3_seed_v2.max_candidates, 25);
  assert.equal(MARKET_BOUNDED_PERSISTENCE_POLICIES.p1.insert_only, false);
});

function candidate(index, options = {}) {
  const key = index.toString(16).padStart(16, "0");
  const variant = options.variant ?? "v1";
  const series = options.series ?? "s1";
  const provider = options.provider ?? "rakuten_ichiba";
  const storefront = options.storefront === undefined ? `shop-${index}` : options.storefront;
  const audit = {
    candidate_key: key,
    source: { provider, listing_id: `${provider}-listing-${index}`, public_url: provider === "rakuten_ichiba" ? `https://item.rakuten.co.jp/shop-${index}/item-${index}/` : `https://store.shopping.yahoo.co.jp/shop-${index}/item-${index}.html` },
    listing: { title: `Series Variant ${index}`, price: options.price ?? 500 + index, status: "active", listing_type: "single" },
    target: { variant_id: variant, variant_name: `Variant ${variant}`, series_id: series, series_name: `Series ${series}`, search_query: `Series ${series} Variant ${variant}` },
    assessment: { accepted: true, review_required: false, reason: "variant_and_parent_evidence_confirmed", confidence: options.confidence ?? 0.9 },
    checks: { set_signal_detected: false },
  };
  const evidence = {
    candidate_key: key,
    provider,
    source_listing_id: audit.source.listing_id,
    public_url: audit.source.public_url,
    price: audit.listing.price,
    status: "active",
    reason: audit.assessment.reason,
    confidence: audit.assessment.confidence,
    classification: "accepted_distinct",
    existing_match_fields: [],
    listing_identity: key,
    storefront_id: storefront,
    storefront_name: storefront ? `Store ${storefront}` : null,
    storefront_identity_source: storefront ? (provider === "rakuten_ichiba" ? "rakuten_item_search_shop_code" : "yahoo_shopping_item_search_storefront_id") : null,
    independent_storefront_evidence: options.independent ?? true,
    merchant_identity: null,
    merchant_identity_status: "unknown",
    independent_merchant_evidence: "unknown",
  };
  return { key, variant, series, audit, evidence };
}

function diagnostic(values) {
  const grouped = new Map();
  for (const value of values) {
    const variant = value.audit.target.variant_id;
    if (!grouped.has(variant)) grouped.set(variant, []);
    grouped.get(variant).push(value.evidence);
  }
  return { priority: 2, query_profile: "priority_2_distinct_exact_diagnostic", variants: [...grouped].map(([variant, entries]) => ({ variant_id: variant, series_id: values.find((value) => value.audit.target.variant_id === variant)?.audit.target.series_id, priority: 2, accepted_distinct: entries })) };
}

function existingListing({ variant = "v1", provider = "rakuten", storefront = "old-shop" } = {}) {
  const normalizedProvider = provider === "rakuten" ? "rakuten_ichiba" : provider;
  return {
    id: `existing-${variant}-${storefront}`,
    variant_id: variant,
    matched_variant_id: variant,
    listing_type: "single",
    market_review_type: "single",
    price: 500,
    status: "active",
    source: provider,
    source_url: provider === "rakuten" ? `https://item.rakuten.co.jp/${storefront}/old/` : `https://store.shopping.yahoo.co.jp/${storefront}/old.html`,
    confidence: 0.9,
    last_observed_at: new Date().toISOString(),
    review_required: false,
    raw: { provider: normalizedProvider, storefront_id: storefront, storefront_name: `Store ${storefront}`, storefront_identity_source: provider === "rakuten" ? "rakuten_item_search_shop_code" : "yahoo_shopping_item_search_storefront_id" },
  };
}

function selectedEntry(value, existing) { return { candidate: value.audit, evidence: value.evidence, existing_listing: existing, rank_class: "A" }; }
function countSnapshot(listings, observations) { return { market_listings: listings, market_listing_observations: observations, import_issues: 10, ingestion_runs: 5, review_required: 0, series: 100, variants: 200, stock_reports: 0, restock_events: 0, complete_set: 2 }; }

function fakeStore({ existing, rows, suppressNewActive = false }) {
  const tables = { market_listings: new Map(), market_listing_observations: new Map(), ingestion_runs: new Map() };
  const baseline = countSnapshot(20, 30);
  return {
    fetchRowsByIds: async (table, ids) => ids.map((id) => tables[table]?.get(id)).filter(Boolean).map(clone),
    fetchCounts: async () => ({ ...baseline, market_listings: baseline.market_listings + tables.market_listings.size, market_listing_observations: baseline.market_listing_observations + tables.market_listing_observations.size }),
    fetchActiveEligibleListingsByVariantIds: async () => suppressNewActive ? [existing] : [existing, ...tables.market_listings.values()].map(clone),
    fetchP2PrewriteConflicts: async () => ({ listingIdConflicts: [], observationIdConflicts: [], sourceIdentityConflicts: [], sourceUrlConflicts: [] }),
    upsertRows: async (table, values) => values.forEach((value) => tables[table].set(value.id, clone(value))),
    deleteRowsByIds: async (table, ids) => ids.reduce((count, id) => count + (tables[table].delete(id) ? 1 : 0), 0),
    fetchObservationsByListingIds: async (ids) => [...tables.market_listing_observations.values()].filter((row) => ids.includes(row.listing_id)).map(clone),
  };
}

function clone(value) { return structuredClone(value); }
