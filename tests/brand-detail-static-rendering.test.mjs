import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { getLegacyBrandDiscoveryPageRedirectPath } from "../lib/domain/brand-discovery.js";
import { STATIC_BRAND_FACETS } from "../lib/domain/brand-static-manifest.js";

for (const route of [
  "app/brands/[name]/page.js",
  "app/brands/[name]/page/[page]/page.js",
]) {
  test(`${route} is a DB-free daily static shell`, () => {
    const source = fs.readFileSync(route, "utf8");
    assert.match(source, /export const dynamic = "force-static";/);
    assert.match(source, /export const revalidate = 86400;/);
    assert.match(source, /generateStaticParams/);
    assert.match(source, /BrandDiscoveryClientLanding/);
    assert.doesNotMatch(source, /getPublicDiscoveryFacetSeriesPage|searchParams/);
  });
}

test("current Production brands are pinned for build-time prerender", () => {
  assert.deepEqual(STATIC_BRAND_FACETS, [
    { name: "タカラトミーアーツ", series_count: 2447 },
    { name: "バンダイ", series_count: 6962 },
  ]);
});

test("brand pagination manifest stays bounded to current Production pages", () => {
  const total = STATIC_BRAND_FACETS.reduce(
    (sum, facet) => sum + Math.max(0, Math.ceil(facet.series_count / 60) - 1),
    0,
  );
  assert.equal(total, 156);
});

test("legacy brand page queries redirect to canonical path pagination", () => {
  assert.equal(
    getLegacyBrandDiscoveryPageRedirectPath("https://gachalens.com/brands/%E3%83%90%E3%83%B3%E3%83%80%E3%82%A4?page=2"),
    "/brands/%E3%83%90%E3%83%B3%E3%83%80%E3%82%A4/page/2",
  );
  assert.equal(
    getLegacyBrandDiscoveryPageRedirectPath("https://gachalens.com/brands/%E3%83%90%E3%83%B3%E3%83%80%E3%82%A4?page=1&utm_source=test"),
    "/brands/%E3%83%90%E3%83%B3%E3%83%80%E3%82%A4?utm_source=test",
  );
  assert.equal(getLegacyBrandDiscoveryPageRedirectPath("https://gachalens.com/franchises/Disney?page=2"), null);
});

test("public discovery API supports brand through the existing targeted read", () => {
  const source = fs.readFileSync("app/api/public-discovery/route.js", "utf8");
  assert.match(source, /\["category", "brand"\]\.includes\(type\)/);
  assert.match(source, /getPublicDiscoveryFacetSeriesPage\("brand"/);
  assert.match(source, /pageSize: 60/);
  assert.match(source, /result\.items\.map\(toPublicSeriesCard\)/);
});

test("worker redirects legacy brand pagination before vinext and caches bounded paths", () => {
  const source = fs.readFileSync("worker/index.js", "utf8");
  const redirectIndex = source.indexOf("const legacyBrandRedirect = getLegacyBrandDiscoveryPageRedirect");
  const handlerIndex = source.indexOf("const response = await handler.fetch");
  assert.ok(redirectIndex >= 0 && handlerIndex > redirectIndex);
  assert.ok(source.includes('|| /^\\/brands\\/[^/]+(?:\\/page\\/[1-9]\\d*)?$/.test(pathname)'));
});
