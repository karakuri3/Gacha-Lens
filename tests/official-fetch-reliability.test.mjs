import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fetchOfficialRaw } from "../lib/fetchers/official-fetcher.js";

const detailUrl = "https://gashapon.jp/products/detail.php?jan_code=4570000000001000";
const detailFixture = fs.readFileSync("tests/fixtures/official/gashapon-detail.html", "utf8");
const phaseA3Support = fs.readFileSync("scripts/official-phase-a3-support.mjs", "utf8");

test("ordinary official fetch remains single-attempt unless reliability is explicitly enabled", async () => {
  const sourceUrl = "https://example.invalid/official-source";
  let calls = 0;

  const result = await fetchOfficialRaw({
    urls: [sourceUrl],
    detailFetchLimit: 0,
    sourceFetchDelayMs: 0,
    detailFetchDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      return response("", calls === 1 ? 503 : 200);
    },
    sleep: async () => assert.fail("default official fetch must not retry"),
  });

  assert.equal(calls, 1);
  assert.equal(result.issues.some((issue) => issue.note === "HTTP 503"), true);
});

test("Phase A3 scan explicitly binds the bounded official retry and timeout policy", () => {
  assert.match(phaseA3Support, /fetchTimeoutMs: 8000/);
  assert.match(phaseA3Support, /fetchMaxAttempts: 2/);
  assert.match(phaseA3Support, /fetchRetryBaseDelayMs: 250/);
  assert.match(phaseA3Support, /fetchRetryMaxDelayMs: 1500/);
});

test("official source GET recovers from transient 503 within the bounded retry policy", async () => {
  const calls = [];
  const delays = [];
  const sourceUrl = "https://example.invalid/official-source";
  const sequence = [
    response("", 503),
    response("<html><body>empty source</body></html>", 200),
  ];

  const result = await fetchOfficialRaw({
    urls: [sourceUrl],
    detailFetchLimit: 0,
    sourceFetchDelayMs: 0,
    detailFetchDelayMs: 0,
    fetchMaxAttempts: 2,
    fetchRetryBaseDelayMs: 25,
    fetchRetryMaxDelayMs: 25,
    fetchImpl: async (url) => {
      calls.push(url);
      return sequence.shift();
    },
    sleep: async (ms) => delays.push(ms),
  });

  assert.deepEqual(calls, [sourceUrl, sourceUrl]);
  assert.deepEqual(delays, [25]);
  assert.equal(result.ok, true);
  assert.equal(result.issues.some((issue) => /HTTP 503/.test(issue.note)), false);
});

test("official detail GET retries one transient timeout and preserves the formal lineup", async () => {
  const sourceUrl = "https://example.invalid/official-source";
  let detailCalls = 0;
  const delays = [];

  const result = await fetchOfficialRaw({
    urls: [sourceUrl],
    priorityDetailUrls: [detailUrl],
    detailFetchLimit: 1,
    sourceFetchDelayMs: 0,
    detailFetchDelayMs: 0,
    fetchMaxAttempts: 2,
    fetchRetryBaseDelayMs: 10,
    fetchRetryMaxDelayMs: 10,
    fetchImpl: async (url) => {
      if (url === sourceUrl) return response("<html><body>empty source</body></html>", 200);
      if (url === detailUrl) {
        detailCalls += 1;
        if (detailCalls === 1) {
          const error = new Error("simulated timeout with private transport detail");
          error.name = "TimeoutError";
          throw error;
        }
        return response(detailFixture, 200);
      }
      throw new Error("unexpected URL");
    },
    sleep: async (ms) => delays.push(ms),
  });

  assert.equal(detailCalls, 2);
  assert.deepEqual(delays, [10]);
  assert.equal(result.detailFetched, 1);
  assert.equal(result.records.some((record) => record.official_url === detailUrl && record.variants.length === 2), true);
  assert.equal(result.issues.some((issue) => /private transport detail/.test(issue.note)), false);
});

test("official detail GET does not retry permanent 404 responses", async () => {
  const sourceUrl = "https://example.invalid/official-source";
  let detailCalls = 0;
  const delays = [];

  const result = await fetchOfficialRaw({
    urls: [sourceUrl],
    priorityDetailUrls: [detailUrl],
    detailFetchLimit: 1,
    sourceFetchDelayMs: 0,
    detailFetchDelayMs: 0,
    fetchMaxAttempts: 3,
    fetchImpl: async (url) => {
      if (url === sourceUrl) return response("<html><body>empty source</body></html>", 200);
      if (url === detailUrl) {
        detailCalls += 1;
        return response("", 404);
      }
      throw new Error("unexpected URL");
    },
    sleep: async (ms) => delays.push(ms),
  });

  assert.equal(detailCalls, 1);
  assert.deepEqual(delays, []);
  assert.equal(result.issues.some((issue) => issue.note === "detail HTTP 404"), true);
});

test("official retry honors Retry-After but remains capped", async () => {
  const calls = [];
  const delays = [];
  const sourceUrl = "https://example.invalid/official-source";
  const sequence = [
    response("", 503, { "retry-after": "30" }),
    response("<html><body>empty source</body></html>", 200),
  ];

  await fetchOfficialRaw({
    urls: [sourceUrl],
    detailFetchLimit: 0,
    sourceFetchDelayMs: 0,
    detailFetchDelayMs: 0,
    fetchMaxAttempts: 2,
    fetchRetryBaseDelayMs: 20,
    fetchRetryMaxDelayMs: 100,
    fetchImpl: async (url) => {
      calls.push(url);
      return sequence.shift();
    },
    sleep: async (ms) => delays.push(ms),
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(delays, [100]);
});

function response(body, status, headers = {}) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]),
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        if (String(name).toLowerCase() === "content-type") return normalizedHeaders["content-type"] ?? "text/html; charset=UTF-8";
        return normalizedHeaders[String(name).toLowerCase()] ?? null;
      },
    },
    text: async () => body,
  };
}
