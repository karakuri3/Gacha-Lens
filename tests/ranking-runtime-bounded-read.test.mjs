import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

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

const { createGachaRepository, createReleasedVariantRankingItems } = await import("../lib/series.js");

function source(pathname) {
  return fs.readFileSync(path.join(root, pathname), "utf8");
}

function marketListing(overrides = {}) {
  return {
    id: "listing-default",
    variant_id: "variant-1",
    matched_variant_id: "variant-1",
    series_id: "series-1",
    title: "テストシリーズ 種1",
    listing_type: "single",
    market_review_type: "single",
    classification_reason: "explicit_listing_type",
    classification_confidence: 0.99,
    price: 500,
    status: "active",
    source: "test_market",
    source_type: "marketplace",
    source_url: "https://example.com/item/default",
    listed_at: "2026-10-01T00:00:00.000Z",
    sold_at: null,
    last_observed_at: "2026-10-05T00:00:00.000Z",
    confidence: 0.99,
    review_required: false,
    raw: {},
    ...overrides,
  };
}

function recordsWithMarket(listings) {
  return {
    series: [{
      id: "series-1",
      slug: "series-1",
      name: "テストシリーズ",
      franchise: "テスト作品",
      brand: "テストブランド",
      category: "テスト",
      release_date: "2026-09-01",
      price: 300,
      image_url: "https://example.com/series.png",
      official_url: "https://example.com/official",
      is_released: true,
    }],
    variants: [{
      id: "variant-1",
      slug: "series-1-variant-1",
      series_id: "series-1",
      name: "種1",
      variant_type: "normal",
      rarity: "通常",
      image: "https://example.com/variant.png",
      released: true,
      price: 300,
      release_date: "2026-09-01",
      review_required: false,
    }],
    marketListings: listings,
    xReactions: [{ id: "x-1", variant_id: "variant-1", series_id: "series-1", text: "unused" }],
    restockEvents: [{ id: "r-1", variant_id: "variant-1", series_id: "series-1", event_type: "restock" }],
    stockReports: [{ id: "s-1", variant_id: "variant-1", series_id: "series-1", status: "in_stock" }],
  };
}

test("released variant ranking loader is market-only, count-free, and variant-scoped", () => {
  const repositorySource = source("lib/data/supabase-gacha-repository.js");
  const start = repositorySource.indexOf("export async function fetchSupabaseReleasedVariantRankingCatalog");
  const end = repositorySource.indexOf("export async function fetchSupabaseReleasedSeriesSignalCatalog", start);
  assert.ok(start >= 0 && end > start);
  const loader = repositorySource.slice(start, end);

  assert.match(loader, /\.from\(TABLE_MAP\.marketListings\)/);
  assert.match(loader, /\.eq\("review_required", false\)/);
  assert.match(loader, /\.gte\("last_observed_at", marketCutoff\)/);
  assert.match(loader, /fetchRowsInWithoutCount/);
  assert.match(loader, /"variant_id"/);
  assert.doesNotMatch(loader, /count:\s*"exact"/);
  assert.doesNotMatch(loader, /fetchSignalsForCatalog/);
  assert.doesNotMatch(loader, /\.from\(TABLE_MAP\.stockReports\)/);
  assert.doesNotMatch(loader, /\.from\(TABLE_MAP\.restockEvents\)/);
  assert.doesNotMatch(loader, /\.from\(TABLE_MAP\.xReactions\)/);
});

test("released variant ranking page alone selects the lean runtime path", () => {
  const component = source("components/RankingPageContent.js");
  assert.match(component, /tab === "released" && scope === "variant"/);
  assert.match(component, /getReleasedVariantRankingSeries\(\)/);
  assert.match(component, /getRankingSeries\(tab, scope\)/);

  const seriesSource = source("lib/series.js");
  assert.match(seriesSource, /loadCachedReleasedVariantRanking/);
  assert.match(seriesSource, /createReleasedVariantRankingItems\(records\)/);
  assert.match(seriesSource, /gacha-released-variant-ranking-v1/);
});

test("lean released ranking projection preserves completed-sale and active-listing truth", () => {
  const listings = [
    marketListing({ id: "sold-1", price: 600, status: "sold", sold_at: "2026-09-20T00:00:00.000Z", last_observed_at: "2026-09-20T00:00:00.000Z" }),
    marketListing({ id: "sold-2", price: 700, status: "sold", sold_at: "2026-09-25T00:00:00.000Z", last_observed_at: "2026-09-25T00:00:00.000Z" }),
    marketListing({ id: "sold-3", price: 800, status: "sold", sold_at: "2026-10-01T00:00:00.000Z", last_observed_at: "2026-10-01T00:00:00.000Z" }),
    marketListing({ id: "active-1", price: 900, source: "shop-a", source_url: "https://example.com/item/a" }),
    marketListing({ id: "active-2", price: 950, source: "shop-b", source_url: "https://example.com/item/b" }),
  ];
  const records = recordsWithMarket(listings);
  const full = createGachaRepository(records).listVariants()[0];
  const lean = createReleasedVariantRankingItems(records)[0];

  assert.deepEqual(lean.market_evidence, full.market_evidence);
  assert.deepEqual(lean.market_summary, full.market_summary);
  assert.deepEqual(lean.market_listings.map((item) => item.id), full.market_listings.map((item) => item.id));
  assert.equal(lean.sold_count, 3);
  assert.equal(lean.active_listing_count, 2);
  assert.equal(lean.market_evidence.eligibleForPriceRanking, true);
  assert.equal(lean.market_evidence.primaryPrice, 700);
  assert.equal(lean.name, full.name);
  assert.equal(lean.series_name, full.series_name);
  assert.equal(lean.image_url, full.image_url);
  assert.equal(lean.x_reactions, undefined);
  assert.equal(lean.stock_reports, undefined);
  assert.equal(lean.restock_events, undefined);
  assert.equal(lean.forecast_score, undefined);
});

test("sold=0 remains unranked while active listing evidence stays available", () => {
  const records = recordsWithMarket([
    marketListing({ id: "active-1", price: 400, source_url: "https://example.com/item/1" }),
    marketListing({ id: "active-2", price: 500, source_url: "https://example.com/item/2" }),
    marketListing({ id: "active-3", price: 600, source_url: "https://example.com/item/3" }),
  ]);
  const lean = createReleasedVariantRankingItems(records)[0];

  assert.equal(lean.sold_count, 0);
  assert.equal(lean.active_listing_count, 3);
  assert.equal(lean.market_evidence.eligibleForPriceRanking, false);
  assert.equal(lean.market_evidence.completedCount, 0);
  assert.equal(lean.market_evidence.activeCount, 3);
  assert.equal(lean.market_evidence.tier, "listing_guide");
});
