import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  collectPublicDiscoveryFacetCatalogs,
  collectPublicDiscoveryFacets,
  decodeDiscoveryFacetParam,
  discoveryFacetHref,
  discoveryFacetPageHref,
  findPublicDiscoveryFacet,
  isMeaningfulDiscoveryFacetName,
  paginatePublicDiscoveryFacetSeries,
} from "../lib/domain/discovery-facets.js";

const ROOT = process.cwd();
const source = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

function row(id, seriesId, franchise, brand, overrides = {}) {
  return {
    id,
    slug: id,
    series_id: seriesId,
    name: `単品${id}`,
    variant_type: "normal",
    parent: { id: seriesId, slug: `series-${seriesId}`, franchise, brand },
    ...overrides,
  };
}

test("facets require two distinct public parent series and count public variants", () => {
  const result = collectPublicDiscoveryFacets([
    row("v1", "s1", "作品A", "メーカーA"),
    row("v2", "s1", "作品A", "メーカーA"),
    row("v3", "s2", "作品A", "メーカーA"),
    row("v4", "s3", "作品B", "メーカーB"),
  ]);
  assert.deepEqual(result.franchises, [{ name: "作品A", series_count: 2, variant_count: 3 }]);
  assert.deepEqual(result.brands, [{ name: "メーカーA", series_count: 2, variant_count: 3 }]);
});

test("provisional and invalid variants cannot make a facet indexable", () => {
  const result = collectPublicDiscoveryFacets([
    row("v1", "s1", "作品A", "メーカーA"),
    row("v2", "s2", "作品A", "メーカーA", { variant_type: "provisional" }),
    row("v3", "s3", "作品A", "メーカーA", { name: "" }),
  ]);
  assert.deepEqual(result, { franchises: [], brands: [] });
});

test("missing variant slug cannot make a facet indexable", () => {
  const result = collectPublicDiscoveryFacets([
    row("v1", "s1", "作品A", "メーカーA"),
    row("v2", "s2", "作品A", "メーカーA", { slug: "" }),
  ]);
  assert.deepEqual(result, { franchises: [], brands: [] });
});

test("blank and unknown facet labels are excluded", () => {
  for (const value of ["", " ", "unknown", "不明", "未登録", "未分類", "その他", "なし", "N/A"]) {
    assert.equal(isMeaningfulDiscoveryFacetName(value), false, value);
  }
});

test("facet lookup and URL encoding are deterministic", () => {
  const facets = [{ name: "機動戦士ガンダム", series_count: 2, variant_count: 7 }];
  assert.deepEqual(findPublicDiscoveryFacet(facets, "機動戦士ガンダム"), facets[0]);
  assert.equal(discoveryFacetHref("franchise", facets[0].name), `/franchises/${encodeURIComponent(facets[0].name)}`);
  assert.equal(decodeDiscoveryFacetParam(decodeURIComponent(encodeURIComponent(facets[0].name))), facets[0].name);
  assert.equal(discoveryFacetPageHref("franchise", facets[0].name), discoveryFacetHref("franchise", facets[0].name));
  assert.equal(discoveryFacetPageHref("franchise", facets[0].name, 2), `${discoveryFacetHref("franchise", facets[0].name)}?page=2`);
});

test("decoded facet params preserve literal percent signs, spaces, ampersands, plus signs, and slashes", () => {
  for (const name of ["Title A", "100% & +", "Title/Feature"]) {
    const segment = discoveryFacetHref("brand", name).split("/").at(-1);
    assert.equal(decodeDiscoveryFacetParam(decodeURIComponent(segment)), name);
  }
});

test("facet catalogs use only public parent series and retain exact counts", () => {
  const rows = [
    row("v1", "s1", "Franchise", "Brand"),
    row("v2", "s1", "Franchise", "Brand"),
    row("v3", "s2", "Franchise", "Brand"),
    row("hidden", "s3", "Franchise", "Brand", { variant_type: "provisional" }),
  ];
  const catalog = collectPublicDiscoveryFacetCatalogs(rows).franchises[0];
  assert.equal(catalog.series_count, 2);
  assert.equal(catalog.variant_count, 3);
  assert.deepEqual(catalog.parent_series.map((item) => item.id), ["s1", "s2"]);
  assert.equal(collectPublicDiscoveryFacets(rows).franchises[0].series_count, catalog.parent_series.length);
});

test("public facet pagination covers 61 and 121 parent series without overlap", () => {
  for (const total of [61, 121]) {
    const parents = Array.from({ length: total }, (_, index) => ({ id: `s${index + 1}`, slug: `series-${String(index + 1).padStart(3, "0")}` }));
    const pages = Array.from({ length: Math.ceil(total / 60) }, (_, index) => paginatePublicDiscoveryFacetSeries(parents, { page: index + 1, pageSize: 60 }));
    assert.equal(pages[0].total, total);
    assert.equal(pages.at(-1).items.length, total % 60 || 60);
    assert.equal(new Set(pages.flatMap((page) => page.items.map((item) => item.id))).size, total);
  }
});

test("public facet pagination excludes provisional rows before it assigns pages", () => {
  const rows = [
    ...Array.from({ length: 61 }, (_, index) => row(`public-${index}`, `s${index}`, "Franchise", "Brand")),
    ...Array.from({ length: 10 }, (_, index) => row(`provisional-${index}`, `p${index}`, "Franchise", "Brand", { variant_type: "provisional" })),
  ];
  const facet = collectPublicDiscoveryFacetCatalogs(rows).franchises[0];
  const first = paginatePublicDiscoveryFacetSeries(facet.parent_series, { page: 1, pageSize: 60 });
  const second = paginatePublicDiscoveryFacetSeries(facet.parent_series, { page: 2, pageSize: 60 });
  assert.equal(facet.series_count, 61);
  assert.equal(first.items.length, 60);
  assert.equal(second.items.length, 1);
  assert.match(second.items[0].id, /^s\d+$/);
});

test("public sitemap fetch remains identity-only, paged, and deterministic", () => {
  const text = source("lib/data/public-sitemap-identifiers.js");
  assert.match(text, /parent:series!inner\(id,slug,franchise,brand,category\)/);
  assert.match(text, /DEFAULT_PAGE_SIZE = 1000/);
  assert.match(text, /\.order\("id", \{ ascending: true \}\)/);
  assert.match(text, /\.range\(from, from \+ pageSize - 1\)/);
  assert.doesNotMatch(text, /market|signal|stock|reaction/i);
});

test("parent catalog applies exact franchise and brand filters", () => {
  const text = source("lib/data/supabase-gacha-repository.js");
  assert.match(text, /query\.eq\("franchise", options\.franchise\)/);
  assert.match(text, /query\.eq\("brand", options\.brand\)/);
});

test("discovery routes publish canonical metadata and reject non-indexable facets", () => {
  for (const file of ["app/franchises/[name]/page.js", "app/brands/[name]/page.js"]) {
    const text = source(file);
    assert.match(text, /getPublicDiscoveryFacetSeriesPage/);
    assert.match(text, /if \(!result\) notFound\(\)/);
    assert.match(text, /pageSize: 60/);
    assert.match(text, /noIndex: page > 1/);
    assert.match(text, /discoveryFacetPageHref/);
    assert.match(text, /buildPageMetadata/);
    assert.doesNotMatch(text, /offers|aggregateRating|review:/);
  }
});

test("landing pages hydrate only the cached public parent population", () => {
  const text = source("lib/series.js");
  assert.match(text, /getPublicDiscoveryFacetSeriesPage/);
  assert.match(text, /getPublicSitemapIdentifiers\(\)/);
  assert.match(text, /fetchSupabaseParentSeriesByIds/);
  assert.match(text, /items\.length !== requestedIds\.length/);
});

test("sitemap includes indexable discovery routes and preserves the global cap", () => {
  const text = source("app/sitemap.js");
  assert.match(text, /path: "\/franchises"/);
  assert.match(text, /path: "\/brands"/);
  assert.match(text, /\/franchises\/\$\{encodeURIComponent\(facet\.name\)\}/);
  assert.match(text, /\/brands\/\$\{encodeURIComponent\(facet\.name\)\}/);
  assert.match(text, /MAX_SITEMAP_URLS = 50000/);
  assert.match(text, /entries\.length > MAX_SITEMAP_URLS/);
});

test("public detail and catalog pages expose only conditional discovery links", () => {
  for (const file of ["app/series/[slug]/page.js", "app/series/group/[slug]/page.js"]) {
    const text = source(file);
    assert.match(text, /getPublicDiscoveryFacets/);
    assert.match(text, /DiscoveryFacetLink/);
  }
  const catalog = source("app/series/page.js");
  assert.match(catalog, /href="\/franchises"/);
  assert.match(catalog, /href="\/brands"/);
});

test("facet discovery is independent from affiliate and ranking signals", () => {
  const text = source("lib/domain/discovery-facets.js");
  assert.doesNotMatch(text, /affiliate|commission|ranking|forecast|market|stock|reaction/i);
});
