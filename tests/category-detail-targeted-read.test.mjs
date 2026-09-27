import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const source = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("category detail route keeps the targeted parent-series read path through the static helper", () => {
  const route = source("app/categories/[name]/page.js");
  const staticHelper = source("lib/static-discovery-facets.js");
  assert.match(route, /resolveDiscoveryFacetStaticPage\("category"/);
  assert.match(staticHelper, /getTargetedPublicCategorySeriesPage/);
  assert.doesNotMatch(staticHelper, /getPublicCategorySeriesPage/);
});

test("Production category detail splits exact count from the bounded page read", () => {
  const helper = source("lib/targeted-category-series-page.js");
  assert.match(helper, /loadCachedSupabaseCategoryPage/);
  assert.ok(helper.includes('const PUBLIC_VARIANT_RELATION = "variants!inner(id)"'));
  assert.ok(helper.includes('.select(`id,${PUBLIC_VARIANT_RELATION}`, { count: "exact", head: true })'));
  assert.ok(helper.includes('.select(`${SERIES_SELECT},${PUBLIC_VARIANT_RELATION}`)'));
  assert.match(helper, /applyPublicVariantRelationFilter/);
  assert.match(helper, /\.eq\("category", category\)/);
  assert.match(helper, /referencedTable: "variants"/);
  assert.match(helper, /const page = Math\.min\(requestedPage, totalPages\)/);
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
