import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("home dashboard is daily static-rendered", () => {
  const source = fs.readFileSync("app/page.js", "utf8");
  assert.match(source, /export const dynamic = "force-static";/);
  assert.match(source, /export const revalidate = 86400;/);
  assert.doesNotMatch(source, /force-dynamic|revalidate = 0|searchParams/);
});

test("home keeps the released variant and upcoming series data contracts", () => {
  const source = fs.readFileSync("app/page.js", "utf8");
  assert.match(source, /getRankingSeries\("released", "variant"\)/);
  assert.match(source, /getRankingSeries\("upcoming", "series"\)/);
});

test("home remains inside the bounded public-document edge policy", () => {
  const source = fs.readFileSync("worker/index.js", "utf8");
  assert.match(source, /PUBLIC_DOCUMENT_PATHS = new Set\(\[/);
  assert.match(source, /"\/",/);
  assert.match(source, /marker: "public-document-120-v1"/);
});
