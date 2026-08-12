import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import {
  automaticMarketBoundedWorkflowDigest,
  isReviewedAutomaticMarketBoundedWorkflow,
  productionWorkflowDigest,
  REVIEWED_AUTOMATIC_MARKET_BOUNDED_WORKFLOW_DIGESTS,
} from "../lib/domain/market-workflow-evidence.js";

const legacyWorkflow = fs.readFileSync(".github/workflows/gacha-ingestion.yml", "utf8");
const autoWorkflow = fs.readFileSync(".github/workflows/gacha-market-bounded-auto.yml", "utf8");
const manualWorkflow = fs.readFileSync(".github/workflows/gacha-market-bounded-manual.yml", "utf8");
const yahooFetcher = fs.readFileSync("lib/fetchers/yahoo-shopping-fetcher.js", "utf8");
const autoDigest = "d8dc4bf3cc7613f6eff0dcecc948539c0a02d46c5aa1d5076487b9b9b97e49e9";
const previousAutoDigest = "5801f3e2958b35cc4b27d48f1e5f820bf1c3bd9f8381790b27ad5098f9c2b29f";
const legacyDigest = "3a1f4c194e724afd68853491ce6642573020358f6aae8d1eb81a4530ec9165af";
const orphanRuns = ["30688709185", "30761206126", "31174863521", "31191456665", "31322475822", "31411326808", "31412968526"];

test("legacy Production workflow remains byte-for-byte on its reviewed digest", () => {
  assert.equal(productionWorkflowDigest(legacyWorkflow), legacyDigest);
});
test("automatic workflow has exactly one scheduled trigger", () => {
  assert.match(autoWorkflow, /^on:\s*\r?\n\s+schedule:/m);
  assert.equal((autoWorkflow.match(/^\s+- cron:/gm) ?? []).length, 1);
  assert.match(autoWorkflow, /cron: "17,47 \* \* \* \*"/);
  assert.doesNotMatch(autoWorkflow, /^\s+(workflow_dispatch|push|pull_request|workflow_run|repository_dispatch):/m);
  assert.doesNotMatch(autoWorkflow, /"7 \* \* \* \*"|"37 \* \* \* \*"/);
});
test("master gate skips the entire job before runner work", () => {
  assert.match(autoWorkflow, /bounded-production:\s+if: \$\{\{ vars\.AUTOMATIC_MARKET_BOUNDED_AUTO_ENABLED == 'true' \}\}/);
  assert.ok(autoWorkflow.indexOf("AUTOMATIC_MARKET_BOUNDED_AUTO_ENABLED") < autoWorkflow.indexOf("actions/checkout@v6"));
  assert.doesNotMatch(autoWorkflow, /AUTOMATIC_MARKET_BOUNDED_AUTO_ENABLED \|\| 'true'/);
});
test("automatic workflow has the fixed scheduled market contract", () => {
  assert.match(autoWorkflow, /AUTOMATIC_INGESTION_SCHEDULE: \$\{\{ github\.event\.schedule \}\}/);
  assert.match(autoWorkflow, /--stage=market-bounded[\s\S]*--task=market[\s\S]*--schedule="\$AUTOMATIC_INGESTION_SCHEDULE"/);
  assert.doesNotMatch(autoWorkflow, /--schedule=\$\{\{ github\.event\.schedule \}\}/);
  assert.match(autoWorkflow, /--mode=dry-run[\s\S]*--limit=\$\{\{ steps\.rollout\.outputs\.limit \}\}[\s\S]*--priority=\$\{\{ steps\.rollout\.outputs\.priority \}\}[\s\S]*--release=\$\{\{ steps\.rollout\.outputs\.release \}\}[\s\S]*--source-scope=\$\{\{ steps\.rollout\.outputs\.source_scope \}\}[\s\S]*--execute-sources/);
  assert.doesNotMatch(autoWorkflow, /BACKFILL_TASK: official|BACKFILL_TASK: stock|task=all|canary-write|db:upsert-all|cleanup/);
  assert.match(autoWorkflow, /INGESTION_WRITE_DISABLED: "true"/);
  assert.match(autoWorkflow, /MARKET_BACKFILL_WRITE_DISABLED: "true"/);
});
test("automatic workflow wires the optional Yahoo affiliate Secret exactly once", () => {
  const binding = "YAHOO_AFFILIATE_TRACKING_ID: ${{ secrets.YAHOO_AFFILIATE_TRACKING_ID }}";
  assert.equal(autoWorkflow.split(binding).length - 1, 1);
  assert.match(yahooFetcher, /process\.env\.YAHOO_AFFILIATE_TRACKING_ID/);
  assert.doesNotMatch(autoWorkflow.slice(autoWorkflow.indexOf("steps:")), /YAHOO_AFFILIATE_TRACKING_ID/);
});
test("Rakuten affiliate wiring is unchanged", () => {
  assert.equal(autoWorkflow.split("RAKUTEN_AFFILIATE_ID: ${{ secrets.RAKUTEN_AFFILIATE_ID }}").length - 1, 1);
});
test("all automatic arming gates retain fail-closed defaults", () => {
  for (const variable of [
    "AUTOMATIC_INGESTION_WRITE_ENABLED",
    "AUTOMATIC_INGESTION_ROLLOUT_STAGE",
    "AUTOMATIC_INGESTION_ROLLOUT_POLICY_DIGEST",
    "AUTOMATIC_INGESTION_BOUNDED_PERSISTENCE_ENABLED",
    "AUTOMATIC_INGESTION_BOUNDED_APPROVAL",
  ]) assert.match(autoWorkflow, new RegExp(`${variable}: \\$\\{\\{ vars\\.${variable}`));
  assert.match(autoWorkflow, /AUTOMATIC_INGESTION_WRITE_ENABLED: \$\{\{ vars\.AUTOMATIC_INGESTION_WRITE_ENABLED \|\| 'false' \}\}/);
  assert.match(autoWorkflow, /AUTOMATIC_INGESTION_ROLLOUT_STAGE: \$\{\{ vars\.AUTOMATIC_INGESTION_ROLLOUT_STAGE \|\| 'disabled' \}\}/);
  assert.match(autoWorkflow, /AUTOMATIC_INGESTION_BOUNDED_PERSISTENCE_ENABLED: \$\{\{ vars\.AUTOMATIC_INGESTION_BOUNDED_PERSISTENCE_ENABLED \|\| 'false' \}\}/);
});
test("manual and automatic bounded workflows share only the new dedicated concurrency group", () => {
  assert.match(autoWorkflow, /group: gacha-market-bounded-v2\s+cancel-in-progress: false/);
  assert.match(manualWorkflow, /group: gacha-market-bounded-v2\s+cancel-in-progress: false/);
  assert.match(legacyWorkflow, /group: gacha-ingestion\s+cancel-in-progress: false/);
  assert.doesNotMatch(autoWorkflow, /group: gacha-ingestion/);
});
test("automatic workflow isolates the legacy orphan queue and forbidden run identities", () => {
  assert.doesNotMatch(autoWorkflow, /gacha-ingestion/);
  for (const runId of orphanRuns) assert.doesNotMatch(autoWorkflow, new RegExp(runId));
});
test("expected throttle no-ops skip source fetch and persistence while other failures enforce", () => {
  const noOp = autoWorkflow.slice(autoWorkflow.indexOf("Report expected rollout no-op"), autoWorkflow.indexOf("Run controlled market backfill"));
  assert.match(noOp, /Source fetch: skipped[\s\S]*Bounded persistence: skipped[\s\S]*Database writes: 0/);
  assert.match(autoWorkflow, /Run controlled market backfill\s+id: market_backfill\s+if: \$\{\{ steps\.rollout\.outputs\.allowed == 'true' \}\}/);
  assert.match(autoWorkflow, /Enforce bounded rollout result\s+if: \$\{\{ always\(\) && steps\.rollout\.outputs\.expected_noop != 'true'/);
});
test("bounded persistence keeps the reviewed schedule-only safety gates", () => {
  const persist = autoWorkflow.slice(autoWorkflow.indexOf("Run bounded market persistence"), autoWorkflow.indexOf("Scan sanitized bounded artifact"));
  for (const condition of ["persistence_authorized", "bounded_persistence_enabled", "bounded_approval_valid", "budget_state == 'within_budget'", "preview_generated == 'true'"]) assert.match(persist, new RegExp(condition.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(persist, /market:bounded-persist -- persist[\s\S]*--event-name=\$\{\{ github\.event_name \}\}[\s\S]*--schedule="\$AUTOMATIC_INGESTION_SCHEDULE"[\s\S]*--stage=market-bounded/);
  assert.match(autoWorkflow, /Scan sanitized bounded artifact[\s\S]*automatic-ingestion-rollout\.mjs scan/);
  assert.match(autoWorkflow, /market-bounded-auto-result-\$\{\{ github\.run_id \}\}/);
});
test("cron expressions stay a single argv value when passed through the quoted schedule binding", () => {
  const schedule = "17,47 * * * *";
  const script = "process.stdout.write(JSON.stringify(process.argv.slice(1)))";
  const result = spawnSync(process.execPath, ["-e", script, "--", `--schedule=${schedule}`], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), [`--schedule=${schedule}`]);
  assert.match(autoWorkflow, /--schedule="\$AUTOMATIC_INGESTION_SCHEDULE"/);
});
test("reviewed automatic workflow digest is exact and detects content drift", () => {
  assert.equal(automaticMarketBoundedWorkflowDigest(autoWorkflow), autoDigest);
  assert.equal(isReviewedAutomaticMarketBoundedWorkflow(autoWorkflow), true);
  assert.equal(REVIEWED_AUTOMATIC_MARKET_BOUNDED_WORKFLOW_DIGESTS.filter((digest) => digest === autoDigest).length, 1);
  assert.equal(REVIEWED_AUTOMATIC_MARKET_BOUNDED_WORKFLOW_DIGESTS.includes("e1cd4fd287bac48e32230fbdf9a9f11ce74f641bd6daeead4730e0cc047ec832"), true);
  assert.equal(REVIEWED_AUTOMATIC_MARKET_BOUNDED_WORKFLOW_DIGESTS.includes(previousAutoDigest), true);
  assert.equal(isReviewedAutomaticMarketBoundedWorkflow(`${autoWorkflow}\n# drift`), false);
});
