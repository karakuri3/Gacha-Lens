import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { getLegacyCategoryDiscoveryPageRedirectPath } from "../lib/domain/category-discovery.js";
import { STATIC_CATEGORY_FACETS } from "../lib/domain/category-static-manifest.js";
import {
  STATIC_BRAND_FACETS,
  STATIC_FRANCHISE_FACETS,
} from "../lib/domain/discovery-static-manifest.js";
import { getLegacyDiscoveryFacetPageRedirectPath } from "../lib/domain/discovery-facets.js";

for (const route of [
  "app/categories/[name]/page.js",
  "app/categories/[name]/page/[page]/page.js",
]) {
  test(`${route} is a DB-free daily static shell`, () => {
    const source = fs.readFileSync(route, "utf8");
    assert.match(source, /export const dynamic = "force-static";/);
    assert.match(source, /export const revalidate = 86400;/);
    assert.match(source, /generateStaticParams/);
    assert.match(source, /CategoryDiscoveryClientLanding/);
    assert.doesNotMatch(source, /getTargetedPublicCategorySeriesPage|getPublicDiscoveryFacets|searchParams/);
  });
}

test("current Production categories are pinned for build-time prerender", () => {
  assert.deepEqual(STATIC_CATEGORY_FACETS.map((facet) => facet.name), [
    "ガシャポン",
    "ガチャ",
    "フラット",
    "プレミアム",
    "めじるしアクセサリー",
  ]);
});

test("legacy category page queries redirect to canonical path pagination", () => {
  assert.equal(
    getLegacyCategoryDiscoveryPageRedirectPath("https://gachalens.com/categories/%E3%82%AC%E3%82%B7%E3%83%A3%E3%83%9D%E3%83%B3?page=2"),
    "/categories/%E3%82%AC%E3%82%B7%E3%83%A3%E3%83%9D%E3%83%B3/page/2",
  );
  assert.equal(
    getLegacyCategoryDiscoveryPageRedirectPath("https://gachalens.com/categories/%E3%82%AC%E3%82%B7%E3%83%A3%E3%83%9D%E3%83%B3?page=1&utm_source=test"),
    "/categories/%E3%82%AC%E3%82%B7%E3%83%A3%E3%83%9D%E3%83%B3?utm_source=test",
  );
  assert.equal(getLegacyCategoryDiscoveryPageRedirectPath("https://gachalens.com/brands/Bandai?page=2"), null);
});

test("category public API keeps the targeted 60-series read contract", () => {
  const source = fs.readFileSync("app/api/public-discovery/route.js", "utf8");
  assert.match(source, /getTargetedPublicCategorySeriesPage/);
  assert.match(source, /pageSize: 60/);
  assert.match(source, /type !== "category"/);
  assert.match(source, /Cloudflare-CDN-Cache-Control/);
  assert.match(source, /result\.items\.map\(toPublicSeriesCard\)/);
  assert.doesNotMatch(source.slice(source.indexOf("function toPublicSeriesCard")), /official_url|officialUrl|source_type|created_at|updated_at/);
});

test("worker redirects legacy category pagination before vinext", () => {
  const source = fs.readFileSync("worker/index.js", "utf8");
  const redirectIndex = source.indexOf("const legacyCategoryRedirect = getLegacyCategoryDiscoveryPageRedirect");
  const handlerIndex = source.indexOf("const response = await handler.fetch");
  assert.ok(redirectIndex >= 0 && handlerIndex > redirectIndex);
  assert.match(source, /categories/);
  assert.doesNotMatch(source, /getLegacyDiscoveryPageRedirectPath/);
});


for (const route of [
  "app/brands/[name]/page.js",
  "app/brands/[name]/page/[page]/page.js",
  "app/franchises/[name]/page.js",
  "app/franchises/[name]/page/[page]/page.js",
]) {
  test(`${route} is a DB-free daily static shell`, () => {
    const source = fs.readFileSync(route, "utf8");
    assert.match(source, /export const dynamic = "force-static";/);
    assert.match(source, /export const revalidate = 86400;/);
    assert.match(source, /generateStaticParams/);
    assert.match(source, /DiscoveryFacetClientLanding/);
    assert.doesNotMatch(source, /getPublicDiscoveryFacetSeriesPage|searchParams|force-dynamic|revalidate = 0/);
  });
}

test("Production brand and franchise manifests stay bounded", () => {
  assert.equal(STATIC_BRAND_FACETS.length, 2);
  assert.equal(STATIC_FRANCHISE_FACETS.length, 977);
  assert.ok(STATIC_BRAND_FACETS.every((facet) => facet.name && facet.series_count >= 2));
  assert.ok(STATIC_FRANCHISE_FACETS.every((facet) => facet.name && facet.series_count >= 2));
});

test("legacy brand and franchise page queries redirect to canonical path pagination", () => {
  assert.equal(
    getLegacyDiscoveryFacetPageRedirectPath("https://gachalens.com/brands/%E3%83%90%E3%83%B3%E3%83%80%E3%82%A4?page=2"),
    "/brands/%E3%83%90%E3%83%B3%E3%83%80%E3%82%A4/page/2",
  );
  assert.equal(
    getLegacyDiscoveryFacetPageRedirectPath("https://gachalens.com/franchises/%E3%82%B5%E3%83%B3%E3%83%AA%E3%82%AA%E3%82%AD%E3%83%A3%E3%83%A9%E3%82%AF%E3%82%BF%E3%83%BC%E3%82%BA?page=1&utm_source=test"),
    "/franchises/%E3%82%B5%E3%83%B3%E3%83%AA%E3%82%AA%E3%82%AD%E3%83%A3%E3%83%A9%E3%82%AF%E3%82%BF%E3%83%BC%E3%82%BA?utm_source=test",
  );
  assert.equal(getLegacyDiscoveryFacetPageRedirectPath("https://gachalens.com/categories/Figures?page=2"), null);
});

test("public discovery API supports category, brand, and franchise with one 60-series contract", () => {
  const source = fs.readFileSync("app/api/public-discovery/route.js", "utf8");
  assert.match(source, /\["category", "brand", "franchise"\]/);
  assert.match(source, /getPublicDiscoveryFacetSeriesPage\(type, rawName, \{ page, pageSize: 60 \}\)/);
  assert.match(source, /getTargetedPublicCategorySeriesPage/);
  assert.match(source, /result\.items\.map\(toPublicSeriesCard\)/);
});

test("worker redirects legacy brand and franchise pagination before vinext", () => {
  const source = fs.readFileSync("worker/index.js", "utf8");
  const redirectIndex = source.indexOf("const legacyDiscoveryFacetRedirect = getLegacyDiscoveryFacetPageRedirect");
  const handlerIndex = source.indexOf("const response = await handler.fetch");
  assert.ok(redirectIndex >= 0 && handlerIndex > redirectIndex);
  assert.match(source, /getLegacyDiscoveryFacetPageRedirectPath/);
});
