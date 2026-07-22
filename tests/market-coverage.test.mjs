import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MARKET_COVERAGE_STATES,
  classifyVariantMarketCoverage,
  runMarketCollectionBatch,
  selectMarketCollectionTargets,
} from "../lib/domain/market-coverage.js";
import {
  applyMarketCandidateSafety,
  applyMarketPersistenceSafety,
  assessMarketCandidate,
  requiresPlannerMarketSafety,
} from "../lib/domain/market-match-safety.js";
import { MARKET_EVIDENCE_TIERS, classifyMarketEvidence, dedupeMarketListings } from "../lib/domain/market-evidence.js";
import {
  MARKET_SOURCE_SCOPES,
  describeMarketWriteReadiness,
  normalizeMarketSourceScope,
  selectMarketSourceFamilies,
} from "../lib/domain/market-source-scope.js";
import { describeMarketSourceConfiguration, fetchMarketListingsRaw } from "../lib/fetchers/market-fetcher.js";
import { buildMarketSearchQueriesForVariant, isSafeMarketSearchQuery } from "../lib/fetchers/market-query-planner.js";

const NOW = new Date("2026-07-22T12:00:00Z");
const series = Object.freeze({ id: "s1", slug: "adventure", name: "冒険ガチャ", franchise: "冒険物語", brand: "テスト社", release_date: "2026-07-01" });
const variant = Object.freeze({ id: "v1", slug: "hero", series_id: "s1", name: "勇者", variant_type: "normal", released: true, release_date: "2026-07-01" });
const upcoming = Object.freeze({ ...variant, id: "v2", slug: "future", name: "未来勇者", released: false, release_date: "2026-08-10" });

function listing(id, overrides = {}) {
  return {
    id,
    variant_id: overrides.variant_id ?? "v1",
    matched_variant_id: overrides.matched_variant_id,
    series_id: "s1",
    listing_type: overrides.listing_type ?? "single",
    market_review_type: overrides.market_review_type ?? "single",
    status: overrides.status ?? "sold",
    price: overrides.price ?? 1000,
    sold_at: overrides.sold_at ?? "2026-07-20T00:00:00Z",
    listed_at: overrides.listed_at ?? "2026-07-20T00:00:00Z",
    last_observed_at: overrides.last_observed_at,
    review_required: overrides.review_required ?? false,
    source_url: overrides.source_url,
  };
}

function listings(count, overrides = {}) {
  return Array.from({ length: count }, (_, index) => listing(`${overrides.prefix || "l"}${index}`, overrides));
}

function coverage(item = variant, rows = [], overrides = {}) {
  return classifyVariantMarketCoverage({ variant: item, parentSeries: overrides.parentSeries === undefined ? series : overrides.parentSeries, listings: rows, attempts: overrides.attempts ?? [], now: overrides.now ?? NOW });
}

function catalog(extraVariants = []) {
  const variants = [variant, { ...variant, id: "v3", slug: "mage", name: "魔法使い" }, ...extraVariants];
  return { series: [series], variants, seriesById: new Map([[series.id, series]]), variantById: new Map(variants.map((entry) => [entry.id, entry])) };
}

test("1 sold market is not a collection target", () => assert.equal(coverage(variant, listings(5)).priority, null));
test("2 reference market is not a collection target", () => assert.equal(coverage(variant, listings(3)).priority, null));
test("3 two completed listings are highest priority", () => assert.equal(coverage(variant, listings(2)).priority, 1));
test("4 one completed listing is second priority", () => assert.equal(coverage(variant, listings(1)).priority, 2));
test("5 two active listings are highest priority", () => assert.equal(coverage(variant, listings(2, { status: "active", sold_at: "" })).priority, 1));
test("6 one active listing is second priority", () => assert.equal(coverage(variant, listings(1, { status: "active", sold_at: "" })).priority, 2));
test("7 no evidence is classified explicitly", () => assert.equal(coverage().coverageState, MARKET_COVERAGE_STATES.NO_EVIDENCE));
test("8 provisional is not eligible", () => assert.equal(coverage({ ...variant, variant_type: "provisional" }).coverageState, MARKET_COVERAGE_STATES.NOT_ELIGIBLE));
test("9 missing parent is not eligible", () => assert.equal(coverage(variant, [], { parentSeries: null }).coverageState, MARKET_COVERAGE_STATES.NOT_ELIGIBLE));
test("10 coverage tier reuses Phase 2-B result", () => assert.equal(coverage(variant, listings(3)).marketTier, classifyMarketEvidence({ subject: variant, listings: listings(3), now: NOW }).tier));

test("11 near tier sorts before no evidence", () => {
  const nearVariant = { ...variant, id: "near", slug: "near" };
  const nearListings = listings(2).map((row) => ({ ...row, variant_id: "near" }));
  const plan = selectMarketCollectionTargets([coverage(), coverage(nearVariant, nearListings)], { now: NOW, cooldownHours: 0, limit: 2 });
  assert.equal(plan.selected[0].priority, 1);
});
test("12 recent no evidence sorts before old no evidence", () => {
  const recent = coverage();
  const old = coverage({ ...variant, id: "old", slug: "old", release_date: "2024-01-01" });
  const plan = selectMarketCollectionTargets([old, recent], { now: NOW, cooldownHours: 0, limit: 2 });
  assert.equal(plan.selected[0].variantId, "v1");
});
test("13 release within 60 days is targeted", () => assert.equal(coverage(upcoming).priority, 4));
test("14 cooldown excludes a recent attempt", () => assert.equal(selectMarketCollectionTargets([coverage(variant, [], { attempts: ["2026-07-22T00:00:00Z"] })], { now: NOW }).selected.length, 0));
test("15 target is selectable after cooldown", () => assert.equal(selectMarketCollectionTargets([coverage(variant, [], { attempts: ["2026-07-20T00:00:00Z"] })], { now: NOW }).selected.length, 1));
test("16 selection respects limit", () => {
  const rows = Array.from({ length: 10 }, (_, index) => coverage({ ...variant, id: `n${index}`, slug: `n${index}`, release_date: "2024-01-01" }));
  assert.equal(selectMarketCollectionTargets(rows, { now: NOW, cooldownHours: 0, limit: 3 }).selected.length, 3);
});
test("17 selection deduplicates variants", () => assert.equal(selectMarketCollectionTargets([coverage(), coverage()], { now: NOW, cooldownHours: 0 }).selected.length, 1));
test("18 day rotation changes the no-evidence window", () => {
  const rows = Array.from({ length: 12 }, (_, index) => coverage({ ...variant, id: `r${index}`, slug: `r${index}`, release_date: "2024-01-01" }));
  const first = selectMarketCollectionTargets(rows, { now: NOW, cooldownHours: 0, limit: 4 }).selected.map((row) => row.variantId);
  const second = selectMarketCollectionTargets(rows, { now: new Date("2026-07-23T12:00:00Z"), cooldownHours: 0, limit: 4 }).selected.map((row) => row.variantId);
  assert.notDeepEqual(first, second);
});
test("19 one item failure does not stop a batch", async () => {
  const result = await runMarketCollectionBatch([1, 2, 3], async (value) => { if (value === 2) throw new Error("denied"); return value; });
  assert.deepEqual(result.map((entry) => entry.ok), [true, false, true]);
});

test("20 query includes variant and parent series", () => assert.match(buildMarketSearchQueriesForVariant(variant, series)[0].query, /冒険ガチャ.*勇者/));
test("21 short variant is never queried alone", () => assert.match(buildMarketSearchQueriesForVariant({ ...variant, name: "A" }, series)[0].query, /^冒険ガチャ A /));
test("22 empty names produce no query", () => assert.equal(buildMarketSearchQueriesForVariant({ ...variant, name: "" }, series).length, 0));
test("23 equivalent queries are deduplicated", () => assert.equal(buildMarketSearchQueriesForVariant(variant, { ...series, franchise: series.name }).length, 1));
test("24 query length has an upper bound", () => assert.ok(buildMarketSearchQueriesForVariant({ ...variant, name: "勇".repeat(80) }, { ...series, name: "冒険".repeat(80) }, { maxQueryLength: 30 })[0].query.length <= 30));
test("25 provisional never generates a query", () => assert.equal(buildMarketSearchQueriesForVariant({ ...variant, variant_type: "provisional" }, series).length, 0));
test("26 query builder normalizes Unicode", () => assert.match(buildMarketSearchQueriesForVariant({ ...variant, name: "Ａ　勇者" }, series)[0].query, /A 勇者/));

test("27 variant and parent evidence are accepted", () => {
  const query = buildMarketSearchQueriesForVariant(variant, series)[0];
  assert.equal(assessMarketCandidate({ title: "冒険ガチャ 勇者 ガチャ 単品" }, query, catalog()).accepted, true);
});
test("28 variant-only partial evidence is rejected", () => {
  const query = buildMarketSearchQueriesForVariant(variant, series)[0];
  assert.equal(assessMarketCandidate({ title: "勇者 ガチャ 単品" }, query, catalog()).reason, "parent_series_evidence_missing");
});
test("29 multiple candidates require review", () => {
  const query = buildMarketSearchQueriesForVariant(variant, series)[0];
  assert.equal(assessMarketCandidate({ title: "冒険ガチャ 勇者 魔法使い 2点" }, query, catalog()).reviewRequired, true);
});
test("30 set listing is not linked to a single", () => {
  const query = buildMarketSearchQueriesForVariant(variant, series)[0];
  assert.equal(assessMarketCandidate({ title: "冒険ガチャ 勇者 2種セット" }, query, catalog()).accepted, false);
});
test("31 unknown listing is not public evidence", () => assert.equal(classifyMarketEvidence({ subject: variant, listings: listings(5, { listing_type: "unknown", market_review_type: "unknown" }), now: NOW }).eligibleListingCount, 0));
test("32 matched_variant_id wins over variant_id", () => assert.equal(classifyMarketEvidence({ subject: variant, listings: listings(3, { variant_id: "wrong", matched_variant_id: "v1" }), now: NOW }).tier, MARKET_EVIDENCE_TIERS.REFERENCE));
test("33 explicit conflicting variant is reviewed", () => {
  const query = buildMarketSearchQueriesForVariant(variant, series)[0];
  assert.equal(assessMarketCandidate({ title: "冒険ガチャ 勇者 ガチャ 単品", variant_id: "v3" }, query, catalog()).reviewRequired, true);
});

test("34 dry-run declares zero database writes", async () => {
  const source = await readFile(new URL("../scripts/market-backfill.mjs", import.meta.url), "utf8");
  assert.match(source, /mode: "dry-run"/);
  assert.match(source, /listing_upserts: 0/);
  assert.match(source, /ingestion_runs_written: 0/);
});
test("35 duplicate listing identity is inserted once", () => assert.equal(dedupeMarketListings([listing("a", { source_url: "https://example.com/1" }), listing("b", { source_url: "https://example.com/1" })]).length, 1));
test("36 a newer observation replaces the same listing snapshot", () => assert.equal(dedupeMarketListings([listing("a", { last_observed_at: "2026-07-20" }), listing("a", { last_observed_at: "2026-07-21", price: 1200 })])[0].price, 1200));
test("37 identical observation identity is deduplicated", () => assert.equal(dedupeMarketListings([listing("a"), listing("a")]).length, 1));
test("38 failed batch returns a failure summary", async () => assert.equal((await runMarketCollectionBatch([1], async () => { throw new Error("failed"); }))[0].error, "failed"));
test("39 service role secret is not logged", async () => {
  const source = await readFile(new URL("../scripts/market-backfill.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /console\.log\([^)]*SERVICE_ROLE/i);
});
test("40 market coverage has no sample fallback", async () => {
  const source = await readFile(new URL("../lib/domain/market-coverage.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /sample|mock/i);
});

test("41 Phase 2-B sold tier is preserved", () => assert.equal(classifyMarketEvidence({ subject: variant, listings: listings(5), now: NOW }).tier, MARKET_EVIDENCE_TIERS.SOLD));
test("42 publication rule is preserved", () => assert.equal(coverage({ ...variant, variant_type: "provisional" }).eligibleForPriceRanking, false));
test("43 provisional public coverage remains zero", () => assert.equal([coverage({ ...variant, variant_type: "provisional" })].filter((row) => row.coverageState !== "not_eligible").length, 0));
test("44 active listings are not completed sales", () => assert.equal(classifyMarketEvidence({ subject: variant, listings: listings(5, { status: "active", sold_at: "" }), now: NOW }).completedCount, 0));
test("45 ranking threshold remains three completed listings", () => {
  assert.equal(classifyMarketEvidence({ subject: variant, listings: listings(2), now: NOW }).eligibleForPriceRanking, false);
  assert.equal(classifyMarketEvidence({ subject: variant, listings: listings(3), now: NOW }).eligibleForPriceRanking, true);
});

test("safe-query checker requires both target and parent evidence", () => {
  assert.equal(isSafeMarketSearchQuery("冒険ガチャ 勇者 ガチャ 単品", variant, series), true);
  assert.equal(isSafeMarketSearchQuery("勇者", variant, series), false);
});

test("manual workflow defaults to dry-run without changing schedule frequency", async () => {
  const workflow = await readFile(new URL("../.github/workflows/gacha-ingestion.yml", import.meta.url), "utf8");
  assert.match(workflow, /default: dry-run/);
  assert.match(workflow, /concurrency:/);
  assert.equal((workflow.match(/cron:/g) ?? []).length, 3);
  assert.match(workflow, /"17,47 \* \* \* \*"/);
});

test("market APIs use bounded request timeouts and no retry loop", async () => {
  const rakuten = await readFile(new URL("../lib/fetchers/rakuten-market-fetcher.js", import.meta.url), "utf8");
  const yahoo = await readFile(new URL("../lib/fetchers/yahoo-shopping-fetcher.js", import.meta.url), "utf8");
  assert.match(rakuten, /AbortSignal\.timeout/);
  assert.match(yahoo, /AbortSignal\.timeout/);
  assert.doesNotMatch(`${rakuten}\n${yahoo}`, /retry\s*\(|for\s*\([^)]*attempt/i);
});

function assessedPersistenceFixture(title, options = {}) {
  const query = options.query ?? buildMarketSearchQueriesForVariant(variant, series)[0];
  const sourceRecord = {
    title,
    variant_id: options.explicitVariantId,
    raw: {
      provider: options.provider ?? "fixture-market-api",
      ...(options.includeQuery === false ? {} : { query }),
    },
  };
  const safety = applyMarketCandidateSafety({ records: [sourceRecord], queryPlan: [query], catalog: catalog() });
  const classifierRow = {
    variant_id: "v3",
    matched_variant_id: "v3",
    series_id: "s1",
    listing_type: "single",
    market_review_type: "single",
    classification_reason: "later_classifier_match",
    classification_confidence: 0.99,
    classification_details: { later_classifier: true },
    confidence: 0.99,
    review_required: false,
  };
  return {
    assessment: safety.assessments[0],
    transformed: safety.records[0],
    row: applyMarketPersistenceSafety(classifierRow, safety.records[0]),
  };
}

test("persistence safety stores accepted candidate on the assessed variant", () => {
  const fixture = assessedPersistenceFixture("冒険ガチャ 勇者 ガチャ 単品");
  assert.equal(fixture.row.variant_id, "v1");
  assert.equal(fixture.row.matched_variant_id, "v1");
  assert.equal(fixture.row.review_required, false);
});

test("persistence safety stores accepted candidate on the assessed series", () => {
  assert.equal(assessedPersistenceFixture("冒険ガチャ 勇者 ガチャ 単品").row.series_id, "s1");
});

test("multiple candidates clear links and require review before persistence", () => {
  const row = assessedPersistenceFixture("冒険ガチャ 勇者 魔法使い 2点").row;
  assert.deepEqual([row.variant_id, row.matched_variant_id, row.series_id, row.review_required], [null, null, null, true]);
});

test("explicit variant conflicts cannot be restored by the later classifier", () => {
  const row = assessedPersistenceFixture("冒険ガチャ 勇者 ガチャ 単品", { explicitVariantId: "v3" }).row;
  assert.equal(row.classification_reason, "explicit_variant_conflict");
  assert.equal(row.variant_id, null);
});

test("missing parent evidence cannot be linked", () => {
  const row = assessedPersistenceFixture("勇者 ガチャ 単品").row;
  assert.equal(row.classification_reason, "parent_series_evidence_missing");
  assert.equal(row.series_id, null);
});

test("missing variant evidence cannot be linked", () => {
  const row = assessedPersistenceFixture("冒険ガチャ ガチャ 単品").row;
  assert.equal(row.classification_reason, "target_variant_not_confirmed");
  assert.equal(row.variant_id, null);
});

test("set candidates are never persisted as target singles", () => {
  const row = assessedPersistenceFixture("冒険ガチャ 勇者 2種セット").row;
  assert.equal(row.classification_reason, "not_single_item");
  assert.equal(row.variant_id, null);
});

test("unsafe query candidates are unlinked before persistence", () => {
  const unsafeQuery = { query: "勇者", variant_id: "v1", series_id: "s1" };
  const row = assessedPersistenceFixture("冒険ガチャ 勇者 ガチャ 単品", { query: unsafeQuery }).row;
  assert.equal(row.classification_reason, "unsafe_search_query");
  assert.equal(row.review_required, true);
});

test("API candidates without query context become review records", () => {
  const row = assessedPersistenceFixture("冒険ガチャ 勇者 ガチャ 単品", { includeQuery: false, provider: "rakuten_ichiba" }).row;
  assert.equal(row.classification_reason, "query_context_missing");
  assert.ok(row.classification_confidence <= 0.49);
});

test("rejected safety records cannot contribute public price evidence", () => {
  const row = assessedPersistenceFixture("冒険ガチャ 勇者 2種セット").row;
  assert.equal(classifyMarketEvidence({ subject: variant, listings: [{ ...row, id: "unsafe", status: "sold", price: 1000 }], now: NOW }).eligibleListingCount, 0);
});

test("safety metadata preserves the provider raw response for audit", () => {
  const transformed = assessedPersistenceFixture("冒険ガチャ 勇者 ガチャ 単品").transformed;
  assert.equal(transformed.raw.provider, "fixture-market-api");
  assert.equal(transformed.raw.market_safety.accepted, true);
  assert.equal(transformed.market_safety_assessed, true);
});

test("approved feed rows without planner safety metadata retain existing handling", () => {
  const row = { variant_id: "v1", series_id: "s1", review_required: false };
  assert.deepEqual(applyMarketPersistenceSafety(row, { provider: "approved-feed" }), row);
});

test("mixed collection path only assesses planner API records", () => {
  const query = buildMarketSearchQueriesForVariant(variant, series)[0];
  const records = [
    { id: "rakuten-safe", title: "冒険ガチャ 勇者 ガチャ 単品", raw: { provider: "rakuten_ichiba", query } },
    { id: "yahoo-ambiguous", title: "冒険ガチャ 勇者 魔法使い 2点", raw: { provider: "yahoo_shopping", query } },
    { id: "rakuten-missing-query", title: "冒険ガチャ 勇者 ガチャ 単品", raw: { provider: "rakuten_ichiba" } },
    { id: "approved-feed", title: "冒険ガチャ 勇者 ガチャ 単品", raw: { fetch_context: { source: "approved-json" } } },
  ];
  const safety = applyMarketCandidateSafety({ records, queryPlan: [query], catalog: catalog() });
  const classifierRows = records.map(() => ({
    variant_id: "v3",
    matched_variant_id: "v3",
    series_id: "s1",
    listing_type: "single",
    market_review_type: "single",
    classification_reason: "existing_classifier",
    classification_confidence: 0.86,
    confidence: 0.86,
    review_required: false,
  }));
  const finalRows = safety.records.map((record, index) => applyMarketPersistenceSafety(classifierRows[index], record));

  assert.deepEqual(safety.summary, {
    accepted_listings: 1,
    ambiguous_listings: 2,
    safety_assessed_records: 3,
    safety_skipped_approved_feed_records: 1,
    variants_with_results: 1,
  });
  assert.deepEqual([finalRows[0].variant_id, finalRows[0].review_required], ["v1", false]);
  assert.deepEqual([finalRows[1].variant_id, finalRows[1].series_id, finalRows[1].review_required], [null, null, true]);
  assert.deepEqual([finalRows[2].classification_reason, finalRows[2].review_required], ["query_context_missing", true]);
  assert.deepEqual(finalRows[3], classifierRows[3]);
  assert.equal(safety.records[3].market_safety_assessed, undefined);
});

test("approved feed records are not planner-assessed or counted as ambiguous", () => {
  const record = { raw: { fetch_context: { format: "csv" } } };
  const result = applyMarketCandidateSafety({ records: [record], queryPlan: [], catalog: catalog() });
  assert.equal(requiresPlannerMarketSafety(record), false);
  assert.equal(result.records[0], record);
  assert.equal(result.records[0].market_safety_assessed, undefined);
  assert.equal(result.summary.ambiguous_listings, 0);
  assert.equal(result.summary.safety_skipped_approved_feed_records, 1);
});

test("planner API providers require safety even when query context is missing", () => {
  assert.equal(requiresPlannerMarketSafety({ raw: { provider: "rakuten_ichiba" } }), true);
  assert.equal(requiresPlannerMarketSafety({ raw: { provider: "yahoo_shopping" } }), true);
});

test("upsert path enforces safety and creates review issues", async () => {
  const source = await readFile(new URL("../scripts/upsert-market-data.mjs", import.meta.url), "utf8");
  assert.match(source, /applyMarketPersistenceSafety\(row, raw\)/);
  assert.match(source, /filter\(\(row\) => row\.review_required\)[\s\S]*createImportIssue/);
});

test("scheduled and manual ingestion share one non-cancelling concurrency group", async () => {
  const workflow = await readFile(new URL("../.github/workflows/gacha-ingestion.yml", import.meta.url), "utf8");
  assert.match(workflow, /group: gacha-ingestion\s+cancel-in-progress: false/);
  assert.equal((workflow.match(/cron:/g) ?? []).length, 3);
  assert.match(workflow, /default: dry-run/);
  assert.match(workflow, /if \[ -n "\$SCHEDULE" \]; then\s+mode=write/);
});

test("market source scope normalizes invalid input to the requested safe default", () => {
  assert.equal(normalizeMarketSourceScope("invalid", MARKET_SOURCE_SCOPES.PLANNER_APIS), MARKET_SOURCE_SCOPES.PLANNER_APIS);
  assert.equal(normalizeMarketSourceScope("invalid", "also-invalid"), MARKET_SOURCE_SCOPES.ALL);
});

test("planner scope selects APIs and excludes approved feeds", () => {
  assert.deepEqual(selectMarketSourceFamilies(MARKET_SOURCE_SCOPES.PLANNER_APIS), {
    sourceScope: MARKET_SOURCE_SCOPES.PLANNER_APIS,
    approvedFeedSourcesEnabled: false,
    plannerApiSourcesEnabled: true,
  });
});

test("approved feed scope excludes planner APIs", () => {
  assert.deepEqual(selectMarketSourceFamilies(MARKET_SOURCE_SCOPES.APPROVED_FEEDS), {
    sourceScope: MARKET_SOURCE_SCOPES.APPROVED_FEEDS,
    approvedFeedSourcesEnabled: true,
    plannerApiSourcesEnabled: false,
  });
});

test("all scope selects approved feeds and planner APIs", () => {
  assert.deepEqual(selectMarketSourceFamilies(MARKET_SOURCE_SCOPES.ALL), {
    sourceScope: MARKET_SOURCE_SCOPES.ALL,
    approvedFeedSourcesEnabled: true,
    plannerApiSourcesEnabled: true,
  });
});

test("planner-only write is blocked without a configured planner API", () => {
  assert.deepEqual(describeMarketWriteReadiness(MARKET_SOURCE_SCOPES.PLANNER_APIS, 0), {
    writeReady: false,
    blockingReason: "no_planner_api_source_configured",
  });
});

test("planner-only write becomes ready with one configured planner API", () => {
  assert.equal(describeMarketWriteReadiness(MARKET_SOURCE_SCOPES.PLANNER_APIS, 1).writeReady, true);
});

test("planner configuration never counts an approved feed", () => {
  const configuration = describeMarketSourceConfiguration({
    sourceScope: "planner-apis",
    sourcesJson: JSON.stringify([{ url: "https://feed.example/market.json" }]),
    queryCount: 5,
    rakuten: { enabled: false },
    yahoo: { enabled: false },
  });
  assert.equal(configuration.approvedFeedSourcesConfigured, 0);
  assert.equal(configuration.plannedSourceRequests.approved_feed_exports, 0);
  assert.equal(configuration.writeReady, false);
});

test("approved-feed configuration never counts planner credentials", () => {
  const configuration = describeMarketSourceConfiguration({
    sourceScope: "approved-feeds",
    sourcesJson: JSON.stringify([{ url: "https://feed.example/market.json" }]),
    queryCount: 5,
    rakuten: { enabled: true, applicationId: "id", accessKey: "key" },
    yahoo: { enabled: true, appId: "id" },
  });
  assert.equal(configuration.approvedFeedSourcesConfigured, 1);
  assert.equal(configuration.plannerApiSourcesConfigured, 0);
  assert.equal(configuration.plannedSourceRequests.rakuten_ichiba, 0);
  assert.equal(configuration.plannedSourceRequests.yahoo_shopping, 0);
});

test("planner fetch does not invoke approved feeds", async () => {
  const calls = [];
  const result = await fetchMarketListingsRaw({
    sourceScope: "planner-apis",
    sourcesJson: JSON.stringify([{ url: "https://feed.example/market.json" }]),
    queries: [{ query: "series variant", variant_id: "v1", series_id: "s1" }],
    rakuten: { enabled: true, applicationId: "id", accessKey: "key" },
    yahoo: { enabled: true, appId: "id" },
    adapters: sourceAdapters(calls),
  });
  assert.deepEqual(calls, ["rakuten", "yahoo"]);
  assert.equal(result.approvedFeedRequestsAttempted, 0);
  assert.equal(result.plannerApiRequestsAttempted, 2);
});

test("approved-feed fetch does not invoke Rakuten or Yahoo", async () => {
  const calls = [];
  const result = await fetchMarketListingsRaw({
    sourceScope: "approved-feeds",
    sourcesJson: JSON.stringify([{ url: "https://feed.example/market.json" }]),
    queries: [{ query: "series variant", variant_id: "v1", series_id: "s1" }],
    rakuten: { enabled: true, applicationId: "id", accessKey: "key" },
    yahoo: { enabled: true, appId: "id" },
    adapters: sourceAdapters(calls),
  });
  assert.deepEqual(calls, ["approved-feeds"]);
  assert.equal(result.approvedFeedRequestsAttempted, 1);
  assert.equal(result.plannerApiRequestsAttempted, 0);
});

test("all source fetch invokes both source families", async () => {
  const calls = [];
  const result = await fetchMarketListingsRaw({
    sourceScope: "all",
    sourcesJson: JSON.stringify([{ url: "https://feed.example/market.json" }]),
    queries: [{ query: "series variant", variant_id: "v1", series_id: "s1" }],
    rakuten: { enabled: true, applicationId: "id", accessKey: "key" },
    yahoo: { enabled: true, appId: "id" },
    adapters: sourceAdapters(calls),
  });
  assert.deepEqual(calls, ["approved-feeds", "rakuten", "yahoo"]);
  assert.equal(result.configuredSources, 3);
});

test("manual workflow defaults to planner APIs while scheduled ingestion forces all", async () => {
  const workflow = await readFile(new URL("../.github/workflows/gacha-ingestion.yml", import.meta.url), "utf8");
  assert.match(workflow, /source_scope:[\s\S]*default: planner-apis/);
  assert.match(workflow, /execute_sources:[\s\S]*default: false/);
  assert.match(workflow, /source_scope=all/);
  assert.match(workflow, /MARKET_SOURCE_SCOPE: \$\{\{ steps\.ingestion\.outputs\.source_scope \}\}/);
  assert.equal((workflow.match(/cron:/g) ?? []).length, 3);
});

test("manual write guard runs before the ingestion process is spawned", async () => {
  const source = await readFile(new URL("../scripts/market-backfill.mjs", import.meta.url), "utf8");
  assert.ok(source.indexOf("if (!sourcePlan.writeReady)") < source.indexOf("spawnScript(\"scripts/run-ingestion.mjs\""));
  assert.match(source, /No planner API source is configured\. Production write was not started\./);
  assert.match(source, /MARKET_SOURCE_SCOPE: options\.sourceScope/);
});

function sourceAdapters(calls) {
  const plannerResult = (source) => ({
    ok: true,
    enabled: true,
    source,
    configuredSources: 1,
    count: 1,
    records: [{ id: `${source}-1`, title: `${source} item`, raw: { provider: source } }],
    issues: [],
    feedResults: [{ name: source, source, format: "api", ok: true, status: 200, message: "" }],
  });
  return {
    approvedFeeds: async (sources) => {
      calls.push("approved-feeds");
      return sources.map((source) => ({ ok: true, source, status: 200, data: [{ id: "feed-1", title: "feed item" }] }));
    },
    rakuten: async () => {
      calls.push("rakuten");
      return plannerResult("rakuten_ichiba");
    },
    yahoo: async () => {
      calls.push("yahoo");
      return plannerResult("yahoo_shopping");
    },
  };
}
