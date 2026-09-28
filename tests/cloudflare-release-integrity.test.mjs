import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  assertProductionSourceIdentity,
  resolveCloudflareCheck,
} from "../.github/scripts/cloudflare-check-resolver.mjs";

const SHA = "a".repeat(40);
const OLD_SHA = "b".repeat(40);
const VERSION = "12345678-1234-4123-8123-123456789abc";
const PREVIEW = "https://12345678-gacha-lens.senpingxingzuo.workers.dev";

function cloudflareCheck(overrides = {}) {
  return {
    id: 100,
    name: "Workers Builds: gacha-lens",
    head_sha: SHA,
    status: "completed",
    conclusion: "success",
    app: { slug: "cloudflare-workers-and-pages" },
    output: {
      summary: `Version ID: ${VERSION}\nPreview URL: ${PREVIEW}\n`,
    },
    ...overrides,
  };
}

test("correct PR head resolves its exact approved Preview", () => {
  const result = resolveCloudflareCheck({ check_runs: [cloudflareCheck()] }, SHA, { requirePreview: true });
  assert.equal(result.state, "success");
  assert.equal(result.previewUrl, PREVIEW);
  assert.equal(result.versionId, VERSION);
});

test("wrong SHA and old Preview cannot satisfy exact-head resolution", () => {
  const result = resolveCloudflareCheck(
    { check_runs: [cloudflareCheck({ head_sha: OLD_SHA })] },
    SHA,
    { requirePreview: true },
  );
  assert.deepEqual(result, { state: "waiting" });
});

test("pending Workers build remains waiting for bounded caller policy", () => {
  const result = resolveCloudflareCheck(
    { check_runs: [cloudflareCheck({ status: "in_progress", conclusion: null })] },
    SHA,
    { requirePreview: true },
  );
  assert.equal(result.state, "waiting");
});

test("failed Workers build fails closed", () => {
  assert.throws(
    () => resolveCloudflareCheck(
      { check_runs: [cloudflareCheck({ conclusion: "failure" })] },
      SHA,
      { requirePreview: true },
    ),
    /concluded failure/,
  );
});

test("successful check without Preview URL fails closed for PR smoke", () => {
  assert.throws(
    () => resolveCloudflareCheck(
      { check_runs: [cloudflareCheck({ output: { summary: `Version ID: ${VERSION}\n` } })] },
      SHA,
      { requirePreview: true },
    ),
    /approved exact-head Preview URL/,
  );
});

test("unapproved Preview hostname fails closed", () => {
  const summary = `Version ID: ${VERSION}\nPreview URL: https://12345678-gacha-lens.attacker.example\n`;
  assert.throws(
    () => resolveCloudflareCheck(
      { check_runs: [cloudflareCheck({ output: { summary } })] },
      SHA,
      { requirePreview: true },
    ),
    /approved exact-head Preview URL/,
  );
});

test("multiple checks use only the deterministic latest exact Cloudflare check", () => {
  const older = cloudflareCheck({ id: 100 });
  const latest = cloudflareCheck({ id: 200, status: "in_progress", conclusion: null });
  const unrelated = cloudflareCheck({
    id: 999,
    name: "Vercel",
    app: { slug: "vercel" },
    conclusion: "failure",
  });
  const result = resolveCloudflareCheck({ check_runs: [latest, unrelated, older] }, SHA, { requirePreview: true });
  assert.deepEqual(result, { state: "waiting", checkId: 200 });
});

test("production resolver requires exact successful Cloudflare check but not a Preview URL", () => {
  const result = resolveCloudflareCheck(
    { check_runs: [cloudflareCheck({ output: { summary: `Version ID: ${VERSION}\n` } })] },
    SHA,
  );
  assert.equal(result.state, "success");
  assert.equal(result.versionId, VERSION);
});

test("Production source identity mismatch fails closed", () => {
  assert.equal(assertProductionSourceIdentity({ source_sha: SHA }, SHA), SHA);
  assert.throws(
    () => assertProductionSourceIdentity({ source_sha: OLD_SHA }, SHA),
    /Production source SHA mismatch/,
  );
});

test("release proof workflow is push-to-main only and does not treat Vercel as Cloudflare authority", () => {
  const workflow = fs.readFileSync(".github/workflows/cloudflare-production-release-proof.yml", "utf8");
  assert.match(workflow, /push:\n\s+branches:\n\s+- main/);
  assert.doesNotMatch(workflow, /workflow_dispatch:/);
  assert.match(workflow, /commits\/\$\{TARGET_SHA\}\/check-runs/);
  assert.doesNotMatch(workflow, /Vercel/);
});

test("release identity endpoint is immutable-build sourced and non-secret", () => {
  const route = fs.readFileSync("app/api/runtime-diagnostics/release-integrity/route.js", "utf8");
  assert.match(route, /WORKERS_CI_COMMIT_SHA/);
  assert.match(route, /dynamic = "force-static"/);
  assert.match(route, /source_sha/);
  assert.match(route, /no-store/);
  assert.doesNotMatch(route, /TOKEN|SECRET|ACCOUNT_ID/);
});
