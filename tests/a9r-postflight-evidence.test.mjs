import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  HTTP_TIMEOUT_MS,
  runPostflight,
} from "../scripts/a9r-postflight-evidence.mjs";

const SHA = "1234567890abcdef1234567890abcdef12345678";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gacha-a9r-"));
}

function a(id, route = `/${id}`, overrides = {}) {
  return {
    id,
    route,
    expectedStatus: 200,
    marker: null,
    owner: "app",
    canonical: false,
    staticAsset: false,
    namespacePrefix: null,
    locationSuffix: null,
    validator: null,
    browserReadinessRequired: false,
    ...overrides,
  };
}

function headers(values = {}) {
  return new Headers(values);
}

function http(status = 200, body = "ok", values = {}, extra = {}) {
  const bodyBytes = Buffer.from(body);
  return {
    kind: "http",
    status,
    headers: headers(values),
    bodyBytes,
    bodyText: body,
    ttfbMs: 2.5,
    elapsedMs: 4.25,
    browserReadiness: null,
    ...extra,
  };
}

function releaseBody(sha = SHA, plane = "public") {
  return JSON.stringify({ plane, source_sha: sha });
}

function releaseAssertion() {
  return a("release_source", "/api/runtime-diagnostics/release-source", { owner: "public", marker: "source_sha", validator: "release_source" });
}

async function runFixture(assertions, executor, dir = tempDir()) {
  const result = await runPostflight({
    origin: "https://public.example",
    surface: "public",
    expectedSha: SHA,
    outputDir: dir,
    assertions,
    executor,
    timeoutMs: HTTP_TIMEOUT_MS,
    now: (() => {
      let n = 0;
      return () => new Date(Date.UTC(2026, 9, 5, 16, 0, n++));
    })(),
  });
  return { result, dir, snapshot: JSON.parse(fs.readFileSync(path.join(dir, "postflight.json"), "utf8")) };
}

test("assertion 3 failure is FIRST_FAILURE and later assertions are NOT_RUN", async () => {
  const assertions = [releaseAssertion(), a("two"), a("three"), a("four"), a("five")];
  const calls = [];
  const { result, snapshot, dir } = await runFixture(assertions, async ({ assertion }) => {
    calls.push(assertion.id);
    if (assertion.id === "release_source") return http(200, releaseBody());
    if (assertion.id === "three") return http(500, "boom");
    return http();
  });
  assert.equal(result.result, "FAIL");
  assert.deepEqual(snapshot.records.map((r) => r.result), ["PASS", "PASS", "FAIL", "NOT_RUN", "NOT_RUN"]);
  assert.equal(snapshot.first_failure.record_type, "FIRST_FAILURE");
  assert.equal(snapshot.first_failure.assertion_id, "three");
  assert.deepEqual(calls, ["release_source", "two", "three"], "no request may run after first failure");
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "FIRST_FAILURE.json"), "utf8")).assertion_id, "three");
});

test("HTTP 503 is persisted as http_5xx rather than a network timeout", async () => {
  const { snapshot } = await runFixture([releaseAssertion(), a("target")], async ({ assertion }) =>
    assertion.id === "release_source" ? http(200, releaseBody()) : http(503, "service unavailable"));
  assert.equal(snapshot.first_failure.failure_class, "http_5xx");
  assert.equal(snapshot.first_failure.observed_http_status, 503);
});

test("actual network timeout is distinct from HTTP 503", async () => {
  const { snapshot } = await runFixture([releaseAssertion(), a("target")], async ({ assertion }) =>
    assertion.id === "release_source" ? http(200, releaseBody()) : { kind: "timeout", elapsedMs: 20_001, error: "A9R_HTTP_TIMEOUT" });
  assert.equal(snapshot.first_failure.failure_class, "actual_http_timeout");
  assert.equal(snapshot.first_failure.observed_http_status, null);
});

test("browser readiness timeout preserves the actual HTTP outcome separately", async () => {
  const browserAssertion = a("browser", "/browser", { browserReadinessRequired: true });
  const { snapshot } = await runFixture([releaseAssertion(), browserAssertion], async ({ assertion }) => {
    if (assertion.id === "release_source") return http(200, releaseBody());
    return http(200, "ready body", {}, { browserReadiness: { result: "TIMEOUT", elapsed_ms: 10_000 } });
  });
  assert.equal(snapshot.first_failure.failure_class, "browser_readiness_timeout");
  assert.equal(snapshot.first_failure.observed_http_status, 200);
  assert.equal(snapshot.first_failure.browser_readiness.result, "TIMEOUT");
});

test("missing required content marker is a marker failure", async () => {
  const markerAssertion = a("marker", "/marker", { marker: "required-marker" });
  const { snapshot } = await runFixture([releaseAssertion(), markerAssertion], async ({ assertion }) =>
    assertion.id === "release_source" ? http(200, releaseBody()) : http(200, "other"));
  assert.equal(snapshot.first_failure.failure_class, "marker_mismatch");
  assert.equal(snapshot.first_failure.marker_result, false);
});

test("mixed_source_sha is preserved as its own signature", async () => {
  const other = "abcdef1234567890abcdef1234567890abcdef12";
  const { snapshot } = await runFixture([releaseAssertion(), a("mixed")], async ({ assertion }) => {
    if (assertion.id === "release_source") return http(200, releaseBody());
    return http(409, JSON.stringify({ error: "mixed_source_sha", app_source_sha: other }), { "x-gacha-app-source-sha": other });
  });
  assert.equal(snapshot.first_failure.failure_class, "mixed_source_sha");
  assert.equal(snapshot.first_failure.app_delegation_sha, other);
});

test("delegation HTTP 502 stays http_5xx when both source SHAs are exact", async () => {
  const delegation = a("app_delegation", "/api/runtime-diagnostics/app-delegation", {
    owner: "public",
    marker: "\"ok\":true",
    validator: "app_delegation",
  });
  const body = JSON.stringify({
    ok: false,
    public_source_sha: SHA,
    app_source_sha: SHA,
    representative: { path: "/review", status: 503, marker: false },
    error: "app_representative_route_failed",
  });
  const { snapshot } = await runFixture([releaseAssertion(), delegation], async ({ assertion }) =>
    assertion.id === "release_source" ? http(200, releaseBody()) : http(502, body));
  assert.equal(snapshot.first_failure.failure_class, "http_5xx");
  assert.equal(snapshot.first_failure.observed_http_status, 502);
  assert.equal(snapshot.first_failure.public_source_sha, SHA);
  assert.equal(snapshot.first_failure.app_delegation_sha, SHA);
});

test("PASS run emits finalized machine-readable artifacts", async () => {
  const { result, snapshot, dir } = await runFixture([releaseAssertion(), a("target")], async ({ assertion }) =>
    assertion.id === "release_source" ? http(200, releaseBody()) : http());
  assert.equal(result.result, "PASS");
  assert.equal(snapshot.finalized, true);
  assert.equal(snapshot.result, "PASS");
  assert.equal(fs.existsSync(path.join(dir, "ledger.jsonl")), true);
  assert.equal(fs.existsSync(path.join(dir, "FIRST_FAILURE.json")), false);
});

test("FAIL run emits finalized artifacts before nonzero caller exit", async () => {
  const { result, snapshot, dir } = await runFixture([releaseAssertion(), a("target")], async ({ assertion }) =>
    assertion.id === "release_source" ? http(200, releaseBody()) : http(500, "fail"));
  assert.equal(result.result, "FAIL");
  assert.equal(snapshot.finalized, true);
  assert.equal(snapshot.result, "FAIL");
  assert.equal(fs.existsSync(path.join(dir, "FIRST_FAILURE.json")), true);
  assert.equal(fs.readFileSync(path.join(dir, "ledger.jsonl"), "utf8").trim().split("\n").length, 2);
});

test("artifact sanitization never emits common secret/token/body credential forms", async () => {
  const secretBody = JSON.stringify({
    token: "super-secret-token-value",
    password: "dont-print-this",
    authorization: "Bearer abc.def.ghi",
    api_key: "sk-sensitive1234567890",
    harmless: "visible",
  });
  const { dir } = await runFixture([releaseAssertion(), a("secret")], async ({ assertion }) =>
    assertion.id === "release_source" ? http(200, releaseBody()) : http(500, secretBody, { "x-gacha-debug": "Bearer abc.def.ghi" }));
  const all = fs.readdirSync(dir).map((name) => fs.readFileSync(path.join(dir, name), "utf8")).join("\n");
  for (const secret of ["super-secret-token-value", "dont-print-this", "abc.def.ghi", "sk-sensitive1234567890"]) {
    assert.equal(all.includes(secret), false, `artifact leaked ${secret}`);
  }
  assert.equal(all.includes("visible"), true);
});

test("expected runtime SHA mismatch fails closed before route matrix", async () => {
  const other = "abcdef1234567890abcdef1234567890abcdef12";
  const calls = [];
  const { snapshot } = await runFixture([releaseAssertion(), a("target")], async ({ assertion }) => {
    calls.push(assertion.id);
    if (assertion.id === "release_source") return http(200, releaseBody(other));
    return http();
  });
  assert.equal(snapshot.first_failure.assertion_id, "release_source");
  assert.equal(snapshot.first_failure.failure_class, "mixed_source_sha");
  assert.equal(snapshot.records[1].result, "NOT_RUN");
  assert.deepEqual(calls, ["release_source"]);
});


test("network error is distinct from actual HTTP timeout", async () => {
  const { snapshot } = await runFixture([releaseAssertion(), a("target")], async ({ assertion }) =>
    assertion.id === "release_source" ? http(200, releaseBody()) : { kind: "network_error", elapsedMs: 3, error: "ECONNRESET" });
  assert.equal(snapshot.first_failure.failure_class, "network_error");
  assert.equal(snapshot.first_failure.observed_http_status, null);
});

test("HTTP 429 retains its own failure class", async () => {
  const { snapshot } = await runFixture([releaseAssertion(), a("target")], async ({ assertion }) =>
    assertion.id === "release_source" ? http(200, releaseBody()) : http(429, "rate limited"));
  assert.equal(snapshot.first_failure.failure_class, "http_429");
});

test("production root canonical is accepted without a trailing slash", async () => {
  const target = a("home", "/", { canonical: true });
  const { result, snapshot } = await runFixture([releaseAssertion(), target], async ({ assertion }) =>
    assertion.id === "release_source"
      ? http(200, releaseBody())
      : http(200, '<html><head><link rel="canonical" href="https://gachalens.com"></head><body>Gacha Lens</body></html>'));
  assert.equal(result.result, "PASS");
  assert.equal(snapshot.first_failure, null);
  assert.equal(snapshot.records[1].canonical, "https://gachalens.com");
});

test("data-error boundary, canonical mismatch, sitemap namespace mismatch and static failure stay distinct", async () => {
  for (const [target, outcome, expectedClass] of [
    [a("data"), http(200, '{"error":"public_document_unavailable"}'), "data_error_boundary"],
    [a("canonical", "/canonical", { canonical: true }), http(200, '<html><link rel="canonical" href="https://wrong.example/x"></html>'), "canonical_mismatch"],
    [a("sitemap", "/sitemap.xml", { owner: "public", namespacePrefix: "https://gachalens.com/" }), http(200, '<loc>https://wrong.example/x</loc>'), "sitemap_namespace_mismatch"],
    [a("asset", "/_next/static/x.js", { staticAsset: true }), http(404, "missing"), "static_asset_failure"],
  ]) {
    const { snapshot } = await runFixture([releaseAssertion(), target], async ({ assertion }) =>
      assertion.id === "release_source" ? http(200, releaseBody()) : outcome);
    assert.equal(snapshot.first_failure.failure_class, expectedClass);
  }
});

test("CLI nonzero failure still leaves finalized machine-readable artifact", async () => {
  const dir = tempDir();
  const testFile = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(testFile), "..");
  const script = path.join(repoRoot, "scripts", "a9r-postflight-evidence.mjs");
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script,
      "--origin", "http://127.0.0.1:1",
      "--surface", "public",
      "--expected-sha", SHA,
      "--output-dir", dir,
      "--only", "release_source",
    ], { stdio: "ignore" });
    child.once("error", reject);
    child.once("close", resolve);
  });
  assert.equal(code, 1);
  const snapshot = JSON.parse(fs.readFileSync(path.join(dir, "postflight.json"), "utf8"));
  assert.equal(snapshot.finalized, true);
  assert.equal(snapshot.result, "FAIL");
  assert.equal(fs.existsSync(path.join(dir, "FIRST_FAILURE.json")), true);
});
