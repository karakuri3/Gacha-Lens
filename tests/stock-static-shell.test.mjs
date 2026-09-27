import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = (path) => fs.readFileSync(path, "utf8");

test("stock page is a DB-free daily static shell", () => {
  const page = source("app/stock/page.js");
  assert.match(page, /export const dynamic = "force-static";/);
  assert.match(page, /export const revalidate = 86400;/);
  assert.match(page, /StockClientPage/);
  assert.doesNotMatch(page, /searchParams|getRankingSeries|getReleasedStockFeedRecords|serviceRoleSupabase/);
});

test("public stock API uses the bounded stock summary path", () => {
  const api = source("app/api/public-stock/route.js");
  assert.match(api, /getPublicStockSummaryRows/);
  assert.match(api, /Cloudflare-CDN-Cache-Control/);
  assert.doesNotMatch(api.slice(0, api.indexOf("async function getFallbackRows")), /market_listings|restock_events|x_reactions/);
});

test("Production stock summary starts from recent stock reports only", () => {
  const helper = source("lib/public-stock-summary.js");
  assert.match(helper, /const REPORT_LIMIT = 300;/);
  assert.match(helper, /const STOCK_DAYS = 45;/);
  assert.match(helper, /from\("stock_reports"\)/);
  assert.match(helper, /review_required\.is\.null,review_required\.eq\.false/);
  assert.match(helper, /order\("reported_at", \{ ascending: false \}\)/);
  assert.match(helper, /limit\(REPORT_LIMIT\)/);
  assert.doesNotMatch(helper, /market_listings|restock_events|x_reactions|fetchSignalsForCatalog|getRankingSeries/);
});

test("stock summary keeps public released variant filtering and minimal public fields", () => {
  const helper = source("lib/public-stock-summary.js");
  assert.match(helper, /eq\("released", true\)/);
  assert.match(helper, /variant_type\.is\.null,variant_type\.neq\.provisional/);
  assert.match(helper, /eq\("is_released", true\)/);
  for (const field of [
    /variant_id: variant\.id/,
    /slug: variant\.slug/,
    /series_name: parent\.name/,
    /series_image_url: parent\.image_url/,
    /reported_at: report\.reported_at/,
  ]) assert.match(helper, field);
});

test("stock client keeps query filtering in the browser", () => {
  const client = source("components/StockClientPage.js");
  assert.match(client, /window\.location\.search/);
  assert.match(client, /fetch\("\/api\/public-stock"/);
  assert.match(client, /searchText\.includes\(q\)/);
  assert.match(client, /report\.region === filters\.region/);
  assert.match(client, /report\.status === filters\.status/);
});
