import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { getLegacyDiscoveryPageRedirectPath } from "../lib/domain/discovery-facets.js";

const routeFiles = [
  "app/categories/[name]/page.js",
  "app/brands/[name]/page.js",
  "app/franchises/[name]/page.js",
  "app/categories/[name]/page/[page]/page.js",
  "app/brands/[name]/page/[page]/page.js",
  "app/franchises/[name]/page/[page]/page.js",
];

for (const route of routeFiles) {
  test(`${route} is daily static-rendered without request searchParams`, () => {
    const source = fs.readFileSync(route, "utf8");
    assert.match(source, /export const dynamic = "force-static";/);
    assert.match(source, /export const revalidate = 86400;/);
    assert.match(source, /generateStaticParams/);
    assert.doesNotMatch(source, /searchParams/);
    assert.doesNotMatch(source, /force-dynamic|revalidate = 0/);
  });
}

test("legacy discovery page queries redirect to canonical path pagination", () => {
  assert.equal(
    getLegacyDiscoveryPageRedirectPath("https://gachalens.com/categories/%E3%82%AC%E3%82%B7%E3%83%A3%E3%83%9D%E3%83%B3?page=2"),
    "/categories/%E3%82%AC%E3%82%B7%E3%83%A3%E3%83%9D%E3%83%B3/page/2",
  );
  assert.equal(
    getLegacyDiscoveryPageRedirectPath("https://gachalens.com/brands/Bandai?page=3&utm_source=test"),
    "/brands/Bandai/page/3?utm_source=test",
  );
  assert.equal(
    getLegacyDiscoveryPageRedirectPath("https://gachalens.com/franchises/Disney?page=1"),
    "/franchises/Disney",
  );
  assert.equal(getLegacyDiscoveryPageRedirectPath("https://gachalens.com/categories?page=2"), null);
  assert.equal(getLegacyDiscoveryPageRedirectPath("https://gachalens.com/ranking?page=2"), null);
});

test("worker redirects legacy discovery pagination before vinext and caches path pagination", () => {
  const source = fs.readFileSync("worker/index.js", "utf8");
  const discoveryIndex = source.indexOf("const legacyDiscoveryPageRedirect = getLegacyDiscoveryPageRedirect");
  const handlerIndex = source.indexOf("const response = await handler.fetch");
  assert.ok(discoveryIndex >= 0 && handlerIndex > discoveryIndex);
  assert.match(source, /categories\|brands\|franchises/);
  assert.match(source, /\[1-9\]/);
});

test("static param helper prebuilds current facet pages in bounded 60-item pages", () => {
  const source = fs.readFileSync("lib/static-discovery-facets.js", "utf8");
  assert.match(source, /DISCOVERY_FACET_PAGE_SIZE = 60/);
  assert.match(source, /getPublicDiscoveryFacets/);
  assert.match(source, /Math\.ceil\(Number\(facet\.series_count \|\| 0\) \/ DISCOVERY_FACET_PAGE_SIZE\)/);
  assert.match(source, /getTargetedPublicCategorySeriesPage/);
  assert.match(source, /getPublicDiscoveryFacetSeriesPage/);
});
