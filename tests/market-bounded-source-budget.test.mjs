import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMarketBoundedFetcherOptions,
  resolveMarketBoundedProviderResultLimit,
  scheduledBoundedRotationOptions,
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

test("scheduled market-bounded runs rotate the variant tie-break bucket hourly", () => {
  const env = { AUTOMATIC_INGESTION_ROLLOUT_STAGE: "market-bounded", GITHUB_EVENT_NAME: "schedule" };
  const first = scheduledBoundedRotationOptions({}, env, new Date("2026-11-24T01:17:00.000Z"));
  const sameHour = scheduledBoundedRotationOptions({}, env, new Date("2026-11-24T01:47:00.000Z"));
  const nextHour = scheduledBoundedRotationOptions({}, env, new Date("2026-11-24T02:17:00.000Z"));
  assert.deepEqual(first, { rotationKey: "market-bounded-hourly:2026-11-24T01" });
  assert.deepEqual(sameHour, first);
  assert.notDeepEqual(nextHour, first);
});

test("hourly rotation is limited to scheduled market-bounded runs", () => {
  const now = new Date("2026-11-24T01:17:00.000Z");
  assert.deepEqual(scheduledBoundedRotationOptions({}, { AUTOMATIC_INGESTION_ROLLOUT_STAGE: "market-shadow", GITHUB_EVENT_NAME: "schedule" }, now), {});
  assert.deepEqual(scheduledBoundedRotationOptions({}, { FIXED_ROLLOUT_STAGE: "market-bounded", GITHUB_EVENT_NAME: "workflow_dispatch" }, now), {});
  assert.deepEqual(scheduledBoundedRotationOptions({}, {}, now), {});
  assert.deepEqual(scheduledBoundedRotationOptions({ readOnlySeedAudit: true }, { AUTOMATIC_INGESTION_ROLLOUT_STAGE: "market-bounded", GITHUB_EVENT_NAME: "schedule" }, now), {});
});
