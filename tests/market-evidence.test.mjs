import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MARKET_EVIDENCE_TIERS,
  classifyMarketEvidence,
  dedupeMarketListings,
  median,
  percentile,
} from "../lib/domain/market-evidence.js";
import { formatMarketEvidenceValue } from "../lib/domain/public-display-clean.js";

const NOW = new Date("2026-07-22T12:00:00Z");
const variant = Object.freeze({ id: "v1", series_id: "s1", slug: "v1", name: "テスト", variant_type: "normal", released: true });
const upcoming = Object.freeze({ ...variant, id: "v2", slug: "v2", released: false });

function listing(id, overrides = {}) {
  return {
    id,
    variant_id: overrides.variant_id ?? "v1",
    series_id: overrides.series_id ?? "s1",
    listing_type: overrides.listing_type ?? "single",
    market_review_type: overrides.market_review_type ?? "single",
    status: overrides.status ?? "sold",
    price: overrides.price ?? 1000,
    sold_at: overrides.sold_at ?? "2026-07-20T00:00:00Z",
    listed_at: overrides.listed_at ?? "2026-07-20T00:00:00Z",
    last_observed_at: overrides.last_observed_at,
    review_required: overrides.review_required ?? false,
    source: "feed",
    source_url: overrides.source_url,
    matched_variant_id: overrides.matched_variant_id,
  };
}

function many(count, overrides = {}) {
  return Array.from({ length: count }, (_, index) => listing(`l${index}`, { price: 1000 + index * 100, ...overrides }));
}

function classify(listings, subject = variant, options = {}) {
  return classifyMarketEvidence({ subject, listings, now: NOW, ...options });
}

test("1: 5 completed listings are a completed market", () => assert.equal(classify(many(5)).tier, MARKET_EVIDENCE_TIERS.SOLD));
test("2: 3 completed listings are a reference market", () => assert.equal(classify(many(3)).tier, MARKET_EVIDENCE_TIERS.REFERENCE));
test("3: 4 completed listings are a reference market", () => assert.equal(classify(many(4)).tier, MARKET_EVIDENCE_TIERS.REFERENCE));
test("4: 2 completed listings are insufficient", () => assert.equal(classify(many(2)).tier, MARKET_EVIDENCE_TIERS.INSUFFICIENT));
test("5: 1 completed listing is insufficient", () => assert.equal(classify(many(1)).tier, MARKET_EVIDENCE_TIERS.INSUFFICIENT));
test("6: 2 completed and 3 active listings use listing guide", () => {
  const rows = [...many(2), ...many(3, { status: "active", sold_at: "", variant_id: "v1" }).map((row, index) => ({ ...row, id: `a${index}` }))];
  assert.equal(classify(rows).tier, MARKET_EVIDENCE_TIERS.LISTING_GUIDE);
});
test("7: 2 active listings are insufficient", () => assert.equal(classify(many(2, { status: "active", sold_at: "" })).tier, MARKET_EVIDENCE_TIERS.INSUFFICIENT));
test("8: no listings are insufficient", () => assert.equal(classify([]).tier, MARKET_EVIDENCE_TIERS.INSUFFICIENT));
test("9: completed listings older than 90 days are excluded", () => assert.equal(classify(many(5, { sold_at: "2026-04-22T11:59:59Z" })).completedCount, 0));
test("10: active listings older than 30 days are excluded", () => assert.equal(classify(many(3, { status: "active", sold_at: "", listed_at: "2026-06-22T11:59:59Z" })).activeCount, 0));
test("11: duplicate listing observations count once", () => {
  const rows = many(5).flatMap((row) => [row, { ...row, price: row.price + 999, last_observed_at: "2026-07-21T00:00:00Z" }]);
  assert.equal(classify(rows).completedCount, 5);
});
test("12: zero and negative prices are excluded", () => assert.equal(classify([listing("a", { price: 0 }), listing("b", { price: -1 })]).completedCount, 0));
test("13: review-required listings are excluded", () => assert.equal(classify(many(5, { review_required: true })).completedCount, 0));
test("14: unknown classifications are excluded", () => assert.equal(classify(many(5, { listing_type: "unknown", market_review_type: "unknown" })).completedCount, 0));
test("15: set listings are excluded from variant evidence", () => assert.equal(classify(many(5, { listing_type: "complete_set", market_review_type: "full_set" })).completedCount, 0));
test("16: provisional variants are excluded", () => assert.equal(classify(many(5), { ...variant, variant_type: "provisional" }).completedCount, 0));
test("17: null variant_type remains public", () => assert.equal(classify(many(5), { ...variant, variant_type: null }).tier, MARKET_EVIDENCE_TIERS.SOLD));
test("18: pre-release sold rows never become completed market", () => assert.notEqual(classify(many(5, { variant_id: "v2" }), upcoming).tier, MARKET_EVIDENCE_TIERS.SOLD));
test("19: 3 pre-release listings show reservation listing price", () => {
  const result = classify(many(3, { variant_id: "v2", status: "pre_release", sold_at: "" }), upcoming);
  assert.equal(result.label, "予約・出品価格");
  assert.equal(result.tier, MARKET_EVIDENCE_TIERS.LISTING_GUIDE);
});
test("20: classification does not mutate input arrays", () => {
  const rows = many(5);
  const before = structuredClone(rows);
  classify(rows);
  assert.deepEqual(rows, before);
});

test("21: median is correct for odd counts", () => assert.equal(median([300, 100, 200]), 200));
test("22: median is correct for even counts", () => assert.equal(median([400, 100, 300, 200]), 250));
test("23: fewer than 8 completed rows do not show IQR", () => assert.equal(classify(many(7)).interquartileRange, null));
test("24: 8 completed rows show correct IQR", () => assert.deepEqual(classify(many(8)).interquartileRange, { low: 1175, high: 1525 }));
test("25: one or two rows are not used as a market median", () => assert.equal(classify(many(2)).primaryPrice, null));

test("26: 3 completed rows are eligible for price ranking", () => assert.equal(classify(many(3)).eligibleForPriceRanking, true));
test("27: active listings alone are not eligible for price ranking", () => assert.equal(classify(many(3, { status: "active", sold_at: "" })).eligibleForPriceRanking, false));
test("28: 2 completed rows are not eligible for price ranking", () => assert.equal(classify(many(2)).eligibleForPriceRanking, false));
test("29: set evidence is not eligible for variant price ranking", () => assert.equal(classify(many(5, { listing_type: "complete_set", market_review_type: "full_set" })).eligibleForPriceRanking, false));
test("30: provisional evidence is not eligible for ranking", () => assert.equal(classify(many(5), { ...variant, variant_type: "provisional" }).eligibleForPriceRanking, false));

test("31: completed market label is public Japanese copy", () => assert.equal(classify(many(5)).label, "成約相場"));
test("32: reference market label is public Japanese copy", () => assert.equal(classify(many(3)).label, "参考相場"));
test("33: listing guide explains it is not a sold price", () => assert.match(classify(many(3, { status: "active", sold_at: "" })).explanation, /売れた価格ではありません/));
test("34: insufficient evidence is explicitly labeled", () => assert.equal(classify([]).label, "データ不足"));
test("35: official price and market evidence remain separate fields", () => {
  const result = classify(many(5));
  assert.equal(variant.price, undefined);
  assert.equal(result.primaryPrice, 1200);
});
test("36: one or two observed prices display as individual confirmations", () => assert.match(formatMarketEvidenceValue(classify(many(2))), /確認2件/));
test("37: sample fixed values cannot fill missing evidence", async () => {
  const source = await readFile(new URL("../lib/domain/market-summary.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /subject\.market|variant\.market|marketValue/);
});
test("38: admin review retains excluded listing classifications", async () => {
  const source = await readFile(new URL("../lib/data/import-review.js", import.meta.url), "utf8");
  assert.match(source, /MARKET_REVIEW_TYPES\.UNKNOWN/);
  assert.match(source, /rawTitle/);
  assert.doesNotMatch(source, /filter\([^)]*review_required/);
});

test("dedupe prefers matched_variant_id over conflicting variant_id", () => {
  const rows = many(5, { variant_id: "wrong", matched_variant_id: "v1" });
  assert.equal(classify(rows).completedCount, 5);
});
test("series scope uses only set evidence", () => {
  const subject = { id: "s1", series_id: "s1", released: true };
  const rows = [...many(5), ...many(5, { listing_type: "complete_set", market_review_type: "full_set", variant_id: "" }).map((row, index) => ({ ...row, id: `set${index}` }))];
  const result = classify(rows, subject, { scope: "series" });
  assert.equal(result.completedCount, 5);
  assert.equal(result.label, "セット成約相場");
});
test("URL aliases deduplicate the same listing", () => {
  const rows = [listing("a", { source_url: "https://example.com/item/1?utm_source=x" }), listing("b", { source_url: "https://example.com/item/1" })];
  assert.equal(dedupeMarketListings(rows).length, 1);
});
test("percentile helper is deterministic", () => assert.equal(percentile([100, 200, 300, 400], 0.25), 175));
