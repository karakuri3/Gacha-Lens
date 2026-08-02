import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  expectedManualMarketBoundedApproval,
  MANUAL_MARKET_BOUNDED_CONFIRMATION,
  validateManualMarketBoundedArmingGate,
  validateManualMarketBoundedOutcome,
} from "../lib/domain/manual-market-bounded-execution.js";

const workflow = fs.readFileSync(".github/workflows/gacha-market-bounded-manual.yml", "utf8");
const productionWorkflow = fs.readFileSync(".github/workflows/gacha-ingestion.yml", "utf8");
const runner = fs.readFileSync("scripts/manual-market-bounded-persistence.mjs", "utf8");
const digest = "d".repeat(64);
const sha = "a".repeat(40);
const nonce = "b".repeat(32);

function gate(overrides = {}) {
  return validateManualMarketBoundedArmingGate({
    event_name: "workflow_dispatch", ref: "refs/heads/main", task: "market", stage: "market-bounded",
    expected_main_sha: sha, head_sha: sha, origin_main_sha: sha, main_sha_verified: true,
    expected_policy_digest: digest, policy_digest: digest, configured_policy_digest: digest,
    approval_nonce: nonce, confirmation: MANUAL_MARKET_BOUNDED_CONFIRMATION,
    automatic_write_enabled: "true", bounded_persistence_enabled: "true",
    bounded_approval: expectedManualMarketBoundedApproval(digest, sha, nonce),
    ...overrides,
  });
}

test("complete manual approval passes", () => assert.equal(gate().ok, true));
test("schedule event fails", () => assert.equal(gate({ event_name: "schedule" }).ok, false));
test("non-dispatch event fails", () => assert.equal(gate({ event_name: "push" }).ok, false));
test("non-main ref fails", () => assert.equal(gate({ ref: "refs/heads/feature" }).ok, false));
test("main SHA mismatch fails", () => assert.equal(gate({ origin_main_sha: "c".repeat(40) }).ok, false));
test("policy digest mismatch fails", () => assert.equal(gate({ configured_policy_digest: "c".repeat(64) }).ok, false));
test("confirmation mismatch fails", () => assert.equal(gate({ confirmation: "yes" }).ok, false));
for (const value of ["", "A".repeat(32), "a".repeat(31), "a".repeat(65), "g".repeat(32)]) {
  test(`invalid nonce ${value.length} fails`, () => assert.equal(gate({ approval_nonce: value }).ok, false));
}
test("missing approval fails", () => assert.equal(gate({ bounded_approval: "" }).ok, false));
test("approval nonce mismatch fails", () => assert.equal(gate({ bounded_approval: expectedManualMarketBoundedApproval(digest, sha, "c".repeat(32)) }).ok, false));
test("automatic write false fails", () => assert.equal(gate({ automatic_write_enabled: "false" }).ok, false));
test("bounded persistence false fails", () => assert.equal(gate({ bounded_persistence_enabled: "false" }).ok, false));
test("wrong rollout stage fails", () => assert.equal(gate({ stage: "market-shadow" }).ok, false));
test("schedule approval cannot authorize manual gate", () => assert.equal(gate({ bounded_approval: `APPROVE_MARKET_BOUNDED:${digest}:${sha}` }).ok, false));
test("gate result never stores approval or nonce", () => assert.doesNotMatch(JSON.stringify(gate()), /APPROVE|bbbbbbbb/));

test("workflow_dispatch is the only trigger", () => {
  assert.match(workflow, /^on:\s*\r?\n\s+workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s+(schedule|push|pull_request|workflow_run|repository_dispatch):/m);
});
test("workflow has only required approval inputs", () => {
  for (const name of ["expected_main_sha", "expected_policy_digest", "approval_nonce", "confirmation"]) assert.match(workflow, new RegExp(`^\\s{6}${name}:`, "m"));
  assert.doesNotMatch(workflow, /^\s{6}(task|stage|limit|priority|release|source_scope|execute_sources|mode):/m);
});
test("workflow fixes the market contract", () => {
  assert.match(workflow, /--mode=dry-run[\s\S]*--limit=5[\s\S]*--priority=1[\s\S]*--release=released[\s\S]*--source-scope=planner-apis[\s\S]*--execute-sources/);
  assert.match(workflow, /stage:\s*"?market-bounded|--stage=market-bounded|stage: market-bounded/);
});
test("workflow uses dedicated non-cancelling concurrency", () => assert.match(workflow, /group: gacha-market-bounded-manual-production\s+cancel-in-progress: false/));
test("workflow has minimal permissions", () => assert.match(workflow, /permissions:\s+contents: read\s+actions: read/));
for (const forbidden of ["db:upsert-all", "canary-write", "db:cleanup", "cleanup-provisional", "gh workflow enable", "gh workflow disable", "gh variable set", "migration"]) {
  test(`workflow excludes ${forbidden}`, () => assert.doesNotMatch(workflow, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
}
test("workflow uploads a Run-scoped artifact", () => assert.match(workflow, /market-bounded-manual-result-\$\{\{ github\.run_id \}\}/));
test("workflow scans before final enforcement", () => assert.ok(workflow.indexOf("Scan sanitized manual bounded artifact") < workflow.indexOf("Enforce final manual bounded result")));
test("existing Production workflow retains schedules and schedule-only bounded gate", () => {
  for (const cron of ["7 * * * *", "17,47 * * * *", "37 * * * *"]) assert.match(productionWorkflow, new RegExp(cron.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(productionWorkflow, /Run bounded market persistence[\s\S]*github\.event_name == 'schedule'/);
});

test("bounded budget accepts two listings observations and one durable row", () => {
  const result = validateManualMarketBoundedOutcome({ candidates: 2, operations: { listings: [{ operation: "insert" }, { operation: "update" }], observations: [{ operation: "insert" }, { operation: "insert" }], durable_run: "insert" }, database_writes: 5, deltas: { market_listings: 1, market_listing_observations: 2, ingestion_runs: 1 } });
  assert.equal(result.total_database_write_operations, 5);
});
test("bounded budget accepts sanitized result operation counts", () => {
  const result = validateManualMarketBoundedOutcome({ candidates: 2, operations: { listing_inserts: 1, listing_updates: 1, observation_inserts: 2, observation_updates: 0, durable_run: "insert" }, database_writes: 5, deltas: { market_listings: 1, market_listing_observations: 2, ingestion_runs: 1 } });
  assert.equal(result.total_database_write_operations, 5);
});
test("malformed sanitized operation counts fail closed", () => assert.throws(() => validateManualMarketBoundedOutcome({ candidates: 1, operations: { listing_inserts: -1 }, database_writes: 0 })));
test("three candidates fail instead of truncating", () => assert.throws(() => validateManualMarketBoundedOutcome({ candidates: 3, database_writes: 0 })));
test("more than two listing operations fail", () => assert.throws(() => validateManualMarketBoundedOutcome({ candidates: 2, operations: { listings: Array.from({ length: 3 }, () => ({ operation: "insert" })) }, database_writes: 3 })));
test("more than two observation operations fail", () => assert.throws(() => validateManualMarketBoundedOutcome({ candidates: 2, operations: { observations: Array.from({ length: 3 }, () => ({ operation: "insert" })) }, database_writes: 3 })));
test("forbidden table delta fails", () => assert.throws(() => validateManualMarketBoundedOutcome({ candidates: 0, database_writes: 0, deltas: { review_required: 1 } })));
test("negative allowed-table delta fails closed", () => assert.throws(() => validateManualMarketBoundedOutcome({ candidates: 0, database_writes: 0, deltas: { market_listings: -1 } })));
test("runner persists a workflow_dispatch durable row", () => assert.match(runner, /trigger_source:\s*"workflow_dispatch"[\s\S]*execution_path:\s*"manual-bounded"/));
test("runner preserves durable operation for final write-budget verification", () => assert.match(runner, /withDurableOperation\([\s\S]*outcome\.operations\?\.durable_run/));
test("runner reuses bounded identity idempotency and rollback", () => {
  assert.match(runner, /validateMarketBoundedPlanIdentity/);
  assert.match(runner, /buildMarketBoundedRows/);
  assert.match(runner, /persistMarketBounded/);
});
test("runner secret scan includes approval and nonce environment values", () => assert.match(runner, /APPROVAL\|NONCE/));
test("runner never writes the approval or nonce into reports", () => assert.doesNotMatch(runner, /writeJson\([^\n]*(approval_nonce|bounded_approval)/));
