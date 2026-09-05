import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("series alias routes public callers through the edge-safe wrapper", () => {
  const config = JSON.parse(source("jsconfig.json"));
  assert.deepEqual(config.compilerOptions.paths["@/lib/series"], ["./lib/edge-safe-series.js"]);
});

test("edge-safe detail and related reads bypass Next unstable_cache and use scoped Supabase helpers", () => {
  const wrapper = source("lib/edge-safe-series.js");
  assert.match(wrapper, /fetchSupabaseScopedVariantDetail\(serviceRoleSupabase, normalizedSlug\)/);
  assert.match(wrapper, /fetchSupabaseScopedRelatedCatalog\(/);
  assert.match(wrapper, /createGachaRepository\(records\)\.findVariantBySlug\(normalizedSlug\)/);
  assert.match(wrapper, /createGachaRepository\(records\)\.getRelatedVariants\(normalizedSlug, limit\)/);
  assert.doesNotMatch(wrapper, /fetchSupabaseCatalogVariant/);
  assert.doesNotMatch(wrapper, /fetchSupabaseRelatedCatalog/);
  assert.doesNotMatch(wrapper, /from\s+["']next\/cache["']/);
  assert.doesNotMatch(wrapper, /\bunstable_cache\s*\(/);
  assert.match(wrapper, /export \* from "\.\/series\.js"/);
});

test("scoped detail data source limits signal reads to relevant variants plus series-level set listings", () => {
  const scoped = source("lib/data/supabase-public-variant-detail.js");

  assert.match(scoped, /fetchRowsForColumn\(client, TABLE_MAP\.marketListings, TABLE_SELECTS\.marketListings, "variant_id", ids\)/);
  assert.match(scoped, /fetchRowsForColumn\(client, TABLE_MAP\.marketListings, TABLE_SELECTS\.marketListings, "matched_variant_id", ids\)/);
  assert.match(scoped, /fetchRowsForColumn\(client, TABLE_MAP\.xReactions, TABLE_SELECTS\.xReactions, "variant_id", ids\)/);
  assert.match(scoped, /fetchRowsForColumn\(client, TABLE_MAP\.restockEvents, TABLE_SELECTS\.restockEvents, "matched_variant_id", ids\)/);
  assert.match(scoped, /fetchRowsForColumn\(client, TABLE_MAP\.stockReports, TABLE_SELECTS\.stockReports, "variant_id", ids\)/);
  assert.match(scoped, /\.is\("variant_id", null\)/);
  assert.match(scoped, /LISTING_TYPES\.COMPLETE_SET/);
  assert.match(scoped, /LISTING_TYPES\.PARTIAL_SET/);
  assert.match(scoped, /LISTING_TYPES\.POPULAR_SET/);
  assert.doesNotMatch(scoped, /fetchSignalsForCatalog/);
  assert.doesNotMatch(scoped, /fetchTable\(/);
});

test("scoped variant detail preserves sibling lineup while market observations stay target-only", () => {
  const scoped = source("lib/data/supabase-public-variant-detail.js");
  assert.match(scoped, /\.eq\("series_id", target\.series_id\)/);
  assert.match(scoped, /TABLE_MAP\.marketObservations,[\s\S]*?"variant_id",[\s\S]*?\[target\.id\]/);
});

test("variant detail page stays framework-dynamic while Cloudflare owns shared reuse", () => {
  const page = source("app/series/[slug]/page.js");
  const worker = source("worker/index.js");
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.match(page, /export const revalidate = 0/);
  assert.match(worker, /series-detail-1800-v1/);
});
