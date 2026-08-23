import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyMarketCandidateSafety,
  assessMarketCandidate,
} from "../lib/domain/market-match-safety.js";
import {
  analyzeExplicitMarketLabels,
  detectParentSeriesEditionConflict,
  explicitLabelMatchesVariant,
  extractBracketLabels,
} from "../lib/domain/market-title-safety.js";
import {
  buildSanitizedMarketCandidateAudit,
  renderMarketCandidateAuditMarkdown,
} from "../lib/domain/market-candidate-audit.js";
import { buildMarketCandidateKey } from "../lib/domain/market-candidate-key.js";

const POOH_SERIES = {
  id: "pooh-series",
  slug: "pooh-series",
  name: "ならぶんです。 Winnie the Pooh",
  franchise: "Winnie the Pooh",
};
const POOH = {
  id: "pooh",
  slug: "pooh",
  series_id: POOH_SERIES.id,
  name: "くまのプーさん",
  variant_type: "normal",
};
const PIGLET = {
  id: "piglet",
  slug: "piglet",
  series_id: POOH_SERIES.id,
  name: "ピグレット",
  variant_type: "normal",
};
const POOH_QUERY = {
  query: "ならぶんです。 Winnie the Pooh くまのプーさん ガチャ 単品",
  variant_id: POOH.id,
  series_id: POOH_SERIES.id,
};

function fixtureCatalog(series = POOH_SERIES, target = POOH, siblings = [PIGLET]) {
  const variants = [target, ...siblings];
  return {
    series: [series],
    variants,
    seriesById: new Map([[series.id, series]]),
    variantById: new Map(variants.map((variant) => [variant.id, variant])),
  };
}

function assess(title, options = {}) {
  const series = options.series ?? POOH_SERIES;
  const target = options.target ?? POOH;
  const siblings = options.siblings ?? [PIGLET];
  const query = options.query ?? {
    query: `${series.name} ${target.name} ガチャ 単品`,
    variant_id: target.id,
    series_id: series.id,
  };
  return assessMarketCandidate(
    { id: options.listingId ?? "listing-2", title },
    query,
    fixtureCatalog(series, target, siblings),
  );
}

function acceptedRecord(title, itemCode = "item-1") {
  return {
    id: `yahoo-${itemCode}`,
    title,
    price: 880,
    status: "active",
    listing_type: "single",
    source: "yahoo_shopping",
    source_url: `https://store.shopping.yahoo.co.jp/example/${itemCode}.html`,
    raw: {
      provider: "yahoo_shopping",
      itemCode,
      query: POOH_QUERY,
    },
  };
}

test("1 square label with item number matches ブレス", () => {
  assert.equal(explicitLabelMatchesVariant("2.ブレス(キュアアンサー)", "ブレス(キュアアンサー)"), true);
});

test("2 square label with item number matches おやすみ", () => {
  assert.equal(explicitLabelMatchesVariant("4.おやすみ", "おやすみ"), true);
});

test("3 short B suffix maps ピグレットB to ピグレット", () => {
  assert.equal(explicitLabelMatchesVariant("ピグレットB", "ピグレット"), true);
});

test("4 explicit ピグレットB label conflicts with Pooh target", () => {
  const result = assess("ならぶんです。 Winnie the Pooh くまのプーさん 【ピグレットB】");
  assert.equal(result.accepted, false);
  assert.equal(result.reviewRequired, true);
  assert.equal(result.reason, "explicit_variant_label_conflict");
  assert.equal(result.auditChecks.explicitLabelOtherVariantMatch, true);
});

test("5 Pooh A label is valid when the parent edition matches", () => {
  const result = assess("ならぶんです。 Winnie the Pooh 【くまのプーさんA】");
  assert.equal(result.accepted, true);
  assert.equal(result.auditChecks.explicitLabelTargetMatch, true);
});

test("6 Pooh B label is valid when the parent edition matches", () => {
  const result = assess("ならぶんです。 Winnie the Pooh 【くまのプーさんB】");
  assert.equal(result.accepted, true);
  assert.equal(result.auditChecks.explicitLabelTargetMatch, true);
});

test("7 Winnie the Pooh 2 cannot match the unversioned parent", () => {
  const result = assess("バンダイ ガチャ ならぶんです。 Winnie the Pooh 2 くまのプーさん クラシック 【くまのプーさんA】");
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "parent_series_edition_conflict");
  assert.equal(result.auditChecks.parentSeriesEditionConflict, true);
});

test("8 a target parent that includes Winnie the Pooh 2 is allowed", () => {
  const series = { ...POOH_SERIES, id: "pooh-2", slug: "pooh-2", name: "ならぶんです。 Winnie the Pooh 2" };
  const target = { ...POOH, id: "pooh-2-target", series_id: series.id };
  const result = assess("ならぶんです。 Winnie the Pooh 2 【くまのプーさんA】", {
    series,
    target,
    siblings: [],
  });
  assert.equal(result.accepted, true);
  assert.equal(result.auditChecks.parentSeriesEditionConflict, false);
});

for (const [index, marker] of ["第2弾", "Vol.2", "PART2", "クラシック"].entries()) {
  test(`${9 + index} ${marker} is an edition conflict`, () => {
    const result = assess(`ならぶんです。 Winnie the Pooh ${marker} 【くまのプーさんA】`);
    assert.equal(result.accepted, false);
    assert.equal(result.reason, "parent_series_edition_conflict");
  });
}

test("13 unrelated price digits are not edition evidence", () => {
  const result = assess("ならぶんです。 Winnie the Pooh 【くまのプーさんA】 2,000円");
  assert.equal(result.accepted, true);
  assert.equal(result.auditChecks.parentSeriesEditionConflict, false);
});

test("14 listing ID digits do not affect edition detection", () => {
  const result = assessMarketCandidate(
    { id: "listing-part2-vol2-999", title: "ならぶんです。 Winnie the Pooh 【くまのプーさんA】" },
    POOH_QUERY,
    fixtureCatalog(),
  );
  assert.equal(result.accepted, true);
});

test("15 delivery labels are not product labels", () => {
  const analysis = analyzeExplicitMarketLabels(
    "対象シリーズ [2.勇者]【ネコポス配送対応】",
    [{ id: "hero", name: "勇者" }],
    "hero",
  );
  assert.equal(analysis.explicitLabelPresent, true);
  assert.deepEqual(analysis.matchedVariantIds, ["hero"]);
});

test("16 generic single label is not a variant label", () => {
  const analysis = analyzeExplicitMarketLabels(
    "対象シリーズ 勇者【単品】",
    [{ id: "hero", name: "勇者" }],
    "hero",
  );
  assert.equal(analysis.explicitLabelPresent, false);
});

test("17 explicit label conflicts remain below accepted confidence", () => {
  const result = assess("ならぶんです。 Winnie the Pooh くまのプーさん 【ピグレットB】");
  assert.ok(result.confidence < 0.8);
});

test("18 explicit label conflicts are review-required", () => {
  assert.equal(assess("ならぶんです。 Winnie the Pooh くまのプーさん 【ピグレットB】").reviewRequired, true);
});

test("19 candidate audit exposes only boolean label diagnostics", () => {
  const safety = applyMarketCandidateSafety({
    records: [acceptedRecord("ならぶんです。 Winnie the Pooh くまのプーさん 【ピグレットB】")],
    queryPlan: [POOH_QUERY],
    catalog: fixtureCatalog(),
  });
  const report = buildSanitizedMarketCandidateAudit({
    records: safety.records,
    queryPlan: [POOH_QUERY],
    catalog: fixtureCatalog(),
    runContext: { run_id: "30532684353", head_sha: "58460de77c35828004c993583bda5830d65362cf" },
    summary: { safety_assessed_records: 1 },
  });
  assert.equal(report.candidates[0].checks.explicit_label_present, true);
  assert.equal(report.candidates[0].checks.explicit_label_other_variant_match, true);
  assert.equal(JSON.stringify(report).match(/ピグレットB/g)?.length, 1);
});

test("20 candidate audit Markdown does not duplicate explicit label text", () => {
  const safety = applyMarketCandidateSafety({
    records: [acceptedRecord("ならぶんです。 Winnie the Pooh くまのプーさん 【ピグレットB】")],
    queryPlan: [POOH_QUERY],
    catalog: fixtureCatalog(),
  });
  const report = buildSanitizedMarketCandidateAudit({
    records: safety.records,
    queryPlan: [POOH_QUERY],
    catalog: fixtureCatalog(),
    runContext: { run_id: "30532684353", head_sha: "58460de77c35828004c993583bda5830d65362cf" },
    summary: { safety_assessed_records: 1 },
  });
  assert.equal(renderMarketCandidateAuditMarkdown(report).match(/ピグレットB/g)?.length, 1);
});

test("21 existing multiple-variant handling remains review-required", () => {
  const result = assess("ならぶんです。 Winnie the Pooh くまのプーさん / ピグレット");
  assert.equal(result.reason, "multiple_variant_candidates");
});

test("22 existing set handling remains higher priority", () => {
  const result = assess("ならぶんです。 Winnie the Pooh くまのプーさん ピグレット 2種セット 【ピグレットB】");
  assert.equal(result.reason, "not_single_item");
});

test("23 Production ブレス candidate remains accepted", () => {
  const series = {
    id: "precure",
    slug: "precure",
    name: "名探偵プリキュア! アクセサリーコレクション",
    franchise: "名探偵プリキュア!",
  };
  const target = { id: "bracelet", slug: "bracelet", series_id: series.id, name: "ブレス(キュアアンサー)", variant_type: "normal" };
  const result = assess("名探偵プリキュア! アクセサリーコレクション [2.ブレス(キュアアンサー)]【ネコポス配送対応】【C】", {
    series,
    target,
    siblings: [],
  });
  assert.equal(result.accepted, true);
  assert.equal(result.confidence, 0.86);
});

test("24 Production おやすみ candidate remains accepted", () => {
  const series = {
    id: "george",
    slug: "george",
    name: "おさるのジョージ ジョージの一日フィギュア",
    franchise: "おさるのジョージ",
  };
  const target = { id: "sleep", slug: "sleep", series_id: series.id, name: "おやすみ", variant_type: "normal" };
  const result = assess("おさるのジョージ ジョージの一日フィギュア [4.おやすみ]【ネコポス配送対応】【C】", {
    series,
    target,
    siblings: [],
  });
  assert.equal(result.accepted, true);
  assert.equal(result.confidence, 0.86);
});

test("25 Production エンジェラ candidate remains accepted after its product label", () => {
  const series = {
    id: "jewelpet-clear-ring",
    slug: "jewelpet-clear-ring",
    name: "ジュエルペット ぷくっとクリアリング",
    franchise: "ジュエルペット",
  };
  const target = { id: "angela", slug: "angela", series_id: series.id, name: "エンジェラ", variant_type: "normal" };
  const result = assess("ジュエルペット ぷくっとクリアリング [5.エンジェラ]【ネコポス配送対応】【C】", {
    series,
    target,
    siblings: [],
  });
  assert.equal(result.accepted, true);
  assert.equal(result.reason, "variant_and_parent_evidence_confirmed");
  assert.equal(result.auditChecks.parentSeriesEditionConflict, false);
});

test("26 sibling series Vol.3 remains an edition conflict before the product label", () => {
  const series = {
    id: "jewelpet-clear-ring",
    slug: "jewelpet-clear-ring",
    name: "ジュエルペット ぷくっとクリアリング",
    franchise: "ジュエルペット",
  };
  const target = { id: "angela", slug: "angela", series_id: series.id, name: "エンジェラ", variant_type: "normal" };
  const result = assess("ジュエルペット アンブレラマーカー Vol.3 [5.エンジェラ]【ネコポス配送対応】【C】", {
    series,
    target,
    siblings: [],
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reviewRequired, true);
  assert.equal(result.reason, "parent_series_edition_conflict");
  assert.equal(result.auditChecks.parentSeriesEditionConflict, true);
});

for (const marker of ["Vol.2", "PART2", "第2弾", "クラシック"]) {
  test(`explicit ${marker} after a valid product label remains an edition conflict`, () => {
    const result = assess(`ならぶんです。 Winnie the Pooh 【くまのプーさんA】 ${marker}`);
    assert.equal(result.accepted, false);
    assert.equal(result.reviewRequired, true);
    assert.equal(result.reason, "parent_series_edition_conflict");
    assert.equal(result.auditChecks.parentSeriesEditionConflict, true);
  });
}

const FALSE_ACCEPTED_TITLES = [
  "バンダイ ガチャ ならぶんです。 Winnie the Pooh 2 くまのプーさん クラシック 【くまのプーさんA】",
  "バンダイ ガチャ ならぶんです。 Winnie the Pooh 2 くまのプーさん クラシック 【くまのプーさんB】",
  "バンダイ ガチャ ならぶんです。 Winnie the Pooh 2 くまのプーさん クラシック 【ピグレットB】",
];

test("25 all three Production Pooh false accepts become review-required", () => {
  const results = FALSE_ACCEPTED_TITLES.map((title) => assess(title));
  assert.deepEqual(results.map((result) => result.accepted), [false, false, false]);
  assert.deepEqual(results.map((result) => result.reviewRequired), [true, true, true]);
  assert.deepEqual(results.map((result) => result.reason), [
    "parent_series_edition_conflict",
    "parent_series_edition_conflict",
    "explicit_variant_label_conflict",
  ]);
});

test("26 safety diagnostics do not change candidate key generation", () => {
  const record = acceptedRecord(FALSE_ACCEPTED_TITLES[2], "pooh-piglet-b");
  const safety = applyMarketCandidateSafety({
    records: [record],
    queryPlan: [POOH_QUERY],
    catalog: fixtureCatalog(),
  });
  const report = buildSanitizedMarketCandidateAudit({
    records: safety.records,
    queryPlan: [POOH_QUERY],
    catalog: fixtureCatalog(),
    runContext: { run_id: "30532684353", head_sha: "58460de77c35828004c993583bda5830d65362cf" },
    summary: { safety_assessed_records: 1 },
  });
  assert.equal(report.candidates[0].candidate_key, buildMarketCandidateKey({
    provider: "yahoo_shopping",
    listing_id: "pooh-piglet-b",
    public_url: "https://store.shopping.yahoo.co.jp/example/pooh-piglet-b.html",
  }));
});

test("27 approved query replay remains independent of title safety", async () => {
  const source = await readFile(new URL("../lib/domain/market-approved-query-replay.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /market-title-safety|edition.conflict|explicit.label/i);
});

test("28 canary write logic remains unchanged by title safety", async () => {
  const source = await readFile(new URL("../lib/domain/market-canary-write.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /market-title-safety|edition.conflict|explicit.label/i);
});

test("29 manual selection profile remains independent of title safety", async () => {
  const source = await readFile(new URL("../lib/domain/market-manual-canary-selection.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /market-title-safety|edition.conflict|explicit.label/i);
});

test("30 bracket extraction supports all approved bracket pairs", () => {
  const labels = extractBracketLabels("[勇者]［魔法使い］【ネコ】(ティガー)（イーヨー）").map((entry) => entry.text);
  assert.deepEqual(labels, ["勇者", "魔法使い", "ネコ", "ティガー", "イーヨー"]);
});

test("31 standalone edition detector ignores unrelated numbers", () => {
  assert.equal(detectParentSeriesEditionConflict({
    title: "対象シリーズ 勇者 価格2000円",
    parentSeriesName: "対象シリーズ",
    targetVariantName: "勇者",
  }), false);
});

test("32 unknown top-level label with target text fails closed", () => {
  const result = assess("ならぶんです。 Winnie the Pooh くまのプーさん 【未知variantB】");
  assert.equal(result.accepted, false);
  assert.equal(result.reviewRequired, true);
  assert.equal(result.reason, "explicit_variant_label_unresolved");
  assert.equal(result.auditChecks.explicitLabelUnresolved, true);
});

test("33 unknown top-level label without target text fails closed", () => {
  const result = assess("ならぶんです。 Winnie the Pooh 【未知variantB】");
  assert.equal(result.accepted, false);
  assert.equal(result.reviewRequired, true);
  assert.equal(result.reason, "explicit_variant_label_unresolved");
});

test("34 nested parentheses belong to the outer product label", () => {
  const labels = extractBracketLabels("[2.ブレス(キュアアンサー)]");
  assert.equal(labels.length, 2);
  assert.deepEqual(labels.map((entry) => ({
    text: entry.text,
    depth: entry.depth,
    topLevel: entry.topLevel,
    contained: entry.containedByAnotherLabel,
  })), [
    {
      text: "2.ブレス(キュアアンサー)",
      depth: 0,
      topLevel: true,
      contained: false,
    },
    {
      text: "キュアアンサー",
      depth: 1,
      topLevel: false,
      contained: true,
    },
  ]);
  assert.deepEqual(labels[1].parentRange, {
    start: labels[0].start,
    end: labels[0].end,
  });
});

test("35 nested sibling text does not conflict with the outer target label", () => {
  const series = { id: "precure", slug: "precure", name: "名探偵プリキュア! アクセサリーコレクション" };
  const target = { id: "bracelet", slug: "bracelet", series_id: series.id, name: "ブレス(キュアアンサー)", variant_type: "normal" };
  const sibling = { id: "answer", slug: "answer", series_id: series.id, name: "キュアアンサー", variant_type: "normal" };
  const result = assess("名探偵プリキュア! アクセサリーコレクション [2.ブレス(キュアアンサー)]", {
    series,
    target,
    siblings: [sibling],
  });
  assert.equal(result.accepted, true);
  assert.equal(result.reason, "variant_and_parent_evidence_confirmed");
  assert.equal(result.auditChecks.explicitLabelOtherVariantMatch, false);
});

test("36 standalone parenthesized variant remains a product label", () => {
  const series = { id: "tigger-series", slug: "tigger-series", name: "対象シリーズ" };
  const target = { id: "tigger", slug: "tigger", series_id: series.id, name: "ティガー", variant_type: "normal" };
  const result = assess("対象シリーズ (ティガー)", {
    series,
    target,
    siblings: [],
  });
  assert.equal(result.accepted, true);
  assert.equal(result.auditChecks.explicitLabelPresent, true);
  assert.equal(result.auditChecks.explicitLabelTargetMatch, true);
});

test("37 sibling-only explicit label is always an explicit conflict", () => {
  const result = assess("ならぶんです。 Winnie the Pooh 【ピグレットB】");
  assert.equal(result.accepted, false);
  assert.equal(result.reviewRequired, true);
  assert.equal(result.reason, "explicit_variant_label_conflict");
  assert.equal(result.auditChecks.explicitLabelOtherVariantMatch, true);
});

test("38 sibling label remains an explicit conflict when target text is present", () => {
  const result = assess("ならぶんです。 Winnie the Pooh くまのプーさん 【ピグレットB】");
  assert.equal(result.reason, "explicit_variant_label_conflict");
});

test("39 Japanese Classic is allowed as the formal target variant", () => {
  const series = { id: "classic-ja-series", slug: "classic-ja-series", name: "対象シリーズ" };
  const target = { id: "classic-ja", slug: "classic-ja", series_id: series.id, name: "クラシック", variant_type: "normal" };
  const result = assess("対象シリーズ クラシック【クラシック】", {
    series,
    target,
    siblings: [],
  });
  assert.equal(result.accepted, true);
  assert.equal(result.auditChecks.parentSeriesEditionConflict, false);
});

test("40 English Classic is allowed as the formal target variant", () => {
  const series = { id: "classic-en-series", slug: "classic-en-series", name: "Example Series" };
  const target = { id: "classic-en", slug: "classic-en", series_id: series.id, name: "Classic", variant_type: "normal" };
  const result = assess("Example Series Classic [Classic]", {
    series,
    target,
    siblings: [],
  });
  assert.equal(result.accepted, true);
  assert.equal(result.auditChecks.parentSeriesEditionConflict, false);
});

test("41 a formal sibling named Classic is not treated as an edition marker", () => {
  assert.equal(detectParentSeriesEditionConflict({
    title: "Example Series Classic [Classic]",
    parentSeriesName: "Example Series",
    targetVariantName: "Hero",
    siblingVariantNames: ["Classic"],
    beforeIndex: "Example Series Classic ".length,
  }), false);
});

test("42 standalone English Classic remains a true edition conflict", () => {
  const series = { id: "edition-en", slug: "edition-en", name: "Example Series" };
  const target = { id: "hero-en", slug: "hero-en", series_id: series.id, name: "Hero", variant_type: "normal" };
  const result = assess("Example Series Classic [Hero]", {
    series,
    target,
    siblings: [],
  });
  assert.equal(result.reason, "parent_series_edition_conflict");
});

test("43 standalone Japanese Classic remains a true edition conflict", () => {
  const series = { id: "edition-ja", slug: "edition-ja", name: "対象シリーズ" };
  const target = { id: "hero-ja", slug: "hero-ja", series_id: series.id, name: "勇者", variant_type: "normal" };
  const result = assess("対象シリーズ クラシック【勇者】", {
    series,
    target,
    siblings: [],
  });
  assert.equal(result.reason, "parent_series_edition_conflict");
});

test("44 ASCII word endings are not stripped as short variant suffixes", () => {
  assert.equal(explicitLabelMatchesVariant("Loki", "Lok"), false);
});

test("45 Japanese variant suffix B remains supported", () => {
  assert.equal(explicitLabelMatchesVariant("ピグレットB", "ピグレット"), true);
});

const GENERIC_LABELS = [
  "ネコポス配送対応",
  "ゆうパケット対応",
  "メール便",
  "宅配便",
  "即納",
  "在庫品",
  "在庫あり",
  "予約",
  "新品",
  "中古",
  "数量限定",
  "期間限定",
  "店舗限定",
  "限定",
  "単品",
  "バラ売り",
  "セット",
  "全5種",
  "全6種",
  "ガチャ",
  "カプセルトイ",
  "送料無料",
  "C",
];

for (const [index, label] of GENERIC_LABELS.entries()) {
  test(`${46 + index} generic label ${label} is ignored`, () => {
    const analysis = analyzeExplicitMarketLabels(
      `対象シリーズ 勇者【${label}】`,
      [{ id: "hero", name: "勇者" }],
      "hero",
    );
    assert.equal(analysis.explicitLabelPresent, false);
    assert.equal(analysis.explicitLabelUnresolved, false);
  });
}

test("69 unresolved label audit exposes only a boolean diagnostic", () => {
  const record = acceptedRecord("ならぶんです。 Winnie the Pooh くまのプーさん 【未知variantB】", "unknown-label");
  const safety = applyMarketCandidateSafety({
    records: [record],
    queryPlan: [POOH_QUERY],
    catalog: fixtureCatalog(),
  });
  const report = buildSanitizedMarketCandidateAudit({
    records: safety.records,
    queryPlan: [POOH_QUERY],
    catalog: fixtureCatalog(),
    runContext: { run_id: "30532684353", head_sha: "58460de77c35828004c993583bda5830d65362cf" },
    summary: { safety_assessed_records: 1 },
  });
  assert.equal(report.candidates[0].checks.explicit_label_unresolved, true);
  assert.equal(JSON.stringify(report).match(/未知variantB/g)?.length, 1);
});

test("70 unresolved label Markdown does not duplicate label text", () => {
  const record = acceptedRecord("ならぶんです。 Winnie the Pooh くまのプーさん 【未知variantB】", "unknown-label-md");
  const safety = applyMarketCandidateSafety({
    records: [record],
    queryPlan: [POOH_QUERY],
    catalog: fixtureCatalog(),
  });
  const report = buildSanitizedMarketCandidateAudit({
    records: safety.records,
    queryPlan: [POOH_QUERY],
    catalog: fixtureCatalog(),
    runContext: { run_id: "30532684353", head_sha: "58460de77c35828004c993583bda5830d65362cf" },
    summary: { safety_assessed_records: 1 },
  });
  assert.equal(renderMarketCandidateAuditMarkdown(report).match(/未知variantB/g)?.length, 1);
});

for (const [index, suffix] of [
  "A",
  "B",
  "C",
  "1",
  "2",
  "3",
  "I",
  "II",
  "III",
  "Ver.A",
  "Ver.B",
  "カラーA",
  "カラーB",
].entries()) {
  test(`${71 + index} explicit Japanese suffix ${suffix} remains supported`, () => {
    assert.equal(explicitLabelMatchesVariant(`ピグレット${suffix}`, "ピグレット"), true);
  });
}

const STITCH_SERIES = {
  id: "stitch-series",
  slug: "stitch-series",
  name: "肩ズンFig. リロ&スティッチ Part2",
};
const JUMBA = {
  id: "jumba",
  slug: "jumba",
  series_id: STITCH_SERIES.id,
  name: "ジャンバ",
  variant_type: "normal",
};
const LILO = {
  id: "lilo",
  slug: "lilo",
  series_id: STITCH_SERIES.id,
  name: "リロ",
  variant_type: "normal",
};
const STITCH = {
  id: "stitch",
  slug: "stitch",
  series_id: STITCH_SERIES.id,
  name: "スティッチ",
  variant_type: "normal",
};

for (const [index, label] of [
  "ネコポス不可",
  " ネコポス 不可 ",
  "ネコポス　　不可",
  "ゆうパケット不可",
  "メール便不可",
  "宅配便不可",
].entries()) {
  test(`${84 + index} known unavailable shipping label ${label.trim()} is ignored`, () => {
    const analysis = analyzeExplicitMarketLabels(
      `対象シリーズ [1.勇者]【${label}】`,
      [{ id: "hero", name: "勇者" }],
      "hero",
    );
    assert.equal(analysis.explicitLabelPresent, true);
    assert.equal(analysis.explicitLabelTargetMatch, true);
    assert.equal(analysis.explicitLabelUnresolved, false);
  });
}

for (const [index, label] of ["不可", "特別仕様"].entries()) {
  test(`${90 + index} unknown label ${label} remains unresolved`, () => {
    const analysis = analyzeExplicitMarketLabels(
      `対象シリーズ [1.勇者]【${label}】`,
      [{ id: "hero", name: "勇者" }],
      "hero",
    );
    assert.equal(analysis.explicitLabelUnresolved, true);
  });
}

test("92 Production おふろ candidate with unavailable shipping label is accepted", () => {
  const series = { id: "george", slug: "george", name: "おさるのジョージ ジョージの一日フィギュア" };
  const target = { id: "bath", slug: "bath", series_id: series.id, name: "おふろ", variant_type: "normal" };
  const result = assess("おさるのジョージ ジョージの一日フィギュア [3.おふろ]【 ネコポス不可 】【C】", {
    series,
    target,
    siblings: [],
  });
  assert.equal(result.accepted, true);
  assert.equal(result.reviewRequired, false);
  assert.equal(result.reason, "variant_and_parent_evidence_confirmed");
  assert.equal(result.listingType, "single");
  assert.equal(result.confidence, 0.86);
  assert.equal(result.auditChecks.explicitLabelTargetMatch, true);
  assert.equal(result.auditChecks.explicitLabelUnresolved, false);
});

test("93 Production ジャンバ candidate ignores sibling names contained by the parent series", () => {
  const result = assess("肩ズンFig. リロ&スティッチ Part2 [1.ジャンバ]【 ネコポス不可 】【C】", {
    series: STITCH_SERIES,
    target: JUMBA,
    siblings: [LILO, STITCH],
  });
  assert.equal(result.accepted, true);
  assert.equal(result.reviewRequired, false);
  assert.equal(result.reason, "variant_and_parent_evidence_confirmed");
  assert.equal(result.listingType, "single");
  assert.equal(result.confidence, 0.86);
  assert.deepEqual(result.classification.details.matched_variant_ids, [JUMBA.id]);
  assert.equal(result.auditChecks.multipleVariantCandidates, false);
  assert.equal(result.auditChecks.explicitLabelTargetMatch, true);
  assert.equal(result.auditChecks.explicitLabelOtherVariantMatch, false);
  assert.equal(result.auditChecks.explicitLabelUnresolved, false);
});

test("94 sibling text outside the exact parent series remains a conflict", () => {
  const result = assess("肩ズンFig. リロ&スティッチ Part2 リロ [1.ジャンバ]", {
    series: STITCH_SERIES,
    target: JUMBA,
    siblings: [LILO, STITCH],
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "multiple_variant_candidates");
});

test("95 sibling text inside and outside the parent keeps the outside match", () => {
  const result = assess("肩ズンFig. リロ&スティッチ Part2 [1.ジャンバ] / リロ", {
    series: STITCH_SERIES,
    target: JUMBA,
    siblings: [LILO, STITCH],
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "multiple_variant_candidates");
  assert.deepEqual(new Set(result.classification.details.matched_variant_ids), new Set([JUMBA.id, LILO.id]));
});

test("96 an explicit sibling label remains a conflict", () => {
  const result = assess("肩ズンFig. リロ&スティッチ Part2 [1.ジャンバ]【リロ】", {
    series: STITCH_SERIES,
    target: JUMBA,
    siblings: [LILO, STITCH],
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "explicit_variant_label_conflict");
});

test("97 a true multi-variant listing remains review-required", () => {
  const result = assess("肩ズンFig. リロ&スティッチ Part2 ジャンバ / リロ", {
    series: STITCH_SERIES,
    target: JUMBA,
    siblings: [LILO, STITCH],
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reviewRequired, true);
  assert.equal(result.reason, "multiple_variant_candidates");
});

test("98 a true set listing remains not_single_item", () => {
  const result = assess("肩ズンFig. リロ&スティッチ Part2 ジャンバ リロ 2種セット", {
    series: STITCH_SERIES,
    target: JUMBA,
    siblings: [LILO, STITCH],
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "not_single_item");
});

test("99 unavailable shipping labels are compared after NFKC normalization", () => {
  const analysis = analyzeExplicitMarketLabels(
    "対象シリーズ [1.勇者]【 ﾈｺﾎﾟｽ 不可 】",
    [{ id: "hero", name: "勇者" }],
    "hero",
  );
  assert.equal(analysis.explicitLabelTargetMatch, true);
  assert.equal(analysis.explicitLabelUnresolved, false);
});

test("100 Production PICO PARK デザインA candidate remains accepted", () => {
  const series = { id: "pico-park", slug: "pico-park", name: "PICO PARK キーボードチャーム" };
  const target = { id: "design-a", slug: "design-a", series_id: series.id, name: "デザインA", variant_type: "normal" };
  const result = assess("PICO PARK キーボードチャーム [1.デザインA]【ネコポス配送対応】【C】", {
    series,
    target,
    siblings: [],
  });
  assert.equal(result.accepted, true);
  assert.equal(result.reason, "variant_and_parent_evidence_confirmed");
  assert.equal(result.confidence, 0.86);
});

const ARTIFACT_POOH_SERIES = {
  id: "gashapon-4549660608370000",
  slug: "gashapon-4549660608370000",
  name: "ならぶんです。 Winnie the Pooh",
  franchise: "Winnie the Pooh",
};
const ARTIFACT_POOH_VARIANTS = [
  "くまのプーさん",
  "ティガー",
  "イーヨー",
  "ルー",
  "ピグレット",
].map((name) => ({
  id: `${ARTIFACT_POOH_SERIES.id}-${name}`,
  slug: `${ARTIFACT_POOH_SERIES.id}-${name}`,
  series_id: ARTIFACT_POOH_SERIES.id,
  name,
  variant_type: "normal",
}));
const ARTIFACT_STITCH_SERIES = {
  id: "tarts-y901362",
  slug: "tarts-y901362",
  name: "肩ズンFig. リロ&スティッチ Part2",
};
const ARTIFACT_STITCH_VARIANTS = [
  ["tarts-y901362-ジャンバ", "ジャンバ"],
  ["tarts-y901362-プリークリー", "プリークリー"],
  ["tarts-y901362-リロ", "リロ"],
  ["tarts-y901362-ディズニー-スティッチ", "ディズニー スティッチ"],
  ["tarts-y901362-スクランプ", "スクランプ"],
].map(([id, name]) => ({
  id,
  slug: id,
  series_id: ARTIFACT_STITCH_SERIES.id,
  name,
  variant_type: "normal",
}));
const ARTIFACT_GEORGE_SERIES = {
  id: "tarts-y901539",
  slug: "tarts-y901539",
  name: "おさるのジョージ ジョージの一日フィギュア",
};
const ARTIFACT_GEORGE_VARIANTS = [{
  id: "tarts-y901539-おふろ",
  slug: "tarts-y901539-おふろ",
  series_id: ARTIFACT_GEORGE_SERIES.id,
  name: "おふろ",
  variant_type: "normal",
}];

const SOURCE_ARTIFACT_30655163177 = [
  {
    candidateKey: "0d255efb944230e5",
    provider: "rakuten_ichiba",
    listingId: "auc-treasuremarket:10051970",
    publicUrl: "https://item.rakuten.co.jp/auc-treasuremarket/71575/",
    title: "ティガー (ならぶんです。 Winnie the Pooh くまのプーさん ディズニー キャラクター Disney グッズ ガシャポン ガチャ バンダイ) 【即納 在庫品】【数量限定】【単品】",
    series: ARTIFACT_POOH_SERIES,
    variants: ARTIFACT_POOH_VARIANTS,
    targetName: "くまのプーさん",
    accepted: false,
    reviewRequired: true,
    reason: "explicit_variant_label_unresolved",
  },
  {
    candidateKey: "25f5906df352c016",
    provider: "rakuten_ichiba",
    listingId: "auc-treasuremarket:10051967",
    publicUrl: "https://item.rakuten.co.jp/auc-treasuremarket/71572/",
    title: "イーヨー (ならぶんです。 Winnie the Pooh くまのプーさん ディズニー キャラクター Disney グッズ ガシャポン ガチャ バンダイ) 【即納 在庫品】【数量限定】【単品】",
    series: ARTIFACT_POOH_SERIES,
    variants: ARTIFACT_POOH_VARIANTS,
    targetName: "くまのプーさん",
    accepted: false,
    reviewRequired: true,
    reason: "explicit_variant_label_unresolved",
  },
  {
    candidateKey: "5e08f193af49dbf9",
    provider: "yahoo_shopping",
    listingId: "ma-petite-mere_221001-bd-4549660772378-03",
    publicUrl: "https://store.shopping.yahoo.co.jp/ma-petite-mere/221001-bd-4549660772378-03.html",
    title: "バンダイ ガチャ ならぶんです。 Winnie the pooh 2 くまのプーさん クラシック 【イーヨー】",
    series: ARTIFACT_POOH_SERIES,
    variants: ARTIFACT_POOH_VARIANTS,
    targetName: "くまのプーさん",
    accepted: false,
    reviewRequired: true,
    reason: "explicit_variant_label_conflict",
  },
  {
    candidateKey: "6d1aaac520172ae5",
    provider: "rakuten_ichiba",
    listingId: "auc-treasuremarket:10051969",
    publicUrl: "https://item.rakuten.co.jp/auc-treasuremarket/71574/",
    title: "ルー (ならぶんです。 Winnie the Pooh くまのプーさん ディズニー キャラクター Disney グッズ ガシャポン ガチャ バンダイ) 【即納 在庫品】【数量限定】【単品】",
    series: ARTIFACT_POOH_SERIES,
    variants: ARTIFACT_POOH_VARIANTS,
    targetName: "くまのプーさん",
    accepted: false,
    reviewRequired: true,
    reason: "explicit_variant_label_unresolved",
  },
  {
    candidateKey: "739e69fd68b39a6f",
    provider: "rakuten_ichiba",
    listingId: "auc-toysanta:10378288",
    publicUrl: "https://item.rakuten.co.jp/auc-toysanta/g-5l0w00186p-001/",
    title: "肩ズンFig. リロ&スティッチ Part2 [1.ジャンバ]【 ネコポス不可 】【C】",
    series: ARTIFACT_STITCH_SERIES,
    variants: ARTIFACT_STITCH_VARIANTS,
    targetName: "ジャンバ",
    accepted: true,
    reviewRequired: false,
    reason: "variant_and_parent_evidence_confirmed",
  },
  {
    candidateKey: "939a0ae56d23e979",
    provider: "yahoo_shopping",
    listingId: "ma-petite-mere_221001-bd-4549660772378-04",
    publicUrl: "https://store.shopping.yahoo.co.jp/ma-petite-mere/221001-bd-4549660772378-04.html",
    title: "バンダイ ガチャ ならぶんです。 Winnie the pooh 2 くまのプーさん クラシック 【ティガー】",
    series: ARTIFACT_POOH_SERIES,
    variants: ARTIFACT_POOH_VARIANTS,
    targetName: "くまのプーさん",
    accepted: false,
    reviewRequired: true,
    reason: "explicit_variant_label_conflict",
  },
  {
    candidateKey: "c0a06ea538d0c6a6",
    provider: "yahoo_shopping",
    listingId: "ma-petite-mere_221001-bd-4549660772378-01",
    publicUrl: "https://store.shopping.yahoo.co.jp/ma-petite-mere/221001-bd-4549660772378-01.html",
    title: "バンダイ ガチャ ならぶんです。 Winnie the pooh 2 くまのプーさん クラシック 【くまのプーさんA】",
    series: ARTIFACT_POOH_SERIES,
    variants: ARTIFACT_POOH_VARIANTS,
    targetName: "くまのプーさん",
    accepted: false,
    reviewRequired: true,
    reason: "parent_series_edition_conflict",
  },
  {
    candidateKey: "d8f6b383d1c838c5",
    provider: "rakuten_ichiba",
    listingId: "auc-toysanta:10381214",
    publicUrl: "https://item.rakuten.co.jp/auc-toysanta/g-5l3l0018ik-003/",
    title: "おさるのジョージ ジョージの一日フィギュア [3.おふろ]【 ネコポス不可 】【C】",
    series: ARTIFACT_GEORGE_SERIES,
    variants: ARTIFACT_GEORGE_VARIANTS,
    targetName: "おふろ",
    accepted: true,
    reviewRequired: false,
    reason: "variant_and_parent_evidence_confirmed",
  },
  {
    candidateKey: "e724818ddc2066e4",
    provider: "yahoo_shopping",
    listingId: "ma-petite-mere_221001-bd-4549660772378-05",
    publicUrl: "https://store.shopping.yahoo.co.jp/ma-petite-mere/221001-bd-4549660772378-05.html",
    title: "バンダイ ガチャ ならぶんです。 Winnie the pooh 2 くまのプーさん クラシック 【くまのプーさんB】",
    series: ARTIFACT_POOH_SERIES,
    variants: ARTIFACT_POOH_VARIANTS,
    targetName: "くまのプーさん",
    accepted: false,
    reviewRequired: true,
    reason: "parent_series_edition_conflict",
  },
  {
    candidateKey: "efef962964b26fbf",
    provider: "yahoo_shopping",
    listingId: "ma-petite-mere_221001-bd-4549660772378-06",
    publicUrl: "https://store.shopping.yahoo.co.jp/ma-petite-mere/221001-bd-4549660772378-06.html",
    title: "バンダイ ガチャ ならぶんです。 Winnie the pooh 2 くまのプーさん クラシック 【ピグレットB】",
    series: ARTIFACT_POOH_SERIES,
    variants: ARTIFACT_POOH_VARIANTS,
    targetName: "くまのプーさん",
    accepted: false,
    reviewRequired: true,
    reason: "explicit_variant_label_conflict",
  },
  {
    candidateKey: "ff5baa7deca4ff32",
    provider: "rakuten_ichiba",
    listingId: "auc-treasuremarket:10051968",
    publicUrl: "https://item.rakuten.co.jp/auc-treasuremarket/71573/",
    title: "ピグレット (ならぶんです。 Winnie the Pooh くまのプーさん ディズニー キャラクター Disney グッズ ガシャポン ガチャ バンダイ) 【即納 在庫品】【数量限定】【単品】",
    series: ARTIFACT_POOH_SERIES,
    variants: ARTIFACT_POOH_VARIANTS,
    targetName: "くまのプーさん",
    accepted: false,
    reviewRequired: true,
    reason: "explicit_variant_label_unresolved",
  },
];

test("101 source artifact 30655163177 keeps all eleven candidate decisions and keys", () => {
  const evaluated = SOURCE_ARTIFACT_30655163177.map((fixture) => {
    const target = fixture.variants.find((variant) => variant.name === fixture.targetName);
    assert.ok(target, `missing target fixture for ${fixture.candidateKey}`);
    const siblings = fixture.variants.filter((variant) => variant.id !== target.id);
    const result = assess(fixture.title, {
      series: fixture.series,
      target,
      siblings,
      listingId: fixture.listingId,
    });
    assert.equal(buildMarketCandidateKey({
      provider: fixture.provider,
      listing_id: fixture.listingId,
      public_url: fixture.publicUrl,
    }), fixture.candidateKey);
    assert.equal(result.accepted, fixture.accepted, fixture.candidateKey);
    assert.equal(result.reviewRequired, fixture.reviewRequired, fixture.candidateKey);
    assert.equal(result.reason, fixture.reason, fixture.candidateKey);
    if (fixture.accepted) {
      assert.equal(result.confidence, 0.86, fixture.candidateKey);
      assert.equal(result.listingType, "single", fixture.candidateKey);
      assert.equal(result.auditChecks.setSignalDetected, false, fixture.candidateKey);
    } else {
      assert.ok(result.confidence < 0.8, fixture.candidateKey);
    }
    return { key: fixture.candidateKey, result };
  });

  const acceptedKeys = evaluated
    .filter(({ result }) => result.accepted)
    .map(({ key }) => key)
    .sort();
  const reviewRequiredKeys = evaluated
    .filter(({ result }) => result.reviewRequired)
    .map(({ key }) => key)
    .sort();
  assert.equal(evaluated.length, 11);
  assert.equal(acceptedKeys.length, 2);
  assert.equal(reviewRequiredKeys.length, 9);
  assert.deepEqual(acceptedKeys, [
    "739e69fd68b39a6f",
    "d8f6b383d1c838c5",
  ]);
  assert.deepEqual(reviewRequiredKeys, [
    "0d255efb944230e5",
    "25f5906df352c016",
    "5e08f193af49dbf9",
    "6d1aaac520172ae5",
    "939a0ae56d23e979",
    "c0a06ea538d0c6a6",
    "e724818ddc2066e4",
    "efef962964b26fbf",
    "ff5baa7deca4ff32",
  ]);
});
