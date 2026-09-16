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

test("targeted category read queries one category instead of enumerating the category catalog", () => {
  const helper = source("lib/targeted-category-series-page.js");
  assert.match(helper, /getParentSeriesCatalogPage\(\{/);
  assert.match(helper, /category: requestedName/);
  assert.match(helper, /pageSize/);
  assert.match(helper, /sort: "newest"/);
  assert.doesNotMatch(helper, /getParentSeriesCategoryCatalog/);
  assert.doesNotMatch(helper, /fetchSupabaseParentSeriesCategoryCatalog/);
});
