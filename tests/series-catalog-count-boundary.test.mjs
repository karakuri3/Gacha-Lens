import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("public series page does not run global catalog count fanout", () => {
  const source = fs.readFileSync("app/series/page.js", "utf8");
  assert.doesNotMatch(source, /getSeriesCatalogCounts/);
  assert.doesNotMatch(source, /catalogCounts|showGlobalCounts/);
  assert.match(source, /getSeriesCatalogPage/);
  assert.match(source, /catalogPage\.total/);
});

test("catalog count helper remains available outside the public series request path", () => {
  const source = fs.readFileSync("lib/series.js", "utf8");
  assert.match(source, /export async function getSeriesCatalogCounts\(\)/);
});
