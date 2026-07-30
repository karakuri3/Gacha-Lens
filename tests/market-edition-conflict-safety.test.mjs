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
