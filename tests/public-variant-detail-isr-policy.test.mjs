import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const layout = readFileSync(new URL("../app/series/[slug]/layout.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/series/[slug]/page.js", import.meta.url), "utf8");

test("public variant detail segment is forced static and revalidates on ingestion cadence", () => {
  assert.match(layout, /export const dynamic = "force-static";/);
  assert.match(layout, /export const revalidate = 1800;/);
  assert.match(page, /export const revalidate = 1800;/);
  assert.doesNotMatch(page, /export const dynamic = "force-dynamic";/);
});
