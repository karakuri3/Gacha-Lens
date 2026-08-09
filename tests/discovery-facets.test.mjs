import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  collectPublicDiscoveryFacets,
  decodeDiscoveryFacetParam,
  discoveryFacetHref,
  findPublicDiscoveryFacet,
  isMeaningfulDiscoveryFacetName,
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
  assert.equal(decodeDiscoveryFacetParam(encodeURIComponent(facets[0].name)), facets[0].name);
});

test("public sitemap fetch remains identity-only, paged, and deterministic", () => {
  const text = source("lib/data/public-sitemap-identifiers.js");
  assert.match(text, /parent:series!inner\(id,slug,franchise,brand\)/);
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
    assert.match(text, /findPublicDiscoveryFacet/);
    assert.match(text, /if \(!facet\) notFound\(\)/);
    assert.match(text, /pageSize: 60/);
    assert.match(text, /buildPageMetadata/);
    assert.doesNotMatch(text, /offers|aggregateRating|review:/);
  }
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
