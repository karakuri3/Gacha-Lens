import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateProductionReleaseProof,
  extractApprovedImmutablePreviewUrl,
  inspectCloudflareCheckRuns,
  normalizeSourceSha,
  readReleaseSourceSha,
} from "../scripts/cloudflare-release-integrity.mjs";

const SHA = "1234567890abcdef1234567890abcdef12345678";
const OTHER_SHA = "abcdef1234567890abcdef1234567890abcdef12";
const COMMIT_PREVIEW = "https://1e09280b-gacha-lens.senpingxingzuo.workers.dev";
const BRANCH_PREVIEW = "https://fix-release-integrity-gacha-lens.senpingxingzuo.workers.dev";

function check({ id = 100, sha = SHA, status = "completed", conclusion = "success", summary } = {}) {
  return {
    id,
    name: "Workers Builds: gacha-lens",
    head_sha: sha,
    status,
    conclusion,
    output: {
      summary: summary ?? `Commit Preview URL: ${COMMIT_PREVIEW}\nBranch Preview URL: ${BRANCH_PREVIEW}`,
    },
  };
}

test("correct PR head resolves its immutable exact deployment URL", () => {
  const result = inspectCloudflareCheckRuns({ check_runs: [check()] }, SHA);
  assert.equal(result.found, true);
  assert.equal(result.preview_url, COMMIT_PREVIEW);
  assert.equal(result.conclusion, "success");
});

test("wrong SHA is rejected even when the Cloudflare check name matches", () => {
  const result = inspectCloudflareCheckRuns({ check_runs: [check({ sha: OTHER_SHA })] }, SHA);
  assert.equal(result.found, false);
});

test("mutable branch Preview aliases and arbitrary old hosts are rejected", () => {
  assert.equal(extractApprovedImmutablePreviewUrl(`Branch Preview URL: ${BRANCH_PREVIEW}`), null);
  assert.equal(extractApprovedImmutablePreviewUrl("https://deadbeef-gacha-lens.attacker.example"), null);
});

test("pending Workers build remains pending for bounded polling", () => {
  const result = inspectCloudflareCheckRuns({ check_runs: [check({ status: "in_progress", conclusion: null })] }, SHA);
  assert.equal(result.status, "in_progress");
  assert.equal(result.conclusion, null);
});

test("failed Workers build is never normalized to success", () => {
  const result = inspectCloudflareCheckRuns({ check_runs: [check({ conclusion: "failure" })] }, SHA);
  assert.equal(result.status, "completed");
  assert.equal(result.conclusion, "failure");
});

test("successful check without an immutable Preview URL fails Preview resolution", () => {
  const result = inspectCloudflareCheckRuns({ check_runs: [check({ summary: "Deployment successful, URL unavailable" })] }, SHA);
  assert.equal(result.preview_url, null);
});

test("invalid workers.dev hostname is rejected", () => {
  assert.equal(extractApprovedImmutablePreviewUrl("https://1e09280b-gacha-lens.other.workers.dev"), null);
});

test("multiple exact-SHA checks deterministically select the highest check id", () => {
  const older = check({ id: 100, conclusion: "failure", summary: "" });
  const latest = check({ id: 250, conclusion: "success" });
  const unrelated = check({ id: 999, sha: OTHER_SHA, conclusion: "success" });
  const result = inspectCloudflareCheckRuns({ check_runs: [latest, unrelated, older] }, SHA);
  assert.equal(result.check_id, 250);
  assert.equal(result.conclusion, "success");
  assert.equal(result.preview_url, COMMIT_PREVIEW);
});

test("main Workers build failure cannot become a Production release PASS", () => {
  const result = evaluateProductionReleaseProof({
    targetSha: SHA,
    workersCheckStatus: "completed",
    workersCheckConclusion: "failure",
    sourceIdentityHttpStatus: 200,
    deployedSha: SHA,
    customDomainHttpStatus: 200,
  });
  assert.deepEqual(result, { ok: false, reason: "workers_build_failed" });
});

test("Production deployed SHA mismatch fails closed", () => {
  const result = evaluateProductionReleaseProof({
    targetSha: SHA,
    workersCheckStatus: "completed",
    workersCheckConclusion: "success",
    sourceIdentityHttpStatus: 200,
    deployedSha: OTHER_SHA,
    customDomainHttpStatus: 200,
  });
  assert.deepEqual(result, { ok: false, reason: "deployed_sha_mismatch" });
});

test("custom-domain HTTP failure fails closed", () => {
  const result = evaluateProductionReleaseProof({
    targetSha: SHA,
    workersCheckStatus: "completed",
    workersCheckConclusion: "success",
    sourceIdentityHttpStatus: 200,
    deployedSha: SHA,
    customDomainHttpStatus: 503,
  });
  assert.deepEqual(result, { ok: false, reason: "custom_domain_http_failure" });
});

test("unrelated Vercel status is outside the Cloudflare release proof", () => {
  const unrelatedStatuses = [{ context: "Vercel", state: "failure" }];
  void unrelatedStatuses;
  const result = evaluateProductionReleaseProof({
    targetSha: SHA,
    workersCheckStatus: "completed",
    workersCheckConclusion: "success",
    sourceIdentityHttpStatus: 200,
    deployedSha: SHA,
    customDomainHttpStatus: 200,
  });
  assert.deepEqual(result, { ok: true, reason: "verified" });
});

test("source identity only accepts a full non-secret Git SHA", () => {
  assert.equal(normalizeSourceSha(SHA.toUpperCase()), SHA);
  assert.equal(readReleaseSourceSha({ source_sha: SHA }), SHA);
  assert.equal(readReleaseSourceSha({ source_sha: "1234" }), null);
});
