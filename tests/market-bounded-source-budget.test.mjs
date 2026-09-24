import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMarketBoundedFetcherOptions,
  resolveMarketBoundedProviderResultLimit,
} from "../lib/domain/market-bounded-source-budget.js";

test("market-bounded provider result limit keeps every discovery plan within candidate budget", () => {
  for (let discoveryRequests = 1; discoveryRequests <= 30; discoveryRequests += 1) {
    const resultLimit = resolveMarketBoundedProviderResultLimit({
      stage: "market-bounded",
      discoveryRequests,
      maxCandidates: 40,
    });
    assert.ok(resultLimit >= 1);
    assert.ok(resultLimit * discoveryRequests <= 40);
  }
});

test("current 14-request bounded plan allows two results per request", () => {
  assert.equal(resolveMarketBoundedProviderResultLimit({
    stage: "market-bounded",
    discoveryRequests: 14,
    maxCandidates: 40,
  }), 2);
});

test("maximum 30-request bounded plan allows one result per request", () => {
  assert.equal(resolveMarketBoundedProviderResultLimit({
    stage: "market-bounded",
    discoveryRequests: 30,
    maxCandidates: 40,
  }), 1);
});

test("bounded fetch options apply the same cap to Rakuten and Yahoo", () => {
  assert.deepEqual(buildMarketBoundedFetcherOptions({
    fixedStage: "market-bounded",
    discoveryRequests: 14,
    maxCandidates: 40,
  }), {
    rakuten: { hits: 2 },
    yahoo: { results: 2 },
  });
});

test("non-bounded stages keep provider defaults unchanged", () => {
  assert.equal(resolveMarketBoundedProviderResultLimit({
    stage: "market-shadow",
    discoveryRequests: 14,
    maxCandidates: 40,
  }), null);
  assert.deepEqual(buildMarketBoundedFetcherOptions({
    stage: "market-shadow",
    discoveryRequests: 14,
    maxCandidates: 40,
  }), {});
});

test("zero-request bounded collection remains a successful no-op budget", () => {
  assert.equal(resolveMarketBoundedProviderResultLimit({
    stage: "market-bounded",
    discoveryRequests: 0,
    maxCandidates: 40,
  }), 1);
});

test("bounded source budgeting fails closed on invalid budget inputs", () => {
  assert.throws(() => resolveMarketBoundedProviderResultLimit({
    stage: "market-bounded",
    discoveryRequests: -1,
    maxCandidates: 40,
  }), /nonnegative discovery request count/);
  assert.throws(() => resolveMarketBoundedProviderResultLimit({
    stage: "market-bounded",
    discoveryRequests: 14,
    maxCandidates: 0,
  }), /nonnegative discovery request count/);
});
