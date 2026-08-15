import assert from "node:assert/strict";
import test from "node:test";
import { buildSanitizedMarketRequestDiagnostics } from "../lib/domain/market-request-diagnostics.js";
import {
  describeMarketSourceConfiguration,
  fetchMarketListingsRaw,
} from "../lib/fetchers/market-fetcher.js";
import {
  MARKET_MAX_DIAGNOSTIC_ATTEMPTS,
  MARKET_MAX_DIAGNOSTIC_ENTRIES,
  MARKET_PROVIDER_ROOT_LIMITS,
  buildMarketRequestBudget,
} from "../lib/fetchers/market-request-budget.js";
import { fetchRakutenMarketListingsRaw } from "../lib/fetchers/rakuten-market-fetcher.js";
import { fetchYahooShoppingListingsRaw } from "../lib/fetchers/yahoo-shopping-fetcher.js";

const AFFILIATE_PREFIX = encodeURIComponent(
  "https://ck.jp.ap.valuecommerce.com/servlet/referral?sid=111&pid=222&vc_url=",
);

test("reviewed request-budget capacity exactly covers every valid provider root", () => {
  const roots = MARKET_PROVIDER_ROOT_LIMITS.rakuten_ichiba.max
    + MARKET_PROVIDER_ROOT_LIMITS.yahoo_shopping.max;
  const budget = buildMarketRequestBudget({
    queryCount: roots,
    queryAttemptCount: roots * 3,
    rakutenConfigured: true,
    yahooConfigured: true,
    rakutenAffiliateConfigured: true,
    yahooAffiliateConfigured: true,
    rakutenRootLimit: MARKET_PROVIDER_ROOT_LIMITS.rakuten_ichiba.max,
    yahooRootLimit: MARKET_PROVIDER_ROOT_LIMITS.yahoo_shopping.max,
  });
  assert.deepEqual(budget.providers.rakuten_ichiba, {
    root_limit: 30,
    root_queries: 30,
    discovery_requests: 90,
    affiliate_enrichment_requests: 30,
    total_requests: 120,
  });
  assert.deepEqual(budget.providers.yahoo_shopping, {
    root_limit: 50,
    root_queries: 50,
    discovery_requests: 150,
    affiliate_enrichment_requests: 50,
    total_requests: 200,
  });
  assert.equal(budget.discovery_requests, 240);
  assert.equal(budget.affiliate_enrichment_requests, 80);
  assert.equal(budget.planner_api_requests, MARKET_MAX_DIAGNOSTIC_ENTRIES);
  assert.equal(budget.maximum_http_attempts, MARKET_MAX_DIAGNOSTIC_ATTEMPTS);
  const configuration = describeMarketSourceConfiguration({
    sourceScope: "planner-apis",
    queryCount: roots,
    queryAttemptCount: roots * 3,
    rakuten: {
      enabled: true,
      applicationId: "fake-rakuten-application",
      accessKey: "fake-rakuten-access",
      affiliateId: "fake-rakuten-affiliate",
      queryLimit: 30,
    },
    yahoo: {
      enabled: true,
      appId: "fake-yahoo-app",
      affiliateTrackingId: AFFILIATE_PREFIX,
      queryLimit: 50,
    },
  });
  assert.deepEqual(configuration.plannedSourceRequests.planner_api, budget);
  assert.equal(JSON.stringify(configuration.plannedSourceRequests).match(/fake-|sid=111|pid=222/gi), null);
});

test("max valid providers retain every diagnostic entry with exact aggregates and pacing", async () => {
  const queries = queryRoots(80);
  const rakutenStarts = [];
  let rakutenNow = 0;
  const rakuten = await fetchRakutenMarketListingsRaw({
    enabled: true,
    applicationId: "fake-rakuten-application",
    accessKey: "fake-rakuten-access",
    affiliateId: "fake-rakuten-affiliate",
    queryLimit: 30,
    queries,
    delayMs: 1200,
    clock: () => rakutenNow,
    sleep: async (ms) => { rakutenNow += ms; },
    fetchImpl: async (url) => {
      rakutenStarts.push(rakutenNow);
      const parsed = new URL(url);
      const keyword = parsed.searchParams.get("keyword");
      const code = stableCode(keyword);
      return response({ Items: [{ Item: {
        itemName: `Gacha ${keyword}`,
        itemPrice: 800,
        itemUrl: `https://item.rakuten.co.jp/test/${code}/`,
        itemCode: `test:${code}`,
        affiliateUrl: parsed.searchParams.has("affiliateId")
          ? `https://hb.afl.rakuten.co.jp/test/${code}`
          : undefined,
        availability: 1,
      } }] });
    },
  });

  const yahooStarts = [];
  let yahooNow = 0;
  const yahoo = await fetchYahooShoppingListingsRaw({
    enabled: true,
    appId: "fake-yahoo-app",
    affiliateTrackingId: AFFILIATE_PREFIX,
    queryLimit: 50,
    queries,
    delayMs: 1000,
    clock: () => yahooNow,
    sleep: async (ms) => { yahooNow += ms; },
    fetchImpl: async (url) => {
      yahooStarts.push(yahooNow);
      const parsed = new URL(url);
      const keyword = parsed.searchParams.get("query");
      const code = stableCode(keyword);
      const ordinary = `https://store.shopping.yahoo.co.jp/test/${code}.html`;
      const destination = parsed.searchParams.has("affiliate_type")
        ? `https://ck.jp.ap.valuecommerce.com/servlet/referral?sid=111&pid=222&vc_url=${encodeURIComponent(ordinary)}`
        : ordinary;
      return response({ hits: [{ name: `Gacha ${keyword}`, price: 900, url: destination, code, inStock: true }] });
    },
  });

  assert.equal(rakuten.feedResults.length, 120);
  assert.equal(yahoo.feedResults.length, 200);
  assert.ok(rakutenStarts.slice(1).every((value, index) => value - rakutenStarts[index] >= 1200));
  assert.ok(yahooStarts.slice(1).every((value, index) => value - yahooStarts[index] >= 1000));

  const diagnostics = buildSanitizedMarketRequestDiagnostics([
    ...rakuten.feedResults,
    ...yahoo.feedResults,
  ]);
  assert.equal(diagnostics.queries.length, MARKET_MAX_DIAGNOSTIC_ENTRIES);
  assert.equal(diagnostics.aggregate.requests_attempted, 320);
  assert.equal(diagnostics.aggregate.queries_executed, 240);
  assert.equal(diagnostics.aggregate.affiliate_requests_attempted, 80);
  assert.equal(diagnostics.providers.rakuten_ichiba.requests_attempted, 120);
  assert.equal(diagnostics.providers.yahoo_shopping.requests_attempted, 200);
  assert.equal(
    diagnostics.aggregate.requests_attempted,
    Object.values(diagnostics.providers).reduce((sum, provider) => sum + provider.requests_attempted, 0),
  );
  assert.equal(JSON.stringify(diagnostics).match(/fake-|sid=111|pid=222|affiliateId|accessKey/gi), null);
  assert.equal(new Set(rakuten.records.map((record) => record.id)).size, rakuten.records.length);
  assert.equal(new Set(yahoo.records.map((record) => record.id)).size, yahoo.records.length);
});

test("configuration above the reviewed provider budget fails before external requests", async () => {
  let externalRequests = 0;
  await assert.rejects(() => fetchMarketListingsRaw({
    sourceScope: "planner-apis",
    queries: queryRoots(31),
    rakuten: {
      enabled: true,
      applicationId: "fake-app",
      accessKey: "fake-key",
      queryLimit: 31,
    },
    yahoo: { enabled: false },
    adapters: {
      rakuten: async () => { externalRequests += 1; },
      yahoo: async () => { externalRequests += 1; },
    },
  }), (error) => error.code === "market_request_budget_exceeded");
  assert.equal(externalRequests, 0);
});

function queryRoots(count) {
  return Array.from({ length: count }, (_, index) => {
    const id = String(index + 1).padStart(3, "0");
    return {
      query: `Series${id} Character${id} Gacha`,
      fallback_queries: [
        `Franchise${id} Character${id} Gacha`,
        `Character${id} Gacha`,
      ],
      query_strategy_version: 2,
      variant_id: `variant-${id}`,
      series_id: `series-${id}`,
    };
  });
}

function stableCode(value) {
  return Buffer.from(String(value)).toString("hex").slice(0, 32);
}

function response(body) {
  return { ok: true, status: 200, headers: new Headers(), json: async () => body };
}
