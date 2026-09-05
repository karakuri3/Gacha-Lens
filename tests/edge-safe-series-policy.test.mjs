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

test("edge-safe variant detail bypasses Next unstable_cache and fetches the bounded catalog directly", () => {
  const wrapper = source("lib/edge-safe-series.js");
  assert.match(wrapper, /fetchSupabaseCatalogVariant\(serviceRoleSupabase, normalizedSlug\)/);
  assert.match(wrapper, /createGachaRepository\(records\)\.findVariantBySlug\(normalizedSlug\)/);
  assert.doesNotMatch(wrapper, /from\s+["']next\/cache["']/);
  assert.doesNotMatch(wrapper, /\bunstable_cache\s*\(/);
  assert.match(wrapper, /export \* from "\.\/series\.js"/);
});

test("variant detail page stays framework-dynamic while Cloudflare owns shared reuse", () => {
  const page = source("app/series/[slug]/page.js");
  const worker = source("worker/index.js");
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.match(page, /export const revalidate = 0/);
  assert.match(worker, /series-detail-1800-v1/);
});
