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
import {
  MAX_OBSERVER_SITEMAP_ROWS,
  SERIES_OBSERVER_PAGE_SIZE,
  fetchBoundedSeriesObserverRows,
} from "../lib/data/series-observer-pagination.js";

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

function createSeriesObserverClient(rows, calls) {
  const data = [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const query = {
    select() { return query; },
    eq() { return query; },
    order(column, options) { calls.push({ type: "order", column, options }); return query; },
    range(from, to) {
      calls.push({ type: "range", from, to });
      return Promise.resolve({ data: data.slice(from, to + 1), error: null });
    },
  };
  return { from(table) { calls.push({ type: "from", table }); return query; } };
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

test("root and observer sitemaps use daily cache boundaries without changing sitemap contracts", () => {
  const rootSitemap = source("app/sitemap.js");
  const seriesRoute = source("app/series-sitemap.xml/route.js");
  const variantRoute = source("app/variant-sitemap.xml/route.js");
  assert.match(rootSitemap, /unstable_cache/);
  assert.match(rootSitemap, /gacha-public-root-sitemap-v1/);
  assert.match(rootSitemap, /export const revalidate = 86400/);
  assert.match(rootSitemap, /getDailyPublicSitemapIdentifiers/);
  assert.match(rootSitemap, /getPublicSitemapIdentifiers/);
  assert.match(rootSitemap, /Public sitemap exceeds/);
  assert.doesNotMatch(rootSitemap, /series-sitemap\.xml|variant-sitemap\.xml/);

  assert.match(seriesRoute, /unstable_cache/);
  assert.match(seriesRoute, /gacha-public-series-observer-sitemap-v1/);
  assert.match(seriesRoute, /getDailySeriesObserverSitemapEntries/);
  assert.match(variantRoute, /unstable_cache/);
  assert.match(variantRoute, /gacha-public-variant-observer-sitemap-v1/);
  assert.match(variantRoute, /getDailyVariantObserverSitemapEntries/);

  for (const route of [seriesRoute, variantRoute]) {
    assert.match(route, /export const dynamic = "force-static"/);
    assert.match(route, /export const revalidate = 86400/);
    assert.doesNotMatch(route, /force-dynamic/);
    assert.match(route, /application\/xml; charset=utf-8/);
    assert.match(route, /buildObserverSitemapXml/);
  }
});

test("series-only observer reads only bounded official series columns without a mutation path", () => {
  const identifiers = source("lib/data/public-sitemap-identifiers.js");
  const pagination = source("lib/data/series-observer-pagination.js");
  assert.match(identifiers, /fetchBoundedSeriesObserverRows/);
  assert.match(pagination, /id,slug,name,brand,official_url,price,release_date,release_month,source_type,updated_at/);
  assert.match(pagination, /\.eq\("source_type", "official_site"\)/);
  assert.match(pagination, /\.range\(offset, offset \+ requestSize - 1\)/);
  assert.match(pagination, /Series observer source exceeds/);
  assert.doesNotMatch(pagination, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/i);
});

test("series observer reads deterministic 1000-row pages and reaches safe records after the first API page", async () => {
  const calls = [];
  const rows = Array.from({ length: SERIES_OBSERVER_PAGE_SIZE + 2 }, (_, index) => series({
    id: String(index).padStart(6, "0"),
    slug: index === SERIES_OBSERVER_PAGE_SIZE ? "official:qualia:series:a192bb6aadb74c8703ac13e9" : `series-${index}`,
  }));
  const fetched = await fetchBoundedSeriesObserverRows(createSeriesObserverClient(rows, calls));
  assert.equal(fetched.length, SERIES_OBSERVER_PAGE_SIZE + 2);
  assert.deepEqual(calls.filter((call) => call.type === "range"), [
    { type: "range", from: 0, to: 999 },
    { type: "range", from: 1000, to: 1999 },
  ]);
  assert.deepEqual(calls.filter((call) => call.type === "order"), [
    { type: "order", column: "id", options: { ascending: true } },
    { type: "order", column: "id", options: { ascending: true } },
  ]);
  const entries = collectSeriesObserverEntries({ seriesRows: fetched, today: TODAY });
  assert.ok(entries.some((entry) => entry.slug === "official:qualia:series:a192bb6aadb74c8703ac13e9"));
});

test("series observer accepts the 50,000-row cap and fails closed on the 50,001st sentinel row", async () => {
  const exactCalls = [];
  const exactRows = Array.from({ length: MAX_OBSERVER_SITEMAP_ROWS }, (_, index) => series({ id: String(index).padStart(6, "0"), slug: `exact-${index}` }));
  const exact = await fetchBoundedSeriesObserverRows(createSeriesObserverClient(exactRows, exactCalls));
  assert.equal(exact.length, MAX_OBSERVER_SITEMAP_ROWS);
  assert.deepEqual(exactCalls.filter((call) => call.type === "range").at(-1), { type: "range", from: 50000, to: 50000 });

  const overflowCalls = [];
  const overflowRows = Array.from({ length: MAX_OBSERVER_SITEMAP_ROWS + 1 }, (_, index) => series({ id: String(index).padStart(6, "0"), slug: `overflow-${index}` }));
  await assert.rejects(
    fetchBoundedSeriesObserverRows(createSeriesObserverClient(overflowRows, overflowCalls)),
    /exceeds 50000/
  );
  assert.deepEqual(overflowCalls.filter((call) => call.type === "range").at(-1), { type: "range", from: 50000, to: 50000 });
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
