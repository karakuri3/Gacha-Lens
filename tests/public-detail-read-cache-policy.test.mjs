import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getCurrentDataSourceOperation,
  runDataSourceOperation,
} from "../lib/data/data-source-policy.js";

const serviceRoleSource = readFileSync(new URL("../lib/supabase/service-role-client.js", import.meta.url), "utf8");

test("data-source operation context survives async work and is isolated between concurrent requests", async () => {
  assert.equal(getCurrentDataSourceOperation(), null);

  const [variantOperation, relatedOperation] = await Promise.all([
    runDataSourceOperation("variant-detail", async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return getCurrentDataSourceOperation();
    }),
    runDataSourceOperation("related-variants", async () => {
      await Promise.resolve();
      return getCurrentDataSourceOperation();
    }),
  ]);

  assert.equal(variantOperation, "variant-detail");
  assert.equal(relatedOperation, "related-variants");
  assert.equal(getCurrentDataSourceOperation(), null);
});

test("service-role cache is limited to public detail GET/HEAD reads with fixed ASCII metadata", () => {
  assert.match(serviceRoleSource, /PUBLIC_DETAIL_READ_CACHE_SECONDS = 1800/);
  assert.match(serviceRoleSource, /PUBLIC_DETAIL_READ_CACHE_TAG = "gacha-public-detail-read"/);
  assert.match(serviceRoleSource, /new Set\(\["variant-detail", "related-variants"\]\)/);
  assert.match(serviceRoleSource, /method === "GET" \|\| method === "HEAD"/);
  assert.match(serviceRoleSource, /cache: "force-cache"/);
  assert.match(serviceRoleSource, /tags: \[PUBLIC_DETAIL_READ_CACHE_TAG\]/);
  assert.match(serviceRoleSource, /global:\s*\{\s*fetch: serviceRoleFetch/s);
  assert.doesNotMatch(serviceRoleSource, /PUBLIC_DETAIL_READ_CACHE_TAG\s*=\s*[^\n]*[ぁ-んァ-ヶ一-龠]/);
});
