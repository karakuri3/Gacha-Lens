import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { buildSeriesCompleteSetReference, safeSeriesCompleteSetReferenceUrl } from "../lib/domain/market-series-complete-set-reference.js";
import { buildMarketSummary } from "../lib/domain/market-summary.js";
import { normalizeMarketListing } from "../lib/domain/source-normalizers.js";

const root = process.cwd();
const serverOnlyModule = pathToFileURL(path.join(root, "node_modules/next/dist/compiled/server-only/empty.js")).href;
const nextCacheStub = "data:text/javascript,export%20const%20cache%20%3D%20(fn)%20%3D%3E%20fn%3B%20export%20const%20unstable_cache%20%3D%20(fn)%20%3D%3E%20fn%3B";
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: serverOnlyModule, shortCircuit: true };
    if (specifier === "next/cache") return { url: nextCacheStub, shortCircuit: true };
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !path.extname(specifier)) return nextResolve(`${specifier}.js`, context);
    return nextResolve(specifier, context);
  },
});
const { createGachaRepository } = await import("../lib/series.js");
const page = fs.readFileSync(path.join(root, "app/series/group/[slug]/page.js"), "utf8");
const series = { id: "series-1", lineup_verification_status: "verified", verified_variant_count: 6, released: true };

function listing(overrides = {}) {
  return {
    id: "yahoo-1",
    series_id: series.id,
    variant_id: null,
    matched_variant_id: null,
    listing_type: "complete_set",
    market_review_type: "full_set",
    classification_reason: "series_complete_set_confirmed",
    classification_confidence: 0.94,
    price: 2090,
    status: "active",
    source: "yahoo_shopping",
    source_url: "https://store.shopping.yahoo.co.jp/suruga-ya/561894609001.html",
    review_required: false,
    last_observed_at: "2026-08-27T00:00:00.000Z",
    raw: { provider: "yahoo_shopping" },
    ...overrides,
  };
}

function persistedCompleteSetRow({ assessed = true, safety = {}, ...overrides } = {}) {
  const marketSafety = {
    accepted: true,
    review_required: false,
    reason: "series_complete_set_confirmed",
    series_id: series.id,
    variant_id: null,
    matched_variant_id: null,
    listing_type: "complete_set",
    market_review_type: "full_set",
    confidence: 0.94,
    ...safety,
  };
  return listing({
    raw: { provider: "yahoo_shopping", market_safety_assessed: assessed, market_safety: marketSafety },
    ...overrides,
  });
}

function parentFromPersistedRow(row) {
  const parent = { ...series, slug: "series-1", name: "テストシリーズ", is_released: true };
  const variants = Array.from({ length: 6 }, (_, index) => ({
    id: `variant-${index + 1}`,
    slug: `series-1-${index + 1}`,
    series_id: series.id,
    name: `種${index + 1}`,
    released: true,
    variant_type: "normal",
  }));
  return createGachaRepository({ series: [parent], variants, marketListings: [row] }).listParentSeries()[0];
}

test("valid active series complete-set listing becomes a separate honest reference", () => {
  const reference = buildSeriesCompleteSetReference({ series, listings: [listing()] });
  assert.deepEqual(reference, {
    listing_id: "yahoo-1", series_id: "series-1", price: 2090, provider: "yahoo_shopping", provider_label: "Yahoo!ショッピング",
    source_url: "https://store.shopping.yahoo.co.jp/suruga-ya/561894609001.html", observed_at: "2026-08-27T00:00:00.000Z", lineup_count: 6,
    lineup_label: "全6種セット", note: "現在確認できた出品1件の価格です。売れた価格や相場の中央値ではありません。",
  });
});

test("DB-shaped F3-C2 complete-set persistence survives normalization and enriches only its parent series", () => {
  const parent = parentFromPersistedRow(persistedCompleteSetRow());
  assert.deepEqual(parent.complete_set_reference && {
    price: parent.complete_set_reference.price,
    provider_label: parent.complete_set_reference.provider_label,
    lineup_label: parent.complete_set_reference.lineup_label,
  }, { price: 2090, provider_label: "Yahoo!ショッピング", lineup_label: "全6種セット" });
  assert.equal(parent.market_summary.type_stats.complete_set.primary_price, null);
  assert.equal(parent.variants.every((variant) => variant.market_evidence.primaryPrice == null), true);
});

for (const [name, options] of [
  ["missing persisted assessment", { assessed: false }],
  ["rejected persisted assessment", { safety: { accepted: false } }],
  ["mismatched persisted reason", { safety: { reason: "explicit_listing_type" } }],
  ["persisted variant ID", { variant_id: "variant-1" }],
  ["mismatched persisted review type", { market_review_type: "single" }],
  ["persisted review requirement", { review_required: true }],
  ["low persisted confidence", { classification_confidence: 0.79, safety: { confidence: 0.79 } }],
  ["generic explicit listing type", { raw: { provider: "yahoo_shopping" } }],
]) test(`unsafe DB-shaped row (${name}) never restores a complete-set reference`, () => {
  assert.equal(parentFromPersistedRow(persistedCompleteSetRow(options)).complete_set_reference, null);
});

test("generic single-listing normalization is unchanged", () => {
  const normalized = normalizeMarketListing({
    id: "single-1",
    series_id: series.id,
    variant_id: "variant-1",
    title: "テストシリーズ 種1",
    listing_type: "single",
    price: 500,
    status: "active",
    source: "yahoo_shopping",
    source_url: "https://store.shopping.yahoo.co.jp/example/single-1.html",
  }, {
    series: [{ id: series.id, name: "テストシリーズ" }],
    variants: [{ id: "variant-1", series_id: series.id, name: "種1" }],
  });
  assert.equal(normalized.listing_type, "single");
  assert.equal(normalized.classification_reason, "explicit_listing_type");
});

for (const [name, changes] of [
  ["wrong series", { series_id: "other" }], ["variant attached", { variant_id: "variant-1" }], ["matched variant attached", { matched_variant_id: "variant-1" }],
  ["single listing", { listing_type: "single" }], ["partial set", { listing_type: "partial_set" }], ["wrong review type", { market_review_type: "single" }],
  ["unknown status", { status: "unknown" }], ["sold status", { status: "sold" }], ["review required", { review_required: true }], ["zero price", { price: 0 }],
  ["unsupported source", { source: "mercari", raw: { provider: "mercari" } }], ["wrong classification", { classification_reason: "not_single_item" }],
  ["low confidence", { classification_confidence: 0.79 }], ["unsafe URL", { source_url: "javascript:alert(1)" }],
]) test(`${name} cannot become a complete-set reference`, () => assert.equal(buildSeriesCompleteSetReference({ series, listings: [listing(changes)] }), null));

test("latest observation wins, then stable listing ID breaks ties", () => {
  const selected = buildSeriesCompleteSetReference({ series, listings: [listing({ id: "z", last_observed_at: "2026-08-26T00:00:00.000Z" }), listing({ id: "b" }), listing({ id: "a" })] });
  assert.equal(selected.listing_id, "a");
});

test("lineup count is stated only for a verified public lineup of two or more variants", () => {
  assert.equal(buildSeriesCompleteSetReference({ series: { ...series, lineup_verification_status: "partial" }, listings: [listing()] }).lineup_label, "コンプリートセット");
  assert.equal(buildSeriesCompleteSetReference({ series: { ...series, verified_variant_count: 1 }, listings: [listing()] }).lineup_label, "コンプリートセット");
});

test("complete-set reference accepts only canonical marketplace HTTPS URLs", () => {
  assert.equal(safeSeriesCompleteSetReferenceUrl("https://item.rakuten.co.jp/example/item/", "rakuten_ichiba"), "https://item.rakuten.co.jp/example/item/");
  assert.equal(safeSeriesCompleteSetReferenceUrl("https://store.shopping.yahoo.co.jp/example/item?affiliate=untrusted#tracking", "yahoo_shopping"), "https://store.shopping.yahoo.co.jp/example/item");
  assert.equal(safeSeriesCompleteSetReferenceUrl("https://example.com/item", "yahoo_shopping"), null);
  assert.equal(safeSeriesCompleteSetReferenceUrl("javascript:alert(1)", "yahoo_shopping"), null);
});

test("reference data and aggregate evidence keep the single observed price separate", () => {
  const reference = buildSeriesCompleteSetReference({ series, listings: [listing()] });
  const summary = buildMarketSummary({ id: series.id, released: true }, [listing()], { scope: "series", now: "2026-08-27T01:00:00.000Z" });
  assert.equal(reference.price, 2090);
  assert.equal(summary.complete_set, null);
  assert.equal(summary.type_stats.complete_set.primary_price, null);
});

test("no qualifying listing means no reference card data", () => {
  assert.equal(buildSeriesCompleteSetReference({ series, listings: [] }), null);
});

test("one active listing remains insufficient for the aggregate complete-set market price", () => {
  const summary = buildMarketSummary({ id: series.id, released: true }, [listing()], { scope: "series", now: "2026-08-27T01:00:00.000Z" });
  assert.equal(summary.complete_set, null);
  assert.equal(summary.type_stats.complete_set.tier, "insufficient");
  assert.equal(summary.type_stats.complete_set.primary_price, null);
});

test("parent page renders an isolated reference card and keeps aggregate and favorites on complete-set evidence", () => {
  assert.match(page, /complete_set_reference/);
  assert.match(page, /コンプリートセット参考価格/);
  assert.match(page, /completeSetReference\.note/);
  assert.match(page, /target="_blank" rel="noopener noreferrer"/);
  assert.match(page, /market\.type_stats\?\.complete_set/);
  assert.match(page, /formatCompleteSetAggregate/);
  assert.doesNotMatch(page, /PriceTrendChart|TrackedMarketLink|application\/ld\+json/);
});
