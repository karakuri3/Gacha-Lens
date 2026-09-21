import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("category route ISR diagnostic preserves pagination while bypassing data cache", () => {
  const route = fs.readFileSync("app/categories/[name]/page.js", "utf8");
  const helper = fs.readFileSync("lib/targeted-category-series-page.js", "utf8");

  assert.match(route, /export const revalidate = 300/);
  assert.match(route, /export const dynamicParams = true/);
  assert.match(route, /generateStaticParams\(\)/);
  assert.match(route, /return \[\]/);
  assert.match(route, /bypassDataCache: true/);
  assert.match(route, /normalizeDiscoveryFacetPage/);
  assert.doesNotMatch(route, /force-dynamic/);

  assert.match(helper, /Boolean\(options\.bypassDataCache\)/);
  assert.match(helper, /bypassDataCache[\s\S]*fetchSupabaseCategorySeriesSummaryPage/);
  assert.match(helper, /loadCachedSupabaseCategoryPage/);
});
