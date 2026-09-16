import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const source = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("category detail route uses the targeted parent-series read path", () => {
  const route = source("app/categories/[name]/page.js");
  assert.match(route, /getTargetedPublicCategorySeriesPage/);
  assert.doesNotMatch(route, /getPublicCategorySeriesPage/);
});

test("Production category detail keeps decoded route values out of Next unstable cache", () => {
  const helper = source("lib/targeted-category-series-page.js");
  assert.doesNotMatch(helper, /import\s+\{\s*unstable_cache\s*\}\s+from\s+["']next\/cache["']/);
  assert.doesNotMatch(helper, /loadCachedSupabaseCategoryPage/);
  assert.match(helper, /fetchSupabaseCategorySeriesSummaryPage\(category, \{ page, pageSize \}\)/);
});

test("Production category detail uses one catalog-only relation query before the raw-value fallback", () => {
  const helper = source("lib/targeted-category-series-page.js");
  assert.match(helper, /\.from\("series"\)/);
  assert.match(helper, /variants!inner\(id,variant_type,series_id,slug,name\)/);
  assert.match(helper, /\.eq\("category", category\)/);
  assert.match(helper, /referencedTable: "variants"/);
  assert.match(helper, /if \(direct\.total > 0\) return buildResult\(direct, requestedName\)/);
  assert.match(helper, /findPublicCategoryFacet\(await getParentSeriesCategoryCatalog\(\), requestedName\)/);
  assert.ok(
    helper.indexOf("readCategoryPage(requestedName") < helper.indexOf("getParentSeriesCategoryCatalog()"),
    "normal category requests must use the targeted query before the broad raw-value fallback",
  );
  assert.doesNotMatch(helper, /market_listings|x_reactions|restock_events|stock_reports/);
});

test("category summary preserves card identity, release, image, price and lineup count fields", () => {
  const helper = source("lib/targeted-category-series-page.js");
  for (const contract of [
    /series_id: series\.id/,
    /series_slug: series\.slug/,
    /entity_type: "series"/,
    /variant_count: variants\.length/,
    /imageUrl: series\.image_url/,
    /price/,
    /effectiveReleaseState\(series\)/,
  ]) assert.match(helper, contract);
});
