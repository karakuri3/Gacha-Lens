import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  BULK_RECOVERY_CONFIRMATION,
  BULK_RECOVERY_LOOKBACK_DAYS,
  BULK_RECOVERY_MAX_ROUNDS,
  BULK_RECOVERY_MAX_TARGETS,
  BULK_RECOVERY_ROUND_LIMIT,
  selectBulkRecoveryTargets,
  summarizeBulkRecoverySeriesDepth,
  validateBulkRecoveryInvocation,
} from "../scripts/market-bulk-recovery-once.mjs";

const root = process.cwd();
const workflow = fs.readFileSync(path.join(root, ".github/workflows/gacha-market-bulk-recovery-once.yml"), "utf8");
const marker = fs.readFileSync(path.join(root, ".github/ops/gacha-market-bulk-recovery-20260916.token"), "utf8").trim();
const sharedRunner = fs.readFileSync(path.join(root, "scripts/market-p3-bounded-seed-v2.mjs"), "utf8");
const sha = "a".repeat(40);

function row(overrides = {}) {
  return {
    variantId: "variant-1",
    seriesId: "series-1",
    released: true,
    releaseDate: "2026-09-10T00:00:00.000Z",
    eligibleListingCount: 0,
    priority: 3,
    ...overrides,
  };
}

test("one-time bulk workflow is main-push-only and marker-scoped", () => {
  const triggers = workflow.slice(workflow.indexOf("on:"), workflow.indexOf("\npermissions:"));
  assert.match(triggers, /push:/);
  assert.match(triggers, /branches:[\s\S]*- main/);
  assert.match(triggers, /gacha-market-bulk-recovery-20260916\.token/);
  assert.doesNotMatch(triggers, /workflow_dispatch|schedule|cron/);
  assert.equal(marker, BULK_RECOVERY_CONFIRMATION);
  assert.match(workflow, /cancel-in-progress:\s*false/);
  assert.match(workflow, /timeout-minutes:\s*120/);
  assert.match(workflow, /manual-market-audit-guard\.mjs scan/);
});

test("bulk workflow reuses existing credentials without secrets or variables mutation", () => {
  assert.match(workflow, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(workflow, /RAKUTEN_APPLICATION_ID/);
  assert.match(workflow, /YAHOO_SHOPPING_APP_ID/);
  assert.doesNotMatch(workflow, /gh secret|gh variable|repository_dispatch|workflow_dispatch/);
  assert.doesNotMatch(workflow, /gacha-ingestion\.yml/);
});

test("bulk runner keeps strict P3 v2 limits and never expands a round beyond 25", () => {
  assert.equal(BULK_RECOVERY_ROUND_LIMIT, 25);
  assert.equal(BULK_RECOVERY_MAX_ROUNDS, 7);
  assert.equal(BULK_RECOVERY_MAX_TARGETS, 100);
  assert.equal(BULK_RECOVERY_LOOKBACK_DAYS, 30);
  assert.match(sharedRunner, /planPriorityThreeSeedSearchQueries/);
  assert.match(sharedRunner, /MARKET_SOURCE_SCOPES\.PLANNER_APIS/);
  assert.match(sharedRunner, /maxVariantsPerSeries:\s*1/);
  assert.doesNotMatch(sharedRunner, /buildMarketSearchQueriesForVariant|planMarketSearchQueries/);
});

test("shared P3 v2 runner preserves default rotation and accepts only bounded target/exclusion controls", () => {
  assert.match(sharedRunner, /target_variant_ids = null/);
  assert.match(sharedRunner, /additional_excluded_variant_ids = \[\]/);
  assert.match(sharedRunner, /rotation_key = null/);
  assert.match(sharedRunner, /priority-3-bounded-seed-v2:\$\{runId\}/);
  assert.match(sharedRunner, /data\.coverageRows\.filter\(\(row\) => targetVariantIds\.has/);
});

test("bulk invocation is exact-current-main push only", () => {
  const input = { event_name: "push", ref: "refs/heads/main", confirmation: BULK_RECOVERY_CONFIRMATION, head_sha: sha, origin_main_sha: sha };
  assert.equal(validateBulkRecoveryInvocation(input), "manual-v2");
  assert.throws(() => validateBulkRecoveryInvocation({ ...input, confirmation: "wrong" }));
  assert.throws(() => validateBulkRecoveryInvocation({ ...input, event_name: "workflow_dispatch" }));
  assert.throws(() => validateBulkRecoveryInvocation({ ...input, ref: "refs/heads/feature" }));
  assert.throws(() => validateBulkRecoveryInvocation({ ...input, origin_main_sha: "b".repeat(40) }));
});

test("bulk target selection is limited to recently released uncovered priority-3 variants", () => {
  const now = new Date("2026-09-16T12:00:00.000Z");
  const selected = selectBulkRecoveryTargets([
    row({ variantId: "recent" }),
    row({ variantId: "covered", eligibleListingCount: 1 }),
    row({ variantId: "upcoming", released: false, releaseDate: "2026-09-20T00:00:00.000Z", priority: 4 }),
    row({ variantId: "old", releaseDate: "2026-08-01T00:00:00.000Z" }),
    row({ variantId: "wrong-priority", priority: 5 }),
  ], { now });
  assert.deepEqual(selected.map((entry) => entry.variantId), ["recent"]);
});

test("series depth determines the bounded traversal requirement", () => {
  const rows = [
    row({ variantId: "a", seriesId: "s1" }),
    row({ variantId: "b", seriesId: "s1" }),
    row({ variantId: "c", seriesId: "s2" }),
  ];
  assert.deepEqual(summarizeBulkRecoverySeriesDepth(rows), { distinct_series: 2, max_variants_per_series: 2 });
});
