import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { classifyMarketEvidence } from "../lib/domain/market-evidence.js";
import { buildActiveListingWatchEntry, formatAskingPrice } from "../lib/domain/ranking-market-watch.js";

const NOW = new Date("2026-09-29T00:00:00.000Z");
const variant = { id: "v1", variant_id: "v1", series_id: "s1", slug: "truthful-single", name: "通常単品", variant_type: "single", released: true, is_released: true };

function listing(overrides = {}) {
  return {
    id: overrides.id || "l1",
    variant_id: "v1",
    matched_variant_id: "v1",
    series_id: "s1",
    listing_type: "single",
    market_review_type: "single",
    price: 1200,
    status: "active",
    source: "rakuten",
    review_required: false,
    last_observed_at: "2026-09-24T05:47:46.548Z",
    ...overrides,
  };
}

test("ranking truthfulness: active asking evidence never becomes sold ranking evidence", () => {
  const evidence = classifyMarketEvidence({ subject: variant, listings: [listing(), listing({ id: "l2" }), listing({ id: "l3" })], now: NOW });
  assert.equal(evidence.completedCount, 0);
  assert.equal(evidence.activeCount, 3);
  assert.equal(evidence.eligibleForPriceRanking, false);
});

test("ranking truthfulness: completed-sale ranking keeps the existing three-sale threshold", () => {
  const sold = (id) => listing({ id, status: "sold", sold_at: "2026-09-20T00:00:00Z" });
  assert.equal(classifyMarketEvidence({ subject: variant, listings: [sold("a"), sold("b")], now: NOW }).eligibleForPriceRanking, false);
  assert.equal(classifyMarketEvidence({ subject: variant, listings: [sold("a"), sold("b"), sold("c")], now: NOW }).eligibleForPriceRanking, true);
});

test("ranking truthfulness: sold status without explicit sold_at is not completed-sale evidence", () => {
  const evidence = classifyMarketEvidence({
    subject: variant,
    listings: [listing({ id: "sold-without-proof", status: "sold", sold_at: null })],
    now: NOW,
  });
  assert.equal(evidence.completedCount, 0);
  assert.equal(evidence.eligibleForPriceRanking, false);
});

test("ranking truthfulness: one active listing is a single observation, never a fake range", () => {
  const entry = buildActiveListingWatchEntry({ ...variant, market_listings: [listing()] }, { now: NOW });
  assert.equal(entry.listingCount, 1);
  assert.equal(formatAskingPrice(entry), "1,200円");
});

test("ranking truthfulness: multiple active listings show the bounded asking range", () => {
  const entry = buildActiveListingWatchEntry({
    ...variant,
    market_listings: [listing({ id: "a", price: 900 }), listing({ id: "b", price: 1500, source: "yahoo_shopping" })],
  }, { now: NOW });
  assert.equal(entry.listingCount, 2);
  assert.equal(entry.providerCount, 2);
  assert.equal(formatAskingPrice(entry), "900円〜1,500円");
  assert.equal(entry.observedAt, "2026-09-24T05:47:46.548Z");
});

test("ranking truthfulness: review-required and non-positive active rows are excluded", () => {
  const entry = buildActiveListingWatchEntry({
    ...variant,
    market_listings: [
      listing({ id: "review", review_required: true }),
      listing({ id: "zero", price: 0 }),
      listing({ id: "safe", price: 1300 }),
    ],
  }, { now: NOW });
  assert.equal(entry.listingCount, 1);
  assert.equal(formatAskingPrice(entry), "1,300円");
});

test("ranking truthfulness: wrong identity and wrong listing type are excluded", () => {
  const entry = buildActiveListingWatchEntry({
    ...variant,
    market_listings: [
      listing({ id: "wrong-id", variant_id: "v2", matched_variant_id: "v2" }),
      listing({ id: "set", listing_type: "complete_set", market_review_type: "full_set" }),
    ],
  }, { now: NOW });
  assert.equal(entry, null);
});

test("ranking truthfulness: stale active rows respect the existing 30-day window", () => {
  const entry = buildActiveListingWatchEntry({
    ...variant,
    market_listings: [listing({ last_observed_at: "2026-08-01T00:00:00Z" })],
  }, { now: NOW });
  assert.equal(entry, null);
});

test("ranking truthfulness: series asking watch uses complete-set listings only", () => {
  const series = { id: "s1", series_id: "s1", name: "シリーズ", entity_type: "series", is_released: true };
  const entry = buildActiveListingWatchEntry({
    ...series,
    market_listings: [
      listing({ id: "single", listing_type: "single" }),
      listing({ id: "partial", listing_type: "partial_set" }),
      listing({ id: "complete", listing_type: "complete_set", price: 3000 }),
    ],
  }, { scope: "series", now: NOW });
  assert.equal(entry.listingCount, 1);
  assert.equal(formatAskingPrice(entry), "3,000円");
});

test("ranking truthfulness: released UI labels asking and sold evidence separately and suppresses sparse podium", () => {
  const page = fs.readFileSync(new URL("../components/RankingPageContent.js", import.meta.url), "utf8");
  assert.match(page, /成約価格ランキング/);
  assert.match(page, /成約3件以上/);
  assert.match(page, /出品価格ウォッチ/);
  assert.match(page, /売れた価格・成約相場ではありません/);
  assert.match(page, /ranked\.length >= 3/);
  assert.match(page, /eligible_for_price_ranking === true/);
  assert.match(page, /tab === "upcoming"/);
});
