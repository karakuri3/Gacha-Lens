import assert from "node:assert/strict";
import test from "node:test";
import { summarizeFetchedMarketCandidates } from "../lib/domain/market-match-safety.js";
import { assertMarketFetchComplete, fetchMarketListingsRaw } from "../lib/fetchers/market-fetcher.js";
import { dedupeMarketQueries, normalizeMarketQuery } from "../lib/fetchers/market-query-dedupe.js";
import { fetchRakutenMarketListingsRaw } from "../lib/fetchers/rakuten-market-fetcher.js";
import { retryableJsonRequest } from "../lib/fetchers/retryable-json-request.js";
import { fetchYahooShoppingListingsRaw } from "../lib/fetchers/yahoo-shopping-fetcher.js";

const query = Object.freeze({
  query: "Example Series Hero ガチャ",
  variant_id: "variant-hero",
  series_id: "series-example",
  variant_name: "Hero",
  series_name: "Example Series",
});

test("retry helper returns a successful JSON response without retrying", async () => {
  const calls = [];
  const result = await retryableJsonRequest("https://example.invalid/path?token=secret", {
    fetchImpl: async () => {
      calls.push("fetch");
      return response(200, { ok: true });
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.attempt_count, 1);
  assert.equal(result.diagnostics.retry_count, 0);
});

test("retry helper recovers from 503 with bounded exponential delay", async () => {
  const sequence = [response(503), response(200, { recovered: true })];
  const delays = [];
  const result = await retryableJsonRequest("https://example.invalid", {
    fetchImpl: async () => sequence.shift(),
    sleep: async (ms) => delays.push(ms),
    random: () => 0,
    baseDelayMs: 500,
    maxDelayMs: 5000,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(delays, [500]);
  assert.equal(result.diagnostics.recovered_after_retry, true);
  assert.equal(result.diagnostics.attempt_count, 2);
});

test("retry helper honors Retry-After seconds and caps the delay", async () => {
  const sequence = [response(429, {}, { "retry-after": "30" }), response(200, {})];
  const delays = [];
  const result = await retryableJsonRequest("https://example.invalid", {
    fetchImpl: async () => sequence.shift(),
    sleep: async (ms) => delays.push(ms),
    maxDelayMs: 5000,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(delays, [5000]);
  assert.equal(result.diagnostics.rate_limited, true);
});

test("retry helper honors Retry-After HTTP dates and falls back for invalid values", async () => {
  const now = Date.parse("2026-08-01T00:00:00Z");
  const dateSequence = [response(503, {}, { "retry-after": "Sat, 01 Aug 2026 00:00:02 GMT" }), response(200, {})];
  const dateDelays = [];
  await retryableJsonRequest("https://example.invalid", {
    fetchImpl: async () => dateSequence.shift(),
    sleep: async (ms) => dateDelays.push(ms),
    clock: () => now,
    random: () => 0,
  });
  assert.deepEqual(dateDelays, [2000]);

  const fallbackSequence = [response(429, {}, { "retry-after": "not-a-date" }), response(200, {})];
  const fallbackDelays = [];
  await retryableJsonRequest("https://example.invalid", {
    fetchImpl: async () => fallbackSequence.shift(),
    sleep: async (ms) => fallbackDelays.push(ms),
    random: () => 0,
    baseDelayMs: 700,
  });
  assert.deepEqual(fallbackDelays, [700]);
});

test("retry helper retries timeout and network failures", async () => {
  for (const error of [namedError("TimeoutError"), new TypeError("socket reset")]) {
    const sequence = [error, response(200, {})];
    const result = await retryableJsonRequest("https://example.invalid", {
      fetchImpl: async () => {
        const value = sequence.shift();
        if (value instanceof Error) throw value;
        return value;
      },
      sleep: async () => {},
      random: () => 0,
    });
    assert.equal(result.ok, true);
    assert.equal(result.diagnostics.attempt_count, 2);
  }
});

test("retry helper exhausts at three attempts and never exceeds its delay cap", async () => {
  const delays = [];
  const result = await retryableJsonRequest("https://example.invalid", {
    fetchImpl: async () => response(503),
    sleep: async (ms) => delays.push(ms),
    random: () => 1,
    maxAttempts: 99,
    baseDelayMs: 5000,
    maxDelayMs: 5000,
  });
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.attempt_count, 3);
  assert.deepEqual(delays, [5000, 5000]);
  assert.equal(result.diagnostics.failure_category, "server_error");
});

for (const status of [400, 401, 403, 404, 409, 422]) {
  test(`retry helper does not retry permanent HTTP ${status}`, async () => {
    let calls = 0;
    const result = await retryableJsonRequest("https://example.invalid", {
      fetchImpl: async () => {
        calls += 1;
        return response(status);
      },
      sleep: async () => assert.fail("permanent errors must not sleep"),
    });
    assert.equal(calls, 1);
    assert.equal(result.diagnostics.failure_category, "client_error");
  });
}

test("invalid JSON is permanent and diagnostics stay sanitized", async () => {
  let calls = 0;
  const result = await retryableJsonRequest("https://example.invalid/private?api_key=top-secret", {
    request: { headers: { authorization: "Bearer credential" } },
    fetchImpl: async () => {
      calls += 1;
      return responseWithInvalidJson(200, "seller private payload");
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.diagnostics.failure_category, "invalid_json");
  const serialized = JSON.stringify(result.diagnostics);
  for (const secret of ["top-secret", "credential", "seller private payload", "api_key"]) {
    assert.equal(serialized.includes(secret), false);
  }
});

test("market queries normalize NFKC, case, and whitespace while preserving identity", () => {
  assert.equal(normalizeMarketQuery("  Ａlpha\t HERO  "), "alpha hero");
  const first = { query: " Ａlpha   HERO ", variant_id: "v1", series_id: "s1", marker: "first" };
  const result = dedupeMarketQueries([
    first,
    { query: "alpha hero", variant_id: "v1", series_id: "s1", marker: "duplicate" },
    { query: "alpha hero", variant_id: "v2", series_id: "s1" },
    { query: "alpha hero", variant_id: "v1", series_id: "s2" },
  ]);
  assert.equal(result.duplicateQueriesSkipped, 1);
  assert.equal(result.queries.length, 3);
  assert.equal(result.queries[0], first);
  assert.deepEqual(result.queries.map((entry) => [entry.variant_id, entry.series_id]), [["v1", "s1"], ["v2", "s1"], ["v1", "s2"]]);
});

test("Rakuten retries a transient response and preserves its normalized record format", async () => {
  const sequence = [response(503), response(200, rakutenBody())];
  const result = await fetchRakutenMarketListingsRaw({
    enabled: true,
    applicationId: "application-id",
    accessKey: "access-key",
    queries: [query],
    delayMs: 0,
    fetchImpl: async () => sequence.shift(),
    sleep: async () => {},
    random: () => 0,
  });
  assert.equal(result.count, 1);
  assert.equal(result.records[0].source, "rakuten");
  assert.equal(result.records[0].price, 1280);
  assert.equal(result.feedResults[0].attempt_count, 2);
  assert.equal(result.feedResults[0].recovered_after_retry, true);
  assert.equal(result.feedResults[0].query, query.query);
  assert.equal(result.feedResults[0].query_index, 0);
});

test("Yahoo retries rate limits, dedupes before limit, and preserves unique queries", async () => {
  const calledQueries = [];
  const statuses = [429, 200, 200];
  const result = await fetchYahooShoppingListingsRaw({
    enabled: true,
    appId: "app-id",
    queries: [query, { ...query, query: "  example series hero ガチャ " }, { ...query, query: "Example Series Mage ガチャ", variant_id: "variant-mage" }],
    queryLimit: 2,
    delayMs: 0,
    fetchImpl: async (url) => {
      calledQueries.push(new URL(url).searchParams.get("query"));
      const status = statuses.shift();
      return status === 200 ? response(200, yahooBody()) : response(status, {}, { "retry-after": "0" });
    },
    sleep: async () => {},
  });
  assert.equal(result.duplicateQueriesSkipped, 1);
  assert.deepEqual(calledQueries, [query.query, query.query, "Example Series Mage ガチャ"]);
  assert.equal(result.feedResults[0].rate_limited, true);
  assert.equal(result.feedResults[0].query, query.query);
  assert.equal(result.feedResults[0].query_index, 0);
  assert.equal(result.records[0].source, "yahoo_shopping");
});

test("Rakuten does not retry a permanent 400 response", async () => {
  let calls = 0;
  const result = await fetchRakutenMarketListingsRaw({
    enabled: true,
    applicationId: "application-id",
    accessKey: "access-key",
    queries: [query],
    delayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      return response(400);
    },
    sleep: async () => assert.fail("HTTP 400 must not sleep"),
  });
  assert.equal(calls, 1);
  assert.equal(result.count, 0);
  assert.equal(result.issues.length, 1);
  assert.equal(result.feedResults[0].failure_category, "client_error");
});

test("Yahoo records an exhausted timeout as one permanently failed query", async () => {
  let calls = 0;
  const result = await fetchYahooShoppingListingsRaw({
    enabled: true,
    appId: "app-id",
    queries: [query],
    delayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      throw namedError("TimeoutError");
    },
    sleep: async () => {},
  });
  assert.equal(calls, 3);
  assert.equal(result.count, 0);
  assert.equal(result.issues.length, 1);
  assert.equal(result.feedResults[0].timed_out, true);
  assert.equal(result.feedResults[0].attempt_count, 3);
  assert.equal(result.feedResults[0].failure_category, "timeout");
});

test("provider failures retain partial successes and expose aggregate retry diagnostics", async () => {
  const result = await fetchMarketListingsRaw({
    sourceScope: "planner-apis",
    queries: [query],
    rakuten: { enabled: true, applicationId: "id", accessKey: "key" },
    yahoo: { enabled: true, appId: "id" },
    adapters: {
      rakuten: async () => providerResult("rakuten_ichiba", true, { recovered_after_retry: true, attempt_count: 2, retry_count: 1 }),
      yahoo: async () => providerResult("yahoo_shopping", false, { timed_out: true, attempt_count: 3, retry_count: 2, failure_category: "timeout" }),
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.records.length, 1);
  assert.equal(result.requests_retried, 2);
  assert.equal(result.retry_attempts_total, 3);
  assert.equal(result.transient_failures_recovered, 1);
  assert.equal(result.requests_timed_out, 1);
  assert.equal(result.requests_permanently_failed, 1);
});

test("all configured planner API failures fail closed before audit or write", async () => {
  const result = await fetchMarketListingsRaw({
    sourceScope: "planner-apis",
    queries: [query],
    rakuten: { enabled: true, applicationId: "id", accessKey: "key" },
    yahoo: { enabled: true, appId: "id" },
    adapters: {
      rakuten: async () => providerResult("rakuten_ichiba", false, { attempt_count: 3, retry_count: 2 }),
      yahoo: async () => providerResult("yahoo_shopping", false, { attempt_count: 1, retry_count: 0 }),
    },
  });
  assert.equal(result.allPlannerRequestsFailed, true);
  assert.equal(result.ok, false);
  assert.throws(() => assertMarketFetchComplete(result), (error) => {
    assert.equal(error.code, "market_planner_all_requests_failed");
    assert.deepEqual(error.diagnostics, {
      planner_api_requests_attempted: 2,
      requests_permanently_failed: 2,
      requests_timed_out: 0,
      requests_rate_limited: 0,
    });
    assert.equal(JSON.stringify(error).includes("credential"), false);
    return true;
  });
});

test("candidate summaries retain the reliability aggregate without changing records", () => {
  const records = [{ id: "listing-1", title: "Example Series Hero ガチャ", price: 1280 }];
  const summary = summarizeFetchedMarketCandidates({
    records,
    rawCount: 1,
    queryPlan: [query],
    feedResults: [
      { source: "rakuten_ichiba", ok: true, attempt_count: 2, retry_count: 1, recovered_after_retry: true },
      { source: "yahoo_shopping", ok: false, attempt_count: 3, retry_count: 2, timed_out: true },
    ],
    catalog: { series: [], variants: [] },
  });
  assert.equal(summary.requests_retried, 2);
  assert.equal(summary.retry_attempts_total, 3);
  assert.equal(summary.transient_failures_recovered, 1);
  assert.equal(summary.requests_timed_out, 1);
});

function response(status, data = {}, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    json: async () => data,
  };
}

function responseWithInvalidJson(status) {
  return { ok: true, status, headers: { get: () => null }, json: async () => { throw new SyntaxError("private response"); } };
}

function namedError(name) {
  const error = new Error(name);
  error.name = name;
  return error;
}

function rakutenBody() {
  return { items: [{ itemName: "Example Series Hero ガチャ", itemCode: "shop:item-1", itemPrice: 1280, itemUrl: "https://item.example/1", availability: "1" }] };
}

function yahooBody() {
  return { hits: [{ name: "Example Series Hero ガチャ", code: "shop_item_1", price: 1280, url: "https://item.example/1", inStock: true }] };
}

function providerResult(source, ok, diagnostics) {
  return {
    ok,
    enabled: true,
    source,
    configuredSources: 1,
    count: ok ? 1 : 0,
    records: ok ? [{ id: `${source}-listing`, title: "Example Series Hero ガチャ", price: 1280 }] : [],
    issues: ok ? [] : [{ issue_type: "market_fetch", message: "request failed" }],
    feedResults: [{ name: source, source, format: "api", ok, status: ok ? 200 : null, message: ok ? "" : "request failed", ...diagnostics }],
  };
}
