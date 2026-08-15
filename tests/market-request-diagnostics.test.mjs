import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildSanitizedMarketRequestDiagnostics,
  sanitizeMarketRequestDiagnostics,
  validateMarketRequestDiagnostics,
} from "../lib/domain/market-request-diagnostics.js";
import { MARKET_MAX_DIAGNOSTIC_ENTRIES } from "../lib/fetchers/market-request-budget.js";
import {
  buildSanitizedMarketCandidateAudit,
  renderMarketCandidateAuditMarkdown,
  validateMarketCandidateAudit,
} from "../lib/domain/market-candidate-audit.js";
import { assertExactMarketAuditMatch } from "../lib/domain/market-canary-write.js";

const success = (overrides = {}) => ({
  source: "rakuten_ichiba", query_index: 0, query: "Example Series Hero gacha single",
  ok: true, status: 200, attempt_count: 1, retry_count: 0, retried: false,
  recovered_after_retry: false, failure_category: null, final_status: 200,
  timed_out: false, rate_limited: false, duration_ms: 20, retry_delays_ms: [],
  attempts: [{ attempt: 1, status: 200, failure_category: null, timed_out: false, rate_limited: false, duration_ms: 20, retry_delay_ms: null }],
  ...overrides,
});

test("legacy schema v1 audits without diagnostics remain valid", () => {
  assert.equal(validateMarketCandidateAudit(baseAudit()), true);
});

test("Phase 6-A live no-retry fixture fixes the observed aggregate without inventing query timings", async () => {
  const fixture = JSON.parse(await readFile(new URL("./fixtures/phase6-a-run-30697724263-request-diagnostics.json", import.meta.url), "utf8"));
  const feeds = [];
  for (const provider of ["rakuten_ichiba", "yahoo_shopping"]) {
    for (let index = 0; index < 5; index += 1) feeds.push(success({ source: provider, query_index: index, query: `phase6a series ${index + 1} variant gacha single` }));
  }
  const diagnostics = buildSanitizedMarketRequestDiagnostics(feeds, 0);
  for (const [field, expected] of Object.entries(fixture.expected_aggregate)) {
    assert.equal(diagnostics.aggregate[field], expected);
  }
  assert.equal(diagnostics.aggregate.queries_executed, 10);
  assert.equal(diagnostics.aggregate.zero_result_queries, 10);
  for (const [provider, expected] of Object.entries(fixture.expected_providers)) {
    assert.equal(diagnostics.providers[provider].requests_attempted, expected.requests_attempted);
    assert.equal(diagnostics.providers[provider].requests_succeeded, expected.requests_succeeded);
    assert.equal(diagnostics.providers[provider].requests_failed, expected.requests_failed);
  }
  assert.equal(fixture.audit_canary_authorized, false);
  assert.equal(fixture.human_review_for_canary_completed, false);
  assert.equal(fixture.evidence_manifest_registered, false);
});

test("503 then 200 diagnostics retain retry attempts and recovery", () => {
  const diagnostics = buildSanitizedMarketRequestDiagnostics([success({
    attempt_count: 2, retry_count: 1, retried: true, recovered_after_retry: true,
    duration_ms: 45, retry_delays_ms: [500],
    attempts: [
      { attempt: 1, status: 503, failure_category: "server_error", timed_out: false, rate_limited: false, duration_ms: 10, retry_delay_ms: 500 },
      { attempt: 2, status: 200, failure_category: null, timed_out: false, rate_limited: false, duration_ms: 15, retry_delay_ms: null },
    ],
  })]);
  assert.equal(diagnostics.aggregate.requests_retried, 1);
  assert.equal(diagnostics.aggregate.transient_failures_recovered, 1);
});

test("Yahoo 429 then 200 preserves Retry-After diagnostics", () => {
  const diagnostics = buildSanitizedMarketRequestDiagnostics([success({
    source: "yahoo_shopping", attempt_count: 2, retry_count: 1, retried: true,
    recovered_after_retry: true, rate_limited: true, retry_delays_ms: [2000],
    attempts: [
      { attempt: 1, status: 429, failure_category: "rate_limited", timed_out: false, rate_limited: true, duration_ms: 5, retry_delay_ms: 2000 },
      { attempt: 2, status: 200, failure_category: null, timed_out: false, rate_limited: false, duration_ms: 8, retry_delay_ms: null },
    ],
  })]);
  assert.equal(diagnostics.aggregate.requests_rate_limited, 1);
  assert.deepEqual(diagnostics.queries[0].retry_delays_ms, [2000]);
});

for (const category of ["timeout", "network"]) {
  test(`${category} then success is represented safely`, () => {
    const diagnostics = buildSanitizedMarketRequestDiagnostics([success({
      attempt_count: 2, retry_count: 1, retried: true, recovered_after_retry: true,
      timed_out: category === "timeout", retry_delays_ms: [500],
      attempts: [
        { attempt: 1, status: null, failure_category: category, timed_out: category === "timeout", rate_limited: false, duration_ms: 5, retry_delay_ms: 500 },
        { attempt: 2, status: 200, failure_category: null, timed_out: false, rate_limited: false, duration_ms: 8, retry_delay_ms: null },
      ],
    })]);
    assert.equal(diagnostics.queries[0].recovered_after_retry, true);
  });
}

test("three failed attempts are persisted as one permanent failure", () => {
  const diagnostics = buildSanitizedMarketRequestDiagnostics([success({
    ok: false, status: 503, final_status: 503, failure_category: "server_error",
    attempt_count: 3, retry_count: 2, retried: true, retry_delays_ms: [500, 1000],
    attempts: [1, 2, 3].map((attempt) => ({ attempt, status: 503, failure_category: "server_error", timed_out: false, rate_limited: false, duration_ms: 5, retry_delay_ms: attempt < 3 ? [500, 1000][attempt - 1] : null })),
  })]);
  assert.equal(diagnostics.aggregate.requests_permanently_failed, 1);
});

test("non-retryable 400 remains one attempt", () => {
  const diagnostics = buildSanitizedMarketRequestDiagnostics([success({
    ok: false, status: 400, final_status: 400, failure_category: "client_error",
    attempts: [{ attempt: 1, status: 400, failure_category: "client_error", timed_out: false, rate_limited: false, duration_ms: 5, retry_delay_ms: null }],
  })]);
  assert.equal(diagnostics.queries[0].attempt_count, 1);
  assert.equal(diagnostics.queries[0].retried, false);
});

test("provider and global aggregate totals are derived from query diagnostics", () => {
  const diagnostics = buildSanitizedMarketRequestDiagnostics([
    success(), success({ source: "yahoo_shopping", query: "Example Series Mage gacha single" }),
  ], 2);
  assert.equal(diagnostics.aggregate.requests_attempted, 2);
  assert.equal(diagnostics.aggregate.duplicate_queries_skipped, 2);
  assert.equal(Object.values(diagnostics.providers).reduce((sum, provider) => sum + provider.requests_attempted, 0), 2);
});

for (const mutate of [
  (query) => { query.retry_count = 1; },
  (query) => { query.retry_delays_ms = [500]; },
  (query) => { query.attempt_count = 4; },
  (query) => { query.attempts = []; },
]) {
  test("inconsistent query diagnostics fail closed", () => {
    const diagnostics = buildSanitizedMarketRequestDiagnostics([success()]);
    mutate(diagnostics.queries[0]);
    assert.throws(() => validateMarketRequestDiagnostics(diagnostics), /diagnostics|attempt/i);
  });
}

test("unknown failure categories normalize to unknown", () => {
  const diagnostics = buildSanitizedMarketRequestDiagnostics([success({
    ok: false, status: 599, final_status: 599, failure_category: "vendor_private_error",
    attempts: [{ attempt: 1, status: 599, failure_category: "vendor_private_error", timed_out: false, rate_limited: false, duration_ms: 1, retry_delay_ms: null }],
  })]);
  assert.equal(diagnostics.queries[0].failure_category, "unknown");
  assert.equal(diagnostics.queries[0].attempts[0].failure_category, "unknown");
});

test("credential-bearing URLs are rejected", () => {
  assert.throws(() => buildSanitizedMarketRequestDiagnostics([success({ query: "https://api.example/items?accessKey=private" })]), /unsafe/);
});

test("diagnostics discard API URL fields that are not part of the allowlist", () => {
  const diagnostics = buildSanitizedMarketRequestDiagnostics([success({ url: "https://api.example/items?appid=private" })]);
  const serialized = JSON.stringify(diagnostics);
  for (const forbidden of ["api.example", "appid"]) assert.equal(serialized.includes(forbidden), false);
});

for (const field of ["authorization", "cookie", "headers", "raw_response", "seller", "service_role", "token"]) {
  test(`secret-bearing field ${field} is rejected`, () => {
    assert.throws(() => buildSanitizedMarketRequestDiagnostics([success({ [field]: "private" })]), /Forbidden market diagnostics field/);
  });
}

test("secret-bearing fields fail closed before non-attempted records are filtered", () => {
  assert.throws(
    () => buildSanitizedMarketRequestDiagnostics([{ attempt_count: 0, authorization: "private" }]),
    /Forbidden market diagnostics field/,
  );
});

test("diagnostics sanitizer rejects inconsistent externally supplied totals", () => {
  const diagnostics = buildSanitizedMarketRequestDiagnostics([success()]);
  diagnostics.aggregate.requests_attempted = 99;
  assert.throws(() => sanitizeMarketRequestDiagnostics(diagnostics), /Aggregate/);
  assert.throws(() => validateMarketRequestDiagnostics(diagnostics), /Aggregate/);
});

test("candidate audit optionally persists diagnostics and Markdown renders safe tables", () => {
  const diagnostics = buildSanitizedMarketRequestDiagnostics([success()]);
  const report = buildSanitizedMarketCandidateAudit({ records: [], queryPlan: [], summary: { safety_assessed_records: 0, request_diagnostics: diagnostics } });
  assert.equal(report.request_diagnostics.aggregate.requests_attempted, 1);
  const markdown = renderMarketCandidateAuditMarkdown(report);
  assert.match(markdown, /## Request diagnostics/);
  assert.match(markdown, /Example Series Hero/);
  assert.doesNotMatch(markdown, /Authorization|Cookie|raw response|api\.example/i);
});

test("request diagnostics do not change exact canary audit matching", () => {
  const approved = baseAudit();
  const current = structuredClone(approved);
  current.request_diagnostics = buildSanitizedMarketRequestDiagnostics([success()]);
  assert.equal(assertExactMarketAuditMatch(approved, current), true);
});

test("market backfill exposes all aggregate diagnostics as GitHub outputs", async () => {
  const source = await readFile(new URL("../scripts/market-backfill.mjs", import.meta.url), "utf8");
  for (const output of [
    "requests_attempted", "requests_succeeded", "requests_failed", "requests_retried",
    "retry_attempts_total", "transient_failures_recovered", "requests_timed_out",
    "requests_rate_limited", "requests_permanently_failed", "duplicate_queries_skipped",
    "diagnostic_query_count",
  ]) assert.match(source, new RegExp(`${output}: summary\\.request_diagnostics`));
  assert.match(source, /buildSanitizedMarketRequestDiagnostics\([\s\S]*fetched\.feedResults/);
});

test("query and attempt bounds fail closed", () => {
  assert.throws(() => buildSanitizedMarketRequestDiagnostics(Array.from(
    { length: MARKET_MAX_DIAGNOSTIC_ENTRIES + 1 },
    (_, index) => success({ query_index: index }),
  )), /query limit/);
  assert.throws(() => buildSanitizedMarketRequestDiagnostics([success({ duration_ms: -1 })]), /duration_ms/);
  assert.throws(() => buildSanitizedMarketRequestDiagnostics([success({ final_status: 999 })]), /HTTP status/);
});

function baseAudit() {
  return {
    schema_version: 1, generated_at: "2026-08-01T00:00:00.000Z", mode: "dry-run", source_scope: "planner-apis",
    workflow: { run_id: "1", run_attempt: "1", head_sha: "abc", event_name: "workflow_dispatch" },
    selection: { selected_variant_count: 0, selected_variants: [], query_count: 0 },
    result: { candidate_count: 0, accepted_count: 0, review_count: 0, no_result_variant_count: 0, report_complete: true, truncated_count: 0 },
    database_writes: { listings: 0, observations: 0, ingestion_runs: 0 }, candidates: [],
  };
}
