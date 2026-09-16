import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const source = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("category detail route delegates the raw dynamic param to the targeted helper once", () => {
  const route = source("app/categories/[name]/page.js");
  assert.match(route, /getTargetedPublicCategorySeriesPage/);
  assert.doesNotMatch(route, /getPublicCategorySeriesPage/);
  assert.match(route, /const name = \(await params\)\.name;/);
  assert.match(route, /return getCategoryDiscoveryPage\(name, page\);/);
  assert.doesNotMatch(route, /categoryDiscoveryLookupCandidates/);
});

test("Production category detail exhausts cheap decoded candidates before one broad raw-value fallback", () => {
  const helper = source("lib/targeted-category-series-page.js");
  assert.match(helper, /categoryDiscoveryLookupCandidates\(name\)/);
  assert.match(helper, /for \(const requestedName of requestedNames\)/);
  assert.match(helper, /const direct = await readCategoryPage\(requestedName, requestedPage, pageSize\)/);
  assert.match(helper, /if \(direct\.total > 0\) return buildResult\(direct, requestedName\)/);
  assert.match(helper, /const catalog = await getParentSeriesCategoryCatalog\(\)/);
  assert.ok(
    helper.indexOf("const direct = await readCategoryPage") < helper.indexOf("const catalog = await getParentSeriesCategoryCatalog()"),
    "all targeted direct reads must happen before the broad category catalog fallback",
  );
  assert.equal(
    helper.match(/getParentSeriesCategoryCatalog\(\)/g)?.length,
    1,
    "the broad category catalog may be loaded at most once",
  );
  assert.match(helper, /findPublicCategoryFacet\(catalog, requestedName\)/);
  assert.doesNotMatch(helper, /market_listings|x_reactions|restock_events|stock_reports/);
});

test("Production category detail keeps the catalog-only relation query", () => {
  const helper = source("lib/targeted-category-series-page.js");
  assert.match(helper, /loadCachedSupabaseCategoryPage/);
  assert.match(helper, /\.from\("series"\)/);
  assert.match(helper, /variants!inner\(id,variant_type,series_id,slug,name\)/);
  assert.match(helper, /\.eq\("category", category\)/);
  assert.match(helper, /referencedTable: "variants"/);
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
