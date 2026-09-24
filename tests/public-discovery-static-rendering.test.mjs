import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const routes = [
  "app/categories/page.js",
  "app/brands/page.js",
  "app/franchises/page.js",
];

for (const route of routes) {
  test(`${route} is daily static-rendered`, () => {
    const source = fs.readFileSync(route, "utf8");
    assert.match(source, /export const dynamic = "force-static";/);
    assert.match(source, /export const revalidate = 86400;/);
    assert.doesNotMatch(source, /force-dynamic/);
    assert.doesNotMatch(source, /revalidate = 0/);
  });
}
