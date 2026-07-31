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
  const series = { id: "precure", slug: "precure", name: "名探偵プリキュア! アクセサリーコレクション" };
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
  const series = { id: "george", slug: "george", name: "おさるのジョージ ジョージの一日フィギュア" };
  const target = { id: "sleep", slug: "sleep", series_id: series.id, name: "おやすみ", variant_type: "normal" };
  const result = assess("おさるのジョージ ジョージの一日フィギュア [4.おやすみ]【ネコポス配送対応】【C】", {
    series,
    target,
    siblings: [],
  });
  assert.equal(result.accepted, true);
  assert.equal(result.confidence, 0.86);
});

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
