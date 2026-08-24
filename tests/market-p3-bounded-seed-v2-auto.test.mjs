import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MARKET_BOUNDED_PERSISTENCE_HARD_CAP } from "../lib/domain/market-bounded-selection.js";
import { P3_BOUNDED_SEED_HARD_CAP } from "../lib/domain/market-p3-bounded-seed.js";
import {
  P3_BOUNDED_SEED_V2_AUTO_APPROVAL,
  P3_BOUNDED_SEED_V2_AUTO_CANARY_CONFIRMATION,
  P3_BOUNDED_SEED_V2_AUTO_LIMIT,
  P3_BOUNDED_SEED_V2_HARD_CAP,
  buildP3BoundedSeedV2Rows,
  validateP3BoundedSeedV2AutoInvocation,
} from "../lib/domain/market-p3-bounded-seed-v2.js";

const root = process.cwd();
const workflow = fs.readFileSync(path.join(root, ".github/workflows/gacha-market-p3-bounded-seed-v2-auto.yml"), "utf8");
const oldAutoWorkflow = fs.readFileSync(path.join(root, ".github/workflows/gacha-market-bounded-auto.yml"), "utf8");
const autoRunner = fs.readFileSync(path.join(root, "scripts/market-p3-bounded-seed-v2-auto.mjs"), "utf8");
const sharedRunner = fs.readFileSync(path.join(root, "scripts/market-p3-bounded-seed-v2.mjs"), "utf8");
const sha = "a".repeat(40);

function candidate() {
  return {
    candidate_key: "1".repeat(16),
    source: { provider: "rakuten_ichiba", listing_id: "shop:item", public_url: "https://item.rakuten.co.jp/shop/item/" },
    listing: { title: "Series Variant", price: 500, status: "active", listing_type: "single" },
    target: { variant_id: "variant-1", variant_name: "Variant", series_id: "series-1", series_name: "Series", search_query: "Series Variant" },
    assessment: { accepted: true, review_required: false, reason: "variant_and_parent_evidence_confirmed", confidence: 0.86 },
    checks: { variant_evidence_present: true, parent_series_evidence_present: true, parent_series_exact_evidence_present: true, parent_series_discriminator_required: false, parent_series_discriminator_evidence_present: false, explicit_label_target_match: true, set_signal_detected: false, multiple_variant_candidates: false, explicit_variant_conflict: false, explicit_label_unresolved: false, explicit_label_other_variant_match: false, parent_series_edition_conflict: false, catalog_parent_variant_identity_ambiguous: false },
  };
}

test("P3 v2 auto workflow is scheduled every three hours and has only a canary confirmation input", () => {
  assert.match(workflow, /cron:\s*"17 \*\/3 \* \* \*"/); assert.match(workflow, /workflow_dispatch:/);
  const inputs = workflow.match(/inputs:([\s\S]*?)\r?\n\r?\npermissions:/)?.[1] ?? "";
  assert.match(inputs, /confirmation/); assert.doesNotMatch(inputs, /(limit|priority|release|variant|series|provider|listing|url|query)/);
  assert.match(workflow, /group:\s*gacha-market-bounded-v2/); assert.match(workflow, /cancel-in-progress:\s*false/);
  assert.match(workflow, /node-version:\s*24/); assert.match(workflow, /timeout-minutes:\s*40/);
});

test("P3 v2 scheduled gate is disabled unless both dedicated variables are exact", () => {
  const input = { event_name: "schedule", ref: "refs/heads/main", head_sha: sha, origin_main_sha: sha };
  for (const value of [{}, { auto_enabled: "false", auto_approval: P3_BOUNDED_SEED_V2_AUTO_APPROVAL }, { auto_enabled: "true", auto_approval: "wrong" }]) assert.throws(() => validateP3BoundedSeedV2AutoInvocation({ ...input, ...value }));
  assert.equal(validateP3BoundedSeedV2AutoInvocation({ ...input, auto_enabled: "true", auto_approval: P3_BOUNDED_SEED_V2_AUTO_APPROVAL }), "scheduled-auto");
  assert.match(workflow, /Provider fetch: skipped/); assert.match(workflow, /Database writes: 0/);
});

test("P3 v2 auto canary is main-only, confirmation-gated, and fixed to 25", () => {
  const input = { event_name: "workflow_dispatch", ref: "refs/heads/main", head_sha: sha, origin_main_sha: sha, confirmation: P3_BOUNDED_SEED_V2_AUTO_CANARY_CONFIRMATION };
  assert.equal(validateP3BoundedSeedV2AutoInvocation(input), "manual-auto-canary");
  assert.throws(() => validateP3BoundedSeedV2AutoInvocation({ ...input, confirmation: "wrong" }));
  assert.throws(() => validateP3BoundedSeedV2AutoInvocation({ ...input, ref: "refs/heads/feature" }));
  assert.throws(() => validateP3BoundedSeedV2AutoInvocation({ ...input, origin_main_sha: "b".repeat(40) }));
  assert.equal(P3_BOUNDED_SEED_V2_AUTO_LIMIT, 25); assert.match(autoRunner, /fixed_limit:\s*P3_BOUNDED_SEED_V2_AUTO_LIMIT/);
});

test("P3 v2 auto reuses the strict shared execution path without generic planning", () => {
  assert.match(autoRunner, /executeP3BoundedSeedV2/); assert.match(sharedRunner, /planPriorityThreeSeedSearchQueries/);
  assert.doesNotMatch(sharedRunner, /buildMarketSearchQueriesForVariant|planMarketSearchQueries/);
  assert.match(sharedRunner, /MARKET_SOURCE_SCOPES\.PLANNER_APIS/); assert.match(sharedRunner, /maxVariantsPerSeries:\s*1/);
  assert.match(sharedRunner, /priority-3-bounded-seed-v2:\$\{runId\}/);
});

test("P3 v2 auto markers are distinct, deterministic, and preserve manual defaults", () => {
  const input = { candidates: [candidate()], workflow: { run_id: "123", head_sha: sha }, observed_at: "2026-08-25T00:00:00.000Z" };
  const manual = buildP3BoundedSeedV2Rows(input); const automatic = buildP3BoundedSeedV2Rows({ ...input, stage: "p3-bounded-seed-v2-auto" });
  assert.equal(manual.listingRows[0].id, automatic.listingRows[0].id);
  assert.notEqual(manual.observationRows[0].id, automatic.observationRows[0].id);
  assert.equal(manual.listingRows[0].raw.p3_bounded_seed.stage, "p3-bounded-seed-v2");
  assert.equal(automatic.listingRows[0].raw.p3_bounded_seed.stage, "p3-bounded-seed-v2-auto");
  assert.equal(automatic.observationRows[0].id, buildP3BoundedSeedV2Rows({ ...input, stage: "p3-bounded-seed-v2-auto" }).observationRows[0].id);
});

test("P3 v2 auto retains cap isolation, insert-only policy, scan, and artifact gating", () => {
  assert.equal(MARKET_BOUNDED_PERSISTENCE_HARD_CAP, 2); assert.equal(P3_BOUNDED_SEED_HARD_CAP, 5); assert.equal(P3_BOUNDED_SEED_V2_HARD_CAP, 25);
  assert.match(sharedRunner, /persistP3BoundedSeedV2/); assert.match(workflow, /if: \$\{\{ always\(\) && steps\.gate\.outputs\.execute == 'true' \}\}/);
  assert.match(workflow, /steps\.scan\.outcome == 'success'/); assert.match(workflow, /market-p3-bounded-seed-v2-auto-result/);
});

test("P3 v2 auto rejected canary writes a sanitized blocked artifact before retrieval", () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "gacha-p3-v2-auto-"));
  try {
    const result = spawnSync(process.execPath, [path.join(root, "scripts/market-p3-bounded-seed-v2-auto.mjs"), `--output-dir=${output}`], { cwd: root, env: { ...process.env, GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/main", GITHUB_SHA: sha, P3_BOUNDED_SEED_V2_AUTO_ORIGIN_MAIN_SHA: sha, P3_BOUNDED_SEED_V2_AUTO_CANARY_CONFIRMATION: "wrong" }, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    const artifact = JSON.parse(fs.readFileSync(path.join(output, "market-p3-bounded-seed-v2-result.json"), "utf8"));
    assert.equal(artifact.status, "blocked"); assert.equal(artifact.workflow.event_name, "workflow_dispatch"); assert.equal(artifact.contract.execution_mode, "manual-auto-canary");
    assert.equal(artifact.production_counts_before, null); assert.equal(artifact.production_counts_after, null);
    assert.doesNotMatch(JSON.stringify(artifact), /token|secret/i);
  } finally { fs.rmSync(output, { recursive: true, force: true }); }
});

test("the old automatic workflow remains isolated from dedicated P3 v2 auto variables", () => {
  assert.doesNotMatch(oldAutoWorkflow, /P3_BOUNDED_SEED_V2_AUTO_(ENABLED|APPROVAL)/);
  assert.match(oldAutoWorkflow, /AUTOMATIC_MARKET_BOUNDED_AUTO_ENABLED/);
});
