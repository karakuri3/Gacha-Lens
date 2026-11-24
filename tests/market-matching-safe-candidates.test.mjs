// Regression tests built from market-shadow dry-run 45370025680
// (2026-11-24): 5 variants, 108 candidates, 0 accepted, run failed closed with
// rollout_budget_exceeded. Titles below are copied from that audit unless they
// are marked as constructed accept examples.
import assert from "node:assert/strict";
import test from "node:test";

import { catalogMatchText, decodeCatalogHtmlEntities } from "../lib/domain/catalog-text.js";
import {
  applyMarketCandidateSafety,
  assessMarketCandidate,
  isParentSeriesAbsent,
  summarizeFetchedMarketCandidates,
} from "../lib/domain/market-match-safety.js";
import { buildSanitizedMarketCandidateAudit } from "../lib/domain/market-candidate-audit.js";
import { countSeriesCompleteSetEvidence } from "../lib/domain/market-series-complete-set.js";
import {
  buildMarketSearchQueriesForVariant,
  buildVariantNameCounts,
  isSafeMarketSearchQuery,
  planMarketSearchQueries,
} from "../lib/fetchers/market-query-planner.js";

const NOW = new Date("2026-11-24T00:00:00.000Z");
const COLOR_BLACK = {
  id: "gashapon-4582770027044000",
  slug: "gashapon-4582770027044000",
  name: "サンリオキャラクターズ カラーコレクション ~Black~",
  franchise: "サンリオキャラクターズ",
  release_date: "2026-10-01",
  is_released: true,
};
const MLB = {
  id: "gashapon-4582769935855000",
  slug: "gashapon-4582769935855000",
  name: "MLB&trade; サイン入りユニフォーム フレームマグネット",
  franchise: "MLB&trade;",
  release_date: "2026-10-01",
  is_released: true,
};
const SHIN = {
  id: "gashapon-4582770055030000",
  slug: "gashapon-4582770055030000",
  name: "クレヨンしんちゃん カラフルマルチチャーム2",
  franchise: "クレヨンしんちゃん",
  release_date: "2026-10-01",
  is_released: true,
};
const BEYBLADE = {
  id: "tarts-y906367",
  slug: "tarts-y906367",
  name: "BEYBLADE X 歴代カプセルシューター大集合",
  franchise: "BEYBLADE",
  release_date: "2026-10-01",
  is_released: true,
};
const WATCH = { id: "sibling-watch3", slug: "sibling-watch3", name: "サンリオキャラクターズ ダンボールウォッチ3", franchise: "サンリオキャラクターズ" };
const POUCH = { id: "sibling-pouch2", slug: "sibling-pouch2", name: "サンリオキャラクターズ ぬいぐるみポーチ2", franchise: "サンリオキャラクターズ" };
const SERIES = [COLOR_BLACK, MLB, SHIN, BEYBLADE, WATCH, POUCH];
const VARIANTS = [
  ...lineup(COLOR_BLACK, ["ハローキティ", "マイメロディ", "クロミ", "ポチャッコ", "バッドばつ丸"]),
  ...lineup(WATCH, ["ハローキティ", "クロミ", "シナモロール", "ポムポムプリン", "マイメロディ"]),
  ...lineup(POUCH, ["クロミ", "ハローキティ", "シナモロール", "ポチャッコ"]),
  ...lineup(MLB, ["大谷 翔平(ロサンゼルス・ドジャース)", "山本 由伸(ロサンゼルス・ドジャース)"]),
  ...lineup(SHIN, ["しんちゃん", "ネネちゃん", "あいちゃん", "マサオくん", "ネネちゃんうさぎ", "カンタム・ロボ"]),
  ...lineup(BEYBLADE, [
    "コバルトドラグーン+左回転シューター+ワインダー",
    "ドランソード+シューター",
    "ヘルズサイズ+シューター",
    "ウィザードアロー+シューター",
    "ナイトシールド+シューター",
    "レオンクロー+シューター",
  ]),
];
const CATALOG = {
  series: SERIES,
  variants: VARIANTS,
  seriesById: new Map(SERIES.map((row) => [row.id, row])),
  variantById: new Map(VARIANTS.map((row) => [row.id, row])),
};
const NAME_COUNTS = buildVariantNameCounts(CATALOG);

function lineup(series, names) {
  return names.map((name) => ({
    id: `${series.id}-${name}`,
    slug: `${series.id}-${name}`,
    series_id: series.id,
    name,
    variant_type: "normal",
    release_date: "2026-10-01",
    released: true,
  }));
}

function queryFor(series, variantName) {
  const variant = CATALOG.variantById.get(`${series.id}-${variantName}`);
  return buildMarketSearchQueriesForVariant(variant, series, { variantNameCounts: NAME_COUNTS, now: NOW })[0];
}

let recordIndex = 0;
function record(title, query, overrides = {}) {
  recordIndex += 1;
  return {
    id: `fixture-${recordIndex}`,
    title,
    price: 500,
    status: "active",
    source: "rakuten",
    source_url: `https://item.rakuten.co.jp/fixture/${recordIndex}/`,
    raw: { provider: "rakuten_ichiba", query: query.query },
    ...overrides,
  };
}

// Real audit titles returned for target クロミ (サンリオキャラクターズ カラーコレクション ~Black~)
// that belong to other series or are not capsule toys at all.
const KUROMI_UNRELATED_TITLES = [
  "サンリオキャラクターズ ダンボールウォッチ3 全5種セット (ガチャ ガシャ コンプリート)",
  "サンリオキャラクターズ ぬいぐるみポーチ2 全4種セット (ガチャ ガシャ コンプリート)",
  "サンリオキャラクターズ miniminiファイルキーホルダー 全6種セット ガチャ コンプリート",
  "キラ★ガチャシール ぷっくりドロップ DXセット サンリオキャラクターズ",
  "キラ★ガチャシール ぷっくりドロップ 専用別売りセット マイメロディ&amp;クロミ",
  "タカラトミー ぷにコミュ クロミのぷにるんず [6歳〜][タカラトミー ぷにるんず 女の子 お世話 おもちゃ][送料無料]",
  "ヘアキャップ 吸水速乾 キャラクタータオルキャップ ( キティ マイメロディ クロミ シナモン プーさん ミッキー ミニ",
  "【くーるん×クロミ】ぷにるんず×サンリオキャラクターズ ぷっくりドロップめじるしガチャマスコット",
  "【正規品】サンリオ ハローキティ ミニノートパソコン キーホルダー ランダム 全5種 ガチャ キーキャップキーホルダーハ",
];

test("catalog HTML entities decode for matching and trademark marks are removed", () => {
  assert.equal(decodeCatalogHtmlEntities("MLB&trade; A&amp;B &#12450;&#x30a2;"), "MLB\u2122 A&B アア");
  assert.equal(decodeCatalogHtmlEntities("&unknown; &#0;"), "&unknown; &#0;");
  assert.equal(catalogMatchText("MLB&trade; サイン").replace(/\s+/g, " "), "MLB サイン");
  assert.equal(catalogMatchText("MLB\u2122 サイン").replace(/\s+/g, " "), "MLB サイン");
});

test("every other-series or non-capsule title from run 45370025680 is parent-series absent", () => {
  const query = queryFor(COLOR_BLACK, "クロミ");
  for (const title of KUROMI_UNRELATED_TITLES) {
    const assessment = assessMarketCandidate(record(title, query), query, CATALOG);
    assert.equal(assessment.accepted, false, title);
    assert.equal(isParentSeriesAbsent(assessment), true, title);
  }
});

test("parent-series-absent titles are excluded from candidates only when requested", () => {
  const query = queryFor(COLOR_BLACK, "クロミ");
  const records = KUROMI_UNRELATED_TITLES.map((title) => record(title, query));
  const legacy = applyMarketCandidateSafety({ records, queryPlan: [query], catalog: CATALOG });
  assert.equal(legacy.records.length, records.length);
  assert.equal(legacy.summary.safety_assessed_records, records.length);
  assert.equal(Object.hasOwn(legacy.summary, "parent_series_absent_excluded"), false);

  const filtered = applyMarketCandidateSafety({ records, queryPlan: [query], catalog: CATALOG, excludeParentSeriesAbsent: true });
  assert.equal(filtered.records.length, 0);
  assert.equal(filtered.assessments.length, 0);
  assert.equal(filtered.summary.safety_assessed_records, 0);
  assert.equal(filtered.summary.parent_series_absent_excluded, records.length);
  assert.equal(filtered.summary.variants_with_results, 1);

  const summary = summarizeFetchedMarketCandidates({
    records: filtered.records,
    rawCount: records.length,
    queryPlan: [query],
    feedResults: [],
    catalog: CATALOG,
    safetyResult: filtered,
  });
  assert.equal(summary.duplicate_listings, 0);
  assert.equal(summary.review_required_count, 0);
  assert.equal(summary.candidate_rejection_reason_counts.parent_series_absent, records.length);
});

test("constructed same-series single listings are accepted (including spacing/tilde variants)", () => {
  const query = queryFor(COLOR_BLACK, "クロミ");
  for (const title of [
    "【クロミ】サンリオキャラクターズ カラーコレクション ~Black~",
    "サンリオキャラクターズ カラーコレクション〜Black〜 クロミ ガチャ",
    "中古おもちゃ クロミ 「サンリオキャラクターズ カラーコレクション ~Black~」",
  ]) {
    const assessment = assessMarketCandidate(record(title, query), query, CATALOG);
    assert.equal(assessment.accepted, true, title);
    assert.equal(assessment.reason, "variant_and_parent_evidence_confirmed", title);
    assert.equal(assessment.variantId, `${COLOR_BLACK.id}-クロミ`, title);
  }
});

test("same-series sets, sibling variants and sibling series stay unaccepted", () => {
  const query = queryFor(COLOR_BLACK, "クロミ");
  const cases = [
    ["サンリオキャラクターズ カラーコレクション ~Black~ 全5種セット", "not_single_item", false],
    ["サンリオキャラクターズ カラーコレクション ~Black~ クロミ マイメロディ 2種セット", "not_single_item", false],
    ["【マイメロディ】サンリオキャラクターズ カラーコレクション ~Black~", null, false],
    ["サンリオキャラクターズ ダンボールウォッチ3 クロミ", null, true],
  ];
  for (const [title, reason, absent] of cases) {
    const assessment = assessMarketCandidate(record(title, query), query, CATALOG);
    assert.equal(assessment.accepted, false, title);
    if (reason) assert.equal(assessment.reason, reason, title);
    assert.equal(isParentSeriesAbsent(assessment), absent, title);
  }
});

test("entity-bearing official series names can now match marketplace titles", () => {
  const query = queryFor(MLB, "大谷 翔平(ロサンゼルス・ドジャース)");
  const accepted = assessMarketCandidate(
    record("MLB™ サイン入りユニフォーム フレームマグネット 大谷翔平 ロサンゼルス・ドジャース ガチャ", query),
    query,
    CATALOG,
  );
  assert.equal(accepted.accepted, true);
  const noSeries = assessMarketCandidate(record("MLB 大谷翔平 フィギュア ガチャ", query), query, CATALOG);
  assert.equal(noSeries.accepted, false);
  assert.equal(isParentSeriesAbsent(noSeries), true);
});

test("audit titles for カンタム・ロボ and BEYBLADE X keep same-series sets and drop other series", () => {
  const shinQuery = queryFor(SHIN, "カンタム・ロボ");
  const otherSeries = assessMarketCandidate(
    record("クレヨンしんちゃん おすしんちゃん [6.カンタム・ロボ]【 ネコポス不可 】【C】", shinQuery),
    shinQuery,
    CATALOG,
  );
  assert.equal(otherSeries.accepted, false);
  assert.equal(isParentSeriesAbsent(otherSeries), true);
  const shinSet = assessMarketCandidate(
    record("クレヨンしんちゃん カラフルマルチチャーム2 全6種コンプリートセット しんちゃん ネネちゃん あいちゃん マサオくん ネネちゃんうさぎ カンタム・ロボ シリコ", shinQuery),
    shinQuery,
    CATALOG,
  );
  assert.equal(shinSet.reason, "not_single_item");
  assert.equal(isParentSeriesAbsent(shinSet), false);
  const shinSingle = assessMarketCandidate(record("【カンタム・ロボ】クレヨンしんちゃん カラフルマルチチャーム2", shinQuery), shinQuery, CATALOG);
  assert.equal(shinSingle.accepted, true);

  const beyQuery = queryFor(BEYBLADE, "コバルトドラグーン+左回転シューター+ワインダー");
  const beySet = assessMarketCandidate(
    record("BEYBLADE X 歴代カプセルシューター大集合 全6種セット コンプリート ベイブレードX ガチャ ガチャガチャ カプセルトイ タカラトミーアーツ", beyQuery),
    beyQuery,
    CATALOG,
  );
  assert.equal(beySet.accepted, false);
  assert.equal(beySet.reason, "not_single_item");
  assert.equal(isParentSeriesAbsent(beySet), false);
});

test("same-series complete sets are counted read-only and never become variant candidates", () => {
  const query = queryFor(COLOR_BLACK, "クロミ");
  const records = [
    record("サンリオキャラクターズ カラーコレクション ~Black~ 全5種セット", query),
    record("サンリオキャラクターズ ダンボールウォッチ3 全5種セット (ガチャ ガシャ コンプリート)", query),
  ];
  const safety = applyMarketCandidateSafety({ records, queryPlan: [query], catalog: CATALOG, excludeParentSeriesAbsent: true });
  assert.equal(safety.records.length, 1);
  assert.equal(safety.summary.accepted_listings, 0);
  assert.deepEqual(countSeriesCompleteSetEvidence({ records: safety.records, queryPlan: [query], catalog: CATALOG }), {
    listings: 1,
    series: 1,
  });
});

test("assessments that stopped before parent identity are never treated as absent", () => {
  assert.equal(isParentSeriesAbsent({ accepted: false, auditChecks: { queryContextPresent: false } }), false);
  assert.equal(isParentSeriesAbsent({ accepted: false, auditChecks: { queryContextPresent: true } }), false);
  assert.equal(isParentSeriesAbsent({ accepted: true, auditChecks: { queryContextPresent: true, parentSeriesEvidencePresent: false } }), false);
  assert.equal(isParentSeriesAbsent(null), false);
});

test("generic variant names get no franchise-only or bare-variant fallback", () => {
  const query = queryFor(COLOR_BLACK, "クロミ");
  assert.equal(query.query, "サンリオキャラクターズ カラーコレクション ~Black~ クロミ ガチャ");
  assert.deepEqual(query.fallback_queries, ["サンリオキャラクターズ カラーコレクション Black クロミ"]);
  for (const attempt of [query.query, ...query.fallback_queries]) {
    assert.notEqual(attempt, "サンリオキャラクターズ クロミ ガチャ");
    assert.notEqual(attempt, "クロミ ガチャ");
  }
  assert.equal(isSafeMarketSearchQuery(query.query, CATALOG.variantById.get(`${COLOR_BLACK.id}-クロミ`), COLOR_BLACK), true);
});

test("entity and decorative symbols are removed from fallbacks while the v2 root query is unchanged", () => {
  const query = queryFor(MLB, "大谷 翔平(ロサンゼルス・ドジャース)");
  assert.equal(query.query, "MLB&trade; サイン入りユニフォーム フレームマグネット 大谷 翔平(ロサンゼルス・ドジャース) ガチャ");
  assert.equal(query.query_strategy_version, 2);
  assert.equal(query.fallback_queries[0], "MLB サイン入りユニフォーム フレームマグネット 大谷 翔平 ロサンゼルス ドジャース");
  assert.ok(query.fallback_queries.every((attempt) => !/&|trade|\u2122/i.test(attempt)));
});

test("catalog-unique variant names keep a variant-only fallback", () => {
  const query = queryFor(BEYBLADE, "コバルトドラグーン+左回転シューター+ワインダー");
  assert.deepEqual(query.fallback_queries, [
    "BEYBLADE X 歴代カプセルシューター大集合 コバルトドラグーン 左回転シューター ワインダー",
    "コバルトドラグーン 左回転シューター ワインダー ガチャ",
  ]);
  const shared = queryFor(COLOR_BLACK, "ハローキティ");
  assert.deepEqual(shared.fallback_queries, ["サンリオキャラクターズ カラーコレクション Black ハローキティ"]);
});

test("without catalog name counts the builder stays conservative", () => {
  const variant = CATALOG.variantById.get(`${BEYBLADE.id}-コバルトドラグーン+左回転シューター+ワインダー`);
  const query = buildMarketSearchQueriesForVariant(variant, BEYBLADE, { now: NOW })[0];
  assert.deepEqual(query.fallback_queries, [
    "BEYBLADE X 歴代カプセルシューター大集合 コバルトドラグーン 左回転シューター ワインダー",
  ]);
});

test("planMarketSearchQueries derives catalog-wide name counts", () => {
  const row = (series, name) => ({
    variantId: `${series.id}-${name}`,
    seriesId: series.id,
    priority: 3,
    priorityReason: "recently_released_without_market_evidence",
    coverageState: "no_evidence",
    released: true,
    lastCollectionAttemptAt: null,
  });
  const plan = planMarketSearchQueries(
    CATALOG,
    [row(COLOR_BLACK, "クロミ"), row(BEYBLADE, "コバルトドラグーン+左回転シューター+ワインダー")],
    { now: NOW, cooldownHours: 0, limit: 5, priority: "all", release: "released" },
  );
  const byVariant = new Map(plan.queries.map((entry) => [entry.variant_id, entry]));
  assert.deepEqual(byVariant.get(`${COLOR_BLACK.id}-クロミ`)?.fallback_queries, [
    "サンリオキャラクターズ カラーコレクション Black クロミ",
  ]);
  assert.equal(
    byVariant.get(`${BEYBLADE.id}-コバルトドラグーン+左回転シューター+ワインダー`)?.fallback_queries.at(-1),
    "コバルトドラグーン 左回転シューター ワインダー ガチャ",
  );
});

test("filtered safety output still builds a complete, self-consistent candidate audit", () => {
  const query = queryFor(COLOR_BLACK, "クロミ");
  const records = [
    ...KUROMI_UNRELATED_TITLES.map((title) => record(title, query)),
    record("【クロミ】サンリオキャラクターズ カラーコレクション ~Black~", query),
    record("サンリオキャラクターズ カラーコレクション ~Black~ 全5種セット", query),
  ];
  const safety = applyMarketCandidateSafety({ records, queryPlan: [query], catalog: CATALOG, excludeParentSeriesAbsent: true });
  const summary = summarizeFetchedMarketCandidates({
    records: safety.records,
    rawCount: records.length,
    queryPlan: [query],
    feedResults: [],
    catalog: CATALOG,
    safetyResult: safety,
  });
  const audit = buildSanitizedMarketCandidateAudit({
    records: safety.records,
    queryPlan: [query],
    catalog: CATALOG,
    runContext: { mode: "dry-run", source_scope: "planner-apis", run_id: "1", head_sha: "a".repeat(40) },
    summary,
  });
  assert.equal(audit.result.report_complete, true);
  assert.equal(audit.result.candidate_count, 2);
  assert.equal(audit.result.accepted_count, 1);
  assert.equal(audit.result.review_count, 1);
  assert.equal(summary.duplicate_listings, 0);
});
