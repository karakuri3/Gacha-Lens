import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildManualMarketBoundedFailureDiagnostic,
  MANUAL_MARKET_BOUNDED_CHECKPOINTS,
  manualMarketBoundedCheckpointReasonCode,
  normalizeManualMarketBoundedCheckpoint,
} from "../lib/domain/manual-market-bounded-diagnostics.js";
import {
  buildMarketBoundedResult,
  renderMarketBoundedResultMarkdown,
} from "../lib/domain/market-bounded-write.js";

const workflow = fs.readFileSync(".github/workflows/gacha-market-bounded-manual.yml", "utf8");
const runner = fs.readFileSync("scripts/manual-market-bounded-persistence.mjs", "utf8");
const diagnosticSource = fs.readFileSync("lib/domain/manual-market-bounded-diagnostics.js", "utf8");
const secretReference = "AUTOMATIC_INGESTION_BOUNDED_APPROVAL: ${{ secrets.AUTOMATIC_INGESTION_BOUNDED_APPROVAL }}";

function stepBlock(name) {
  const start = workflow.indexOf(`- name: ${name}`);
  assert.notEqual(start, -1, `${name} step is missing`);
  const next = workflow.indexOf("\n      - name:", start + 1);
  return workflow.slice(start, next === -1 ? workflow.length : next);
}

test("approval Repository Variable is removed", () => {
  assert.doesNotMatch(workflow, /vars\.AUTOMATIC_INGESTION_BOUNDED_APPROVAL/);
});

test("approval uses the Actions Secret only in required steps", () => {
  const jobEnv = workflow.slice(workflow.indexOf("    env:"), workflow.indexOf("    steps:"));
  assert.doesNotMatch(jobEnv, /AUTOMATIC_INGESTION_BOUNDED_APPROVAL/);
  const requiredSteps = [
    "Verify manual approval secret",
    "Run manual bounded preflight",
    "Create one-run approval claim",
    "Verify one-run approval claim",
    "Run manual bounded persistence",
    "Scan sanitized manual bounded artifact",
  ];
  for (const name of requiredSteps) assert.match(stepBlock(name), new RegExp(secretReference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal((workflow.match(/secrets\.AUTOMATIC_INGESTION_BOUNDED_APPROVAL/g) ?? []).length, requiredSteps.length);
});

test("approval secret fails closed and is masked before source fetch", () => {
  const verify = stepBlock("Verify manual approval secret");
  assert.match(verify, /test -n "\$AUTOMATIC_INGESTION_BOUNDED_APPROVAL"/);
  assert.match(verify, /echo "::add-mask::\$AUTOMATIC_INGESTION_BOUNDED_APPROVAL"/);
  assert.ok(workflow.indexOf("Verify manual approval secret") < workflow.indexOf("Run fixed fresh market dry-run"));
});

test("approval and nonce cannot be workflow inputs or CLI arguments", () => {
  assert.doesNotMatch(workflow, /^\s{6}(approval|approval_nonce|nonce):/m);
  assert.doesNotMatch(workflow, /--(?:approval|nonce)=/);
  assert.doesNotMatch(workflow, /GITHUB_OUTPUT[^\n]*(?:APPROVAL|NONCE)/i);
});

test("secret scan receives the approval Secret", () => {
  assert.match(stepBlock("Scan sanitized manual bounded artifact"), /secrets\.AUTOMATIC_INGESTION_BOUNDED_APPROVAL/);
});

test("all allowlisted checkpoints are accepted with stable reason codes", () => {
  for (const checkpoint of MANUAL_MARKET_BOUNDED_CHECKPOINTS) {
    assert.equal(normalizeManualMarketBoundedCheckpoint(checkpoint), checkpoint);
    assert.equal(manualMarketBoundedCheckpointReasonCode(checkpoint), `manual_bounded_${checkpoint}_failed`);
  }
});

test("unknown checkpoints and error categories fail closed", () => {
  const diagnostic = buildManualMarketBoundedFailureDiagnostic({ checkpoint: "raw_database_call", error_category: "http" });
  assert.equal(diagnostic.checkpoint, "unknown");
  assert.equal(diagnostic.checkpoint_reason_code, "manual_bounded_unknown_failed");
  assert.equal(diagnostic.error_category, "unknown");
});

test("safe upstream reason is retained and malformed reason is removed", () => {
  assert.equal(buildManualMarketBoundedFailureDiagnostic({ upstream_reason_code: "bounded_verification_failed" }).upstream_reason_code, "bounded_verification_failed");
  assert.equal(buildManualMarketBoundedFailureDiagnostic({ upstream_reason_code: "bounded failed: https://example.invalid" }).upstream_reason_code, null);
  assert.equal(buildManualMarketBoundedFailureDiagnostic({ upstream_reason_code: "a".repeat(101) }).upstream_reason_code, null);
});

test("diagnostic output excludes raw exceptions and secrets", () => {
  const secret = "synthetic-approval-value-never-store";
  const diagnostic = buildManualMarketBoundedFailureDiagnostic({
    checkpoint: "existing_rows_snapshot",
    upstream_reason_code: "bounded_verification_failed",
    error_category: "database",
    persistence_invoked: false,
    rollback_attempted: false,
    rollback_verified: false,
    message: `Authorization: Bearer ${secret}`,
    stack: `https://supabase.invalid/${secret}`,
    approval: secret,
    nonce: secret,
  });
  assert.deepEqual(Object.keys(diagnostic), [
    "checkpoint",
    "checkpoint_reason_code",
    "upstream_reason_code",
    "error_category",
    "persistence_invoked",
    "rollback_attempted",
    "rollback_verified",
  ]);
  assert.doesNotMatch(JSON.stringify(diagnostic), new RegExp(secret));
  assert.doesNotMatch(JSON.stringify(diagnostic), /Authorization|https?:|stack|message|approval|nonce/i);
});

test("persist checkpoints precede their guarded operations", () => {
  const ordered = [
    "policy_load",
    "arming_gate_revalidation",
    "safety_state_revalidation",
    "production_snapshot_revalidation",
    "audit_load",
    "preview_revalidation",
    "plan_identity_revalidation",
    "bounded_rows_build",
    "existing_rows_snapshot",
    "approval_fingerprint",
    "bounded_persistence",
    "bounded_outcome_validation",
    "production_after_snapshot",
    "exact_delta_validation",
    "result_build",
  ];
  const positions = ordered.map((checkpoint) => runner.indexOf(`checkpoint = "${checkpoint}"`));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual([...positions].sort((left, right) => left - right), positions);
  const operations = [
    "loadAutomaticIngestionRolloutPolicy(policyPath)",
    "validateManualGate(digest)",
    "loadSafetyState({ requireCurrentClaim: true })",
    "assertCountsEqual(preflightReport.production_snapshot?.counts, safety.counts)",
    "fs.readFileSync(auditPath)",
    "const preview = readJson",
    "validateMarketBoundedPlanIdentity",
    "buildMarketBoundedRows",
    "store.fetchRowsByIds",
    "approvalNonceSha256",
    "persistMarketBounded",
  ];
  operations.forEach((operation, index) => assert.ok(positions[index] < runner.indexOf(operation, positions[index])));
});

test("failure Artifact retains sanitized checkpoint without raw failure text", () => {
  const secret = "synthetic-sensitive-failure";
  const failureDiagnostic = buildManualMarketBoundedFailureDiagnostic({
    checkpoint: "existing_rows_snapshot",
    upstream_reason_code: "bounded_verification_failed",
    error_category: "database",
  });
  const result = buildMarketBoundedResult({
    workflow: { run_id: "1", run_attempt: "1", head_sha: "a".repeat(40), event_name: "workflow_dispatch", ref: "refs/heads/main" },
    plan: { policy_digest: "b".repeat(64), audit_digest: "c".repeat(64), plan_digest: "d".repeat(64) },
    status: "blocked",
    reason_code: "bounded_verification_failed",
    error_category: "database",
    error_message: `Authorization: Bearer ${secret}`,
    failure_diagnostic: { ...failureDiagnostic, message: secret, stack: secret, approval: secret, nonce: secret },
    database_writes: 0,
  });
  const json = JSON.stringify(result);
  const markdown = renderMarketBoundedResultMarkdown(result);
  assert.equal(result.failure_diagnostic.checkpoint, "existing_rows_snapshot");
  assert.match(markdown, /Failure checkpoint: existing_rows_snapshot/);
  assert.match(markdown, /Checkpoint reason code: manual_bounded_existing_rows_snapshot_failed/);
  assert.match(markdown, /Persistence invoked: false/);
  assert.doesNotMatch(`${json}\n${markdown}`, new RegExp(secret));
  assert.doesNotMatch(`${json}\n${markdown}`, /Authorization: Bearer|raw stack/i);
});

test("gate state is preserved after later checkpoint failures", () => {
  assert.match(runner, /bounded_approval_valid: gate\?\.bounded_approval_valid === true/);
  assert.doesNotMatch(runner, /bounded_approval_valid: false, failure_diagnostic/);
});

test("diagnostic module does not inspect raw errors or environment values", () => {
  assert.doesNotMatch(diagnosticSource, /process\.env|error\.message|error\.stack|Authorization|Cookie|https?:\/\//);
});
