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

test("Production category detail splits exact count from the bounded page read", () => {\n  const helper = source("lib/targeted-category-series-page.js");\n  assert.match(helper, /loadCachedSupabaseCategoryPage/);\n  assert.match(helper, /const PUBLIC_VARIANT_RELATION = "variants!inner\\(id\\)"/);\n  assert.match(helper, /count: "exact", head: true/);\n  assert.match(helper, /select\\(`id,\\$\\{PUBLIC_VARIANT_RELATION\\}`/);\n  assert.match(helper, /select\\(`\\$\\{SERIES_SELECT\\},\\$\\{PUBLIC_VARIANT_RELATION\\}`\\)/);\n  assert.match(helper, /applyPublicVariantRelationFilter/);\n  assert.match(helper, /\\.eq\\("category", category\\)/);\n  assert.match(helper, /referencedTable: "variants"/);\n  assert.match(helper, /const page = Math\\.min\\(requestedPage, totalPages\\)/);\n  assert.match(helper, /if \\(direct\\.total > 0\\) return buildResult\\(direct, requestedName\\)/);\n  assert.match(helper, /findPublicCategoryFacet\\(await getParentSeriesCategoryCatalog\\(\\), requestedName\\)/);\n  assert.ok(\n    helper.indexOf("readCategoryPage(requestedName") < helper.indexOf("getParentSeriesCategoryCatalog()"),\n    "normal category requests must use the targeted query before the broad raw-value fallback",\n  );\n  assert.doesNotMatch(helper, /market_listings|x_reactions|restock_events|stock_reports/);\n});\ntest("category summary preserves card identity, release, image, price and lineup count fields", () => {
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
