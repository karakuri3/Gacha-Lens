import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/cloudflare-runtime-smoke.yml", import.meta.url), "utf8");
const nextConfig = readFileSync(new URL("../next.config.mjs", import.meta.url), "utf8");
const appJob = workflow.split("  exact-head-runtime:")[1]?.split("  exact-head-public-runtime:")[0];
const publicJob = workflow.split("  exact-head-public-runtime:")[1];

function forbiddenHttpCommands(source) {
  const joined = source.replace(/\\\r?\n[ \t]*/g, " ");
  return joined.split("\n").filter((line) => {
    if (/\bfetch\s*\(\s*['"]https?:\/\//i.test(line)) return true;
    if (/\b(?:curl|wget)\b/i.test(line)) {
      if (/https?:\/\/|gachalens\.com/i.test(line)) return true;
      if (!/\$\{(?:GITHUB_API_URL|PREVIEW_URL|PUBLIC_PREVIEW_URL)\}/.test(line)) return true;
      if (/\$\{(?:PRODUCTION_URL|PROD_URL|PROD_ORIGIN|HOST_URL)\}/i.test(line)) return true;
      if (/(?:^|[ \t])(?:--location(?:-trusted)?|-L)(?:[ \t]|$)/.test(line)) return true;
    }
    return false;
  });
}

test("both PR jobs have pre-network static Production egress preflight", () => {
  assert.ok(appJob && publicJob);
  assert.doesNotMatch(workflow, /^\s+workflow_dispatch:/m);
  assert.match(workflow, /^  pull_request:/m);
  for (const [name, job] of [["App", appJob], ["Public", publicJob]]) {
    const preflight = job.indexOf("- name: Enforce PR Production HTTP egress guard");
    const resolve = job.indexOf("- name: Resolve exact-head Cloudflare");
    assert.ok(preflight >= 0 && preflight < resolve, name + " guard must precede HTTP probes");
    assert.match(job, /run: node --test tests\/cloudflare-runtime-smoke-production-egress\.test\.mjs/);
    assert.deepEqual(forbiddenHttpCommands(job), [], name + " has forbidden HTTP command");
  }
});

test("forbidden curl, wget and fetch Production GET mutations are rejected", () => {
  const cases = [
    "curl 'https://gachalens.com/'",
    'curl "https://api.gachalens.com/robots.txt"',
    'curl "https://gachalens.com/sitemap.xml" "${PREVIEW_URL}/"',
    'curl "${PRODUCTION_URL}/ranking"',
    'wget https://www.gachalens.com/',
    'node -e "fetch(' + "'https://gachalens.com/'" + ')"',
  ];
  for (const injected of cases) {
    assert.ok(forbiddenHttpCommands(appJob + "\n" + injected).length > 0, injected);
    assert.ok(forbiddenHttpCommands(publicJob + "\n" + injected).length > 0, injected);
  }
});

test("all six historically audited headers remain visible and repository-required HSTS is hard-gated", () => {
  assert.match(nextConfig, /key:\s*"Strict-Transport-Security",\s*value:\s*"max-age=63072000"/);
  for (const header of [
    "strict-transport-security",
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
    "content-security-policy",
    "permissions-policy",
  ]) assert.match(appJob.toLowerCase(), new RegExp(header));
  assert.match(appJob, /missing required Strict-Transport-Security/);
  assert.match(appJob, /Production parity NOT_RUN/);
});

test("Public SEO pinned contracts and SHA 409 fail-closed behavior are retained", () => {
  for (const marker of [
    "https://gachalens.com/schedule?month=2026-10",
    "Disallow: /api/",
    "Disallow: /review/",
    "Disallow: /supabase-series",
    "Sitemap: https://gachalens.com/sitemap.xml",
    "Sitemap: https://gachalens.com/series-sitemap.xml",
    "Sitemap: https://gachalens.com/variant-sitemap.xml",
    "Host: https://gachalens.com/",
    "series-sitemap.xml",
    "variant-sitemap.xml",
    "mixed_source_sha",
    "PUBLIC_APP_SHA_MATCH",
    "Production parity: NOT_RUN",
    "route_not_owned_by_public_bootstrap",
  ]) assert.ok(publicJob.includes(marker), "missing Public contract: " + marker);
  assert.match(publicJob, /== '409'/);
  assert.doesNotMatch(publicJob, /production_code|production_canonical|production_headers/);
});
