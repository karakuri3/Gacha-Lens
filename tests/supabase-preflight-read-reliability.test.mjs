import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTOMATIC_PREFLIGHT_READ_CONTRACT,
  readAutomaticDurableRunStore,
  readAutomaticProductionSnapshot,
} from "../scripts/automatic-ingestion-preflight-store.mjs";
import {
  SUPABASE_READ_RELIABILITY_CONTRACT,
  fetchExactRowCountReliable,
  fetchRowsLimited,
} from "../scripts/supabase-rest.mjs";
import {
  evaluateAutomaticIngestionRollout,
  evaluateAutomaticIngestionThrottle,
  loadAutomaticIngestionRolloutPolicy,
} from "../lib/domain/automatic-ingestion-rollout.js";

const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-service-role-key";
const { policy, digest } = loadAutomaticIngestionRolloutPolicy("config/automatic-ingestion-rollout-policy.json");

test.after(() => {
  if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
  if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
});

for (const total of [100, 1_000, 100_000]) {
  test(`bounded row retrieval does not paginate a theoretical ${total}-row result`, async () => {
    const calls = [];
    const result = await fetchRowsLimited("ingestion_runs", {
      maxRows: 60,
      operationName: "ingestion_runs.completed_history",
      params: { order: "finished_at.desc,id.desc" },
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return response(200, Array.from({ length: 60 }, (_, index) => ({ id: `row-${index}` })), {
          "content-range": `0-59/${total}`,
        });
      },
    });
    assert.equal(calls.length, 1);
    assert.equal(result.rows.length, 60);
    assert.equal(result.saturated, true);
    assert.equal(new URL(calls[0].url).searchParams.get("limit"), "60");
    assert.equal(calls[0].options.headers.Prefer, undefined);
  });
}

test("bounded row retrieval requires deterministic ordering", async () => {
  await assert.rejects(
    fetchRowsLimited("ingestion_runs", { fetchImpl: async () => response(200, []) }),
    (error) => error.diagnostic.category === "configuration" && error.diagnostic.attempt_count === 0,
  );
});

test("a response exceeding the deterministic row cap fails closed", async () => {
  await assert.rejects(fetchRowsLimited("ingestion_runs", {
    maxRows: 2,
    params: { order: "id.asc" },
    fetchImpl: async () => response(200, [{ id: "1" }, { id: "2" }, { id: "3" }]),
  }), (error) => error.diagnostic.category === "invalid_response");
});

test("completed history keeps the latest six eligible write-like runs", async () => {
  const history = [
    ...Array.from({ length: 12 }, (_, index) => completed(`dry-${index}`, index, "failed", { mode: "dry-run" })),
    ...Array.from({ length: 6 }, (_, index) => completed(`write-${index}`, index + 20, index < 2 ? "failed" : "succeeded")),
    ...Array.from({ length: 42 }, (_, index) => completed(`older-${index}`, index + 40, "succeeded", { execution_type: "read_only" })),
  ];
  const store = await readAutomaticDurableRunStore({ task: "market", stage: "market-bounded", maxRunsPer24Hours: 1, now: new Date("2026-08-16T00:00:00Z") }, {
    fetchRowsLimitedImpl: queuedLimitedReads([
      limited([], 100),
      limited(history, 60),
      limited([], 1),
    ]),
  });
  assert.equal(store.available, true);
  assert.deepEqual(store.circuit_history_rows.map((row) => row.id), Array.from({ length: 6 }, (_, index) => `write-${index}`));
  assert.equal(store.report.completed_history.eligible_rows, 6);
  assert.equal(store.report.completed_history.complete_for_decision, true);
});

test("a saturated history window with fewer than six eligible runs fails closed", async () => {
  const history = Array.from({ length: 60 }, (_, index) => completed(`dry-${index}`, index, "failed", { mode: "dry-run" }));
  const store = await readAutomaticDurableRunStore({ task: "market", stage: "market-bounded", maxRunsPer24Hours: 1 }, {
    fetchRowsLimitedImpl: queuedLimitedReads([limited([], 100), limited(history, 60)]),
  });
  assert.equal(store.available, false);
  assert.equal(store.circuit_history_rows, null);
  assert.equal(store.report.completed_history.complete_for_decision, false);
  assert.equal(store.report.diagnostics.at(-1).category, "invalid_response");
});

test("a saturated history window with ambiguous completion ordering fails closed", async () => {
  const history = Array.from({ length: 60 }, (_, index) => completed(`write-${index}`, index, "succeeded"));
  history[0] = { ...history[0], finished_at: null, started_at: "2026-08-16T00:00:00.000Z" };
  const store = await readAutomaticDurableRunStore({ task: "market", stage: "market-bounded", maxRunsPer24Hours: 1 }, {
    fetchRowsLimitedImpl: queuedLimitedReads([limited([], 100), limited(history, 60)]),
  });
  assert.equal(store.available, false);
  assert.equal(store.report.completed_history.ordering_complete, false);
  assert.equal(store.report.completed_history.complete_for_decision, false);
});

test("a running-row result at the safety cap fails closed before history reads", async () => {
  const reads = [];
  const store = await readAutomaticDurableRunStore({ task: "market", stage: "market-bounded", maxRunsPer24Hours: 1 }, {
    fetchRowsLimitedImpl: async (_table, options) => {
      reads.push(options.operationName);
      return limited(Array.from({ length: 100 }, (_, index) => ({ id: `running-${index}` })), 100);
    },
  });
  assert.equal(store.available, false);
  assert.deepEqual(reads, ["ingestion_runs.running_rows"]);
  assert.equal(store.report.running_rows.complete_for_decision, false);
});

test("rollout throttle history capacity follows the reviewed one-run policy", async () => {
  const optionsSeen = [];
  const store = await readAutomaticDurableRunStore({ task: "market", stage: "market-bounded", maxRunsPer24Hours: 1, now: new Date("2026-08-16T12:00:00Z") }, {
    fetchRowsLimitedImpl: async (_table, options) => {
      optionsSeen.push(options);
      if (options.operationName === "ingestion_runs.completed_history") return limited([], 60);
      return limited([], options.maxRows);
    },
  });
  assert.equal(store.available, true);
  assert.equal(optionsSeen[2].maxRows, 1);
  assert.equal(optionsSeen[2].params["summary->>rollout_stage"], "eq.market-bounded");
  assert.equal(optionsSeen[2].params.finished_at, "gte.2026-08-15T12:00:00.000Z");
});

for (const maxRunsPer24Hours of [1, 2, 5]) {
  test(`rollout history cannot bypass a future ${maxRunsPer24Hours}-run daily budget`, async () => {
    const now = new Date("2026-08-16T12:00:00Z");
    const rolloutRows = Array.from({ length: maxRunsPer24Hours }, (_, index) => ({
      id: `bounded-${index}`,
      task: "market",
      status: "succeeded",
      finished_at: new Date(now.getTime() - (index + 1) * 60_000).toISOString(),
      summary: { rollout_stage: "market-bounded" },
    }));
    const reads = [];
    const store = await readAutomaticDurableRunStore({
      task: "market",
      stage: "market-bounded",
      maxRunsPer24Hours,
      now,
    }, {
      fetchRowsLimitedImpl: async (_table, options) => {
        reads.push(options);
        if (options.operationName === "ingestion_runs.completed_history") return limited([], 60);
        if (options.operationName === "ingestion_runs.rollout_history_24h") {
          return limited(rolloutRows, maxRunsPer24Hours);
        }
        return limited([], options.maxRows);
      },
    });
    const throttle = evaluateAutomaticIngestionThrottle({
      stage: "market-bounded",
      task: "market",
      policy: { minimum_interval_minutes: 1, max_runs_per_24_hours: maxRunsPer24Hours },
      history_rows: store.rollout_history_rows,
      running_rows: store.running_rows,
      github_rows: [],
      now,
    });
    assert.equal(store.available, true);
    assert.equal(reads[2].maxRows, maxRunsPer24Hours);
    assert.equal(throttle.reason_code, "rollout_daily_budget_exhausted");
  });
}

test("a policy above the supported rollout history capacity fails closed before reads", async () => {
  let reads = 0;
  const store = await readAutomaticDurableRunStore({
    task: "market",
    stage: "market-bounded",
    maxRunsPer24Hours: 6,
  }, {
    fetchRowsLimitedImpl: async () => { reads += 1; return limited([], 1); },
  });
  assert.equal(store.available, false);
  assert.equal(reads, 0);
  assert.equal(store.report.rollout_history.complete_for_decision, false);
  assert.equal(store.report.diagnostics[0].category, "invalid_response");
});

test("timeouts are retried exactly three times with deterministic bounded backoff", async () => {
  const delays = [];
  let attempts = 0;
  await assert.rejects(fetchRowsLimited("ingestion_runs", {
    maxRows: 1,
    timeoutMs: 2,
    params: { order: "id.asc" },
    fetchImpl: async (_url, options) => {
      attempts += 1;
      return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }));
    },
    sleepImpl: async (delay) => delays.push(delay),
  }), (error) => {
    assert.deepEqual(error.diagnostic, {
      operation_name: "ingestion_runs.bounded_rows",
      category: "timeout",
      status_code: null,
      attempt_count: 3,
      duration_ms: error.diagnostic.duration_ms,
    });
    return true;
  });
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [250, 500]);
});

test("HTTP 522 is categorized and retried only to the fixed maximum", async () => {
  let attempts = 0;
  const delays = [];
  await assert.rejects(fetchRowsLimited("ingestion_runs", {
    maxRows: 1,
    params: { order: "id.asc" },
    fetchImpl: async () => { attempts += 1; return response(522); },
    sleepImpl: async (delay) => delays.push(delay),
  }), (error) => error.diagnostic.category === "http_522"
    && error.diagnostic.status_code === 522
    && error.diagnostic.attempt_count === 3);
  assert.equal(attempts, SUPABASE_READ_RELIABILITY_CONTRACT.max_attempts);
  assert.deepEqual(delays, [...SUPABASE_READ_RELIABILITY_CONTRACT.backoff_ms]);
});

test("other HTTP 5xx responses have a sanitized category", async () => {
  await assert.rejects(fetchRowsLimited("ingestion_runs", {
    maxRows: 1,
    params: { order: "id.asc" },
    fetchImpl: async () => response(503),
    sleepImpl: async () => {},
  }), (error) => error.diagnostic.category === "http_5xx" && error.diagnostic.status_code === 503);
});

for (const status of [408, 429]) {
  test(`transient HTTP ${status} is retried within the fixed bound`, async () => {
    let attempts = 0;
    const result = await fetchRowsLimited("ingestion_runs", {
      maxRows: 1,
      params: { order: "id.asc" },
      fetchImpl: async () => {
        attempts += 1;
        return attempts < 3 ? response(status) : response(200, []);
      },
      sleepImpl: async () => {},
    });
    assert.equal(result.rows.length, 0);
    assert.equal(attempts, 3);
  });
}

for (const status of [401, 403]) {
  test(`HTTP ${status} is categorized without aggressive retry`, async () => {
    let attempts = 0;
    await assert.rejects(fetchRowsLimited("ingestion_runs", {
      maxRows: 1,
      params: { order: "id.asc" },
      fetchImpl: async () => { attempts += 1; return response(status); },
      sleepImpl: async () => assert.fail("non-transient errors must not sleep"),
    }), (error) => error.diagnostic.category === "http_4xx"
      && error.diagnostic.status_code === status
      && error.diagnostic.attempt_count === 1);
    assert.equal(attempts, 1);
  });
}

test("invalid JSON is categorized without exposing the response body", async () => {
  const secret = "https://project.supabase.co service-role-secret authorization-token";
  await assert.rejects(fetchRowsLimited("ingestion_runs", {
    maxRows: 1,
    operationName: secret,
    params: { order: "id.asc" },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      async json() { throw new Error(secret); },
    }),
  }), (error) => {
    assert.equal(error.diagnostic.category, "invalid_response");
    assert.equal(error.diagnostic.operation_name, "supabase_read");
    assert.doesNotMatch(JSON.stringify(error), /supabase\.co|service-role|authorization-token/);
    return true;
  });
});

test("exact count reads preserve HEAD count semantics and retry transient failures", async () => {
  const calls = [];
  const result = await fetchExactRowCountReliable("market_listings", {}, {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return calls.length === 1 ? response(503) : response(200, null, { "content-range": "0-0/856" });
    },
    sleepImpl: async () => {},
  });
  assert.equal(result.count, 856);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.method, "HEAD");
  assert.equal(calls[1].options.headers.Prefer, "count=exact");
});

test("Production snapshot exact counts are read sequentially with concurrency one", async () => {
  let active = 0;
  let maximumActive = 0;
  const operations = [];
  const snapshot = await readAutomaticProductionSnapshot({
    fetchExactRowCountReliableImpl: async (_table, _params, options) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      operations.push(options.operationName);
      await Promise.resolve();
      active -= 1;
      return { count: operations.length, diagnostic: successDiagnostic(options.operationName) };
    },
  });
  assert.equal(snapshot.available, true);
  assert.equal(maximumActive, 1);
  assert.equal(operations.length, 9);
  assert.equal(snapshot.request_concurrency, 1);
  assert.equal(snapshot.exact_counts, true);
});

test("Production snapshot failure stays unavailable with only sanitized diagnostics", async () => {
  const secret = "https://secret.supabase.co/service-role-token";
  const snapshot = await readAutomaticProductionSnapshot({
    fetchExactRowCountReliableImpl: async () => {
      const error = new Error(secret);
      error.diagnostic = {
        operation_name: `unsafe ${secret}`,
        category: "http_522",
        status_code: 522,
        attempt_count: 3,
        duration_ms: 12,
        raw_response: secret,
      };
      throw error;
    },
  });
  assert.equal(snapshot.available, false);
  assert.equal(snapshot.counts, null);
  assert.equal(snapshot.diagnostics.length, 1);
  assert.deepEqual(Object.keys(snapshot.diagnostics[0]), ["operation_name", "category", "status_code", "attempt_count", "duration_ms"]);
  assert.doesNotMatch(JSON.stringify(snapshot), /secret\.supabase|service-role-token|raw_response/);
});

test("Production snapshot rejects a non-exact count result", async () => {
  const snapshot = await readAutomaticProductionSnapshot({
    fetchExactRowCountReliableImpl: async (_table, _params, options) => ({
      count: -1,
      diagnostic: successDiagnostic(options.operationName),
    }),
  });
  assert.equal(snapshot.available, false);
  assert.equal(snapshot.diagnostics[0].category, "invalid_response");
  assert.equal(snapshot.request_concurrency, 1);
});

test("durable-store read failure records the safe diagnostic and performs no writes", async () => {
  let writeCalls = 0;
  const store = await readAutomaticDurableRunStore({ task: "market", stage: "market-bounded", maxRunsPer24Hours: 1 }, {
    fetchRowsLimitedImpl: async () => {
      const error = new Error("private response");
      error.diagnostic = { operation_name: "ingestion_runs.running_rows", category: "http_522", status_code: 522, attempt_count: 3, duration_ms: 1 };
      throw error;
    },
    upsertRowsImpl: async () => { writeCalls += 1; },
  });
  assert.equal(store.available, false);
  assert.equal(store.report.diagnostics[0].category, "http_522");
  assert.equal(writeCalls, 0);
});

test("a timeout diagnostic remains paired with durable_run_store_unavailable enforcement", async () => {
  const store = await readAutomaticDurableRunStore({ task: "market", stage: "market-bounded", maxRunsPer24Hours: 1 }, {
    fetchRowsLimitedImpl: async () => {
      const error = new Error("timed out");
      error.diagnostic = { operation_name: "ingestion_runs.running_rows", category: "timeout", status_code: null, attempt_count: 3, duration_ms: 15_000 };
      throw error;
    },
  });
  const decision = evaluateAutomaticIngestionRollout({
    policy,
    policy_digest: digest,
    configured_policy_digest: digest,
    stage: "market-bounded",
    task: "market",
    schedule: "17,47 * * * *",
    event_name: "schedule",
    durable_run_store_available: store.available,
    production_snapshot_available: true,
  });
  assert.equal(decision.reason_code, "durable_run_store_unavailable");
  assert.equal(store.report.diagnostics[0].category, "timeout");
});

test("bounded read contract keeps automatic preflight limits fixed", () => {
  assert.deepEqual(AUTOMATIC_PREFLIGHT_READ_CONTRACT, {
    running_max_rows: 100,
    completed_history_max_rows: 60,
    circuit_breaker_required_eligible_runs: 6,
    rollout_history_supported_max_rows: 5,
    snapshot_request_concurrency: 1,
    timeout_ms: 5_000,
    max_attempts: 3,
  });
});

function response(status, body = [], headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    async json() { return body; },
  };
}

function limited(rows, maxRows) {
  return {
    rows,
    max_rows: maxRows,
    rows_returned: rows.length,
    saturated: rows.length >= maxRows,
    request_count: 1,
    diagnostic: successDiagnostic("test.read"),
  };
}

function successDiagnostic(operationName) {
  return { operation_name: operationName, category: null, status_code: 200, attempt_count: 1, duration_ms: 1 };
}

function queuedLimitedReads(results) {
  let index = 0;
  return async () => {
    const result = results[index];
    index += 1;
    if (!result) throw new Error("Unexpected bounded read.");
    return result;
  };
}

function completed(id, minutesAgo, status, summary = { execution_type: "scheduled_write", mode: "write" }) {
  return {
    id,
    task: "market",
    status,
    finished_at: new Date(new Date("2026-08-16T00:00:00Z").getTime() - minutesAgo * 60_000).toISOString(),
    summary,
  };
}
