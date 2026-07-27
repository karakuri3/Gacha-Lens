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
  buildFormalVariantsBySeries,
  findVariantNameOccurrences,
  prepareMarketSafetyCatalog,
  requiresPlannerMarketSafety,
} from "../lib/domain/market-match-safety.js";
import { MARKET_EVIDENCE_TIERS, classifyMarketEvidence, dedupeMarketListings } from "../lib/domain/market-evidence.js";
import {
  buildSanitizedMarketCandidateAudit,
  renderMarketCandidateAuditMarkdown,
  validateMarketCandidateAudit,
} from "../lib/domain/market-candidate-audit.js";
import { buildMarketCandidateKey } from "../lib/domain/market-candidate-key.js";
import {
  assertExactMarketAuditMatch,
  buildMarketCanaryRows,
  buildMarketplaceListingId,
  buildSanitizedCanaryFailureResult,
  canonicalMarketplaceSource,
  normalizeCanaryRollback,
  parseCanaryCandidateKeys,
  persistMarketCanary,
  renderMarketCanaryResultMarkdown,
  resolveStoredMarketplaceIdentity,
  selectApprovedCanaryCandidates,
  validateApprovedMarketAudit,
  validateCanaryRequest,
} from "../lib/domain/market-canary-write.js";
import { compactMarketRawPayload, mergeMarketRawRecords } from "../lib/domain/market-raw.js";
import { normalizeMarketplaceStatus } from "../lib/domain/market-status.js";
import {
  MARKET_SOURCE_SCOPES,
  describeMarketWriteReadiness,
  normalizeMarketSourceScope,
  selectMarketSourceFamilies,
} from "../lib/domain/market-source-scope.js";
import { describeMarketSourceConfiguration, fetchMarketListingsRaw } from "../lib/fetchers/market-fetcher.js";
import { buildMarketSearchQueriesForVariant, isSafeMarketSearchQuery } from "../lib/fetchers/market-query-planner.js";
import { upsertRows } from "../scripts/supabase-rest.mjs";

const NOW = new Date("2026-07-22T12:00:00Z");
const series = Object.freeze({ id: "s1", slug: "adventure", name: "冒険ガチャ", franchise: "冒険物語", brand: "テスト社", release_date: "2026-07-01" });
const variant = Object.freeze({ id: "v1", slug: "hero", series_id: "s1", name: "勇者", variant_type: "normal", released: true, release_date: "2026-07-01" });
const upcoming = Object.freeze({ ...variant, id: "v2", slug: "future", name: "未来勇者", released: false, release_date: "2026-08-10" });

function normalizeSourceLineEndings(value) {
  return String(value).replace(/\r\n?/g, "\n");
}

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

function matchingFixtureCatalog(parentSeries, targetVariant, siblingVariants = [], crossSeriesVariants = []) {
  const crossSeries = { id: "cross-series", slug: "cross-series", name: "別シリーズ", franchise: "別作品" };
  const variants = [targetVariant, ...siblingVariants, ...crossSeriesVariants.map((entry) => ({
    variant_type: "normal",
    ...entry,
    series_id: crossSeries.id,
  }))];
  const allSeries = [parentSeries, crossSeries];
  return {
    series: allSeries,
    variants,
    seriesById: new Map(allSeries.map((entry) => [entry.id, entry])),
    variantById: new Map(variants.map((entry) => [entry.id, entry])),
  };
}

function assessMatchingFixture({ title, parentName, targetName, siblings = [], collisions = [], targetId = "target" }) {
  const parentSeries = { id: "target-series", slug: "machine-id", name: parentName, franchise: parentName };
  const targetVariant = { id: targetId, slug: "machine-variant-id", series_id: parentSeries.id, name: targetName, variant_type: "normal" };
  const siblingVariants = siblings.map((entry, index) => ({
    id: entry.id ?? `sibling-${index}`,
    slug: entry.slug ?? `sibling-slug-${index}`,
    series_id: parentSeries.id,
    name: entry.name,
    variant_type: entry.variant_type ?? "normal",
  }));
  const crossSeriesVariants = collisions.map((name, index) => ({
    id: `collision-${index}`,
    slug: `collision-slug-${index}`,
    name,
  }));
  const fixtureCatalog = matchingFixtureCatalog(parentSeries, targetVariant, siblingVariants, crossSeriesVariants);
  const query = { query: `${parentName} ${targetName}`, variant_id: targetVariant.id, series_id: parentSeries.id };
  return assessMarketCandidate({ title }, query, fixtureCatalog);
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

test("Production GT-R candidate ignores cross-series ネコ and スカイ collisions", () => {
  const assessment = assessMatchingFixture({
    title: "tomica PREMIUM BOX型シリコンポーチ [4.日産 スカイライン GT-R (KPGC10)]【ネコポス配送対応】",
    parentName: "tomica PREMIUM BOX型シリコンポーチ",
    targetName: "日産 スカイライン GT-R(KPGC10)",
    collisions: ["ネコ", "スカイ"],
  });
  assert.equal(assessment.accepted, true);
  assert.deepEqual(assessment.classification.details.matched_variant_ids, ["target"]);
  assert.equal(assessment.confidence, 0.86);
});

test("Production マイク candidate ignores unrelated catalog collisions", () => {
  const assessment = assessMatchingFixture({
    title: "モンスターズ・インクへようこそ [3.マイク]【ネコポス配送対応】",
    parentName: "モンスターズ・インクへようこそ",
    targetName: "マイク",
    collisions: ["ネコ", "マイ", "モンスターズ・インク"],
  });
  assert.equal(assessment.accepted, true);
  assert.deepEqual(assessment.classification.details.matched_variant_ids, ["target"]);
  assert.equal(assessment.confidence, 0.86);
});

test("Production スポンジ candidate ignores cross-series ネコ collision", () => {
  const assessment = assessMatchingFixture({
    title: "PEANUTS リラクシングバスタイム [2.スポンジ]【ネコポス配送対応】",
    parentName: "PEANUTS リラクシングバスタイム",
    targetName: "スポンジ",
    collisions: ["ネコ"],
  });
  assert.equal(assessment.accepted, true);
  assert.deepEqual(assessment.classification.details.matched_variant_ids, ["target"]);
  assert.equal(assessment.confidence, 0.86);
});

test("Production ランドール candidate ignores unrelated catalog collisions", () => {
  const assessment = assessMatchingFixture({
    title: "モンスターズ・インクへようこそ [4.ランドール]【ネコポス配送対応】",
    parentName: "モンスターズ・インクへようこそ",
    targetName: "ランドール",
    collisions: ["ネコ", "ラン", "モンスターズ・インク"],
  });
  assert.equal(assessment.accepted, true);
  assert.deepEqual(assessment.classification.details.matched_variant_ids, ["target"]);
  assert.equal(assessment.confidence, 0.86);
});

test("same-series longer name rejects a contained shorter name before overlap handling", () => {
  const assessment = assessMatchingFixture({
    title: "対象シリーズ [3.マイク]",
    parentName: "対象シリーズ",
    targetName: "マイク",
    siblings: [{ id: "short", name: "マイ" }],
  });
  assert.equal(assessment.accepted, true);
  assert.deepEqual(assessment.classification.details.matched_variant_ids, ["target"]);
  assert.deepEqual(assessment.classification.details.suppressed_overlap_variant_ids, []);
});

test("contained short target is not accepted as evidence for the longer sibling", () => {
  const assessment = assessMatchingFixture({
    title: "対象シリーズ [3.マイク]",
    parentName: "対象シリーズ",
    targetName: "マイ",
    siblings: [{ id: "long", name: "マイク" }],
  });
  assert.equal(assessment.accepted, false);
  assert.equal(assessment.reason, "target_variant_not_confirmed");
  assert.deepEqual(assessment.classification.details.matched_variant_ids, ["long"]);
});

test("independent same-series sibling occurrences remain ambiguous", () => {
  const assessment = assessMatchingFixture({
    title: "対象シリーズ マイ / マイク",
    parentName: "対象シリーズ",
    targetName: "マイク",
    siblings: [{ id: "short", name: "マイ" }],
  });
  assert.equal(assessment.accepted, false);
  assert.equal(assessment.reason, "multiple_variant_candidates");
  assert.deepEqual(new Set(assessment.classification.details.matched_variant_ids), new Set(["target", "short"]));
});

test("duplicate normalized sibling names remain ambiguous", () => {
  const assessment = assessMatchingFixture({
    title: "対象シリーズ ネコ",
    parentName: "対象シリーズ",
    targetName: "ネコ",
    siblings: [{ id: "duplicate", name: "ネコ" }],
  });
  assert.equal(assessment.accepted, false);
  assert.equal(assessment.reason, "multiple_variant_candidates");
  assert.deepEqual(new Set(assessment.classification.details.matched_variant_ids), new Set(["target", "duplicate"]));
});

test("matching only scans formal variants in the target series", () => {
  const collisions = Array.from({ length: 10000 }, (_, index) => `衝突${index}`);
  collisions.push("マイク");
  const assessment = assessMatchingFixture({
    title: "対象シリーズ マイク",
    parentName: "対象シリーズ",
    targetName: "マイク",
    siblings: [{ id: "provisional", name: "マイク", variant_type: "provisional" }],
    collisions,
  });
  assert.equal(assessment.accepted, true);
  assert.deepEqual(assessment.classification.details.matched_variant_ids, ["target"]);
});

test("same-series ネコ does not match inside ネコポス delivery text", () => {
  const assessment = assessMatchingFixture({
    title: "対象シリーズ [3.マイク]【ネコポス配送対応】",
    parentName: "対象シリーズ",
    targetName: "マイク",
    siblings: [{ id: "cat", name: "ネコ" }],
  });
  assert.equal(assessment.accepted, true);
  assert.deepEqual(assessment.classification.details.matched_variant_ids, ["target"]);
  assert.deepEqual(assessment.classification.details.suppressed_overlap_variant_ids, []);
});

test("delivery text alone cannot confirm the ネコ target", () => {
  const assessment = assessMatchingFixture({
    title: "対象シリーズ [2.イヌ]【ネコポス配送対応】",
    parentName: "対象シリーズ",
    targetName: "ネコ",
    siblings: [{ id: "dog", name: "イヌ" }],
  });
  assert.equal(assessment.accepted, false);
  assert.equal(assessment.reason, "target_variant_not_confirmed");
  assert.deepEqual(assessment.classification.details.matched_variant_ids, ["dog"]);
});

test("formal bracketed ネコ remains valid target evidence", () => {
  const assessment = assessMatchingFixture({
    title: "対象シリーズ [1.ネコ]",
    parentName: "対象シリーズ",
    targetName: "ネコ",
  });
  assert.equal(assessment.accepted, true);
  assert.deepEqual(assessment.classification.details.matched_variant_ids, ["target"]);
});

test("variant matcher rejects incidental Japanese and ASCII substrings", () => {
  assert.equal(findVariantNameOccurrences("ランドール", "ラン").length, 0);
  assert.equal(findVariantNameOccurrences("スカイライン", "スカイ").length, 0);
  assert.equal(findVariantNameOccurrences("CARTON", "CAR").length, 0);
  assert.equal(findVariantNameOccurrences("マイ / ク", "マイク").length, 0);
  assert.equal(findVariantNameOccurrences("[1.ネコ]", "ネコ").length, 1);
});

test("variant matcher preserves punctuation and width variations inside a formal name", () => {
  const assessment = assessMatchingFixture({
    title: "シリーズ名 [4.日産 スカイライン GT-R (KPGC10)]",
    parentName: "シリーズ名",
    targetName: "日産 スカイライン GT-R（ＫＰＧＣ１０）",
  });
  assert.equal(assessment.accepted, true);
  assert.deepEqual(assessment.classification.details.matched_variant_ids, ["target"]);
});

test("formal variant index groups once and excludes provisional records", () => {
  const index = buildFormalVariantsBySeries([
    { id: "a", series_id: "s1", name: "A", variant_type: "normal" },
    { id: "b", series_id: "s1", name: "B", variant_type: "provisional" },
    { id: "c", series_id: "s2", name: "C", variant_type: "normal" },
  ]);
  assert.deepEqual(index.get("s1").map((entry) => entry.id), ["a"]);
  assert.deepEqual(index.get("s2").map((entry) => entry.id), ["c"]);
});

test("candidate safety builds the formal variant index once per batch", () => {
  const parentSeries = { id: "batch-series", slug: "batch-series", name: "対象シリーズ", franchise: "対象作品" };
  const targetVariant = { id: "batch-target", slug: "batch-target", series_id: parentSeries.id, name: "マイク", variant_type: "normal" };
  let catalogScans = 0;
  const variants = new Proxy([targetVariant], {
    get(target, property, receiver) {
      if (property === Symbol.iterator) catalogScans += 1;
      return Reflect.get(target, property, receiver);
    },
  });
  const batchCatalog = {
    series: [parentSeries],
    variants,
    seriesById: new Map([[parentSeries.id, parentSeries]]),
    variantById: new Map([[targetVariant.id, targetVariant]]),
  };
  const query = { query: "対象シリーズ マイク", variant_id: targetVariant.id, series_id: parentSeries.id };
  const records = [
    { id: "one", title: "対象シリーズ [3.マイク]", raw: { provider: "yahoo_shopping", query } },
    { id: "two", title: "対象シリーズ マイク 単品", raw: { provider: "rakuten_ichiba", query } },
  ];
  const result = applyMarketCandidateSafety({ records, queryPlan: [query], catalog: batchCatalog });
  assert.equal(result.summary.accepted_listings, 2);
  assert.equal(catalogScans, 1);
});

test("prepared catalog matching never reads the full variants collection", () => {
  const parentSeries = { id: "prepared-series", slug: "prepared-series", name: "対象シリーズ", franchise: "対象作品" };
  const targetVariant = { id: "prepared-target", slug: "prepared-target", series_id: parentSeries.id, name: "マイク", variant_type: "normal" };
  const prepared = prepareMarketSafetyCatalog({
    series: [parentSeries],
    variants: [targetVariant],
    seriesById: new Map([[parentSeries.id, parentSeries]]),
    variantById: new Map([[targetVariant.id, targetVariant]]),
  });
  Object.defineProperty(prepared, "variants", {
    get() {
      throw new Error("full catalog variants must not be read after preparation");
    },
  });
  const query = { query: "対象シリーズ マイク", variant_id: targetVariant.id, series_id: parentSeries.id };
  const assessment = assessMarketCandidate({ title: "対象シリーズ [3.マイク]" }, query, prepared);
  assert.equal(assessment.accepted, true);
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

const auditSeries = { id: "audit-series", slug: "audit-series", name: "Audit Series", franchise: "Audit" };
const auditVariants = [
  { id: "audit-v1", slug: "hero", name: "Hero", series_id: auditSeries.id, variant_type: "normal" },
  { id: "audit-v2", slug: "mage", name: "Mage", series_id: auditSeries.id, variant_type: "normal" },
  { id: "audit-provisional", slug: "hidden", name: "Hidden Provisional", series_id: auditSeries.id, variant_type: "provisional" },
];
const auditCatalog = {
  series: [auditSeries],
  variants: auditVariants,
  seriesById: new Map([[auditSeries.id, auditSeries]]),
  variantById: new Map(auditVariants.map((entry) => [entry.id, entry])),
};
const auditQueryPlan = [{ query: "Audit Series Hero gacha single", variant_id: "audit-v1", series_id: auditSeries.id, priority: 1, priority_reason: "missing_evidence" }];

function auditRecord(overrides = {}) {
  return {
    id: overrides.id ?? "candidate-1",
    title: overrides.title ?? "Audit Series Hero | limited\nitem",
    price: 1200,
    status: "active",
    source_url: overrides.source_url ?? "https://user:password@example.com/item/1?token=secret#tracking",
    market_safety_assessed: overrides.market_safety_assessed ?? true,
    market_safety: {
      accepted: overrides.accepted ?? true,
      review_required: overrides.review_required ?? false,
      reason: overrides.reason ?? "variant_and_parent_evidence_confirmed",
      variant_id: overrides.accepted === false ? null : "audit-v1",
      series_id: overrides.accepted === false ? null : auditSeries.id,
      listing_type: "single",
      confidence: overrides.confidence ?? 0.86,
      matched_variant_ids: overrides.matched_variant_ids ?? ["audit-v1", "audit-provisional"],
      checks: {
        variant_evidence_present: true,
        parent_series_evidence_present: true,
        set_signal_detected: false,
        multiple_variant_candidates: overrides.multiple ?? false,
        explicit_variant_conflict: false,
        query_context_present: true,
      },
    },
    raw: {
      provider: overrides.provider ?? "yahoo_shopping",
      code: overrides.code ?? "public-code-1",
      itemCode: overrides.itemCode,
      public_item_url: overrides.public_item_url,
      query: auditQueryPlan[0],
      applicationId: "DO_NOT_REPORT_APPLICATION_ID",
      accessKey: "DO_NOT_REPORT_ACCESS_KEY",
      authorization: "Bearer DO_NOT_REPORT",
      seller: { email: "seller@example.com" },
      response: { private: true },
    },
  };
}

function auditReport(records = [auditRecord()], overrides = {}) {
  return buildSanitizedMarketCandidateAudit({
    records,
    queryPlan: auditQueryPlan,
    catalog: auditCatalog,
    runContext: {
      generated_at: "2026-07-23T00:00:00.000Z",
      mode: "dry-run",
      source_scope: "planner-apis",
      run_id: "123",
      run_attempt: "1",
      head_sha: "abc123",
      event_name: "workflow_dispatch",
      ...overrides.runContext,
    },
    summary: {
      safety_assessed_records: records.filter((record) => record.market_safety_assessed).length,
      no_result_variants: 0,
      listing_upserts: 0,
      observations_created: 0,
      ingestion_runs_written: 0,
      ...overrides.summary,
    },
  });
}

test("candidate audit includes stable schema and workflow metadata", () => {
  const report = auditReport();
  assert.equal(report.schema_version, 1);
  assert.deepEqual(report.workflow, { run_id: "123", run_attempt: "1", head_sha: "abc123", event_name: "workflow_dispatch" });
  assert.equal(validateMarketCandidateAudit(report), true);
});

test("candidate audit preserves selected target and parent series", () => {
  const selected = auditReport().selection.selected_variants[0];
  assert.deepEqual([selected.variant_id, selected.variant_name, selected.series_id, selected.series_name], ["audit-v1", "Hero", "audit-series", "Audit Series"]);
  assert.equal(selected.priority_reason, "missing_evidence");
});

test("candidate audit preserves accepted safety decisions", () => {
  const candidate = auditReport().candidates[0];
  assert.equal(candidate.assessment.accepted, true);
  assert.equal(candidate.assessment.review_required, false);
  assert.equal(candidate.assessment.reason, "variant_and_parent_evidence_confirmed");
});

test("candidate audit preserves review reasons", () => {
  const report = auditReport([auditRecord({ accepted: false, review_required: true, reason: "multiple_variant_candidates", multiple: true })]);
  assert.equal(report.result.review_count, 1);
  assert.equal(report.candidates[0].assessment.reason, "multiple_variant_candidates");
  assert.equal(report.candidates[0].checks.multiple_variant_candidates, true);
});

test("matched variant names resolve from catalog without provisional disclosure", () => {
  const assessment = auditReport().candidates[0].assessment;
  assert.deepEqual(assessment.matched_variant_names, ["Hero"]);
  assert.doesNotMatch(JSON.stringify(assessment), /Hidden Provisional/);
  assert.equal(assessment.matched_variant_overflow, 0);
});

test("approved feed rows are excluded from planner candidate audits", () => {
  const approved = auditRecord({ id: "approved", market_safety_assessed: false });
  const report = auditReport([auditRecord(), approved], { summary: { safety_assessed_records: 1 } });
  assert.equal(report.candidates.length, 1);
});

test("candidate audit serializes allowlisted fields instead of raw responses", () => {
  const serialized = JSON.stringify(auditReport());
  for (const forbidden of ["DO_NOT_REPORT_APPLICATION_ID", "DO_NOT_REPORT_ACCESS_KEY", "Bearer DO_NOT_REPORT", "seller@example.com", '"raw"']) {
    assert.doesNotMatch(serialized, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("public URLs remove credentials, query strings and fragments", () => {
  const source = auditReport().candidates[0].source;
  assert.equal(source.public_url, "https://example.com/item/1");
  assert.equal(source.public_url_host, "example.com");
});

test("Rakuten audit uses public item URL instead of affiliate URL", () => {
  const record = auditRecord({
    provider: "rakuten_ichiba",
    source_url: "https://affiliate.example/click?affiliateId=private",
    public_item_url: "https://item.rakuten.co.jp/shop/item?scid=tracking#fragment",
    itemCode: "shop:item",
  });
  assert.equal(auditReport([record]).candidates[0].source.public_url, "https://item.rakuten.co.jp/shop/item");
});

test("invalid and non-http public URLs are omitted", () => {
  assert.equal(auditReport([auditRecord({ source_url: "javascript:alert(1)" })]).candidates[0].source.public_url, null);
});

test("candidate titles are normalized, bounded and control-free", () => {
  const title = `Ａ\u0000\n${"x".repeat(400)}`;
  const output = auditReport([auditRecord({ title })]).candidates[0].listing.title;
  assert.ok(output.startsWith("A "));
  assert.ok(output.length <= 300);
  assert.doesNotMatch(output, /[\u0000-\u001f\u007f]/);
});

test("Markdown escapes tables and executable HTML", () => {
  const markdown = renderMarketCandidateAuditMarkdown(auditReport());
  assert.match(markdown, /Audit Series Hero \\| limited item/);
  assert.doesNotMatch(markdown, /<script>/i);
});

test("Markdown renders all external text as plain text", () => {
  const report = auditReport([auditRecord({
    title: "[click](https://tracker.example) ![pixel](https://tracker.example/pixel) `code` **bold** ~~strike~~ | <script>",
  })]);
  const candidate = report.candidates[0];
  candidate.source.provider = "[provider](https://tracker.example)";
  candidate.target.variant_name = "![variant](https://tracker.example/pixel)";
  candidate.target.series_name = "`series`";
  candidate.assessment.reason = "**reason**";
  const markdown = renderMarketCandidateAuditMarkdown(report);
  const row = markdown.split("\n").find((line) => line.includes(candidate.candidate_key));

  assert.ok(row);
  assert.match(row, /\\\[click\\\]\\\(https:\/\/tracker\\\.example\\\)/);
  assert.match(row, /\\!\\\[pixel\\\]\\\(https:\/\/tracker\\\.example\/pixel\\\)/);
  assert.match(row, /\\`code\\`/);
  assert.match(row, /\\\*\\\*bold\\\*\\\*/);
  assert.match(row, /\\~\\~strike\\~\\~/);
  assert.match(row, /\\\|/);
  assert.match(row, /\\<script\\>/);
  assert.doesNotMatch(row, /(?<!\\)!\[/);
  assert.doesNotMatch(row, /(?<!\\)\[[^\]]+\]\(/);
  assert.doesNotMatch(row, /(?<!\\)<script>/i);
});

test("JSON text remains readable without Markdown escaping", () => {
  const title = "[click](url) `code` **bold**";
  const report = auditReport([auditRecord({ title })]);
  assert.equal(report.candidates[0].listing.title, title);
  assert.doesNotMatch(report.candidates[0].listing.title, /\\/);
});

test("Unicode direction and format controls are removed from audit text", () => {
  const controls = "\u061c\u200e\u200f\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069\ufeff";
  const report = auditReport([auditRecord({ title: `safe${controls} title\u0000` })]);
  const serialized = JSON.stringify(report);
  assert.equal(report.candidates[0].listing.title, "safe title");
  assert.doesNotMatch(serialized, /[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/);
});

test("audit validation rejects forbidden fields", () => {
  const report = auditReport();
  report.workflow.authorization = "private";
  assert.throws(() => validateMarketCandidateAudit(report), /Forbidden audit field/);
});

test("audit validation rejects nonzero dry-run writes", () => {
  const report = auditReport();
  report.database_writes.listings = 1;
  assert.throws(() => validateMarketCandidateAudit(report), /zero database writes/);
});

test("candidate audit is deterministic apart from generated metadata", () => {
  assert.deepEqual(auditReport(), auditReport());
});

test("candidate audit reports truncation instead of silently dropping records", () => {
  const records = Array.from({ length: 201 }, (_, index) => auditRecord({ id: `candidate-${index}`, code: `code-${index}` }));
  const report = auditReport(records);
  assert.equal(report.candidates.length, 200);
  assert.equal(report.result.report_complete, false);
  assert.equal(report.result.truncated_count, 1);
});

test("workflow uploads only the two sanitized reports for external manual dry-runs", async () => {
  const workflow = await readFile(new URL("../.github/workflows/gacha-ingestion.yml", import.meta.url), "utf8");
  assert.match(workflow, /Upload sanitized market candidate audit/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'[\s\S]*mode == 'dry-run'[\s\S]*execute_sources == 'true'/);
  assert.match(workflow, /market-candidate-audit\.json[\s\S]*market-candidate-audit\.md/);
  assert.match(workflow, /if-no-files-found: error[\s\S]*retention-days: 7/);
  assert.doesNotMatch(workflow, /gacha-market-audit\/ingestion\.log/);
});

test("market backfill writes audits to runner or OS temp and never makes them a write prerequisite", async () => {
  const source = await readFile(new URL("../scripts/market-backfill.mjs", import.meta.url), "utf8");
  assert.match(source, /MARKET_AUDIT_OUTPUT_DIR \|\| path\.join\(os\.tmpdir\(\), "gacha-lens-market-audit"\)/);
  assert.match(source, /if \(options\.executeSources\)/);
  const writeMode = source.match(
    /async function runWriteMode[\s\S]*?\n}\n\nfunction assessFetchedRecords/,
  )?.[0] ?? "";
  assert.doesNotMatch(writeMode, /writeAuditReport/);
});

function approvedAudit(overrides = {}) {
  const report = structuredClone(auditReport());
  Object.assign(report, overrides);
  if (overrides.workflow) report.workflow = { ...auditReport().workflow, ...overrides.workflow };
  if (overrides.result) report.result = { ...auditReport().result, ...overrides.result };
  if (overrides.database_writes) report.database_writes = { ...auditReport().database_writes, ...overrides.database_writes };
  return report;
}

function validAuditOptions(overrides = {}) {
  return {
    auditRunId: "123",
    isAncestor: true,
    now: "2026-07-24T00:00:00.000Z",
    ...overrides,
  };
}

test("canary audit rejects a schema version mismatch", () => {
  assert.throws(() => validateApprovedMarketAudit(approvedAudit({ schema_version: 2 }), validAuditOptions()), /schema/i);
});
test("canary audit rejects a non-dry-run report", () => {
  assert.throws(() => validateApprovedMarketAudit(approvedAudit({ mode: "write" }), validAuditOptions()), /dry-run/);
});
test("canary audit rejects non-planner sources", () => {
  assert.throws(() => validateApprovedMarketAudit(approvedAudit({ source_scope: "all" }), validAuditOptions()), /planner-apis/);
});
test("canary audit rejects an incomplete report", () => {
  assert.throws(() => validateApprovedMarketAudit(approvedAudit({ result: { report_complete: false } }), validAuditOptions()), /incomplete/);
});
test("canary audit rejects a truncated report", () => {
  const report = approvedAudit({ result: { report_complete: false, truncated_count: 1 } });
  assert.throws(() => validateApprovedMarketAudit(report, validAuditOptions()), /incomplete|truncated/);
});
test("canary audit rejects prior database writes", () => {
  assert.throws(() => validateApprovedMarketAudit(approvedAudit({ database_writes: { listings: 1 } }), validAuditOptions()), /zero database writes/);
});
test("canary audit rejects a different run ID", () => {
  assert.throws(() => validateApprovedMarketAudit(approvedAudit(), validAuditOptions({ auditRunId: "999" })), /run ID/);
});
test("canary audit rejects a non-ancestor head", () => {
  assert.throws(() => validateApprovedMarketAudit(approvedAudit(), validAuditOptions({ isAncestor: false })), /ancestor/);
});
test("canary audit rejects an expired artifact", () => {
  assert.throws(() => validateApprovedMarketAudit(approvedAudit(), validAuditOptions({ now: "2026-08-01T00:00:01.000Z" })), /expired/);
});
test("canary request rejects invalid candidate key format", () => {
  assert.throws(() => parseCanaryCandidateKeys("ABC"), /lowercase hex/);
});
test("guarded small-batch accepts four candidate keys and rejects five", () => {
  assert.equal(parseCanaryCandidateKeys([
    "1111111111111111",
    "2222222222222222",
    "3333333333333333",
    "4444444444444444",
  ]).length, 4);
  assert.throws(
    () => parseCanaryCandidateKeys("1111111111111111,2222222222222222,3333333333333333,4444444444444444,5555555555555555"),
    /one and four/,
  );
});
test("canary request rejects duplicate candidate keys", () => {
  assert.throws(() => parseCanaryCandidateKeys("1111111111111111,1111111111111111"), /duplicates/);
});
test("canary subset rejects a key absent from the audit", () => {
  assert.throws(() => selectApprovedCanaryCandidates(approvedAudit(), ["1111111111111111"]), /not present/);
});
test("canary subset rejects a review candidate", () => {
  const report = approvedAudit();
  report.candidates[0].assessment.accepted = false;
  report.candidates[0].assessment.review_required = true;
  assert.throws(() => selectApprovedCanaryCandidates(report, [report.candidates[0].candidate_key]), /not approved/);
});
test("canary request requires manual market planner released constraints", () => {
  const input = { eventName: "workflow_dispatch", task: "market", mode: "canary-write", sourceScope: "planner-apis", limit: 5, priority: "1", release: "released", auditRunId: "123", candidateKeys: "1111111111111111" };
  assert.equal(validateCanaryRequest(input).candidateKeys.length, 1);
  for (const change of [{ eventName: "schedule" }, { task: "all" }, { sourceScope: "all" }, { limit: 6 }, { priority: "all" }, { priority: "2" }, { release: "all" }]) {
    assert.throws(() => validateCanaryRequest({ ...input, ...change }));
  }
});

function changedAudit(mutator) {
  const report = approvedAudit();
  mutator(report);
  return report;
}

test("exact comparison rejects an added candidate", () => {
  assert.throws(() => assertExactMarketAuditMatch(approvedAudit(), changedAudit((report) => {
    report.candidates.push(structuredClone(report.candidates[0]));
    report.candidates[1].candidate_key = "1111111111111111";
    report.result.candidate_count = 2;
    report.result.accepted_count = 2;
  })), /exactly match/);
});
test("exact comparison rejects a missing candidate", () => {
  assert.throws(() => assertExactMarketAuditMatch(approvedAudit(), changedAudit((report) => {
    report.candidates = [];
    report.result.candidate_count = 0;
    report.result.accepted_count = 0;
  })), /exactly match/);
});
for (const [name, mutate] of [
  ["title", (report) => { report.candidates[0].listing.title += " changed"; }],
  ["price", (report) => { report.candidates[0].listing.price += 1; }],
  ["status", (report) => { report.candidates[0].listing.status = "sold_out"; }],
  ["URL", (report) => { report.candidates[0].source.public_url = "https://example.com/item/2"; }],
  ["target", (report) => { report.candidates[0].target.variant_id = "other"; }],
  ["confidence", (report) => { report.candidates[0].assessment.confidence = 0.85; }],
  ["query", (report) => { report.selection.selected_variants[0].query += " changed"; }],
]) {
  test(`exact comparison rejects a ${name} change`, () => {
    assert.throws(() => assertExactMarketAuditMatch(approvedAudit(), changedAudit(mutate)), /exactly match/);
  });
}
test("exact comparison accepts only an exact report while ignoring run metadata", () => {
  const current = changedAudit((report) => {
    report.generated_at = "2026-07-24T01:00:00.000Z";
    report.workflow.run_id = "456";
    report.workflow.run_attempt = "2";
    report.workflow.head_sha = "def456";
  });
  assert.equal(assertExactMarketAuditMatch(approvedAudit(), current), true);
});

test("market status keeps completed sales distinct from inventory", () => {
  assert.equal(normalizeMarketplaceStatus("sold"), "sold");
  assert.equal(normalizeMarketplaceStatus("売却済み"), "sold");
  assert.equal(normalizeMarketplaceStatus("sold_out"), "sold_out");
  assert.equal(normalizeMarketplaceStatus("売り切れ"), "sold_out");
  assert.equal(normalizeMarketplaceStatus("在庫切れ"), "sold_out");
  assert.equal(normalizeMarketplaceStatus("active"), "active");
  assert.equal(normalizeMarketplaceStatus(""), "active");
});
test("sold_out never becomes completed or active evidence", () => {
  const result = classifyMarketEvidence({
    subject: variant,
    listings: [listing("sold-out", { status: "sold_out", sold_at: "", last_observed_at: "2026-07-21T00:00:00Z" })],
    now: NOW,
  });
  assert.equal(result.completedCount, 0);
  assert.equal(result.activeCount, 0);
});
test("only sold contributes completed evidence", () => {
  const result = classifyMarketEvidence({
    subject: variant,
    listings: [
      listing("sold", { status: "sold" }),
      listing("sold-out", { status: "sold_out", sold_at: "", last_observed_at: "2026-07-21T00:00:00Z" }),
    ],
    now: NOW,
  });
  assert.equal(result.completedCount, 1);
});

const productionCandidateFixtures = [
  {
    key: "1e901198049bc341",
    provider: "rakuten_ichiba",
    listingId: "auc-toysanta:10380564",
    url: "https://item.rakuten.co.jp/auc-toysanta/g-5l3e0018ii-004/",
    rowId: "rakuten-auc-toysanta-10380564",
    variantId: "gt-r",
    seriesId: "tomica",
    variantName: "日産 スカイライン GT-R(KPGC10)",
    status: "active",
  },
  {
    key: "2e833931e4e7cb26",
    provider: "yahoo_shopping",
    listingId: "toysanta_g-5l3e0018if-003-57687",
    url: "https://store.shopping.yahoo.co.jp/toysanta/g-5l3e0018if-003-57687.html",
    rowId: "yahoo-toysanta-g-5l3e0018if-003-57687",
    variantId: "mike",
    seriesId: "monsters",
    variantName: "マイク",
    status: "sold_out",
  },
  {
    key: "65bf088fb494c114",
    provider: "rakuten_ichiba",
    listingId: "auc-toysanta:10380498",
    url: "https://item.rakuten.co.jp/auc-toysanta/g-5l3e0018io-002/",
    rowId: "rakuten-auc-toysanta-10380498",
    variantId: "sponge",
    seriesId: "peanuts",
    variantName: "スポンジ",
    status: "active",
  },
  {
    key: "f1e9adfb8785c509",
    provider: "yahoo_shopping",
    listingId: "toysanta_g-5l3e0018if-004-57687",
    url: "https://store.shopping.yahoo.co.jp/toysanta/g-5l3e0018if-004-57687.html",
    rowId: "yahoo-toysanta-g-5l3e0018if-004-57687",
    variantId: "randall",
    seriesId: "monsters",
    variantName: "ランドール",
    status: "sold_out",
  },
];

function productionFixture() {
  const records = productionCandidateFixtures.map((fixture) => ({
    id: fixture.rowId,
    title: `${fixture.seriesId} ${fixture.variantName}`,
    price: 568,
    status: fixture.status,
    source: fixture.provider === "rakuten_ichiba" ? "rakuten" : "yahoo_shopping",
    source_url: fixture.url,
    listed_at: "2026-07-27T07:17:30.000Z",
    market_safety_assessed: true,
    market_safety: {
      accepted: true,
      review_required: false,
      reason: "variant_and_parent_evidence_confirmed",
      variant_id: fixture.variantId,
      series_id: fixture.seriesId,
      listing_type: "single",
      confidence: 0.86,
      matched_variant_ids: [fixture.variantId],
      checks: {
        variant_evidence_present: true,
        parent_series_evidence_present: true,
        set_signal_detected: false,
        multiple_variant_candidates: false,
        explicit_variant_conflict: false,
        query_context_present: true,
      },
    },
    raw: {
      provider: fixture.provider,
      itemCode: fixture.provider === "rakuten_ichiba" ? fixture.listingId : undefined,
      code: fixture.provider === "yahoo_shopping" ? fixture.listingId : undefined,
      public_item_url: fixture.provider === "rakuten_ichiba" ? fixture.url : undefined,
      fetchedAt: "2026-07-27T07:17:30.000Z",
      seller: { email: "private@example.com" },
      accessKey: "private",
    },
  }));
  const candidates = productionCandidateFixtures.map((fixture, index) => ({
    candidate_key: fixture.key,
    source: { provider: fixture.provider, listing_id: fixture.listingId, public_url: fixture.url, public_url_host: new URL(fixture.url).hostname },
    listing: { title: records[index].title, price: 568, status: fixture.status, listing_type: "single" },
    target: { variant_id: fixture.variantId, variant_slug: fixture.variantId, variant_name: fixture.variantName, series_id: fixture.seriesId, series_slug: fixture.seriesId, series_name: fixture.seriesId, search_query: `${fixture.seriesId} ${fixture.variantName}` },
    assessment: { accepted: true, review_required: false, reason: "variant_and_parent_evidence_confirmed", confidence: 0.86, matched_variant_ids: [fixture.variantId], matched_variant_names: [fixture.variantName], matched_variant_overflow: 0 },
    checks: { variant_evidence_present: true, parent_series_evidence_present: true, set_signal_detected: false, multiple_variant_candidates: false, explicit_variant_conflict: false, query_context_present: true },
  }));
  const report = {
    schema_version: 1,
    generated_at: "2026-07-27T07:17:57.612Z",
    mode: "dry-run",
    source_scope: "planner-apis",
    workflow: { run_id: "30245610468", run_attempt: "1", head_sha: "9bb9bd44384a03976fe7ea550d9c0214330b036b", event_name: "workflow_dispatch" },
    selection: { selected_variant_count: 4, selected_variants: candidates.map((candidate) => ({ variant_id: candidate.target.variant_id, query: candidate.target.search_query })), query_count: 4 },
    result: { candidate_count: 4, accepted_count: 4, review_count: 0, no_result_variant_count: 0, report_complete: true, truncated_count: 0 },
    database_writes: { listings: 0, observations: 0, ingestion_runs: 0 },
    candidates,
  };
  return { records, report };
}

test("Production fixture candidate keys preserve the approved run values", () => {
  const { records } = productionFixture();
  assert.deepEqual(records.map(buildMarketCandidateKey), productionCandidateFixtures.map((fixture) => fixture.key));
});
test("Production fixture selects only GT-R and Mike with correct statuses", () => {
  const fixture = productionFixture();
  const rows = buildMarketCanaryRows({
    ...fixture,
    candidateKeys: ["1e901198049bc341", "2e833931e4e7cb26"],
    auditRunId: "30245610468",
    observedAt: "2026-07-27T08:00:00.000Z",
  });
  assert.deepEqual(rows.listingRows.map((row) => [row.variant_id, row.status]), [["gt-r", "active"], ["mike", "sold_out"]]);
  assert.equal(rows.listingRows.some((row) => ["sponge", "randall"].includes(row.variant_id)), false);
});
test("guarded small-batch builds all four explicitly approved Production fixtures", () => {
  const fixture = productionFixture();
  const rows = buildMarketCanaryRows({
    ...fixture,
    candidateKeys: productionCandidateFixtures.map((entry) => entry.key),
    auditRunId: "30245610468",
    observedAt: "2026-07-27T08:00:00.000Z",
  });
  assert.equal(rows.listingRows.length, 4);
  assert.deepEqual(rows.listingRows.map((row) => row.variant_id), ["gt-r", "mike", "sponge", "randall"]);
});
test("canary rows use only the safety-linked variant and series", () => {
  const fixture = productionFixture();
  const rows = buildMarketCanaryRows({ ...fixture, candidateKeys: ["1e901198049bc341"], auditRunId: "30245610468" });
  assert.deepEqual([rows.listingRows[0].variant_id, rows.listingRows[0].matched_variant_id, rows.listingRows[0].series_id], ["gt-r", "gt-r", "tomica"]);
});
test("canary raw allowlist excludes seller and credentials", () => {
  const fixture = productionFixture();
  const rows = buildMarketCanaryRows({ ...fixture, candidateKeys: ["1e901198049bc341"], auditRunId: "30245610468" });
  const raw = JSON.stringify(rows.listingRows[0].raw);
  assert.doesNotMatch(raw, /seller|private@example|accessKey/i);
  assert.match(raw, /canary_candidate_key/);
});
test("canary rows refuse a review safety assessment", () => {
  const fixture = productionFixture();
  fixture.records[0].market_safety.review_required = true;
  assert.throws(() => buildMarketCanaryRows({ ...fixture, candidateKeys: ["1e901198049bc341"], auditRunId: "30245610468" }), /invalid/);
});
test("Rakuten canary listing ID matches the existing normalizer identity", () => {
  assert.equal(buildMarketplaceListingId({
    provider: "rakuten_ichiba",
    sourceListingId: "auc-toysanta:10380564",
    publicUrl: "https://item.rakuten.co.jp/auc-toysanta/g-5l3e0018ii-004/",
    title: "ignored fallback",
  }), "rakuten-auc-toysanta-10380564");
});
test("Yahoo canary listing ID matches the existing normalizer identity", () => {
  assert.equal(buildMarketplaceListingId({
    provider: "yahoo_shopping",
    sourceListingId: "toysanta_g-5l3e0018if-003-57687",
    publicUrl: "https://store.shopping.yahoo.co.jp/toysanta/g-5l3e0018if-003-57687.html",
    title: "ignored fallback",
  }), "yahoo-toysanta-g-5l3e0018if-003-57687");
});
test("marketplace listing identity is deterministic and source-specific", () => {
  const input = { provider: "rakuten_ichiba", sourceListingId: "shop:item-1", publicUrl: "https://example.com/1", title: "item" };
  assert.equal(buildMarketplaceListingId(input), buildMarketplaceListingId(input));
  assert.notEqual(buildMarketplaceListingId(input), buildMarketplaceListingId({ ...input, sourceListingId: "shop:item-2" }));
});
test("canary rows reject record ID drift before persistence", () => {
  const fixture = productionFixture();
  fixture.records[0].id = "rakuten-drifted";
  assert.throws(
    () => buildMarketCanaryRows({ ...fixture, candidateKeys: ["1e901198049bc341"], auditRunId: "30245610468" }),
    /identity drift/,
  );
});
test("canary rows require a finite positive numeric price", () => {
  for (const value of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -1, "568"]) {
    const fixture = productionFixture();
    fixture.report.candidates[0].listing.price = value;
    assert.throws(
      () => buildMarketCanaryRows({ ...fixture, candidateKeys: ["1e901198049bc341"], auditRunId: "30245610468" }),
      /invalid price/,
    );
  }
});
test("canary rows reject missing current and approved statuses before persistence", () => {
  const missingValues = [null, undefined, "", " ", "\t", "\n"];
  for (const value of missingValues) {
    const fixture = productionFixture();
    fixture.records[0].status = value;
    assert.throws(
      () => buildMarketCanaryRows({ ...fixture, candidateKeys: ["1e901198049bc341"], auditRunId: "30245610468" }),
      /missing status/,
    );
  }
  for (const value of missingValues) {
    const fixture = productionFixture();
    fixture.report.candidates[0].listing.status = value;
    assert.throws(
      () => buildMarketCanaryRows({ ...fixture, candidateKeys: ["1e901198049bc341"], auditRunId: "30245610468" }),
      /missing approved status/,
    );
  }
});
test("canary rows preserve supported statuses and normalized sold-out aliases", () => {
  for (const status of ["active", "sold", "sold_out", "pre_release"]) {
    const fixture = productionFixture();
    fixture.records[0].status = status;
    fixture.report.candidates[0].listing.status = status;
    const rows = buildMarketCanaryRows({ ...fixture, candidateKeys: ["1e901198049bc341"], auditRunId: "30245610468" });
    assert.equal(rows.listingRows[0].status, status);
  }
  const aliasFixture = productionFixture();
  aliasFixture.records[0].status = "売り切れ";
  aliasFixture.report.candidates[0].listing.status = "sold_out";
  const aliasRows = buildMarketCanaryRows({
    ...aliasFixture,
    candidateKeys: ["1e901198049bc341"],
    auditRunId: "30245610468",
  });
  assert.equal(aliasRows.listingRows[0].status, "sold_out");
});
test("canary rows reject unsupported and approved/current mismatched statuses", () => {
  const fixture = productionFixture();
  fixture.records[0].status = "mystery";
  fixture.report.candidates[0].listing.status = "mystery";
  assert.throws(
    () => buildMarketCanaryRows({ ...fixture, candidateKeys: ["1e901198049bc341"], auditRunId: "30245610468" }),
    /unsupported status/,
  );
  for (const [current, approved] of [["active", "sold_out"], ["sold_out", "sold"]]) {
    const mismatch = productionFixture();
    mismatch.records[0].status = current;
    mismatch.report.candidates[0].listing.status = approved;
    assert.throws(
      () => buildMarketCanaryRows({ ...mismatch, candidateKeys: ["1e901198049bc341"], auditRunId: "30245610468" }),
      /status drift/,
    );
  }
});
test("canary source is derived canonically from the approved provider", () => {
  assert.equal(canonicalMarketplaceSource("rakuten_ichiba"), "rakuten");
  assert.equal(canonicalMarketplaceSource("yahoo_shopping"), "yahoo_shopping");
  const fixture = productionFixture();
  const rows = buildMarketCanaryRows({
    ...fixture,
    candidateKeys: ["1e901198049bc341", "2e833931e4e7cb26"],
    auditRunId: "30245610468",
  });
  assert.deepEqual(rows.listingRows.map((row) => row.source), ["rakuten", "yahoo_shopping"]);
  assert.deepEqual(rows.observationRows.map((row) => row.source), ["rakuten", "yahoo_shopping"]);
});
test("canary rows reject unsupported providers and source identity drift", () => {
  const unsupported = productionFixture();
  unsupported.report.candidates[0].source.provider = "unknown";
  assert.throws(
    () => buildMarketCanaryRows({ ...unsupported, candidateKeys: ["1e901198049bc341"], auditRunId: "30245610468" }),
    /unsupported provider/,
  );
  for (const [index, source] of [[0, "yahoo_shopping"], [1, "rakuten"]]) {
    const drift = productionFixture();
    drift.records[index].source = source;
    assert.throws(
      () => buildMarketCanaryRows({
        ...drift,
        candidateKeys: [productionCandidateFixtures[index].key],
        auditRunId: "30245610468",
      }),
      /source identity drift/,
    );
  }
  const missing = productionFixture();
  missing.records[0].source = "";
  assert.throws(
    () => buildMarketCanaryRows({ ...missing, candidateKeys: ["1e901198049bc341"], auditRunId: "30245610468" }),
    /missing source/,
  );
});
test("status and source rejection occurs before any DB store call", () => {
  const store = memoryCanaryStore();
  const statusFixture = productionFixture();
  statusFixture.records[0].status = "";
  assert.throws(
    () => buildMarketCanaryRows({ ...statusFixture, candidateKeys: ["1e901198049bc341"], auditRunId: "30245610468" }),
    /missing status/,
  );
  const sourceFixture = productionFixture();
  sourceFixture.records[0].source = "yahoo_shopping";
  assert.throws(
    () => buildMarketCanaryRows({ ...sourceFixture, candidateKeys: ["1e901198049bc341"], auditRunId: "30245610468" }),
    /source identity drift/,
  );
  assert.deepEqual(store.calls, []);
});
test("sanitized pre-write failures report zero writes without raw or credentials", () => {
  for (const stage of ["request_validation", "approved_audit_validation", "exact_audit_match"]) {
    const result = buildSanitizedCanaryFailureResult({
      failedStage: stage,
      auditRunId: "30245610468",
      workflowRunId: "999",
      headSha: "1775181dd2c75d5b67dbfad4c8e3e265c4f08bb3",
      candidateKeys: "1e901198049bc341",
      rawResponse: "private raw response",
      credentials: "service-role-secret",
    });
    assert.equal(result.failed_stage, stage);
    assert.equal(result.listing_writes, 0);
    assert.equal(result.observation_writes, 0);
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /private raw response|service-role-secret|credentials|rawResponse/);
  }
});
test("successful canary rollback is always a structured zero-count result", () => {
  assert.deepEqual(normalizeCanaryRollback(false), {
    attempted: false,
    verified: false,
    listings_deleted: 0,
    observations_deleted: 0,
    listings_restored: 0,
    observations_restored: 0,
  });
});
test("legacy rollback false renders a complete canary Markdown result without undefined", () => {
  const markdown = renderMarketCanaryResultMarkdown({
    source_audit_run_id: "30253757681",
    workflow_run_id: "30264689615",
    head_sha: "0bb34ed4d17963207d0c34c63e89917fc3330b68",
    candidate_count: 2,
    listing_writes: 2,
    observation_writes: 2,
    verification: true,
    rollback: false,
    health: { database: "ok" },
    candidates: [],
  });
  assert.match(markdown, /Rollback: not required/);
  assert.match(markdown, /listings deleted 0, observations deleted 0, listings restored 0, observations restored 0/);
  assert.doesNotMatch(markdown, /undefined/);
});
test("normal market raw compaction removes the verified 84-level Production raw chain", () => {
  const fixture = productionFixture().records[0];
  let raw = structuredClone(fixture.raw);
  for (let depth = 1; depth < 84; depth += 1) raw = { id: fixture.id, source_url: fixture.source_url, raw };
  const compacted = compactMarketRawPayload({ ...fixture, raw });
  assert.equal(Object.hasOwn(compacted, "raw"), false);
  assert.equal(compacted.provider, "rakuten_ichiba");
  assert.equal(compacted.itemCode, "auc-toysanta:10380564");
  assert.equal(compacted.source_url, fixture.source_url);
});
test("normal market raw compaction is stable across repeated save and reload cycles", () => {
  const fixture = productionFixture().records[0];
  const first = compactMarketRawPayload(fixture);
  const second = compactMarketRawPayload({ ...fixture, raw: first });
  const third = compactMarketRawPayload({ ...fixture, raw: second });
  assert.deepEqual(second, first);
  assert.deepEqual(third, first);
  assert.equal(JSON.stringify(third).includes('"raw"'), false);
});
test("normal market raw compaction fails closed for cyclic input", () => {
  const raw = { provider: "rakuten_ichiba", itemCode: "shop:item" };
  raw.raw = raw;
  assert.throws(() => compactMarketRawPayload({ raw }), /cycle/);
});
test("existing recursive raw stays canonical-equal while a different fresh row alone is compacted", () => {
  const existingRaw = {
    id: "existing",
    raw: {
      id: "existing",
      raw: { provider: "rakuten_ichiba", itemCode: "shop:existing" },
    },
  };
  const existing = { id: "existing", title: "existing", raw: existingRaw };
  const fresh = {
    id: "fresh",
    title: "fresh",
    raw: {
      raw: { provider: "yahoo_shopping", code: "shop_fresh" },
      fetch_context: { source: "generated" },
    },
  };
  const merged = mergeMarketRawRecords({
    existingRecords: [existing],
    freshRecords: [fresh],
    getId: (record) => record.id,
  });
  const persisted = merged.map((entry) => ({
    id: entry.id,
    raw: entry.fresh ? compactMarketRawPayload(entry.record) : entry.preservedRaw,
  }));
  assert.deepEqual(persisted.find((entry) => entry.id === "existing").raw, existingRaw);
  assert.deepEqual(persisted.find((entry) => entry.id === "fresh").raw, {
    provider: "yahoo_shopping",
    code: "shop_fresh",
    fetch_context: { source: "generated" },
  });
  assert.equal(Object.hasOwn(persisted.find((entry) => entry.id === "fresh").raw, "raw"), false);
});
test("a fresh record wins over an existing row with the same ID", () => {
  const existingRaw = { provider: "rakuten_ichiba", itemCode: "shop:old" };
  const freshRaw = { provider: "rakuten_ichiba", itemCode: "shop:new" };
  const merged = mergeMarketRawRecords({
    existingRecords: [{ id: "same", title: "old", raw: existingRaw }],
    freshRecords: [{ id: "same", title: "new", raw: freshRaw }],
    getId: (record) => record.id,
  });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].fresh, true);
  assert.equal(merged[0].record.title, "new");
  assert.deepEqual(compactMarketRawPayload(merged[0].record), freshRaw);
});
test("normal market raw compaction rejects 129 levels instead of truncating", () => {
  let raw = { provider: "rakuten_ichiba", itemCode: "shop:deep" };
  for (let depth = 1; depth < 129; depth += 1) raw = { depth, raw };
  assert.throws(() => compactMarketRawPayload({ raw }), /exceeds 128 levels/);
});
test("normal market upsert keeps import issue and generated-only observation boundaries", async () => {
  const source = await readFile(new URL("../scripts/upsert-market-data.mjs", import.meta.url), "utf8");
  assert.match(source, /dbMarketRows\s*\.filter\(\(row\) => row\.review_required\)\s*\.map\(\(row\) => createImportIssue/);
  assert.match(source, /buildObservationRows\(dbMarketRows\.filter\(\(row\) => generatedIds\.has\(row\.id\)\)\)/);
  assert.match(source, /input\.fresh \? compactMarketRawPayload\(raw\) : input\.preservedRaw/);
});
test("strict upsert fails once without deleting a missing column", async () => {
  const row = { id: "strict-1", known: "kept", missing_column: "must-not-be-removed" };
  const original = structuredClone(row);
  const bodies = [];
  await withMockSupabase(async () => {
    globalThis.fetch = async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return new Response(JSON.stringify({ message: "Could not find the 'missing_column' column" }), { status: 400 });
    };
    await assert.rejects(
      () => upsertRows("market_listings", [row], { allowSchemaFallback: false }),
      /strict upsert failed/,
    );
  });
  assert.equal(bodies.length, 1);
  assert.deepEqual(bodies[0], [original]);
  assert.deepEqual(row, original);
});
test("normal upsert retains the existing schema fallback", async () => {
  const row = { id: "normal-1", known: "kept", missing_column: "fallback-only" };
  const original = structuredClone(row);
  const bodies = [];
  await withMockSupabase(async () => {
    globalThis.fetch = async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return bodies.length === 1
        ? new Response(JSON.stringify({ message: "Could not find the 'missing_column' column" }), { status: 400 })
        : new Response("", { status: 201 });
    };
    await upsertRows("market_listings", [row]);
  });
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[0], [original]);
  assert.deepEqual(bodies[1], [{ id: "normal-1", known: "kept" }]);
  assert.deepEqual(row, original);
});

async function withMockSupabase(run) {
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-key";
  try {
    await run();
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
}

function memoryCanaryStore(options = {}) {
  const tables = {
    market_listings: new Map((options.listings ?? []).map((row) => [row.id, structuredClone(row)])),
    market_listing_observations: new Map((options.observations ?? []).map((row) => [row.id, structuredClone(row)])),
  };
  const calls = [];
  let failOnce = options.failOnObservation === true;
  let corruptOnce = options.corruptVerification === true || Boolean(options.corruptField);
  return {
    tables,
    calls,
    async fetchRowsByIds(table, ids) {
      calls.push(`fetch:${table}`);
      const rows = ids.map((id) => tables[table].get(id)).filter(Boolean).map((row) => structuredClone(row));
      if (corruptOnce && calls.includes(`upsert:${table}`) && (!options.corruptTable || options.corruptTable === table)) {
        corruptOnce = false;
        return rows.map((row) => {
          const next = structuredClone(row);
          delete next[options.corruptField || "status"];
          return next;
        });
      }
      return rows;
    },
    async fetchCounts() {
      return {
        market_listings: tables.market_listings.size,
        market_listing_observations: tables.market_listing_observations.size,
        import_issues: 10,
        ingestion_runs: 20,
        review_required: [...tables.market_listings.values()].filter((row) => row.review_required).length,
      };
    },
    async upsertRows(table, rows) {
      calls.push(`upsert:${table}`);
      rows.forEach((row) => tables[table].set(row.id, structuredClone(row)));
      if (table === "market_listing_observations" && failOnce) {
        failOnce = false;
        throw new Error("fixture failure");
      }
    },
    async deleteRowsByIds(table, ids) {
      calls.push(`delete:${table}`);
      ids.forEach((id) => tables[table].delete(id));
      return ids.length;
    },
  };
}

function fixtureCanaryRows() {
  const fixture = productionFixture();
  return buildMarketCanaryRows({
    ...fixture,
    candidateKeys: ["1e901198049bc341", "2e833931e4e7cb26"],
    auditRunId: "30245610468",
    observedAt: "2026-07-27T08:00:00.000Z",
  });
}

function legacyMarketplaceRow(row, { provider, externalKey, depth = 1 } = {}) {
  let raw = {
    provider,
    [externalKey]: row.raw.source_listing_id,
    source_url: row.source_url,
  };
  for (let index = 1; index < depth; index += 1) {
    raw = {
      id: row.id,
      raw,
      source_url: row.source_url,
    };
  }
  return { ...structuredClone(row), raw };
}

test("current canary marketplace identities resolve for Rakuten and Yahoo", () => {
  const rows = fixtureCanaryRows();
  for (const row of rows.listingRows) {
    const identity = resolveStoredMarketplaceIdentity(row);
    assert.equal(identity.complete, true);
    assert.equal(identity.derivedId, row.id);
  }
});
test("legacy provider-specific marketplace identities resolve through nested raw", () => {
  const rows = fixtureCanaryRows();
  const rakuten = legacyMarketplaceRow(rows.listingRows[0], {
    provider: "rakuten_ichiba",
    externalKey: "itemCode",
  });
  const yahoo = legacyMarketplaceRow(rows.listingRows[1], {
    provider: "yahoo_shopping",
    externalKey: "code",
  });
  assert.equal(resolveStoredMarketplaceIdentity(rakuten).complete, true);
  assert.equal(resolveStoredMarketplaceIdentity(yahoo).complete, true);
});
test("verified Production raw depth resolves without widening the raw traversal", () => {
  const rows = fixtureCanaryRows();
  const rakuten = legacyMarketplaceRow(rows.listingRows[0], {
    provider: "rakuten_ichiba",
    externalKey: "itemCode",
    depth: 58,
  });
  const yahoo = legacyMarketplaceRow(rows.listingRows[1], {
    provider: "yahoo_shopping",
    externalKey: "code",
    depth: 58,
  });
  assert.deepEqual(
    [resolveStoredMarketplaceIdentity(rakuten).depth, resolveStoredMarketplaceIdentity(yahoo).depth],
    [58, 58],
  );
  assert.equal(resolveStoredMarketplaceIdentity(rakuten).complete, true);
  assert.equal(resolveStoredMarketplaceIdentity(yahoo).complete, true);
});
test("matching duplicate identity values across raw levels are allowed", () => {
  const row = fixtureCanaryRows().listingRows[0];
  const legacy = legacyMarketplaceRow(row, {
    provider: "rakuten_ichiba",
    externalKey: "itemCode",
  });
  legacy.raw = {
    provider: "rakuten_ichiba",
    itemCode: row.raw.source_listing_id,
    source_listing_id: row.raw.source_listing_id,
    public_url: row.source_url,
    raw: legacy.raw,
  };
  assert.equal(resolveStoredMarketplaceIdentity(legacy).complete, true);
});
test("conflicting marketplace external IDs fail closed", () => {
  const rows = fixtureCanaryRows();
  for (const [index, provider, externalKey] of [
    [0, "rakuten_ichiba", "itemCode"],
    [1, "yahoo_shopping", "code"],
  ]) {
    const legacy = legacyMarketplaceRow(rows.listingRows[index], { provider, externalKey });
    legacy.raw.source_listing_id = "conflicting-id";
    const identity = resolveStoredMarketplaceIdentity(legacy);
    assert.equal(identity.complete, false);
    assert.equal(identity.conflicts.source_listing_id, true);
  }
});
test("provider, source and URL mismatches fail closed", () => {
  const row = fixtureCanaryRows().listingRows[0];
  const providerMismatch = legacyMarketplaceRow(row, {
    provider: "yahoo_shopping",
    externalKey: "itemCode",
  });
  const sourceMismatch = { ...legacyMarketplaceRow(row, {
    provider: "rakuten_ichiba",
    externalKey: "itemCode",
  }), source: "yahoo_shopping" };
  const urlMismatch = legacyMarketplaceRow(row, {
    provider: "rakuten_ichiba",
    externalKey: "itemCode",
  });
  urlMismatch.raw.source_url = "https://example.com/different";
  assert.equal(resolveStoredMarketplaceIdentity(providerMismatch).complete, false);
  assert.equal(resolveStoredMarketplaceIdentity(sourceMismatch).complete, false);
  assert.equal(resolveStoredMarketplaceIdentity(urlMismatch).complete, false);
});
test("missing provider or external ID fails closed", () => {
  const row = fixtureCanaryRows().listingRows[0];
  const missingProvider = legacyMarketplaceRow(row, {
    provider: "",
    externalKey: "itemCode",
  });
  const missingExternalId = legacyMarketplaceRow(row, {
    provider: "rakuten_ichiba",
    externalKey: "itemCode",
  });
  delete missingExternalId.raw.itemCode;
  assert.equal(resolveStoredMarketplaceIdentity(missingProvider).complete, false);
  assert.equal(resolveStoredMarketplaceIdentity(missingExternalId).complete, false);
});
test("provider-specific IDs cannot cross marketplace boundaries", () => {
  const rows = fixtureCanaryRows();
  const rakutenWithYahooCode = legacyMarketplaceRow(rows.listingRows[0], {
    provider: "rakuten_ichiba",
    externalKey: "code",
  });
  const yahooWithRakutenItemCode = legacyMarketplaceRow(rows.listingRows[1], {
    provider: "yahoo_shopping",
    externalKey: "itemCode",
  });
  assert.equal(resolveStoredMarketplaceIdentity(rakutenWithYahooCode).complete, false);
  assert.equal(resolveStoredMarketplaceIdentity(yahooWithRakutenItemCode).complete, false);
});
test("deterministic marketplace ID mismatch is rejected before writes", async () => {
  const rows = fixtureCanaryRows();
  const desired = { ...rows.listingRows[0], id: "rakuten-wrong-id" };
  const existing = legacyMarketplaceRow(desired, {
    provider: "rakuten_ichiba",
    externalKey: "itemCode",
  });
  const observation = { ...rows.observationRows[0], listing_id: desired.id };
  const store = memoryCanaryStore({ listings: [existing] });
  await assert.rejects(
    () => persistMarketCanary({ listingRows: [desired], observationRows: [observation], store }),
    (error) => error.canaryStage === "preflight" && error.canaryResult?.rollback?.attempted === false,
  );
  assert.equal(store.calls.some((call) => call.startsWith("upsert:") || call.startsWith("delete:")), false);
});
test("verified legacy rows pass preflight without touching unrelated IDs", async () => {
  const rows = fixtureCanaryRows();
  const existing = rows.listingRows.map((row, index) => legacyMarketplaceRow(row, {
    provider: index === 0 ? "rakuten_ichiba" : "yahoo_shopping",
    externalKey: index === 0 ? "itemCode" : "code",
    depth: 58,
  }));
  const unrelated = { ...existing[0], id: "unrelated-listing" };
  const store = memoryCanaryStore({ listings: [...existing, unrelated] });
  await persistMarketCanary({ ...rows, store });
  assert.equal(store.tables.market_listings.has("unrelated-listing"), true);
  assert.deepEqual(rows.listingRows.map((row) => store.tables.market_listings.get(row.id).status), ["active", "sold_out"]);
});
test("legacy preflight rejection performs no write, delete or rollback", async () => {
  const rows = fixtureCanaryRows();
  const conflict = legacyMarketplaceRow(rows.listingRows[0], {
    provider: "rakuten_ichiba",
    externalKey: "itemCode",
  });
  conflict.raw.itemCode = "different";
  const store = memoryCanaryStore({ listings: [conflict] });
  await assert.rejects(
    () => persistMarketCanary({
      listingRows: [rows.listingRows[0]],
      observationRows: [rows.observationRows[0]],
      store,
    }),
    (error) => error.canaryStage === "preflight" && error.canaryResult?.rollback?.attempted === false,
  );
  assert.equal(store.calls.some((call) => call.startsWith("upsert:")), false);
  assert.equal(store.calls.some((call) => call.startsWith("delete:")), false);
});

test("canary persistence writes listings before observations", async () => {
  const rows = fixtureCanaryRows();
  const store = memoryCanaryStore();
  await persistMarketCanary({ ...rows, store });
  assert.ok(store.calls.indexOf("upsert:market_listings") < store.calls.indexOf("upsert:market_listing_observations"));
});
test("guarded small-batch persists four rows with verification and no rollback", async () => {
  const fixture = productionFixture();
  const rows = buildMarketCanaryRows({
    ...fixture,
    candidateKeys: productionCandidateFixtures.map((entry) => entry.key),
    auditRunId: "30245610468",
    observedAt: "2026-07-27T08:00:00.000Z",
  });
  const store = memoryCanaryStore();
  const result = await persistMarketCanary({ ...rows, store });
  assert.equal(result.listing_writes, 4);
  assert.equal(result.observation_writes, 4);
  assert.equal(result.verification, true);
  assert.deepEqual(result.rollback, normalizeCanaryRollback());
  assert.deepEqual(result.db_deltas, {
    market_listings: 4,
    market_listing_observations: 4,
    import_issues: 0,
    ingestion_runs: 0,
    review_required: 0,
  });
});
test("canary persistence writes only allowlisted rows", async () => {
  const rows = fixtureCanaryRows();
  const store = memoryCanaryStore();
  await persistMarketCanary({ ...rows, store });
  assert.equal(store.tables.market_listings.size, 2);
  assert.equal(store.tables.market_listing_observations.size, 2);
});
test("post-write mismatch triggers compensating rollback", async () => {
  const rows = fixtureCanaryRows();
  const store = memoryCanaryStore({ corruptVerification: true });
  await assert.rejects(() => persistMarketCanary({ ...rows, store }), /rollback verified/);
  assert.equal(store.tables.market_listings.size, 0);
  assert.equal(store.tables.market_listing_observations.size, 0);
});
test("missing raw field triggers post-write rollback", async () => {
  const rows = fixtureCanaryRows();
  const store = memoryCanaryStore({ corruptTable: "market_listings", corruptField: "raw" });
  await assert.rejects(() => persistMarketCanary({ ...rows, store }), /rollback verified/);
  assert.equal(store.tables.market_listings.size, 0);
  assert.equal(store.tables.market_listing_observations.size, 0);
});
test("missing classification field triggers post-write rollback", async () => {
  const rows = fixtureCanaryRows();
  const store = memoryCanaryStore({ corruptTable: "market_listings", corruptField: "classification_details" });
  await assert.rejects(() => persistMarketCanary({ ...rows, store }), /rollback verified/);
  assert.equal(store.tables.market_listings.size, 0);
  assert.equal(store.tables.market_listing_observations.size, 0);
});
test("new rows are removed during rollback", async () => {
  const rows = fixtureCanaryRows();
  const store = memoryCanaryStore({ failOnObservation: true });
  await assert.rejects(() => persistMarketCanary({ ...rows, store }));
  assert.equal(store.tables.market_listings.size, 0);
  assert.equal(store.tables.market_listing_observations.size, 0);
});
test("existing rows are restored during rollback", async () => {
  const rows = fixtureCanaryRows();
  const priorListing = { ...rows.listingRows[0], price: 500 };
  const priorObservation = { ...rows.observationRows[0], price: 500 };
  const store = memoryCanaryStore({ listings: [priorListing], observations: [priorObservation], failOnObservation: true });
  await assert.rejects(() => persistMarketCanary({ ...rows, listingRows: [rows.listingRows[0]], observationRows: [rows.observationRows[0]], store }));
  assert.equal(store.tables.market_listings.get(priorListing.id).price, 500);
  assert.equal(store.tables.market_listing_observations.get(priorObservation.id).price, 500);
});
test("rollback never deletes unrelated IDs", async () => {
  const rows = fixtureCanaryRows();
  const unrelated = { ...rows.listingRows[0], id: "unrelated" };
  const store = memoryCanaryStore({ listings: [unrelated], failOnObservation: true });
  await assert.rejects(() => persistMarketCanary({ ...rows, store }));
  assert.equal(store.tables.market_listings.has("unrelated"), true);
});
test("canary persistence never writes import issues", async () => {
  const rows = fixtureCanaryRows();
  const store = memoryCanaryStore();
  await persistMarketCanary({ ...rows, store });
  assert.equal(store.calls.some((call) => call.includes("import_issues")), false);
});
test("canary persistence never writes ingestion runs", async () => {
  const rows = fixtureCanaryRows();
  const store = memoryCanaryStore();
  await persistMarketCanary({ ...rows, store });
  assert.equal(store.calls.some((call) => call.includes("ingestion_runs")), false);
});
test("canary persistence is idempotent for the same daily rows", async () => {
  const rows = fixtureCanaryRows();
  const store = memoryCanaryStore();
  await persistMarketCanary({ ...rows, store });
  const second = await persistMarketCanary({ ...rows, store });
  assert.deepEqual(second.db_deltas, { market_listings: 0, market_listing_observations: 0, import_issues: 0, ingestion_runs: 0, review_required: 0 });
});
test("preflight rejects a listing identity collision before writes", async () => {
  const rows = fixtureCanaryRows();
  const conflict = { ...rows.listingRows[0], source_url: "https://example.com/different", raw: { source_listing_id: "different" } };
  const store = memoryCanaryStore({ listings: [conflict] });
  await assert.rejects(
    () => persistMarketCanary({ ...rows, listingRows: [rows.listingRows[0]], observationRows: [rows.observationRows[0]], store }),
    (error) => error.canaryStage === "preflight" && error.canaryResult?.rollback?.attempted === false,
  );
  assert.equal(store.calls.some((call) => call.startsWith("upsert:") || call.startsWith("delete:")), false);
});
test("workflow keeps canary separate from normal ingestion and cleanup", async () => {
  const workflow = await readFile(new URL("../.github/workflows/gacha-ingestion.yml", import.meta.url), "utf8");
  assert.match(workflow, /canary-write/);
  assert.match(workflow, /Download approved market candidate audit/);
  assert.match(workflow, /market-canary-result-\$\{\{ github\.run_id \}\}/);
  assert.match(workflow, /maximum 4/);
  assert.match(workflow, /"\$\{#canary_keys\[@\]\}" -gt 4/);
  assert.match(workflow, /Remove validation-only signal rows[\s\S]*mode == 'write'/);
  assert.doesNotMatch(workflow, /mode == 'canary-write'[\s\S]{0,160}cleanup/i);
});
test("workflow checkout is full only for manual canary writes", async () => {
  const source = await readFile(new URL("../.github/workflows/gacha-ingestion.yml", import.meta.url), "utf8");
  const assertCheckoutPolicy = (value) => {
    const workflow = normalizeSourceLineEndings(value);
    const full = workflow.match(/      - name: Checkout full history for canary write\n[\s\S]*?(?=\n      - name: Checkout shallow history)/)?.[0] ?? "";
    const shallow = workflow.match(/      - name: Checkout shallow history\n[\s\S]*?(?=\n      - uses: actions\/setup-node@v6)/)?.[0] ?? "";

    assert.match(full, /if: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.mode == 'canary-write' \}\}/);
    assert.match(full, /uses: actions\/checkout@v6/);
    assert.match(full, /fetch-depth: 0/);
    assert.match(shallow, /if: \$\{\{ github\.event_name != 'workflow_dispatch' \|\| inputs\.mode != 'canary-write' \}\}/);
    assert.match(shallow, /uses: actions\/checkout@v6/);
    assert.doesNotMatch(shallow, /fetch-depth:/);
    assert.equal(workflow.match(/uses: actions\/checkout@v6/g)?.length, 2);
    assert.doesNotMatch(workflow, /^\s*-\s+(?:name:\s+.*git fetch|run:\s+git fetch)\s*$/m);
  };

  const lf = normalizeSourceLineEndings(source);
  assertCheckoutPolicy(lf);
  assertCheckoutPolicy(lf.replaceAll("\n", "\r\n"));
});
test("workflow checkout conditions are mutually exclusive", () => {
  const cases = [
    { event: "workflow_dispatch", mode: "canary-write", full: true, shallow: false },
    { event: "workflow_dispatch", mode: "dry-run", full: false, shallow: true },
    { event: "workflow_dispatch", mode: "write", full: false, shallow: true },
    { event: "schedule", mode: "", full: false, shallow: true },
  ];

  for (const item of cases) {
    const full = item.event === "workflow_dispatch" && item.mode === "canary-write";
    const shallow = item.event !== "workflow_dispatch" || item.mode !== "canary-write";
    assert.equal(full, item.full);
    assert.equal(shallow, item.shallow);
    assert.notEqual(full, shallow);
  }
});
test("canary source normalization supports LF and CRLF checkouts", () => {
  const lf = "function canaryStore() {\n  allowSchemaFallback: false\n}\n\nfunction buildCanaryResult";
  const crlf = lf.replaceAll("\n", "\r\n");
  assert.equal(normalizeSourceLineEndings(lf), lf);
  assert.equal(normalizeSourceLineEndings(crlf), lf);
});
test("canary implementation never invokes the normal ingestion runner", async () => {
  const source = normalizeSourceLineEndings(
    await readFile(new URL("../scripts/market-backfill.mjs", import.meta.url), "utf8"),
  );
  const canary = source.match(/async function runCanaryWriteMode[\s\S]*?\n}\n\nfunction assessFetchedRecords/)?.[0] ?? "";
  assert.doesNotMatch(canary, /run-ingestion|upsert-market-data|cleanup/);
});
test("canary store uses strict upserts for writes and rollback restoration", async () => {
  const source = normalizeSourceLineEndings(
    await readFile(new URL("../scripts/market-backfill.mjs", import.meta.url), "utf8"),
  );
  const store = source.match(/function canaryStore\(\)[\s\S]*?\n}\n\nfunction buildCanaryResult/)?.[0] ?? "";
  assert.match(store, /allowSchemaFallback:\s*false/);
  const rollback = await readFile(new URL("../lib/domain/market-canary-write.js", import.meta.url), "utf8");
  assert.match(rollback, /store\.upsertRows\("market_listings", beforeListings\)/);
  assert.match(rollback, /store\.upsertRows\("market_listing_observations", beforeObservations\)/);
});
test("canary implementation has no cleanup invocation", async () => {
  const source = normalizeSourceLineEndings(
    await readFile(new URL("../scripts/market-backfill.mjs", import.meta.url), "utf8"),
  );
  const canary = source.match(/async function runCanaryWriteMode[\s\S]*?\n}\n\nfunction assessFetchedRecords/)?.[0] ?? "";
  assert.doesNotMatch(canary, /cleanup/i);
});
