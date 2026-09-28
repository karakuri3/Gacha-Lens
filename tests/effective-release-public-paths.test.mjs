import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = (path) => fs.readFileSync(path, "utf8");

test("stock summary cannot drop aged false variants before effective release evaluation", () => {
  const text = source("lib/public-stock-summary.js");
  assert.match(text, /withEffectiveVariantReleaseRelations\(VARIANT_SELECT\)/);
  assert.match(text, /applyEffectiveVariantReleaseFilter\(query, "released"\)/);
  assert.doesNotMatch(text, /\.eq\("released", true\)|\.eq\("is_released", true\)/);
});

test("stock feed cannot drop aged false variants before effective release evaluation", () => {
  const text = source("lib/data/public-stock-feed.js");
  assert.match(text, /withEffectiveVariantReleaseRelations\(VARIANT_SELECT\)/);
  assert.match(text, /applyEffectiveVariantReleaseFilter\(query, "released"\)/);
  assert.doesNotMatch(text, /\.eq\("released", true\)|\.eq\("is_released", true\)/);
});

test("restock feed uses effective series release state instead of persisted is_released", () => {
  const text = source("lib/data/public-restock-feed.js");
  assert.match(text, /applyEffectiveReleaseFilter\(query, "released", "is_released", "release_date"\)/);
  assert.doesNotMatch(text, /\.eq\("is_released", true\)/);
});

test("marketplace query planning uses the effective release contract for preorder wording", () => {
  const text = source("lib/fetchers/market-query-planner.js");
  assert.match(text, /effectiveReleaseState\(variant, \{ parent: parentSeries, now \}\)/);
  assert.doesNotMatch(text, /variant\.released === false \? "予約 ガチャ"/);
});

test("release-sensitive public caches are bounded to five minutes at Next or Cloudflare boundaries", () => {
  for (const path of [
    "app/page.js",
    "app/ranking/page.js",
    "app/ranking/series/page.js",
    "app/ranking/upcoming/page.js",
    "app/ranking/upcoming/series/page.js",
    "app/categories/page.js",
    "app/brands/page.js",
    "app/franchises/page.js",
  ]) {
    assert.match(source(path), /export const revalidate = 300;/, path);
  }

  const worker = source("worker/index.js");
  assert.match(worker, /series-detail-300-v2/);
  assert.match(worker, /discovery-index-300-v2/);
  assert.match(worker, /discovery-document-300-v2/);

  for (const path of ["app/api/public-stock/route.js", "app/api/public-discovery/route.js"]) {
    const text = source(path);
    assert.match(text, /Cloudflare-CDN-Cache-Control/);
    assert.match(text, /max-age=300, stale-while-revalidate=60/);
  }
});
