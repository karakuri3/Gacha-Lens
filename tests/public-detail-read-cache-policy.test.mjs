import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const facadeSource = readFileSync(new URL("../lib/public-series-cache.js", import.meta.url), "utf8");
const jsconfigSource = readFileSync(new URL("../jsconfig.json", import.meta.url), "utf8");

test("public series facade defines persistent detail caches at module scope", () => {
  assert.match(facadeSource, /PUBLIC_DETAIL_CACHE_SECONDS = 1800/);
  assert.match(facadeSource, /const loadCachedVariantDetail = unstable_cache\(/);
  assert.match(facadeSource, /const loadCachedRelatedSeries = unstable_cache\(/);
  assert.match(facadeSource, /async \(encodedSlug\) =>/);
  assert.match(facadeSource, /async \(encodedSlug, limit\) =>/);
  assert.match(facadeSource, /getSeriesBySlugUncached\(normalizedSlug\)/);
  assert.match(facadeSource, /getRelatedSeriesUncached\(normalizedSlug, limit\)/);
  assert.equal((facadeSource.match(/unstable_cache\(/g) ?? []).length, 2);
});

test("public detail cache uses only ASCII-safe external identity", () => {
  assert.match(facadeSource, /encodeURIComponent\(value\)/);
  assert.match(facadeSource, /decodeURIComponent\(value\)/);
  assert.match(facadeSource, /\["gacha-public-variant-detail-v2"\]/);
  assert.match(facadeSource, /\["gacha-public-related-detail-v2"\]/);
  assert.match(facadeSource, /tags: \["gacha-public-variant-v2"\]/);
  assert.match(facadeSource, /tags: \["gacha-public-related-v2"\]/);
  assert.doesNotMatch(facadeSource, /tags:\s*\[[^\]]*normalizedSlug/);
});

test("public facade passes slug and limit as cache arguments instead of per-request closures", () => {
  assert.match(facadeSource, /loadCachedVariantDetail\(encodeCacheSlug\(normalizeSlugValue\(slug\)\)\)/);
  assert.match(facadeSource, /loadCachedRelatedSeries\(encodeCacheSlug\(normalizeSlugValue\(slug\)\), limit\)/);
  assert.match(facadeSource, /createHash\("sha256"\)/);
  assert.match(facadeSource, /digest\("hex"\)/);
});

test("application imports resolve through the transparent public series facade", () => {
  const config = JSON.parse(jsconfigSource);
  assert.deepEqual(config.compilerOptions.paths["@/lib/series"], ["./lib/public-series-cache.js"]);
  assert.deepEqual(config.compilerOptions.paths["@/*"], ["./*"]);
  assert.match(facadeSource, /export \* from "\.\/series\.js"/);
});
