import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import test from "node:test";
import {
  auditLaunchReadiness,
  formatLaunchReadiness,
  isSitemapSourceReady,
  parseLaunchReadinessArgs,
} from "../scripts/launch-readiness.mjs";

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, "scripts/launch-readiness.mjs");
const validEnv = {
  NEXT_PUBLIC_SITE_URL: "https://gachalens.example.jp",
  NEXT_PUBLIC_CONTACT_EMAIL: "support@example.jp",
  GOOGLE_SITE_VERIFICATION: "verification-token-for-test-only",
};

function audit(env = {}) {
  return auditLaunchReadiness({ env: { ...validEnv, ...env }, root: ROOT });
}

function check(result, id) {
  return result.checks.find((item) => item.id === id);
}

test("valid HTTPS site URL passes", () => {
  assert.equal(check(audit(), "canonical_production_url").status, "pass");
});

test("empty site URL fails the required launch condition", () => {
  assert.equal(check(audit({ NEXT_PUBLIC_SITE_URL: "" }), "canonical_production_url").status, "fail");
});

test("localhost is not production ready", () => {
  assert.equal(check(audit({ NEXT_PUBLIC_SITE_URL: "https://localhost:3000" }), "canonical_production_url").status, "fail");
});

test("HTTP site URL fails", () => {
  assert.equal(check(audit({ NEXT_PUBLIC_SITE_URL: "http://gachalens.example.jp" }), "canonical_production_url").status, "fail");
});

test("obvious Vercel preview URL fails", () => {
  assert.equal(check(audit({ NEXT_PUBLIC_SITE_URL: "https://gacha-lens-git-main-team.vercel.app" }), "canonical_production_url").status, "fail");
});

test("valid contact email passes", () => {
  assert.equal(check(audit(), "public_contact").status, "pass");
});

test("invalid contact email fails", () => {
  assert.equal(check(audit({ NEXT_PUBLIC_CONTACT_EMAIL: "not-an-email" }), "public_contact").status, "fail");
});

test("Google verification passes without exposing its value", () => {
  const result = audit();
  assert.equal(check(result, "search_console_verification").status, "pass");
  assert.equal(JSON.stringify(result).includes(validEnv.GOOGLE_SITE_VERIFICATION), false);
});

test("missing Google verification stays an explicit review warning", () => {
  assert.equal(check(audit({ GOOGLE_SITE_VERIFICATION: "" }), "search_console_verification").status, "warn");
});

test("configured AdSense triggers a review warning only", () => {
  const result = audit({ NEXT_PUBLIC_GOOGLE_ADSENSE_ACCOUNT: "ca-pub-1234567890123456" });
  assert.equal(check(result, "adsense_inactive").status, "warn");
  assert.equal(result.summary.ready, true);
  assert.equal(JSON.stringify(result).includes("ca-pub-1234567890123456"), false);
});

test("missing AdSense remains launch-ready", () => {
  assert.equal(check(audit(), "adsense_inactive").status, "pass");
});

test("editorial guide count and expected slugs are ready", () => {
  assert.equal(check(audit(), "editorial_content").status, "pass");
});

test("public catalog route checks pass", () => {
  assert.equal(check(audit(), "public_catalog_routes").status, "pass");
});

test("legal route checks pass", () => {
  assert.equal(check(audit(), "legal_routes").status, "pass");
});

test("robots and sitemap checks pass", () => {
  const result = audit();
  assert.equal(check(result, "robots").status, "pass");
  assert.equal(check(result, "sitemap").status, "pass");
});

test("sitemap readiness requires all core routes, guide mapping, and cap", () => {
  const source = fs.readFileSync(path.join(ROOT, "app/sitemap.js"), "utf8");
  assert.equal(isSitemapSourceReady(source), true);

  for (const fragment of [
    '{ path: "/",',
    '{ path: "/series",',
    '{ path: "/ranking",',
    '{ path: "/schedule",',
    '{ path: "/guides",',
    "getEditorialGuideSlugs",
    "`/guides/${encodeURIComponent(slug)}`",
    "MAX_SITEMAP_URLS = 50000",
    "entries.length > MAX_SITEMAP_URLS",
  ]) {
    assert.equal(isSitemapSourceReady(source.replaceAll(fragment, "")), false, fragment);
  }
});

test("affiliate and ranking safety check passes", () => {
  assert.equal(check(audit(), "affiliate_ranking_safety").status, "pass");
});

test("audit has no Production network dependency", () => {
  const source = fs.readFileSync(SCRIPT, "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(/i);
  assert.doesNotMatch(source, /from\s+["']@supabase\//i);
});

test("JSON output contains no configured secret values", () => {
  const result = audit({
    NEXT_PUBLIC_GOOGLE_ADSENSE_ACCOUNT: "ca-pub-9999999999999999",
    AMAZON_ASSOCIATE_TAG: "amazon-secret-tag",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
  });
  const serialized = JSON.stringify(result);
  for (const value of ["ca-pub-9999999999999999", "amazon-secret-tag", "service-role-secret"]) {
    assert.equal(serialized.includes(value), false);
  }
});

test("strict mode exits nonzero when required conditions are missing", () => {
  const run = spawnSync(process.execPath, [SCRIPT, "--strict", "--json"], {
    cwd: ROOT,
    env: { ...process.env, NEXT_PUBLIC_SITE_URL: "", NEXT_PUBLIC_CONTACT_EMAIL: "" },
    encoding: "utf8",
  });
  assert.equal(run.status, 1);
  assert.equal(JSON.parse(run.stdout).summary.ready, false);
});

test("normal developer mode remains usable when conditions are incomplete", () => {
  const run = spawnSync(process.execPath, [SCRIPT, "--json"], {
    cwd: ROOT,
    env: { ...process.env, NEXT_PUBLIC_SITE_URL: "", NEXT_PUBLIC_CONTACT_EMAIL: "" },
    encoding: "utf8",
  });
  assert.equal(run.status, 0);
  assert.equal(JSON.parse(run.stdout).summary.required_fail >= 2, true);
});

test("JSON and strict options parse without a CLI framework", () => {
  assert.deepEqual(parseLaunchReadinessArgs(["--strict", "--json"]), { strict: true, json: true });
  assert.throws(() => parseLaunchReadinessArgs(["--unknown"]), /Unknown launch readiness option/);
});

test("human output retains check IDs without configuration values", () => {
  const output = formatLaunchReadiness(audit());
  assert.match(output, /canonical_production_url/);
  assert.equal(output.includes(validEnv.NEXT_PUBLIC_CONTACT_EMAIL), false);
});

test("configured contact address is redacted by the output guard", () => {
  const result = audit({ NEXT_PUBLIC_CONTACT_EMAIL: "launch-contact@example.jp" });
  assert.equal(JSON.stringify(result).includes("launch-contact@example.jp"), false);
  assert.doesNotThrow(() => formatLaunchReadiness(result));
});
