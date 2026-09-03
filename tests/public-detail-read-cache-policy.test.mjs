import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const facadeSource = readFileSync(new URL("../lib/public-series-cache.js", import.meta.url), "utf8");
const jsconfigSource = readFileSync(new URL("../jsconfig.json", import.meta.url), "utf8");

test("public series facade caches only completed detail results for 30 minutes", () => {
  assert.match(facadeSource, /PUBLIC_DETAIL_CACHE_SECONDS = 1800/);
  assert.match(facadeSource, /getSeriesBySlugUncached\(normalizedSlug\)/);
  assert.match(facadeSource, /getRelatedSeriesUncached\(normalizedSlug, limit\)/);
  assert.match(facadeSource, /tags: \["gacha-public-variant"\]/);
  assert.match(facadeSource, /tags: \["gacha-public-related"\]/);
});

test("public detail cache identity contains no raw Japanese slug", () => {
  assert.match(facadeSource, /createHash\("sha256"\)/);
  assert.match(facadeSource, /digest\("hex"\)/);
  assert.match(facadeSource, /\["gacha-public-variant-detail-v1", cacheIdentity\]/);
  assert.match(facadeSource, /\["gacha-public-related-detail-v1", cacheIdentity\]/);
  assert.doesNotMatch(facadeSource, /tags:\s*\[[^\]]*normalizedSlug/);
});

test("application imports resolve through the transparent public series facade", () => {
  const config = JSON.parse(jsconfigSource);
  assert.deepEqual(config.compilerOptions.paths["@/lib/series"], ["./lib/public-series-cache.js"]);
  assert.deepEqual(config.compilerOptions.paths["@/*"], ["./*"]);
  assert.match(facadeSource, /export \* from "\.\/series\.js"/);
});
