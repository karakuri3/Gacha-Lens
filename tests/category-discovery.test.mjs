import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  categoryDiscoveryHref,
  categoryDiscoveryPageHref,
  collectPublicCategoryFacets,
  decodeCategoryDiscoveryParam,
  findPublicCategoryFacet,
  paginatePublicCategoryVariants,
} from "../lib/domain/category-discovery.js";
import { discoveryFacetHref } from "../lib/domain/discovery-facets.js";

const ROOT = process.cwd();
const source = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

function row(id, seriesId, category, overrides = {}) {
  return {
    id,
    slug: id,
    series_id: seriesId,
    name: `Variant ${id}`,
    variant_type: "normal",
    parent: { id: seriesId, slug: `series-${seriesId}`, category },
    ...overrides,
  };
}

test("category facets require two distinct public parent series and retain exact variant counts", () => {
  const facets = collectPublicCategoryFacets([
    row("v1", "s1", "Figures"),
    row("v2", "s1", "Figures"),
    row("v3", "s2", "Figures"),
    row("v4", "s3", "Plush"),
  ]);
  assert.deepEqual(facets, [{ name: "Figures", filter_value: "Figures", series_count: 2, variant_count: 3 }]);
  assert.deepEqual(findPublicCategoryFacet(facets, " figures "), facets[0]);
});

test("category facets keep one raw database value while publishing its normalized display name", () => {
  const facets = collectPublicCategoryFacets([
    row("v1", "s1", " Figures "),
    row("v2", "s2", " Figures "),
  ]);
  assert.deepEqual(facets, [{ name: "Figures", filter_value: " Figures ", series_count: 2, variant_count: 2 }]);
});

test("NFKC display normalization never changes the exact category filter value", () => {
  const raw = "\uFF26\uFF49\uFF47\uFF55\uFF52\uFF45\uFF53";
  const facets = collectPublicCategoryFacets([row("v1", "s1", raw), row("v2", "s2", raw)]);
  assert.equal(facets[0].name, "Figures");
  assert.equal(facets[0].filter_value, raw);
});

test("normalized category collisions fail closed instead of choosing one raw filter value", () => {
  const facets = collectPublicCategoryFacets([
    row("v1", "s1", "Figures"),
    row("v2", "s2", "Figures"),
    row("v3", "s3", "figures"),
  ]);
  assert.deepEqual(facets, []);
});

test("category facets exclude provisional, incomplete, unknown, and generic category rows", () => {
  const facets = collectPublicCategoryFacets([
    row("visible", "s1", "Figures"),
    row("provisional", "s2", "Figures", { variant_type: "provisional" }),
    row("missing-name", "s3", "Figures", { name: "" }),
    row("unknown-a", "s4", "unknown"),
    row("unknown-b", "s5", "unknown"),
    row("generic-a", "s6", "all"),
    row("generic-b", "s7", "all"),
  ]);
  assert.deepEqual(facets, []);
});

test("category-only generic exclusions do not change franchise or brand facet rules", async () => {
  const { isMeaningfulDiscoveryFacetName } = await import("../lib/domain/discovery-facets.js");
  assert.equal(isMeaningfulDiscoveryFacetName("all"), true);
  assert.equal(isMeaningfulDiscoveryFacetName("category"), true);
});

test("multiple variants from the same series do not inflate category series counts", () => {
  const facets = collectPublicCategoryFacets([
    row("v1", "s1", "Miniatures"),
    row("v2", "s1", "Miniatures"),
    row("v3", "s1", "Miniatures"),
    row("v4", "s2", "Miniatures"),
  ]);
  assert.equal(facets[0].series_count, 2);
  assert.equal(facets[0].variant_count, 4);
});

test("category variant pagination covers 61 and 121 public variants without overlap", () => {
  for (const total of [61, 121]) {
    const variants = Array.from({ length: total }, (_, index) => ({ id: `v${index + 1}` }));
    const pages = Array.from({ length: Math.ceil(total / 60) }, (_, index) => paginatePublicCategoryVariants(variants, { page: index + 1, pageSize: 60 }));
    assert.equal(pages[0].total, total);
    assert.equal(pages.at(-1).items.length, total % 60 || 60);
    assert.equal(new Set(pages.flatMap((page) => page.items.map((item) => item.id))).size, total);
  }
});

test("category route helpers preserve Japanese, literal percent signs, spaces, ampersands, plus signs, and slashes", () => {
  for (const name of ["\u30df\u30cb\u30c1\u30e5\u30a2", "100% & +", "Title/Feature"]) {
    const segment = categoryDiscoveryHref(name).split("/").at(-1);
    assert.equal(decodeCategoryDiscoveryParam(decodeURIComponent(segment)), name);
  }
  assert.equal(categoryDiscoveryPageHref("Figures"), "/categories/Figures");
  assert.equal(categoryDiscoveryPageHref("Figures", 2), "/categories/Figures?page=2");
  assert.equal(discoveryFacetHref("category", "\u30df\u30cb\u30c1\u30e5\u30a2"), "/categories/%E3%83%9F%E3%83%8B%E3%83%81%E3%83%A5%E3%82%A2");
});

test("category pages use parent-series filtering, canonical metadata, and noindex pagination", () => {
  const text = source("app/categories/[name]/page.js");
  assert.match(text, /getPublicCategorySeriesPage/);
  assert.match(text, /if \(!result\) notFound\(\)/);
  assert.match(text, /pageSize: 60/);
  assert.match(text, /noIndex: page > 1/);
  assert.match(text, /categoryDiscoveryPageHref/);
  assert.match(text, /buildPageMetadata/);
  assert.doesNotMatch(text, /offers|aggregateRating|review:/);
});

test("category discovery uses a targeted parent series query without sitemap cache agreement", () => {
  const text = source("lib/series.js");
  const functionSource = text.slice(text.indexOf("export async function getPublicCategorySeriesPage"), text.indexOf("export async function getPublicDiscoveryFacetSeriesPage"));
  assert.match(functionSource, /getParentSeriesCatalogPage\(\{/);
  assert.doesNotMatch(functionSource, /getPublicSitemapIdentifiers\(\)/);
  assert.doesNotMatch(functionSource, /result\.total !==/);
  assert.match(functionSource, /if \(result\.total === 0\) return null/);
  assert.match(functionSource, /getParentSeriesCategoryCatalog\(\)/);
  assert.doesNotMatch(source("lib/domain/category-discovery.js"), /affiliate|commission|ranking|forecast|market|stock|reaction/i);
});

test("category database filtering remains exact while URL names remain normalized", () => {
  const repository = source("lib/data/supabase-gacha-repository.js");
  const categorySource = source("lib/domain/category-discovery.js");
  assert.match(repository, /query\.eq\("category", options\.category\)/);
  assert.match(categorySource, /filter_value: \[\.\.\.group\.rawValues\]\[0\]/);
  assert.match(categorySource, /rawValues\.size === 1/);
});

test("categories index is parent-series-first while filtered catalog URLs stay noindex", () => {
  const categories = source("app/categories/page.js");
  const catalog = source("app/series/page.js");
  assert.match(categories, /getParentSeriesCategoryCatalog/);
  assert.match(categories, /categoryDiscoveryHref/);
  assert.match(categories, /series_count/);
  assert.match(catalog, /noIndex: Boolean\(query\.q \|\| query\.category\)/);
  assert.match(catalog, /query\.q \|\| query\.category \? \{ index: false, follow: true \}/);
});

test("parent category catalog retains a series-only category and its exact parent count", () => {
  const repository = source("lib/data/supabase-gacha-repository.js");
  const categorySource = repository.slice(repository.indexOf("export async function fetchSupabaseParentSeriesCategoryCatalog"), repository.indexOf("export async function fetchSupabaseUpcomingParentSeriesMonths"));
  assert.match(categorySource, /fetchTable\(supabaseClient, TABLE_MAP\.series, "id,category,image_url,is_released"\)/);
  assert.match(categorySource, /series_count \+= 1/);
  assert.match(categorySource, /if \(!row\.is_released\) group\.upcoming_count \+= 1/);
  assert.doesNotMatch(categorySource, /TABLE_MAP\.variants|countPublicVariants/);
});

test("category landing renders parent-series cards instead of variant cards", () => {
  const landing = source("components/DiscoveryFacetPages.js");
  const categoryLanding = landing.slice(landing.indexOf("export function CategoryDiscoveryLanding"));
  assert.match(categoryLanding, /シリーズ一覧/);
  assert.match(categoryLanding, /scope="series"/);
  assert.doesNotMatch(categoryLanding, /単品一覧|公開単品/);
});

test("category detail pages keep local text while sitemap retains only canonical discovery URLs", () => {
  for (const file of ["app/series/[slug]/page.js", "app/series/group/[slug]/page.js"]) {
    const text = source(file);
    assert.doesNotMatch(text, /DiscoveryFacetLink/);
    assert.doesNotMatch(text, /getPublicDiscoveryFacets/);
    assert.match(text, /カテゴリ/);
  }
  const sitemap = source("app/sitemap.js");
  assert.match(sitemap, /categories\.map\(\(facet\)/);
  assert.match(sitemap, /\/categories\/\$\{encodeURIComponent\(facet\.name\)\}/);
  assert.doesNotMatch(sitemap, /categoryDiscoveryPageHref/);
  assert.match(sitemap, /MAX_SITEMAP_URLS = 50000/);
});
