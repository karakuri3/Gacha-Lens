import assert from "node:assert/strict";
import test from "node:test";

import {
  applyMarketCandidateSafety,
  assessMarketCandidate,
} from "../lib/domain/market-match-safety.js";
import { buildSanitizedMarketCandidateAudit } from "../lib/domain/market-candidate-audit.js";
import { buildMarketCandidateKey } from "../lib/domain/market-candidate-key.js";
import { buildMarketplaceListingId } from "../lib/domain/market-canary-write.js";

const TARGET_SERIES = {
  id: "tarts-y096563",
  slug: "tarts-y096563",
  name: "ガチャポリス 追うものと追われるもの",
  franchise: "ガチャポリス",
};
const SIBLING_SERIES = [
  { id: "tarts-y090608", name: "ガチャポリス！ ～犯罪都市を救え～", franchise: "ガチャポリス！" },
  { id: "tarts-y078835", name: "ガチャポリス！ 逮捕の瞬間", franchise: "ガチャポリス！" },
  { id: "sanitized-unknown-edition", name: "ガチャポリス！ 完全無欠の捜査隊編", franchise: "ガチャポリス！" },
];
const VARIANTS = ["親指手錠", "面会窓", "誘導棒"].map((name) => ({
  id: `${TARGET_SERIES.id}-${name}`,
  slug: `${TARGET_SERIES.id}-${name}`,
  series_id: TARGET_SERIES.id,
  name,
  variant_type: "normal",
}));
const SERIES = [TARGET_SERIES, ...SIBLING_SERIES];
const CATALOG = {
  series: SERIES,
  variants: VARIANTS,
  seriesById: new Map(SERIES.map((row) => [row.id, row])),
  variantById: new Map(VARIANTS.map((row) => [row.id, row])),
};
const QUERY_BY_VARIANT = new Map(VARIANTS.map((variant) => [variant.name, {
  query: `${TARGET_SERIES.name} ${variant.name} ガチャ`,
  variant_id: variant.id,
  series_id: TARGET_SERIES.id,
}]));

const RUN_31905435691_ACCEPTED = [
  ["11da70d6ad877fb3", "yahoo_shopping", "lead-netstore_302507s186ook3", "https://store.shopping.yahoo.co.jp/lead-netstore/302507s186ook3.html", "【面会窓】ガチャポリス 追うものと追われるもの", 698, "active", "面会窓", false, "yahoo-lead-netstore-302507s186ook3"],
  ["1765d317730e9415", "rakuten_ichiba", "realize-store:10620520", "https://item.rakuten.co.jp/realize-store/302507s186ook8/", "【親指手錠】ガチャポリス 追うものと追われるもの", 648, "active", "親指手錠", false, "rakuten-realize-store-10620520"],
  ["2132f31b0d27a0c9", "rakuten_ichiba", "realize-store-2:10124621", "https://item.rakuten.co.jp/realize-store-2/302308s124gpt5/", "【親指手錠】 ガチャポリス! 完全無欠の捜査隊編", 528, "active", "親指手錠", true, null],
  ["3dc2f8eb3b051968", "rakuten_ichiba", "realize-store:10620490", "https://item.rakuten.co.jp/realize-store/302507s186ook3/", "【面会窓】ガチャポリス 追うものと追われるもの", 698, "active", "面会窓", false, "rakuten-realize-store-10620490"],
  ["3fb91a5064d902d8", "rakuten_ichiba", "realize-store:10399940", "https://item.rakuten.co.jp/realize-store/302308s124gpt5/", "【親指手錠】 ガチャポリス! 完全無欠の捜査隊編", 528, "active", "親指手錠", true, null],
  ["4e8ab49acab22512", "yahoo_shopping", "lead-netstore_302507s186ook6", "https://store.shopping.yahoo.co.jp/lead-netstore/302507s186ook6.html", "【誘導棒】ガチャポリス 追うものと追われるもの", 698, "active", "誘導棒", false, "yahoo-lead-netstore-302507s186ook6"],
  ["4f3beb24b579ce98", "rakuten_ichiba", "realize-store:10620518", "https://item.rakuten.co.jp/realize-store/302507s186ook6/", "【誘導棒】ガチャポリス 追うものと追われるもの", 698, "active", "誘導棒", false, "rakuten-realize-store-10620518"],
  ["6ca4063042ba781b", "yahoo_shopping", "suruga-ya_607213181001", "https://store.shopping.yahoo.co.jp/suruga-ya/607213181001.html", "中古おもちゃ 親指手錠 「ガチャポリス! 犯罪都市を救え」", 300, "sold_out", "親指手錠", true, null],
  ["8492b2f9864fa928", "rakuten_ichiba", "realize-store-2:10456538", "https://item.rakuten.co.jp/realize-store-2/302507s186ook3/", "【面会窓】ガチャポリス 追うものと追われるもの", 698, "active", "面会窓", false, "rakuten-realize-store-2-10456538"],
  ["88d5281cf6a4210c", "rakuten_ichiba", "realize-store-2:10456540", "https://item.rakuten.co.jp/realize-store-2/302507s186ook6/", "【誘導棒】ガチャポリス 追うものと追われるもの", 698, "active", "誘導棒", false, "rakuten-realize-store-2-10456540"],
  ["8e0709c22d6b1e4a", "yahoo_shopping", "lead-netstore_302308s124gpt5", "https://store.shopping.yahoo.co.jp/lead-netstore/302308s124gpt5.html", "【親指手錠】 ガチャポリス! 完全無欠の捜査隊編", 528, "active", "親指手錠", true, null],
  ["a00507b1877cd75c", "yahoo_shopping", "suruga-ya_607195374001", "https://store.shopping.yahoo.co.jp/suruga-ya/607195374001.html", "中古おもちゃ 親指手錠 「ガチャポリス! 完全無欠の捜査隊編」", 300, "active", "親指手錠", true, null],
  ["ab952abbea5ae739", "yahoo_shopping", "lead-netstore_302507s186ook8", "https://store.shopping.yahoo.co.jp/lead-netstore/302507s186ook8.html", "【親指手錠】ガチャポリス 追うものと追われるもの", 648, "active", "親指手錠", false, "yahoo-lead-netstore-302507s186ook8"],
  ["b946d1bd49843f80", "rakuten_ichiba", "realize-store-2:10456551", "https://item.rakuten.co.jp/realize-store-2/302507s186ook8/", "【親指手錠】ガチャポリス 追うものと追われるもの", 648, "active", "親指手錠", false, "rakuten-realize-store-2-10456551"],
  ["bcacecffc5e9f6e0", "yahoo_shopping", "suruga-ya_607218566001", "https://store.shopping.yahoo.co.jp/suruga-ya/607218566001.html", "中古おもちゃ 面会窓 「ガチャポリス 追うものと追われるもの」", 580, "active", "面会窓", false, "yahoo-suruga-ya-607218566001"],
  ["d498acc8a6dbf43d", "yahoo_shopping", "suruga-ya_607218569001", "https://store.shopping.yahoo.co.jp/suruga-ya/607218569001.html", "中古おもちゃ 誘導棒 「ガチャポリス 追うものと追われるもの」", 300, "active", "誘導棒", false, "yahoo-suruga-ya-607218569001"],
  ["e54a6e8a7636e1cc", "yahoo_shopping", "suruga-ya_607218571001", "https://store.shopping.yahoo.co.jp/suruga-ya/607218571001.html", "中古おもちゃ 親指手錠 「ガチャポリス 追うものと追われるもの」", 300, "active", "親指手錠", false, "yahoo-suruga-ya-607218571001"],
  ["f9db7ff7bced8cea", "yahoo_shopping", "suruga-ya_607200072001", "https://store.shopping.yahoo.co.jp/suruga-ya/607200072001.html", "中古おもちゃ 親指手錠 「ガチャポリス! 逮捕の瞬間」", 300, "active", "親指手錠", true, null],
].map(([candidateKey, provider, listingId, publicUrl, title, price, status, variantName, wrongEdition, expectedListingDbId]) => ({
  candidateKey,
  provider,
  listingId,
  publicUrl,
  title,
  price,
  status,
  variantName,
  wrongEdition,
  expectedListingDbId,
}));

function assess(title, variantName = "親指手錠", series = TARGET_SERIES, catalog = CATALOG) {
  const variant = catalog.variants.find((row) => row.name === variantName);
  assert.ok(variant);
  const query = series.id === TARGET_SERIES.id
    ? QUERY_BY_VARIANT.get(variantName)
    : { query: `${series.name} ${variant.name} ガチャ`, variant_id: variant.id, series_id: series.id };
  return assessMarketCandidate({ id: "listing", title }, query, catalog);
}

test("exact target parent and exact variant remain accepted with independent evidence", () => {
  const result = assess("【親指手錠】ガチャポリス 追うものと追われるもの");
  assert.equal(result.accepted, true);
  assert.equal(result.auditChecks.variantEvidencePresent, true);
  assert.equal(result.auditChecks.parentFranchiseEvidencePresent, true);
  assert.equal(result.auditChecks.parentSeriesExactEvidencePresent, true);
  assert.equal(result.auditChecks.parentSeriesDiscriminatorRequired, true);
  assert.equal(result.auditChecks.parentSeriesDiscriminatorEvidencePresent, true);
  assert.equal(result.auditChecks.parentSeriesEvidencePresent, true);
});

test("same variant label with a different named edition is review-required", () => {
  for (const title of [
    "【親指手錠】 ガチャポリス! 完全無欠の捜査隊編",
    "【親指手錠】 ガチャポリス! 未登録の新章",
  ]) {
    const result = assess(title);
    assert.equal(result.accepted, false, title);
    assert.equal(result.reviewRequired, true, title);
    assert.equal(result.reason, "parent_series_edition_conflict", title);
    assert.equal(result.auditChecks.parentSeriesEditionConflict, true, title);
  }
});

test("franchise-only evidence cannot automatically prove a more-specific parent", () => {
  const result = assess("親指手錠 ガチャポリス ガチャ");
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "parent_series_evidence_missing");
  assert.equal(result.auditChecks.parentFranchiseEvidencePresent, true);
  assert.equal(result.auditChecks.parentSeriesExactEvidencePresent, false);
});

test("missing parent identity remains review-required", () => {
  const result = assess("親指手錠 ガチャ");
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "parent_series_evidence_missing");
});

test("target parent punctuation, Japanese quotes, and variant-first ordering normalize safely", () => {
  for (const title of [
    "【親指手錠】ガチャポリス! 追うものと追われるもの",
    "親指手錠 「ガチャポリス 追うものと追われるもの」",
    "親指手錠 ガチャポリス 追うものと追われるもの",
  ]) {
    assert.equal(assess(title).accepted, true, title);
  }
});

test("wrong editions inside Japanese quotes are conflicts", () => {
  for (const title of [
    "親指手錠 「ガチャポリス! 犯罪都市を救え」",
    "親指手錠 「ガチャポリス! 逮捕の瞬間」",
  ]) {
    const result = assess(title);
    assert.equal(result.accepted, false, title);
    assert.equal(result.reason, "parent_series_edition_conflict", title);
  }
});

test("an unregistered edition appended to an otherwise exact parent also fails closed", () => {
  const result = assess("ガチャポリス 追うものと追われるもの 未登録の続編 親指手錠");
  assert.equal(result.accepted, false);
  assert.equal(result.reviewRequired, true);
  assert.equal(result.reason, "parent_series_edition_conflict");
});

test("a parent equal to its franchise does not require a nonexistent discriminator", () => {
  const series = { id: "root-series", slug: "root-series", name: "ガチャポリス", franchise: "ガチャポリス" };
  const variant = { id: "root-variant", slug: "root-variant", series_id: series.id, name: "親指手錠", variant_type: "normal" };
  const catalog = {
    series: [series],
    variants: [variant],
    seriesById: new Map([[series.id, series]]),
    variantById: new Map([[variant.id, variant]]),
  };
  const result = assess("ガチャポリス 親指手錠", "親指手錠", series, catalog);
  assert.equal(result.accepted, true);
  assert.equal(result.auditChecks.parentSeriesDiscriminatorRequired, false);
});

test("Run 31905435691 accepted subset rejects every wrong edition and keeps correct targets", () => {
  const evaluated = RUN_31905435691_ACCEPTED.map((fixture) => ({
    fixture,
    result: assess(fixture.title, fixture.variantName),
  }));
  const wrong = evaluated.filter(({ fixture }) => fixture.wrongEdition);
  const correct = evaluated.filter(({ fixture }) => !fixture.wrongEdition);
  assert.equal(evaluated.length, 18);
  assert.equal(wrong.length, 6);
  assert.equal(wrong.filter(({ result }) => result.accepted).length, 0);
  assert.equal(wrong.filter(({ result }) => result.reviewRequired).length, 6);
  assert.equal(correct.length, 12);
  assert.equal(correct.filter(({ result }) => result.accepted).length, 12);
  assert.ok(correct.every(({ result }) => result.auditChecks.parentSeriesExactEvidencePresent));
});

test("Run 31905435691 candidate keys and durable listing identities remain stable", () => {
  for (const fixture of RUN_31905435691_ACCEPTED) {
    assert.equal(buildMarketCandidateKey({
      provider: fixture.provider,
      listing_id: fixture.listingId,
      public_url: fixture.publicUrl,
    }), fixture.candidateKey);
    if (!fixture.wrongEdition) {
      assert.equal(buildMarketplaceListingId({
        provider: fixture.provider,
        sourceListingId: fixture.listingId,
        publicUrl: fixture.publicUrl,
        title: fixture.title,
      }), fixture.expectedListingDbId);
    }
  }
});

test("sanitized candidate audit exposes parent evidence booleans and preserves provider identity", () => {
  const records = RUN_31905435691_ACCEPTED.map((fixture) => ({
    id: `${fixture.provider}-${fixture.listingId}`,
    title: fixture.title,
    price: fixture.price,
    status: fixture.status,
    source: fixture.provider,
    source_url: fixture.publicUrl,
    raw: {
      provider: fixture.provider,
      itemCode: fixture.listingId,
      public_item_url: fixture.provider === "rakuten_ichiba" ? fixture.publicUrl : undefined,
      query: QUERY_BY_VARIANT.get(fixture.variantName),
    },
  }));
  const queryPlan = [...QUERY_BY_VARIANT.values()];
  const safety = applyMarketCandidateSafety({ records, queryPlan, catalog: CATALOG });
  const report = buildSanitizedMarketCandidateAudit({
    records: safety.records,
    queryPlan,
    catalog: CATALOG,
    runContext: { run_id: "31905435691", head_sha: "1d389aaf200bccb21a31b752e2e1459f748cc657" },
    summary: { safety_assessed_records: records.length },
  });
  assert.equal(report.result.candidate_count, 18);
  assert.equal(report.result.accepted_count, 12);
  assert.equal(report.result.review_count, 6);
  assert.deepEqual(report.candidates.map((row) => row.candidate_key).sort(), RUN_31905435691_ACCEPTED.map((row) => row.candidateKey).sort());
  assert.ok(report.candidates.every((candidate) => (
    typeof candidate.checks.parent_franchise_evidence_present === "boolean"
    && typeof candidate.checks.parent_series_exact_evidence_present === "boolean"
    && typeof candidate.checks.parent_series_discriminator_required === "boolean"
    && typeof candidate.checks.parent_series_discriminator_evidence_present === "boolean"
  )));
  assert.equal(JSON.stringify(report).match(/application.?id|access.?key|authorization|cookie|service.?role/giu), null);
});

test("set, preorder, and multiple-variant safety remain independent of parent identity", () => {
  assert.equal(assess("ガチャポリス 追うものと追われるもの 親指手錠 面会窓 2種セット").reason, "not_single_item");
  assert.equal(assess("予約 ガチャポリス 追うものと追われるもの 親指手錠").reason, "preorder_listing");
  assert.equal(assess("ガチャポリス 追うものと追われるもの 親指手錠 面会窓").reason, "multiple_variant_candidates");
});
