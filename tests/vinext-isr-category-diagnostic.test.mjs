import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("isolated category ISR diagnostic uses on-demand revalidation without force-dynamic", () => {
  const source = fs.readFileSync("app/diagnostics/isr-category/[name]/page.js", "utf8");
  assert.match(source, /export const revalidate = 300/);
  assert.match(source, /export const dynamicParams = true/);
  assert.match(source, /generateStaticParams\(\)/);
  assert.match(source, /return \[\]/);
  assert.match(source, /serviceRoleSupabase/);
  assert.match(source, /count: "exact", head: true/);
  assert.match(source, /\.range\(0, 59\)/);
  assert.doesNotMatch(source, /unstable_cache|getTargetedPublicCategorySeriesPage/);
  assert.doesNotMatch(source, /force-dynamic/);
  assert.doesNotMatch(source, /searchParams/);
});
