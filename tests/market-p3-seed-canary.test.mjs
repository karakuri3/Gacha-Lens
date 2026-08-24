import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  P3_SEED_CANARY_CONFIRMATION,
  buildP3SeedCanaryRows,
  loadP3SeedCanaryTarget,
  selectExactP3SeedCanaryCandidate,
  validateP3SeedCanaryInvocation,
} from "../lib/domain/market-p3-seed-canary.js";
import { isNonAuthoritativeManualMarketAudit } from "../lib/domain/manual-market-audit-diagnostic.js";

const root = process.cwd();
const workflow = fs.readFileSync(path.join(root, ".github/workflows/gacha-market-seed-canary.yml"), "utf8");
const target = loadP3SeedCanaryTarget(fs.readFileSync(path.join(root, "config/market-p3-seed-canary-target.json"), "utf8"));
const sha = "a".repeat(40);

function candidate(overrides = {}) { return { candidate_key: "1234567890abcdef", source: { provider: target.provider, listing_id: target.source_listing_id, public_url: target.public_url }, listing: { title: "【白ナス】つながリングチャーム やさいのようせい", price: 650, status: "active", listing_type: "single" }, target: { variant_id: target.variant_id, series_id: target.series_id, search_query: `${target.series_name} ${target.variant_name} ガチャ` }, assessment: { accepted: true, review_required: false, reason: "variant_and_parent_evidence_confirmed", confidence: 0.86 }, checks: { variant_evidence_present: true, parent_series_evidence_present: true, set_signal_detected: false, multiple_variant_candidates: false, explicit_variant_conflict: false, explicit_label_unresolved: false, parent_series_edition_conflict: false }, ...overrides }; }

test("P3 seed canary workflow is dispatch-only and has no arbitrary target inputs", () => {
  assert.match(workflow, /^on:\s*\r?\n\s+workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s+(schedule|push|pull_request|workflow_run|repository_dispatch):/m);
  const inputs = workflow.match(/inputs:([\s\S]*?)\r?\n\r?\njobs:/)?.[1] ?? "";
  assert.match(inputs, /expected_main_sha/); assert.match(inputs, /confirmation/);
  assert.doesNotMatch(inputs, /(variant_id|series_id|listing_id|provider|public_url)/);
});

test("fixed target accepts only the exact active safe White Eggplant listing", () => assert.equal(selectExactP3SeedCanaryCandidate([candidate()], target).candidate_key, "1234567890abcdef"));

for (const [name, change] of [
  ["sold listing", (c) => { c.listing.status = "sold"; }], ["review", (c) => { c.assessment.review_required = true; }], ["wrong variant", (c) => { c.target.variant_id = "other"; }], ["wrong series", (c) => { c.target.series_id = "other"; }], ["wrong provider", (c) => { c.source.provider = "yahoo_shopping"; }], ["wrong listing", (c) => { c.source.listing_id = "other:1"; }], ["URL mismatch", (c) => { c.source.public_url = "https://item.rakuten.co.jp/other/item/"; }], ["set", (c) => { c.checks.set_signal_detected = true; }], ["explicit conflict", (c) => { c.checks.explicit_variant_conflict = true; }], ["edition conflict", (c) => { c.checks.parent_series_edition_conflict = true; }],
]) test(`${name} fails closed`, () => { const value = candidate(); change(value); assert.throws(() => selectExactP3SeedCanaryCandidate([value], target)); });

test("invocation needs an exact main SHA and confirmation", () => {
  assert.equal(validateP3SeedCanaryInvocation({ event_name: "workflow_dispatch", ref: "refs/heads/main", confirmation: P3_SEED_CANARY_CONFIRMATION, expected_main_sha: sha, head_sha: sha, origin_main_sha: sha }), true);
  assert.throws(() => validateP3SeedCanaryInvocation({ event_name: "workflow_dispatch", ref: "refs/heads/main", confirmation: "no", expected_main_sha: sha, head_sha: sha, origin_main_sha: sha }));
});

test("one fixed candidate builds one deterministic listing and observation only", () => {
  const rows = buildP3SeedCanaryRows({ candidate: candidate(), target, workflow: { run_id: "1", run_attempt: "1", head_sha: sha }, observed_at: "2026-08-24T00:00:00.000Z" });
  assert.equal(rows.listingRows.length, 1); assert.equal(rows.observationRows.length, 1); assert.equal(rows.listingRows[0].variant_id, target.variant_id); assert.equal(rows.listingRows[0].raw.p3_seed_canary.target_digest.length, 64);
});

test("generic Priority 3 seed audit remains non-authoritative", () => assert.equal(isNonAuthoritativeManualMarketAudit({ manual_diagnostic: { kind: "priority_3_seed_read_only", canary_eligible: false, write_eligible: false } }), true));

test("workflow retains one-row budget, rollback, sanitized artifact scanning, and no generic P1 changes", () => {
  const runner = fs.readFileSync(path.join(root, "scripts", "market-p3-seed-canary.mjs"), "utf8");
  assert.match(workflow, /P3_SEED_CANARY_MAX_CANDIDATES/); assert.match(runner, /persistP3SeedCanary/); assert.match(runner, /rollback/); assert.match(workflow, /manual-market-audit-guard\.mjs scan/);
  assert.doesNotMatch(workflow, /gacha-ingestion\.yml|gacha-market-bounded-auto\.yml|--mode=canary-write/);
});
