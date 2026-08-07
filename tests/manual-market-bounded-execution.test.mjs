import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  approvalNonceSha256,
  buildManualApprovalClaim,
  buildManualApprovalAttemptRows,
  buildManualMarketBoundedDurableRunId,
  expectedManualMarketBoundedApproval,
  KNOWN_ORPHANED_RUN_ID,
  MANUAL_MARKET_BOUNDED_CONFIRMATION,
  parseManualMarketBoundedApproval,
  validateManualActiveRuns,
  validateManualApprovalClaimReuse,
  validateManualApprovalClaimShape,
  validateManualMarketBoundedArmingGate,
  validateManualMarketBoundedExactDeltas,
  validateManualMarketBoundedOutcome,
} from "../lib/domain/manual-market-bounded-execution.js";
import { stableId } from "../lib/fetchers/feed-source-utils.js";

const workflow = fs.readFileSync(".github/workflows/gacha-market-bounded-manual.yml", "utf8");
const productionWorkflow = fs.readFileSync(".github/workflows/gacha-ingestion.yml", "utf8");
const runner = fs.readFileSync("scripts/manual-market-bounded-persistence.mjs", "utf8");
const digest = "d".repeat(64);
const sha = "a".repeat(40);
const nonce = "b".repeat(32);
const UUID_V8 = /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("legacy manual bounded durable ID is not a UUID", () => {
  const legacy = stableId("market-bounded-manual-run", "31174863521", "1", digest);
  assert.doesNotMatch(legacy, UUID_V8);
});

test("manual bounded durable ID is a deterministic UUIDv8", () => {
  const input = { workflow_run_id: "31174863521", workflow_run_attempt: "1", plan_digest: digest };
  const first = buildManualMarketBoundedDurableRunId(input);
  const second = buildManualMarketBoundedDurableRunId(input);
  assert.match(first, UUID_V8);
  assert.equal(first, second);
});

test("manual bounded durable ID changes with every identity component", () => {
  const input = { workflow_run_id: "31174863521", workflow_run_attempt: "1", plan_digest: digest };
  const baseline = buildManualMarketBoundedDurableRunId(input);
  assert.notEqual(buildManualMarketBoundedDurableRunId({ ...input, workflow_run_id: "31174863522" }), baseline);
  assert.notEqual(buildManualMarketBoundedDurableRunId({ ...input, workflow_run_attempt: "2" }), baseline);
  assert.notEqual(buildManualMarketBoundedDurableRunId({ ...input, plan_digest: "e".repeat(64) }), baseline);
});

for (const [name, input] of [
  ["missing workflow run ID", { workflow_run_attempt: "1", plan_digest: digest }],
  ["missing workflow run attempt", { workflow_run_id: "31174863521", plan_digest: digest }],
  ["invalid plan digest", { workflow_run_id: "31174863521", workflow_run_attempt: "1", plan_digest: "invalid" }],
]) {
  test(`${name} fails durable UUID generation closed`, () => {
    assert.throws(() => buildManualMarketBoundedDurableRunId(input), /identity is invalid/);
  });
}

function gate(overrides = {}) {
  const nonceOverride = Object.hasOwn(overrides, "approval_nonce") ? overrides.approval_nonce : nonce;
  const boundedApproval = Object.hasOwn(overrides, "bounded_approval")
    ? overrides.bounded_approval
    : expectedManualMarketBoundedApproval(digest, sha, nonceOverride);
  const input = {
    event_name: "workflow_dispatch", ref: "refs/heads/main", task: "market", stage: "market-bounded", configured_stage: "market-bounded", run_attempt: "1",
    expected_main_sha: sha, head_sha: sha, origin_main_sha: sha, main_sha_verified: true,
    expected_policy_digest: digest, policy_digest: digest, configured_policy_digest: digest,
    confirmation: MANUAL_MARKET_BOUNDED_CONFIRMATION,
    automatic_write_enabled: "true", bounded_persistence_enabled: "true",
    bounded_approval: boundedApproval,
    ...overrides,
  };
  delete input.approval_nonce;
  return validateManualMarketBoundedArmingGate(input);
}

test("complete manual approval passes", () => assert.equal(gate().ok, true));
test("schedule event fails", () => assert.equal(gate({ event_name: "schedule" }).ok, false));
test("non-dispatch event fails", () => assert.equal(gate({ event_name: "push" }).ok, false));
test("non-main ref fails", () => assert.equal(gate({ ref: "refs/heads/feature" }).ok, false));
test("main SHA mismatch fails", () => assert.equal(gate({ origin_main_sha: "c".repeat(40) }).ok, false));
test("policy digest mismatch fails", () => assert.equal(gate({ configured_policy_digest: "c".repeat(64) }).ok, false));
test("confirmation mismatch fails", () => assert.equal(gate({ confirmation: "yes" }).ok, false));
for (const value of ["", "A".repeat(32), "a".repeat(31), "a".repeat(65), "g".repeat(32), ` ${nonce}`, `${nonce} `, `${nonce}\n`]) {
  test(`invalid nonce ${JSON.stringify(value)} has the nonce reason`, () => assert.equal(gate({ approval_nonce: value }).reason_code, "manual_bounded_nonce_invalid"));
}
test("missing approval fails", () => assert.equal(gate({ bounded_approval: "" }).ok, false));
test("approval with an extra colon fails", () => assert.equal(gate({ bounded_approval: `${expectedManualMarketBoundedApproval(digest, sha, nonce)}:extra` }).reason_code, "manual_bounded_approval_mismatch"));
test("automatic write false fails", () => assert.equal(gate({ automatic_write_enabled: "false" }).ok, false));
test("bounded persistence false fails", () => assert.equal(gate({ bounded_persistence_enabled: "false" }).ok, false));
test("wrong rollout stage fails", () => assert.equal(gate({ stage: "market-shadow" }).ok, false));
test("configured rollout stage market-bounded passes", () => assert.equal(gate().ok, true));
test("configured rollout stage disabled fails", () => assert.equal(gate({ configured_stage: "disabled" }).ok, false));
test("configured rollout stage missing fails", () => assert.equal(gate({ configured_stage: "" }).ok, false));
test("configured rollout stage mismatch fails even when fixed stage is correct", () => assert.equal(gate({ stage: "market-bounded", configured_stage: "market-shadow" }).ok, false));
test("configured rollout stage trims surrounding whitespace", () => assert.equal(gate({ configured_stage: " market-bounded " }).ok, true));
for (const value of ["MARKET-BOUNDED", "Market-Bounded", "market-Bounded"]) {
  test(`configured stage ${value} is case-sensitive`, () => assert.equal(gate({ configured_stage: value }).reason_code, "manual_bounded_contract_invalid"));
}
test("run attempt two fails with the dedicated reason", () => assert.equal(gate({ run_attempt: "2" }).reason_code, "manual_bounded_run_attempt_invalid"));
test("schedule approval cannot authorize manual gate", () => assert.equal(gate({ bounded_approval: `APPROVE_MARKET_BOUNDED:${digest}:${sha}` }).ok, false));
test("gate result never stores approval or nonce", () => assert.doesNotMatch(JSON.stringify(gate()), /APPROVE|bbbbbbbb/));
test("strict approval parser returns only policy head and nonce", () => {
  assert.deepEqual(parseManualMarketBoundedApproval(expectedManualMarketBoundedApproval(digest, sha, nonce)), { policy_digest: digest, head_sha: sha, approval_nonce: nonce });
});
test("strict approval parser rejects surrounding whitespace and a final newline", () => {
  const approval = expectedManualMarketBoundedApproval(digest, sha, nonce);
  assert.throws(() => parseManualMarketBoundedApproval(` ${approval}`));
  assert.throws(() => parseManualMarketBoundedApproval(`${approval}\n`));
});
test("nonce fingerprinting never trims or lowercases", () => {
  assert.throws(() => approvalNonceSha256(` ${nonce}`));
  assert.throws(() => approvalNonceSha256(nonce.toUpperCase()));
});

test("workflow_dispatch is the only trigger", () => {
  assert.match(workflow, /^on:\s*\r?\n\s+workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s+(schedule|push|pull_request|workflow_run|repository_dispatch):/m);
});
test("workflow has only required approval inputs", () => {
  for (const name of ["expected_main_sha", "expected_policy_digest", "confirmation"]) assert.match(workflow, new RegExp(`^\\s{6}${name}:`, "m"));
  assert.equal((workflow.match(/^\s{6}[a-z_]+:\s*$/gm) ?? []).length, 3);
  assert.doesNotMatch(workflow, /approval_nonce:|MANUAL_APPROVAL_NONCE|inputs\.approval_nonce|github\.event\.inputs\.approval_nonce/);
  assert.doesNotMatch(workflow, /^\s{6}(task|stage|limit|priority|release|source_scope|execute_sources|mode):/m);
});
test("approval comes only from the bounded approval Actions Secret", () => {
  assert.doesNotMatch(workflow, /vars\.AUTOMATIC_INGESTION_BOUNDED_APPROVAL/);
  assert.match(workflow, /AUTOMATIC_INGESTION_BOUNDED_APPROVAL: \$\{\{ secrets\.AUTOMATIC_INGESTION_BOUNDED_APPROVAL \}\}/);
  assert.doesNotMatch(workflow, /--(?:approval|nonce)=/);
  assert.match(workflow, /name: \$\{\{ steps\.claim\.outputs\.claim_name \}\}/);
});
test("workflow fixes the market contract", () => {
  assert.match(workflow, /--mode=dry-run[\s\S]*--limit=5[\s\S]*--priority=1[\s\S]*--release=released[\s\S]*--source-scope=planner-apis[\s\S]*--execute-sources/);
  assert.match(workflow, /stage:\s*"?market-bounded|--stage=market-bounded|stage: market-bounded/);
});
test("manual and Production workflows share non-cancelling concurrency", () => {
  assert.match(workflow, /group: gacha-ingestion\s+cancel-in-progress: false/);
  assert.match(productionWorkflow, /group: gacha-ingestion\s+cancel-in-progress: false/);
});
test("workflow has minimal permissions", () => assert.match(workflow, /permissions:\s+contents: read\s+actions: read/));
for (const forbidden of ["db:upsert-all", "canary-write", "db:cleanup", "cleanup-provisional", "gh workflow enable", "gh workflow disable", "gh variable set", "migration"]) {
  test(`workflow excludes ${forbidden}`, () => assert.doesNotMatch(workflow, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
}
test("workflow uploads a Run-scoped artifact", () => assert.match(workflow, /market-bounded-manual-result-\$\{\{ github\.run_id \}\}/));
test("workflow scans then verifies before uploading final artifact", () => {
  const scanIndex = workflow.indexOf("Scan sanitized manual bounded artifact");
  const verifyIndex = workflow.indexOf("Enforce final manual bounded result");
  const uploadIndex = workflow.indexOf("Upload sanitized manual bounded artifact");
  assert.ok(scanIndex < verifyIndex && verifyIndex < uploadIndex);
});
test("final artifact upload requires successful secret scan", () => assert.match(workflow, /Upload sanitized manual bounded artifact\s+if: \$\{\{ always\(\) && steps\.scan\.outcome == 'success' \}\}/));
test("secret scan failure cannot upload any final or failure artifact", () => assert.doesNotMatch(workflow, /Upload (?:failure|sanitized manual bounded) artifact\s+if: \$\{\{ always\(\) \}\}/));
test("approval claim upload and verification precede source fetch", () => {
  assert.ok(workflow.indexOf("Upload one-run approval claim") < workflow.indexOf("Verify one-run approval claim"));
  assert.ok(workflow.indexOf("Verify one-run approval claim") < workflow.indexOf("Run fixed fresh market dry-run"));
});
test("claim upload failure blocks source fetch by default step semantics", () => {
  const claimUpload = workflow.slice(workflow.indexOf("Upload one-run approval claim"), workflow.indexOf("Verify one-run approval claim"));
  assert.doesNotMatch(claimUpload, /if:\s*\$\{\{\s*always/);
  assert.match(claimUpload, /if-no-files-found: error/);
});
test("both process-level dry-run write guards are true", () => {
  assert.match(workflow, /INGESTION_WRITE_DISABLED: "true"/);
  assert.match(workflow, /MARKET_BACKFILL_WRITE_DISABLED: "true"/);
});
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
test("exact operation and Production deltas pass", () => {
  const operations = { listings: [{ operation: "insert" }, { operation: "update" }], observations: [{ operation: "insert" }, { operation: "insert" }], durable_run: "insert" };
  const deltas = { market_listings: 1, market_listing_observations: 2, ingestion_runs: 1, import_issues: 0, review_required: 0, series: 0, variants: 0, stock_reports: 0, restock_events: 0 };
  assert.equal(validateManualMarketBoundedExactDeltas({ operations, persisted_deltas: deltas, snapshot_deltas: deltas }).ok, true);
});
for (const [name, persisted, snapshot] of [
  ["listing insert delta mismatch", { market_listings: 1 }, { market_listings: 0 }],
  ["listing update unexpected count delta", { market_listings: 0 }, { market_listings: 1 }],
  ["observation delta mismatch", { market_listing_observations: 2 }, { market_listing_observations: 1 }],
  ["ingestion run delta mismatch", { ingestion_runs: 1 }, { ingestion_runs: 0 }],
  ["forbidden table delta mismatch", { import_issues: 0 }, { import_issues: 1 }],
]) {
  test(name, () => {
    const operations = { listings: name.includes("listing insert") ? [{ operation: "insert" }] : name.includes("listing update") ? [{ operation: "update" }] : [], observations: name.includes("observation") ? [{ operation: "insert" }, { operation: "insert" }] : [], durable_run: name.includes("ingestion") ? "insert" : "unchanged" };
    const baseline = { market_listings: 0, market_listing_observations: 0, ingestion_runs: 0, import_issues: 0, review_required: 0, series: 0, variants: 0, stock_reports: 0, restock_events: 0 };
    assert.throws(() => validateManualMarketBoundedExactDeltas({ operations, persisted_deltas: { ...baseline, ...persisted }, snapshot_deltas: { ...baseline, ...snapshot } }));
  });
}

test("new nonce has no prior claim", () => {
  const fingerprint = approvalNonceSha256(nonce);
  assert.equal(validateManualApprovalClaimReuse({ artifacts: [], approval_nonce_sha256: fingerprint, current_run_id: "100", current_run_attempt: "1" }).ok, true);
});
test("previously claimed nonce fails closed", () => {
  const fingerprint = approvalNonceSha256(nonce);
  assert.throws(() => validateManualApprovalClaimReuse({ artifacts: [{ name: `manual-bounded-approval-claim-${fingerprint}`, expired: false, workflow_run: { id: "99", run_attempt: "1" } }], approval_nonce_sha256: fingerprint, current_run_id: "100", current_run_attempt: "1" }), /already been consumed/);
});
test("expired prior claim also fails closed with the reuse reason", () => {
  const fingerprint = approvalNonceSha256(nonce);
  assert.throws(
    () => validateManualApprovalClaimReuse({ artifacts: [{ name: `manual-bounded-approval-claim-${fingerprint}`, expired: true, workflow_run: { id: "99", run_attempt: "1" } }], approval_nonce_sha256: fingerprint, current_run_id: "100", current_run_attempt: "1" }),
    (error) => error.reason_code === "manual_bounded_approval_already_consumed",
  );
});
test("current one-run claim verifies exactly once", () => {
  const fingerprint = approvalNonceSha256(nonce);
  assert.equal(validateManualApprovalClaimReuse({ artifacts: [{ name: `manual-bounded-approval-claim-${fingerprint}`, expired: false, workflow_run: { id: "100", run_attempt: "1" } }], approval_nonce_sha256: fingerprint, current_run_id: "100", current_run_attempt: "1", require_current: true }).current_claim_count, 1);
});
test("two current Run claims fail closed", () => {
  const fingerprint = approvalNonceSha256(nonce);
  const claim = { name: `manual-bounded-approval-claim-${fingerprint}`, expired: false, workflow_run: { id: "100", run_attempt: "1" } };
  assert.throws(() => validateManualApprovalClaimReuse({ artifacts: [claim, { ...claim, expired: true }], approval_nonce_sha256: fingerprint, current_run_id: "100", current_run_attempt: "1", require_current: true }));
});
test("claim contains fingerprint but no raw nonce or approval", () => {
  const claim = buildManualApprovalClaim({ nonce, workflow_run_id: "100", workflow_run_attempt: "1", head_sha: sha, policy_digest: digest, created_at: "2026-08-02T00:00:00.000Z" });
  const serialized = JSON.stringify(claim);
  assert.equal(claim.approval_nonce_sha256, approvalNonceSha256(nonce));
  assert.doesNotMatch(serialized, new RegExp(nonce));
  assert.doesNotMatch(serialized, /APPROVE_MARKET_BOUNDED/);
});
test("claim rejects fields outside the upload allowlist", () => {
  const claim = buildManualApprovalClaim({ nonce, workflow_run_id: "100", workflow_run_attempt: "1", head_sha: sha, policy_digest: digest, created_at: "2026-08-02T00:00:00.000Z" });
  assert.throws(() => validateManualApprovalClaimShape({ ...claim, raw_approval: nonce }), /unexpected or invalid fields/);
});
test("unexpected active Production Run blocks", () => assert.throws(() => validateManualActiveRuns({ runs: [{ id: "200", name: "Gacha ingestion", status: "in_progress" }], current_run_id: "100" })));
test("current Run and known orphan are excluded without operation", () => {
  const result = validateManualActiveRuns({ runs: [{ id: "100", name: "Gacha Market Bounded Manual Production", status: "in_progress" }, { id: KNOWN_ORPHANED_RUN_ID, name: "Gacha ingestion", status: "queued" }], current_run_id: "100" });
  assert.equal(result.blocking_run_count, 0);
  assert.equal(result.known_orphan_excluded, true);
});
test("claim artifacts become deduplicated throttle history including expired claims", () => {
  const rows = buildManualApprovalAttemptRows({ artifacts: [
    { name: "manual-bounded-approval-claim-a", expired: true, created_at: "2026-08-01T01:00:00Z", workflow_run: { id: "10" } },
    { name: "manual-bounded-approval-claim-b", expired: false, created_at: "2026-08-01T01:05:00Z", workflow_run: { id: "10" } },
    { name: "manual-bounded-approval-claim-c", expired: false, created_at: "2026-08-01T02:00:00Z", workflow_run: { id: "11" } },
    { name: "unrelated", expired: false, created_at: "", workflow_run: {} },
  ], current_run_id: "11" });
  assert.deepEqual(rows, [{ id: "10", task: "market", status: "succeeded", finished_at: "2026-08-01T01:00:00.000Z", summary: { rollout_stage: "market-bounded" } }]);
});
test("incomplete claim attempt metadata fails closed", () => assert.throws(() => buildManualApprovalAttemptRows({ artifacts: [{ name: "manual-bounded-approval-claim-a", workflow_run: {} }], current_run_id: "11" })));
test("three candidates fail instead of truncating", () => assert.throws(() => validateManualMarketBoundedOutcome({ candidates: 3, database_writes: 0 })));
test("more than two listing operations fail", () => assert.throws(() => validateManualMarketBoundedOutcome({ candidates: 2, operations: { listings: Array.from({ length: 3 }, () => ({ operation: "insert" })) }, database_writes: 3 })));
test("more than two observation operations fail", () => assert.throws(() => validateManualMarketBoundedOutcome({ candidates: 2, operations: { observations: Array.from({ length: 3 }, () => ({ operation: "insert" })) }, database_writes: 3 })));
test("forbidden table delta fails", () => assert.throws(() => validateManualMarketBoundedOutcome({ candidates: 0, database_writes: 0, deltas: { review_required: 1 } })));
test("negative allowed-table delta fails closed", () => assert.throws(() => validateManualMarketBoundedOutcome({ candidates: 0, database_writes: 0, deltas: { market_listings: -1 } })));
test("runner persists a workflow_dispatch durable row", () => assert.match(runner, /trigger_source:\s*"workflow_dispatch"[\s\S]*execution_path:\s*"manual-bounded"/));
test("runner preserves durable operation for final write-budget verification", () => assert.match(runner, /withDurableOperation\([\s\S]*outcome\.operations\?\.durable_run/));
test("runner reuses one durable UUID for snapshot and durable row", () => {
  assert.doesNotMatch(runner, /stableId\("market-bounded-manual-run"/);
  assert.equal((runner.match(/buildManualMarketBoundedDurableRunId\(/g) ?? []).length, 1);
  assert.match(runner, /const runId = buildManualMarketBoundedDurableRunId\([\s\S]*store\.fetchRowsByIds\("ingestion_runs", \[runId\]\)[\s\S]*durableRunRow\(\{ id: runId,/);
});
test("runner reuses bounded identity idempotency and rollback", () => {
  assert.match(runner, /validateMarketBoundedPlanIdentity/);
  assert.match(runner, /buildMarketBoundedRows/);
  assert.match(runner, /persistMarketBounded/);
});
test("runner secret scan includes approval environment values", () => assert.match(runner, /APPROVAL\|NONCE/));
test("runner never writes the approval or nonce into reports", () => assert.doesNotMatch(runner, /writeJson\([^\n]*(approval_nonce|bounded_approval)/));
test("runner derives the nonce only from the strict bounded approval parser", () => {
  assert.match(runner, /parseManualMarketBoundedApproval\(process\.env\.AUTOMATIC_INGESTION_BOUNDED_APPROVAL\)/);
  assert.doesNotMatch(runner, /MANUAL_APPROVAL_NONCE/);
});
test("runner fetches GitHub active rows instead of hardcoding an empty array", () => {
  assert.match(runner, /fetchGithubActiveRuns/);
  assert.doesNotMatch(runner, /github_rows:\s*\[\]/);
});
test("runner rechecks safety before persistence", () => assert.ok((runner.match(/loadSafetyState\(/g) ?? []).length >= 3));
test("runner separates active rows from claim attempt throttle rows", () => {
  assert.match(runner, /githubActiveRows[\s\S]*githubAttemptRows/);
  assert.match(runner, /validateManualActiveRuns\(\{ runs: githubActiveRows/);
  assert.match(runner, /github_rows: githubAttemptRows/);
});
test("runner fails closed on unavailable or incomplete GitHub pagination", () => {
  assert.match(runner, /if \(!response\.ok\) throw manualError\("manual_bounded_github_state_unavailable"\)/);
  assert.match(runner, /expectedTotal[\s\S]*rows\.length === expectedTotal[\s\S]*manual_bounded_github_state_unavailable/);
  assert.match(runner, /typeof artifact\?\.expired !== "boolean"[\s\S]*manual_bounded_github_state_unavailable/);
});
test("final verification repeats exact three-way delta validation", () => assert.ok((runner.match(/validateManualMarketBoundedExactDeltas\(/g) ?? []).length >= 2));
test("runner rolls back an exact-delta failure", () => assert.match(runner, /validateManualMarketBoundedExactDeltas[\s\S]*rollbackMarketBounded/));
