import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  MAX_OBSERVER_SITEMAP_URLS,
  buildObserverSitemapXml,
  collectSeriesObserverEntries,
  collectVariantObserverEntries,
  isSafeRecentOfficialSeriesOnly,
} from "../lib/domain/sitemap-publication.js";
import { buildCatalogCanonicalHref, parseCatalogQuery } from "../lib/domain/catalog-query.js";

const ROOT = process.cwd();
const source = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const TODAY = "2026-08-26";

function series(overrides = {}) {
  return {
    id: "series-1",
    slug: "qualia-series",
    name: "むぎゅっ鳥 マスコットボールチェーン",
    brand: "クオリア",
    official_url: "https://www.qualia-45.jp/product/view/1",
    price: 500,
    release_date: null,
    release_month: "2026-08",
    source_type: "official_site",
    updated_at: "2026-08-20T09:00:00.000Z",
    ...overrides,
  };
}

function variant(overrides = {}) {
  return {
    id: "variant-1",
    slug: "variant-one",
    series_id: "series-1",
    name: "公開単品",
    variant_type: "normal",
    parent: { id: "series-1", slug: "parent-one" },
    ...overrides,
  };
}

test("public variant parents and safe recent series-only records enter the series observer", () => {
  const entries = collectSeriesObserverEntries({
    parentSeriesSlugs: ["parent-one"],
    seriesRows: [series()],
    today: TODAY,
  });
  assert.deepEqual(entries.map((entry) => entry.slug), ["parent-one", "qualia-series"]);
});

test("old series-only records are excluded while future and current-month official records enter", () => {
  const entries = collectSeriesObserverEntries({
    seriesRows: [
      series({ slug: "old", release_date: "2026-02-26", release_month: "2026-02" }),
      series({ slug: "future", release_date: "2026-12-01", release_month: "2026-12" }),
      series({ slug: "current-month", release_month: "2026-08" }),
    ],
    today: TODAY,
  });
  assert.deepEqual(entries.map((entry) => entry.slug), ["current-month", "future"]);
});

test("series-only publication is deterministic at the exact date and month cutoff", () => {
  assert.equal(isSafeRecentOfficialSeriesOnly(series({ release_date: "2026-02-27", release_month: "2026-02" }), { today: TODAY }), true);
  assert.equal(isSafeRecentOfficialSeriesOnly(series({ release_date: "2026-02-26", release_month: "2026-02" }), { today: TODAY }), false);
  assert.equal(isSafeRecentOfficialSeriesOnly(series({ release_date: null, release_month: "2026-02" }), { today: TODAY }), true);
  assert.equal(isSafeRecentOfficialSeriesOnly(series({ release_date: null, release_month: "8月" }), { today: TODAY }), false);
});

for (const [label, overrides] of [
  ["missing slug", { slug: "" }],
  ["missing name", { name: "" }],
  ["missing brand", { brand: "" }],
  ["missing official URL", { official_url: "" }],
  ["nonpositive price", { price: 0 }],
]) test(`series-only observer excludes ${label}`, () => {
  assert.equal(isSafeRecentOfficialSeriesOnly(series(overrides), { today: TODAY }), false);
});

test("series observer deduplicates and orders slugs while retaining image-optional official series", () => {
  const entries = collectSeriesObserverEntries({
    parentSeriesSlugs: ["z-parent", "a-parent", "a-parent"],
    seriesRows: [series({ slug: "a-parent", image_url: null }), series({ slug: "middle", image_url: null })],
    today: TODAY,
  });
  assert.deepEqual(entries.map((entry) => entry.slug), ["a-parent", "middle", "z-parent"]);
});

test("observer sitemap cap fails closed rather than truncating", () => {
  const slugs = Array.from({ length: MAX_OBSERVER_SITEMAP_URLS + 1 }, (_, index) => `series-${index}`);
  assert.throws(() => collectSeriesObserverEntries({ parentSeriesSlugs: slugs, today: TODAY }), /exceeds 50000/);
});

test("variant observer uses the existing public variant predicate and excludes provisional rows", () => {
  const entries = collectVariantObserverEntries([
    variant({ updated_at: "2026-08-20T09:00:00.000Z" }),
    variant({ id: "variant-2", slug: "provisional", variant_type: "provisional" }),
  ]);
  assert.deepEqual(entries, [{ slug: "variant-one", updated_at: "2026-08-20T09:00:00.000Z" }]);
});

test("observer XML is absolute, escaped, deterministic, and omits invalid timestamps", () => {
  const xml = buildObserverSitemapXml([
    { slug: "b&b", updated_at: "invalid" },
    { slug: "a", updated_at: "2026-08-20T09:00:00.000Z" },
  ], { siteUrl: "https://gachalens.com/", pathPrefix: "/series/" });
  assert.match(xml, /^<\?xml/);
  assert.match(xml, /https:\/\/gachalens\.com\/series\/a/);
  assert.match(xml, /https:\/\/gachalens\.com\/series\/b%26b/);
  assert.match(xml, /<lastmod>2026-08-20T09:00:00\.000Z<\/lastmod>/);
  assert.equal((xml.match(/<lastmod>/g) || []).length, 1);
});

test("root sitemap remains separate while observer routes use dynamic XML handlers", () => {
  const rootSitemap = source("app/sitemap.js");
  const seriesRoute = source("app/series-sitemap.xml/route.js");
  const variantRoute = source("app/variant-sitemap.xml/route.js");
  assert.match(rootSitemap, /getPublicSitemapIdentifiers/);
  assert.doesNotMatch(rootSitemap, /series-sitemap\.xml|variant-sitemap\.xml/);
  for (const route of [seriesRoute, variantRoute]) {
    assert.match(route, /export const dynamic = "force-dynamic"/);
    assert.match(route, /application\/xml; charset=utf-8/);
    assert.match(route, /buildObserverSitemapXml/);
  }
});

test("series-only observer reads only bounded official series columns without a mutation path", () => {
  const identifiers = source("lib/data/public-sitemap-identifiers.js");
  const observerFetch = identifiers.slice(identifiers.indexOf("export async function fetchSeriesObserverRows"));
  assert.match(identifiers, /id,slug,name,brand,official_url,price,release_date,release_month,source_type,updated_at/);
  assert.match(observerFetch, /\.eq\("source_type", "official_site"\)/);
  assert.match(observerFetch, /\.range\(0, maxRows\)/);
  assert.match(observerFetch, /Series observer source exceeds/);
  assert.doesNotMatch(observerFetch, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/i);
});

test("robots publishes root and observer sitemaps without weakening disallows", () => {
  const robots = source("app/robots.js");
  for (const route of ["/sitemap.xml", "/series-sitemap.xml", "/variant-sitemap.xml", "/api/", "/review/", "/supabase-series"]) {
    assert.match(robots, new RegExp(route.replaceAll("/", "\\/")));
  }
});

test("catalog canonical preserves indexable pagination and filters but omits q and sort", () => {
  const canonical = buildCatalogCanonicalHref(parseCatalogQuery({
    scope: "variant", release: "released", month: "2026-08", page: "2", q: "検索", sort: "price_desc",
  }));
  assert.equal(canonical, "/series?scope=variant&release=released&month=2026-08&page=2");
  assert.equal(buildCatalogCanonicalHref(parseCatalogQuery({ q: "検索", category: "フィギュア", page: "2" })), "/series?category=%E3%83%95%E3%82%A3%E3%82%AE%E3%83%A5%E3%82%A2&page=2");
  const seriesPage = source("app/series/page.js");
  assert.match(seriesPage, /buildCatalogCanonicalHref\(query\)/);
  assert.match(seriesPage, /query\.q \|\| query\.category/);
});
