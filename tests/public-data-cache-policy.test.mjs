import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../lib/series.js", import.meta.url), "utf8");

test("public Supabase data cache is bounded to the fastest ingestion interval", () => {
  assert.match(source, /const PUBLIC_CACHE_SECONDS = 1800;/);
  assert.match(source, /const CATALOG_CACHE_SECONDS = 1800;/);
});

test("public data caching remains scoped to Next shared data cache", () => {
  assert.match(source, /unstable_cache/);
  assert.match(source, /tags: \["gacha-public-catalog"\]/);
  assert.match(source, /tags: \["gacha-public-ranking"\]/);
  assert.match(source, /tags: \["gacha-public-variant"\]/);
  assert.match(source, /tags: \["gacha-public-series"\]/);
});
