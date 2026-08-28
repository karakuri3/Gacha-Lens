import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildMarketCandidateKey } from "../lib/domain/market-candidate-key.js";
import { MARKET_BOUNDED_PERSISTENCE_POLICIES } from "../lib/domain/market-bounded-write.js";
import { buildPriorityOneDistinctEvidenceDiagnostic } from "../lib/domain/market-p1-distinct-evidence-diagnostic.js";
import { buildPriorityOneBoundedEvidenceReadOnlyDiagnostic, sanitizeManualMarketAuditDiagnostic } from "../lib/domain/manual-market-audit-diagnostic.js";
import {
  assertMarketP1BoundedPrewrite,
  buildMarketP1BoundedArtifact,
  buildMarketP1BoundedRows,
  expectedMarketP1BoundedApproval,
  MARKET_P1_BOUNDED_POLICY_DIGEST,
  persistMarketP1Bounded,
  selectMarketP1BoundedCandidates,
  validateMarketP1BoundedInvocation,
} from "../lib/domain/market-p1-bounded-persistence.js";
import { planPriorityOneDistinctEvidenceQueries } from "../lib/fetchers/market-p1-distinct-evidence-query-planner.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = fs.readFileSync(path.join(root, ".github/workflows/gacha-market-p1-bounded-manual.yml"), "utf8");
const runner = fs.readFileSync(path.join(root, "scripts/market-p1-bounded-persistence.mjs"), "utf8");
const sha = "a".repeat(40);

test("P1 workflow is workflow_dispatch-only, dry-run by default, and exact-main guarded", () => {
  assert.match(workflow, /name: Gacha Market P1 Bounded Manual Production/);
  assert.match(workflow, /on:\s*\n\s*workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\bschedule:|\bpush:|\bpull_request:|\bworkflow_run:|\brepository_dispatch:/);
  assert.match(workflow, /default: dry-run/);
  assert.match(workflow, /test "\$GITHUB_SHA" = "\$\{\{ inputs\.expected_main_sha \}\}"/);
  assert.match(workflow, /git fetch --no-tags origin main --depth=1/);
  assert.match(workflow, /test "\$GITHUB_SHA" = "\$origin_main_sha"/);
  assert.match(workflow, /MARKET_BACKFILL_WRITE_DISABLED: "true"/);
  assert.match(workflow, /id: scan/);
});

test("invocation requires exact main and exact digest/head/candidate-bound approval", () => {
  const key = "0123456789abcdef";
  const dry = { event_name: "workflow_dispatch", ref: "refs/heads/main", mode: "dry-run", limit: 5, expected_main_sha: sha, head_sha: sha, origin_main_sha: sha, candidate_key: "", approval: "" };
  assert.deepEqual(validateMarketP1BoundedInvocation(dry), { mode: "dry-run", limit: 5, write_authorized: false, candidate_key: null });
  const approval = expectedMarketP1BoundedApproval(sha, key);
  assert.equal(approval, `APPROVE_MARKET_P1_BOUNDED_CANARY_V1:${MARKET_P1_BOUNDED_POLICY_DIGEST}:${sha}:${key}`);
  assert.deepEqual(validateMarketP1BoundedInvocation({ ...dry, mode: "canary-write", candidate_key: key, approval }), { mode: "canary-write", limit: 5, write_authorized: true, candidate_key: key });
  assert.throws(() => validateMarketP1BoundedInvocation({ ...dry, mode: "canary-write", candidate_key: key, approval: approval.replace(key, "fedcba9876543210") }));
  assert.throws(() => validateMarketP1BoundedInvocation({ ...dry, origin_main_sha: "b".repeat(40) }));
  assert.throws(() => validateMarketP1BoundedInvocation({ ...dry, limit: 6 }));
});

test("planner selects only released non-provisional Priority 1 rows with exactly two eligible active listings", () => {
  const catalog = catalogFixture();
  const row = (variantId, seriesId, priority, activeCount, overrides = {}) => ({
    variantId, seriesId, priority, released: true, activeCount, eligibleListingCount: activeCount,
    coverageState: "observed_insufficient", lastCollectionAttemptAt: null, ...overrides,
  });
  const plan = planPriorityOneDistinctEvidenceQueries(catalog, [
    row("p1", "s1", 1, 2), row("p2", "s2", 2, 1), row("p3", "s3", 1, 3),
    row("prov", "s4", 1, 2, { variantType: "provisional" }), row("future", "s5", 1, 2, { released: false }),
  ], { limit: 5, cooldownHours: 0 });
  assert.deepEqual(plan.selected.map((entry) => entry.variantId), ["p1"]);
  const attempts = [plan.queries[0].query, ...plan.queries[0].fallback_queries];
  assert.equal(plan.queries[0].priority, 1);
  assert.equal(plan.queries[0].released, true);
  assert.ok(attempts.length >= 2 && attempts.length <= 3);
  assert.ok(attempts.every((query) => query.includes("Series One") && query.includes("Variant One")));
  assert.ok(attempts[0].endsWith("ガチャ"));
});

test("selection requires exactly two known distinct existing storefronts", () => {
  const value = candidate(1, { storefront: "third-shop" });
  const two = existingPair();
  assert.equal(select([value], two).selected.length, 1);
  assert.equal(select([value], two.slice(0, 1)).selected.length, 0);
  assert.equal(select([value], [...two, existingListing({ storefront: "fourth-shop", sourceListingId: "fourth-shop:4" })]).selected.length, 0);
  assert.equal(select([value], [two[0], { ...two[1], raw: { provider: "rakuten_ichiba", shopName: "Display only" } }]).selected.length, 0);
  assert.equal(select([value], [two[0], existingListing({ storefront: "auc-toysanta", sourceListingId: "auc-toysanta:other" })]).selected.length, 0);
});

test("priority, release, publication, strict matcher, and set safety remain fail closed", () => {
  const value = candidate(2, { storefront: "third-shop" });
  assert.throws(() => select([value], existingPair(), { priority: 2 }));
  assert.equal(select([value], existingPair(), { released: false }).selected.length, 0);
  assert.equal(select([value], existingPair(), { variant_type: "provisional" }).selected.length, 0);
  const unsafe = structuredClone(value); unsafe.audit.assessment.accepted = false;
  assert.equal(select([unsafe], existingPair()).selected.length, 0);
  const review = structuredClone(value); review.audit.assessment.review_required = true;
  assert.equal(select([review], existingPair()).selected.length, 0);
  const set = structuredClone(value); set.audit.listing.listing_type = "complete_set"; set.audit.checks.set_signal_detected = true;
  assert.equal(select([set], existingPair()).selected.length, 0);
  const inactive = structuredClone(value); inactive.audit.listing.status = "sold"; inactive.evidence.status = "sold";
  assert.equal(select([inactive], existingPair()).selected.length, 0);
});

test("candidate must be distinct from both listing identities and both storefronts", () => {
  const existing = existingPair();
  assert.equal(select([candidate(3, { storefront: "third-shop" })], existing).selected.length, 1);
  assert.equal(select([candidate(4, { storefront: "auc-toysanta" })], existing).selected.length, 0);
  assert.equal(select([candidate(5, { storefront: "realize-store" })], existing).selected.length, 0);
  assert.equal(select([candidate(6, { storefront: null })], existing).selected.length, 0);
  assert.equal(select([candidate(7, { storefront: "third-shop", sourceListingId: "auc-toysanta:10381220", publicUrl: existing[0].source_url })], existing).selected.length, 0);
  assert.equal(select([candidate(8, { storefront: "third-shop", sourceListingId: "realize-store:10745012", publicUrl: existing[1].source_url })], existing).selected.length, 0);
});

test("same-provider third storefront ranks before cross-provider and price never ranks", () => {
  const same = candidate(9, { storefront: "third-rakuten", price: 9999 });
  const cross = candidate(10, { provider: "yahoo_shopping", storefront: "third-yahoo", price: 1 });
  const selection = select([cross, same], existingPair(), {}, 1);
  assert.equal(selection.selected[0].candidate.candidate_key, same.key);
  assert.equal(selection.selected[0].rank_class, "A");
});

test("selection keeps one listing per variant and one variant per series while dry-run can inspect five", () => {
  const values = [
    candidate(11, { variant: "v1", series: "shared", storefront: "third-1" }),
    candidate(12, { variant: "v2", series: "shared", storefront: "third-2" }),
    candidate(13, { variant: "v3", series: "s3", storefront: "third-3" }),
  ];
  const existing = [...existingPair("v1"), ...existingPair("v2", "old-v2-a", "old-v2-b"), ...existingPair("v3", "old-v3-a", "old-v3-b")];
  const selection = select(values, existing, {}, 5);
  assert.equal(selection.selected.length, 2);
  assert.equal(new Set(selection.selected.map((entry) => entry.candidate.target.variant_id)).size, 2);
  assert.equal(new Set(selection.selected.map((entry) => entry.candidate.target.series_id)).size, 2);
});

test("rows persist only one sanitized listing/observation pair with P1 provenance", () => {
  const value = candidate(14, { storefront: "third-shop" });
  value.audit.raw_secret = "must-not-copy";
  const selected = select([value], existingPair(), {}, 1).selected;
  const rows = buildMarketP1BoundedRows({ selected, workflow: { run_id: "100", head_sha: sha }, observed_at: "2026-08-29T00:00:00.000Z" });
  assert.equal(rows.listingRows.length, 1);
  assert.equal(rows.observationRows.length, 1);
  assert.equal(rows.listingRows[0].raw.storefront_id, "third-shop");
  assert.equal(rows.listingRows[0].raw.p1_bounded_persistence.candidate_key, value.key);
  assert.equal(JSON.stringify(rows).includes("must-not-copy"), false);
  assert.throws(() => buildMarketP1BoundedRows({ selected: [...selected, ...selected], workflow: { run_id: "100", head_sha: sha } }));
});

test("prewrite recovers both legacy/current storefronts and recomputes stale evidence", () => {
  const selected = select([candidate(15, { storefront: "third-shop" })], existingPair(), {}, 1).selected;
  const rows = buildMarketP1BoundedRows({ selected, workflow: { run_id: "101", head_sha: sha } });
  const base = { rows, selected, existingActiveListings: existingPair() };
  assert.equal(assertMarketP1BoundedPrewrite(base), true);
  assert.throws(() => assertMarketP1BoundedPrewrite({ ...base, existingActiveListings: existingPair().slice(0, 1) }));
  assert.throws(() => assertMarketP1BoundedPrewrite({ ...base, existingActiveListings: [existingPair()[0], { ...existingPair()[1], raw: { provider: "rakuten_ichiba", source_listing_id: "malformed" } }] }));
  const stale = structuredClone(selected);
  stale[0].evidence.storefront_id = "auc-toysanta";
  stale[0].evidence.independent_storefront_evidence = true;
  const staleRows = buildMarketP1BoundedRows({ selected: stale, workflow: { run_id: "102", head_sha: sha } });
  assert.throws(() => assertMarketP1BoundedPrewrite({ rows: staleRows, selected: stale, existingActiveListings: existingPair() }));
  for (const key of ["listingIdConflicts", "observationIdConflicts", "sourceIdentityConflicts", "sourceUrlConflicts"]) {
    assert.throws(() => assertMarketP1BoundedPrewrite({ ...base, [key]: [{ id: "conflict" }] }));
  }
});

test("canary inserts exactly one pair and verifies 2 to 3 listing-guide evidence", async () => {
  const selected = select([candidate(16, { storefront: "third-shop", price: 700 })], existingPair(), {}, 1).selected;
  const rows = buildMarketP1BoundedRows({ selected, workflow: { run_id: "103", head_sha: sha } });
  const store = fakeStore({ existing: existingPair(), rows });
  const before = await store.fetchCounts();
  const outcome = await persistMarketP1Bounded({ rows, selected, store, beforeCounts: before });
  assert.equal(outcome.database_writes, 2);
  assert.equal(outcome.postwrite.target_active_listing_count_after, 3);
  assert.deepEqual(outcome.postwrite.deltas, { market_listings: 1, market_listing_observations: 1, import_issues: 0, ingestion_runs: 0, series: 0, variants: 0, complete_set: 0 });
  assert.deepEqual(outcome.postwrite.market_evidence, {
    tier: "listing_guide", label: "出品価格の目安", active_count: 3, completed_count: 0,
    primary_price: 700, minimum_price: 568, maximum_price: 748, eligible_for_price_ranking: false,
  });
});

test("unexpected postwrite count/tier fails and bounded rollback restores original counts", async () => {
  const selected = select([candidate(17, { storefront: "third-shop" })], existingPair(), {}, 1).selected;
  const rows = buildMarketP1BoundedRows({ selected, workflow: { run_id: "104", head_sha: sha } });
  const store = fakeStore({ existing: existingPair(), rows, suppressNewActive: true });
  const before = await store.fetchCounts();
  await assert.rejects(() => persistMarketP1Bounded({ rows, selected, store, beforeCounts: before }));
  assert.deepEqual(await store.fetchCounts(), before);
  assert.equal((await store.fetchRowsByIds("market_listings", [rows.listingRows[0].id])).length, 0);
});

test("artifact is sanitized, keeps both existing identities, and never infers merchant identity", () => {
  const selected = select([candidate(18, { storefront: "third-shop" })], existingPair(), {}, 1).selected;
  const counts = countSnapshot(64, 64);
  const dry = buildMarketP1BoundedArtifact({ workflow: { run_id: "105", head_sha: sha }, mode: "dry-run", status: "dry-run", write_authorized: false, selection: { selected }, before: counts, after: counts });
  assert.equal(dry.database_writes, 0);
  assert.equal(dry.write_eligible, false);
  assert.equal(dry.selected_candidates[0].existing_listings.length, 2);
  assert.equal(dry.selected_candidates[0].merchant_identity, null);
  assert.equal(dry.selected_candidates[0].merchant_identity_status, "unknown");
  assert.equal(JSON.stringify(dry).includes("seller"), false);
  const rollbackUnknown = buildMarketP1BoundedArtifact({ workflow: { run_id: "106", head_sha: sha }, mode: "canary-write", status: "rollback-failed", write_authorized: false, selection: { selected }, before: counts, after: null, rollback: { attempted: true, verified: false }, reason_code: "priority_1_bounded_persistence_failed" });
  assert.equal(rollbackUnknown.database_writes, null);
  assert.equal(rollbackUnknown.write_outcome_unknown, true);
});

test("P1 runner uses only the exact planner and leaves P2/P3 policies unchanged", () => {
  assert.match(runner, /planPriorityOneDistinctEvidenceQueries/);
  assert.match(runner, /priority_1_distinct_exact_diagnostic/);
  assert.doesNotMatch(runner, /buildMarketSearchQueriesForVariant|planPriorityThree|complete-set|complete_set_reference/);
  assert.match(runner, /mode === "dry-run"[\s\S]*database_writes: 0/);
  assert.deepEqual(MARKET_BOUNDED_PERSISTENCE_POLICIES.p1_distinct_v1, { name: "p1-distinct-bounded-v1", max_candidates: 1, insert_only: true });
  assert.deepEqual(MARKET_BOUNDED_PERSISTENCE_POLICIES.p2_distinct_v1, { name: "p2-distinct-bounded-v1", max_candidates: 2, insert_only: true });
  assert.equal(MARKET_BOUNDED_PERSISTENCE_POLICIES.p3_seed_v2.max_candidates, 25);
});

test("P1 read-only diagnostic preserves two existing identities and remains write/canary ineligible", () => {
  const value = candidate(19, { storefront: "third-shop" });
  const manual = buildPriorityOneBoundedEvidenceReadOnlyDiagnostic();
  assert.deepEqual(sanitizeManualMarketAuditDiagnostic(manual), manual);
  const counts = countSnapshot(64, 64);
  const diagnosticResult = buildPriorityOneDistinctEvidenceDiagnostic({
    audit: {
      mode: "dry-run", source_scope: "planner-apis", manual_diagnostic: manual,
      result: { report_complete: true, truncated_count: 0, candidate_count: 1, accepted_count: 1, review_count: 0 },
      database_writes: { listings: 0, observations: 0, ingestion_runs: 0 },
      selection: { selected_variants: [{ variant_id: "v1", series_id: "s1", series_name: "Series s1", variant_name: "Variant v1", priority: 1 }] },
      candidates: [value.audit], request_diagnostics: { queries: [] },
    },
    queryPlan: [{ variant_id: "v1", series_id: "s1", priority: 1, released: true, variant_type: "regular", query_profile: "priority_1_distinct_exact_diagnostic", query: "Series s1 Variant v1 ガチャ", fallback_queries: ["Series s1 Variant v1"] }],
    existingListings: existingPair(),
    candidateStorefronts: new Map([[value.key, { provider: "rakuten_ichiba", storefront_id: "third-shop", storefront_name: "Third", storefront_identity_source: "rakuten_item_search_shop_code", merchant_identity: null, merchant_identity_status: "unknown" }]]),
    before: counts,
    after: counts,
  });
  assert.equal(diagnosticResult.priority, 1);
  assert.equal(diagnosticResult.variants[0].existing_listing_identity.length, 2);
  assert.equal(diagnosticResult.variants[0].accepted_distinct[0].independent_storefront_evidence, true);
  assert.equal(diagnosticResult.write_eligible, false);
  assert.equal(diagnosticResult.canary_eligible, false);
  assert.equal(diagnosticResult.database_writes, 0);
});

function catalogFixture() {
  const variants = [
    { id: "p1", series_id: "s1", name: "Variant One", variant_type: "regular" }, { id: "p2", series_id: "s2", name: "Variant Two", variant_type: "regular" },
    { id: "p3", series_id: "s3", name: "Variant Three", variant_type: "regular" }, { id: "prov", series_id: "s4", name: "Provisional", variant_type: "provisional" },
    { id: "future", series_id: "s5", name: "Future", variant_type: "regular" },
  ];
  const series = variants.map((variant, index) => ({ id: variant.series_id, name: `Series ${["One", "Two", "Three", "Four", "Five"][index]}` }));
  return { variants, series, variantById: new Map(variants.map((entry) => [entry.id, entry])), seriesById: new Map(series.map((entry) => [entry.id, entry])) };
}

function candidate(index, options = {}) {
  const provider = options.provider ?? "rakuten_ichiba";
  const storefront = options.storefront === undefined ? `shop-${index}` : options.storefront;
  const sourceListingId = options.sourceListingId ?? (provider === "rakuten_ichiba" ? `${storefront}:item-${index}` : `${storefront}_item-${index}`);
  const publicUrl = options.publicUrl ?? (provider === "rakuten_ichiba" ? `https://item.rakuten.co.jp/${storefront}/item-${index}/` : `https://store.shopping.yahoo.co.jp/${storefront}/item-${index}.html`);
  const source = { provider, listing_id: sourceListingId, public_url: publicUrl };
  const key = buildMarketCandidateKey({ source });
  const variant = options.variant ?? "v1";
  const series = options.series ?? "s1";
  const audit = {
    candidate_key: key, source,
    listing: { title: `Series Variant ${index}`, price: options.price ?? 600, status: "active", listing_type: "single" },
    target: { variant_id: variant, variant_name: `Variant ${variant}`, series_id: series, series_name: `Series ${series}`, search_query: `Series ${series} Variant ${variant}` },
    assessment: { accepted: true, review_required: false, reason: "variant_and_parent_evidence_confirmed", confidence: options.confidence ?? 0.9 },
    checks: { set_signal_detected: false },
  };
  const evidence = {
    candidate_key: key, provider, source_listing_id: sourceListingId, public_url: publicUrl, price: audit.listing.price,
    status: "active", reason: audit.assessment.reason, confidence: audit.assessment.confidence, classification: "accepted_distinct",
    existing_match_fields: [], listing_identity: key, storefront_id: storefront, storefront_name: storefront ? `Store ${storefront}` : null,
    storefront_identity_source: storefront ? (provider === "rakuten_ichiba" ? "rakuten_item_search_shop_code" : "yahoo_shopping_item_search_storefront_id") : null,
    independent_storefront_evidence: options.independent ?? true, merchant_identity: null, merchant_identity_status: "unknown", independent_merchant_evidence: "unknown",
  };
  return { key, audit, evidence };
}

function diagnostic(values, overrides = {}) {
  const grouped = new Map();
  for (const value of values) {
    const variant = value.audit.target.variant_id;
    if (!grouped.has(variant)) grouped.set(variant, []);
    grouped.get(variant).push(value.evidence);
  }
  return {
    priority: overrides.priority ?? 1, query_profile: "priority_1_distinct_exact_diagnostic",
    variants: [...grouped].map(([variant, entries]) => {
      const value = values.find((entry) => entry.audit.target.variant_id === variant);
      return { variant_id: variant, series_id: value.audit.target.series_id, variant_name: value.audit.target.variant_name, priority: overrides.priority ?? 1, released: overrides.released ?? true, variant_type: overrides.variant_type ?? "regular", accepted_distinct: entries };
    }),
  };
}

function select(values, existing, overrides = {}, limit = 5) {
  return selectMarketP1BoundedCandidates({ audit: { candidates: values.map((entry) => entry.audit) }, diagnostic: diagnostic(values, overrides), existingListings: existing, limit });
}

function existingPair(variant = "v1", first = "auc-toysanta", second = "realize-store") {
  return [legacyRakutenListing({ variant, storefront: first, sourceListingId: `${first}:10381220`, price: 568 }), existingListing({ variant, storefront: second, sourceListingId: `${second}:10745012`, price: 748 })];
}

function existingListing({ variant = "v1", provider = "rakuten_ichiba", storefront = "realize-store", sourceListingId = `${storefront}:10745012`, price = 748 } = {}) {
  const source = provider === "rakuten_ichiba" ? "rakuten" : "yahoo_shopping";
  return {
    id: `${source}-${sourceListingId.replace(/[^a-z0-9]+/gi, "-")}`, variant_id: variant, matched_variant_id: variant, series_id: "s1",
    listing_type: "single", market_review_type: "single", price, status: "active", source,
    source_url: provider === "rakuten_ichiba" ? `https://item.rakuten.co.jp/${storefront}/${sourceListingId.split(":")[1]}/` : `https://store.shopping.yahoo.co.jp/${storefront}/item.html`,
    listed_at: "2026-08-28T00:00:00.000Z", last_observed_at: new Date().toISOString(), review_required: false,
    raw: { provider, source_listing_id: sourceListingId, storefront_id: storefront, storefront_name: `Store ${storefront}`, storefront_identity_source: provider === "rakuten_ichiba" ? "rakuten_item_search_shop_code" : "yahoo_shopping_item_search_storefront_id" },
  };
}

function legacyRakutenListing({ variant = "v1", storefront = "auc-toysanta", sourceListingId = "auc-toysanta:10381220", price = 568 } = {}) {
  return {
    id: `rakuten-${storefront}-10381220`, variant_id: variant, matched_variant_id: variant, series_id: "s1", listing_type: "single", market_review_type: "single",
    price, status: "active", source: "rakuten", source_url: `https://item.rakuten.co.jp/${storefront}/10381220/`, listed_at: "2026-08-28T00:00:00.000Z",
    last_observed_at: new Date().toISOString(), review_required: false, raw: { provider: "rakuten_ichiba", source_listing_id: sourceListingId },
  };
}

function countSnapshot(listings, observations) {
  return { market_listings: listings, market_listing_observations: observations, import_issues: 133, ingestion_runs: 209, review_required: 0, series: 10225, variants: 23727, stock_reports: 0, restock_events: 0, complete_set: 1 };
}

function fakeStore({ existing, rows, suppressNewActive = false }) {
  const tables = { market_listings: new Map(), market_listing_observations: new Map(), ingestion_runs: new Map() };
  const baseline = countSnapshot(64, 64);
  return {
    fetchRowsByIds: async (table, ids) => ids.map((id) => tables[table]?.get(id)).filter(Boolean).map(clone),
    fetchCounts: async () => ({ ...baseline, market_listings: baseline.market_listings + tables.market_listings.size, market_listing_observations: baseline.market_listing_observations + tables.market_listing_observations.size }),
    fetchActiveEligibleListingsByVariantIds: async () => suppressNewActive ? existing.map(clone) : [...existing, ...tables.market_listings.values()].map(clone),
    fetchP1PrewriteConflicts: async () => ({ listingIdConflicts: [], observationIdConflicts: [], sourceIdentityConflicts: [], sourceUrlConflicts: [] }),
    upsertRows: async (table, values) => values.forEach((value) => tables[table].set(value.id, clone(value))),
    deleteRowsByIds: async (table, ids) => ids.reduce((count, id) => count + (tables[table].delete(id) ? 1 : 0), 0),
    fetchObservationsByListingIds: async (ids) => [...tables.market_listing_observations.values()].filter((row) => ids.includes(row.listing_id)).map(clone),
  };
}

function clone(value) { return structuredClone(value); }
