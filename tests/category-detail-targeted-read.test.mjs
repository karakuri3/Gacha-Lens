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

test("targeted category read takes the scoped fast path before the raw-value fallback", () => {
  const helper = source("lib/targeted-category-series-page.js");
  assert.match(helper, /readCategoryPage\(requestedName, requestedPage, pageSize\)/);
  assert.match(helper, /getParentSeriesCatalogPage\(\{ category, page, pageSize, sort: "newest" \}\)/);
  assert.match(helper, /if \(direct\.total > 0\) return buildResult\(direct, requestedName\)/);
  assert.match(helper, /findPublicCategoryFacet\(await getParentSeriesCategoryCatalog\(\), requestedName\)/);
  assert.match(helper, /readCategoryPage\(facet\.filter_value, requestedPage, pageSize\)/);
  assert.ok(
    helper.indexOf("readCategoryPage(requestedName") < helper.indexOf("getParentSeriesCategoryCatalog()"),
    "normal category requests must use the targeted query before the broad raw-value fallback",
  );
  assert.doesNotMatch(helper, /fetchSupabaseParentSeriesCategoryCatalog/);
});
