import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  AUTOMATIC_INGESTION_ROLLOUT_REASON_CODES,
  buildAutomaticMarketRolloutPlan,
  buildGithubThrottleHistoryRows,
  buildSanitizedRolloutReport,
  calculateAutomaticIngestionRolloutPolicyDigest,
  evaluateAutomaticIngestionRollout,
  evaluateAutomaticIngestionThrottle,
  evaluateAutomaticMarketCandidate,
  findAutomaticIngestionRolloutSecretLeaks,
  loadAutomaticIngestionRolloutPolicy,
  renderAutomaticIngestionShadowReportMarkdown,
  renderAutomaticMarketRolloutPlanMarkdown,
  resolveAutomaticIngestionRolloutStage,
  validateAutomaticIngestionRolloutPolicy,
} from "../lib/domain/automatic-ingestion-rollout.js";

const policyPath = "config/automatic-ingestion-rollout-policy.json";
const policySource = fs.readFileSync(policyPath);
const { policy, digest } = loadAutomaticIngestionRolloutPolicy(policyPath);
const productionWorkflow = fs.readFileSync(".github/workflows/gacha-ingestion.yml", "utf8");
const rolloutScript = fs.readFileSync("scripts/automatic-ingestion-rollout.mjs", "utf8");
const simulationWorkflow = fs.readFileSync(".github/workflows/gacha-ingestion-rollout-simulation.yml", "utf8");
const manualWorkflow = fs.readFileSync(".github/workflows/gacha-market-manual-audit.yml", "utf8");
const safetyWorkflow = fs.readFileSync(".github/workflows/gacha-ingestion-safety-check.yml", "utf8");

test("policy schema version 1 validates", () => assert.equal(validateAutomaticIngestionRolloutPolicy(policy), true));
test("policy default stage is disabled", () => assert.equal(policy.default_stage, "disabled"));
test("missing stage resolves disabled", () => assert.equal(resolveAutomaticIngestionRolloutStage("", policy), "disabled"));
test("undefined stage resolves disabled", () => assert.equal(resolveAutomaticIngestionRolloutStage(undefined, policy), "disabled"));
test("unknown stage fails closed", () => assert.throws(() => resolveAutomaticIngestionRolloutStage("unknown", policy), /Unknown automatic/));
test("missing policy fails closed", () => assert.throws(() => validateAutomaticIngestionRolloutPolicy(null), /schema/));
test("unknown policy stage fails closed", () => {
  const value = clone(policy);
  value.stages.other = {};
  assert.throws(() => validateAutomaticIngestionRolloutPolicy(value), /stages/);
});
test("unsafe bounded limit fails policy validation", () => {
  const value = clone(policy);
  value.stages["market-bounded"].max_listing_writes = 3;
  assert.throws(() => validateAutomaticIngestionRolloutPolicy(value), /unsafe/);
});
test("missing bounded limit fails policy validation", () => {
  const value = clone(policy);
  delete value.stages["market-bounded"].max_listing_writes;
  assert.throws(() => validateAutomaticIngestionRolloutPolicy(value), /unsafe/);
});
test("weakened throttle fails policy validation", () => {
  const value = clone(policy);
  value.stages["market-shadow"].max_runs_per_24_hours = 0;
  assert.throws(() => validateAutomaticIngestionRolloutPolicy(value), /contract/);
});
test("policy digest is deterministic", () => assert.equal(calculateAutomaticIngestionRolloutPolicyDigest(policySource), digest));
test("canonical object digest is deterministic", () => assert.equal(calculateAutomaticIngestionRolloutPolicyDigest({ b: 2, a: 1 }), calculateAutomaticIngestionRolloutPolicyDigest({ a: 1, b: 2 })));
test("policy content change changes digest", () => assert.notEqual(calculateAutomaticIngestionRolloutPolicyDigest(`${policySource}\n `), digest));
test("policy digest is lowercase sha256", () => assert.match(digest, /^[0-9a-f]{64}$/));

for (const task of ["market", "official", "stock"]) {
  test(`disabled stage blocks scheduled ${task}`, () => {
    const result = rollout({ stage: "disabled", task, schedule: scheduleFor(task) });
    assert.equal(result.ok, false);
    assert.equal(result.reason_code, "rollout_stage_disabled");
    assert.equal(result.persistence_authorized, false);
  });
}
test("disabled stage never starts ingestion", () => assert.equal(rollout({ stage: "disabled" }).action, "blocked"));
test("disabled stage never allows writes", () => assert.equal(rollout({ stage: "disabled" }).production_writes_allowed, false));
test("invalid stage reports explicit validation reason", () => assert.equal(rollout({ stage: "invalid" }).reason_code, "rollout_stage_invalid"));
test("official rollout is not enabled", () => assert.equal(rollout({ stage: "market-shadow", task: "official", schedule: "7 * * * *" }).reason_code, "rollout_task_not_enabled"));
test("stock rollout is not enabled", () => assert.equal(rollout({ stage: "market-shadow", task: "stock", schedule: "37 * * * *" }).reason_code, "rollout_task_not_enabled"));
test("all rollout is not enabled", () => assert.equal(rollout({ stage: "market-shadow", task: "all" }).reason_code, "rollout_task_not_enabled"));
test("manual bounded rollout is blocked", () => assert.equal(rollout({ stage: "market-bounded", event_name: "workflow_dispatch", configured_policy_digest: digest, automatic_write_enabled: "true" }).reason_code, "rollout_task_not_enabled"));
test("market schedule mismatch fails closed", () => assert.equal(rollout({ stage: "market-shadow", schedule: "37 * * * *" }).reason_code, "rollout_schedule_mismatch"));
test("unavailable durable run history fails closed", () => assert.equal(rollout({ durable_run_store_available: false }).reason_code, "durable_run_store_unavailable"));
test("unavailable Production snapshot fails closed", () => assert.equal(rollout({ production_snapshot_available: false }).reason_code, "production_snapshot_unavailable"));
test("active concurrency fails closed", () => assert.equal(rollout({ concurrency: { available: true, active_count: 1, stale_count: 0 } }).reason_code, "concurrent_run_detected"));
test("stale concurrency fails closed", () => assert.equal(rollout({ concurrency: { available: true, active_count: 0, stale_count: 1 } }).reason_code, "stale_running_record_detected"));
test("open circuit fails closed", () => assert.equal(rollout({ circuit_breaker: { available: true, state: "open" } }).reason_code, "recent_failure_circuit_open"));
test("unavailable circuit history fails closed", () => assert.equal(rollout({ circuit_breaker: { available: false, state: "unavailable" } }).reason_code, "durable_run_store_unavailable"));

test("shadow converts market schedule to dry-run contract", () => assert.equal(rollout({ stage: "market-shadow" }).contract.mode, "dry-run"));
for (const [key, expected] of [
  ["limit", 5], ["priority", "1"], ["release", "released"],
  ["source_scope", "planner-apis"], ["execute_sources", true],
]) test(`shadow fixes ${key}`, () => assert.equal(rollout({ stage: "market-shadow" }).contract[key], expected));
test("shadow action is prediction only", () => assert.equal(rollout({ stage: "market-shadow" }).action, "shadow"));
test("shadow prohibits Production writes", () => assert.equal(rollout({ stage: "market-shadow" }).production_writes_allowed, false));
test("shadow persistence authorization is always false", () => assert.equal(rollout({ stage: "market-shadow" }).persistence_authorized, false));
test("bounded digest missing fails closed", () => assert.equal(rollout({ stage: "market-bounded", automatic_write_enabled: "true" }).reason_code, "rollout_policy_digest_missing"));
test("bounded digest mismatch fails closed", () => assert.equal(rollout({ stage: "market-bounded", configured_policy_digest: "f".repeat(64), automatic_write_enabled: "true" }).reason_code, "rollout_policy_digest_mismatch"));
test("bounded kill switch false fails closed", () => assert.equal(rollout({ stage: "market-bounded", configured_policy_digest: digest, automatic_write_enabled: "false" }).reason_code, "automatic_ingestion_disabled"));
test("bounded valid gates authorize only the dedicated bounded path", () => {
  const result = rollout({ stage: "market-bounded", configured_policy_digest: digest, automatic_write_enabled: "true", bounded_persistence_enabled: "true", bounded_approval: `APPROVE_MARKET_BOUNDED:${digest}:${"a".repeat(40)}`, head_sha: "a".repeat(40) });
  assert.equal(result.ok, true);
  assert.equal(result.action, "bounded-plan");
  assert.equal(result.persistence_authorized, true);
});
test("bounded simulation permits prediction with kill switch false", () => {
  const result = rollout({ stage: "market-bounded", simulation: true, prediction_only: true, configured_policy_digest: digest, automatic_write_enabled: "false", event_name: "workflow_dispatch", schedule: "" });
  assert.equal(result.ok, true);
  assert.equal(result.action, "bounded-plan");
});

test("throttle is clear without matching history", () => assert.equal(throttle().state, "clear"));
test("shadow within 720 minutes is throttled", () => assert.equal(throttle({ history_rows: [completed(10)] }).reason_code, "rollout_throttled"));
test("shadow at 720 minutes is outside minimum interval", () => assert.equal(throttle({ history_rows: [completed(720)] }).reason_code, "rollout_daily_budget_exhausted"));
test("one run in 24 hours exhausts daily budget", () => assert.equal(throttle({ history_rows: [completed(800)] }).reason_code, "rollout_daily_budget_exhausted"));
test("run older than 24 hours is allowed", () => assert.equal(throttle({ history_rows: [completed(1441)] }).ok, true));
test("active same-task run blocks", () => assert.equal(throttle({ running_rows: [running(5)] }).state, "running"));
test("stale same-task run blocks", () => assert.equal(throttle({ running_rows: [running(31)] }).state, "stale"));
test("other task history is excluded", () => assert.equal(throttle({ history_rows: [{ ...completed(5), task: "official" }] }).ok, true));
test("other stage history is excluded", () => assert.equal(throttle({ history_rows: [{ ...completed(5), summary: { rollout_stage: "market-bounded" } }] }).ok, true));
test("market-shadow throttle counts only the dedicated allowed-attempt marker", () => {
  const rows = buildGithubThrottleHistoryRows([
    { id: 1, name: "ingestion-shadow-report-1", created_at: "2026-08-01T23:55:00.000Z", expired: false },
    { id: 2, name: "ingestion-rollout-throttle-market-shadow-market-2", created_at: "2026-08-01T23:55:00.000Z", expired: false },
    { id: 3, name: "ingestion-rollout-throttle-market-shadow-market-3", created_at: "2026-08-01T23:55:00.000Z", expired: true },
    { id: 4, name: "ingestion-rollout-throttle-market-shadow-market-x", created_at: "2026-08-01T23:55:00.000Z", expired: false },
  ], { stage: "market-shadow", task: "market" });
  assert.deepEqual(rows.map((row) => row.id), ["2"]);
  assert.equal(throttle({ github_rows: rows }).reason_code, "rollout_throttled");
});
test("market-bounded ignores GitHub artifacts and uses durable history only", () => {
  const artifacts = [{ id: 1, name: "ingestion-shadow-report-1", created_at: "2026-08-01T23:55:00.000Z", expired: false }];
  assert.deepEqual(buildGithubThrottleHistoryRows(artifacts, { stage: "market-bounded", task: "market" }), []);
  assert.equal(throttle({ stage: "market-bounded", github_rows: [], history_rows: [completedFor("market-bounded", 30)] }).reason_code, "rollout_throttled");
  assert.equal(throttle({ stage: "market-bounded", github_rows: [], history_rows: [completedFor("market-bounded", 800)] }).reason_code, "rollout_daily_budget_exhausted");
  assert.equal(throttle({ stage: "market-bounded", github_rows: [], history_rows: [completedFor("market-bounded", 1441)] }).ok, true);
});
test("generic blocked diagnostics cannot perpetually reset the bounded throttle", () => {
  const blockedArtifacts = [30, 60, 90].map((minutesAgo, index) => ({
    id: index + 1,
    name: `ingestion-shadow-report-${index + 1}`,
    created_at: new Date(new Date("2026-08-02T00:00:00.000Z") - minutesAgo * 60_000).toISOString(),
    expired: false,
  }));
  const githubRows = buildGithubThrottleHistoryRows(blockedArtifacts, { stage: "market-bounded", task: "market" });
  assert.deepEqual(githubRows, []);
  assert.equal(evaluateAutomaticIngestionThrottle({
    stage: "market-bounded",
    task: "market",
    policy: policy.stages["market-bounded"],
    history_rows: [completedFor("market-bounded", 1441)],
    running_rows: [],
    github_rows: githubRows,
    now: new Date("2026-08-02T00:00:00.000Z"),
  }).ok, true);
});
test("history fetch failure fails closed", () => assert.equal(throttle({ history_rows: null }).reason_code, "rollout_throttled"));
test("github metadata failure fails closed", () => assert.equal(throttle({ github_rows: null }).reason_code, "rollout_throttled"));
test("running fetch failure fails closed", () => assert.equal(throttle({ running_rows: null }).reason_code, "rollout_throttled"));
test("rollout runner treats missing GitHub metadata configuration as unavailable", () => {
  const source = fs.readFileSync("scripts/automatic-ingestion-rollout.mjs", "utf8");
  assert.match(source, /if \(!token \|\| !repository\) return null/);
});

test("fully safe candidate is auto eligible", () => assert.equal(evaluateAutomaticMarketCandidate(candidate()).eligible, true));
for (const [name, mutate, reason] of [
  ["review-required", (value) => { value.assessment.review_required = true; }, "candidate_not_accepted"],
  ["set", (value) => { value.listing.listing_type = "partial_set"; }, "listing_type_not_single"],
  ["sold", (value) => { value.listing.status = "sold"; }, "status_not_active"],
  ["multiple variant", (value) => { value.checks.multiple_variant_candidates = true; }, "multiple_variant_candidates"],
  ["explicit conflict", (value) => { value.checks.explicit_variant_conflict = true; }, "explicit_variant_conflict"],
  ["other explicit label", (value) => { value.checks.explicit_label_other_variant_match = true; }, "explicit_label_other_variant_match"],
  ["unresolved label", (value) => { value.checks.explicit_label_unresolved = true; }, "explicit_label_unresolved"],
  ["edition conflict", (value) => { value.checks.parent_series_edition_conflict = true; }, "parent_series_edition_conflict"],
  ["set signal", (value) => { value.checks.set_signal_detected = true; }, "set_signal_detected"],
  ["low confidence", (value) => { value.assessment.confidence = 0.85; }, "confidence_below_threshold"],
  ["unknown provider", (value) => { value.source.provider = "unknown"; }, "provider_not_allowed"],
  ["invalid key", (value) => { value.candidate_key = "BAD"; }, "candidate_key_invalid"],
  ["invalid price", (value) => { value.listing.price = 0; }, "price_invalid"],
  ["missing variant", (value) => { value.target.variant_id = ""; }, "variant_missing"],
  ["missing series", (value) => { value.target.series_id = ""; }, "series_missing"],
  ["missing variant evidence", (value) => { value.checks.variant_evidence_present = false; }, "variant_evidence_missing"],
  ["missing parent evidence", (value) => { value.checks.parent_series_evidence_present = false; }, "parent_evidence_missing"],
  ["wrong reason", (value) => { value.assessment.reason = "other"; }, "reason_not_confirmed"],
]) test(`${name} candidate is excluded`, () => {
  const value = candidate();
  mutate(value);
  const result = evaluateAutomaticMarketCandidate(value);
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes(reason));
});
test("Yahoo candidate is allowlisted", () => {
  const value = candidate();
  value.source.provider = "yahoo_shopping";
  assert.equal(evaluateAutomaticMarketCandidate(value).eligible, true);
});

test("two eligible candidates fit bounded budget", () => assert.equal(plan(auditWith(2)).auto_eligible_count, 2));
test("three eligible candidates reject whole run", () => {
  const error = capturePlanError(auditWith(3));
  assert.equal(error.reason_code, "rollout_budget_exceeded");
  assert.equal(error.plan.selected_candidate_keys.length, 3);
});
test("budget rejection retains the complete prediction plan for audit", () => {
  const error = capturePlanError(auditWith(3));
  assert.equal(error.plan.database_writes, 0);
  assert.equal(error.plan.budget_checks.state, "exceeded");
  assert.equal(error.plan.selected_candidate_keys.length, 3);
});
test("listing writes three reject", () => assert.equal(capturePlanError(auditWith(2), { listings: 3 }).reason_code, "rollout_budget_exceeded"));
test("observation writes three reject", () => assert.equal(capturePlanError(auditWith(2), { observations: 3 }).reason_code, "rollout_budget_exceeded"));
test("review-required write one rejects", () => assert.equal(capturePlanError(auditWith(1), { review_required: 1 }).reason_code, "rollout_budget_exceeded"));
test("candidate count 21 rejects", () => assert.equal(capturePlanError(auditWith(21)).reason_code, "rollout_budget_exceeded"));
test("selected variants six rejects", () => {
  const value = auditWith(1);
  value.selection.selected_variants = Array.from({ length: 6 }, (_, index) => selection(index));
  value.selection.selected_variant_count = 6;
  value.selection.query_count = 6;
  assert.equal(capturePlanError(value).reason_code, "rollout_budget_exceeded");
});
test("duplicate candidate keys reject as incomplete", () => {
  const value = auditWith(2);
  value.candidates[1].candidate_key = value.candidates[0].candidate_key;
  assert.throws(() => plan(value), (error) => error.reason_code === "rollout_plan_incomplete");
});
test("incomplete audit rejects", () => {
  const value = auditWith(1);
  value.result.report_complete = false;
  assert.throws(() => plan(value), (error) => error.reason_code === "rollout_plan_incomplete");
});
test("truncated audit rejects", () => {
  const value = auditWith(1);
  value.result.truncated_count = 1;
  assert.throws(() => plan(value), (error) => error.reason_code === "rollout_plan_incomplete");
});
test("nonzero audit writes reject", () => {
  const value = auditWith(1);
  value.database_writes.listings = 1;
  assert.throws(() => plan(value), (error) => error.reason_code === "rollout_plan_incomplete");
});
test("missing audit write counters reject", () => {
  const value = auditWith(1);
  delete value.database_writes.ingestion_runs;
  assert.throws(() => plan(value), (error) => error.reason_code === "rollout_plan_incomplete");
});
test("excluded candidates remain visible in prediction", () => {
  const value = auditWith(1);
  value.candidates[0].assessment.confidence = 0.2;
  normalizeAuditTotals(value);
  const result = plan(value);
  assert.deepEqual(result.selected_candidate_keys, []);
  assert.deepEqual(result.excluded_candidate_keys, [value.candidates[0].candidate_key]);
});
test("plan is prediction only with zero writes", () => {
  const result = plan(auditWith(1));
  assert.equal(result.prediction_only, true);
  assert.equal(result.persistence_authorized, false);
  assert.equal(result.database_writes, 0);
});
test("plan markdown says prediction and zero writes", () => assert.match(renderAutomaticMarketRolloutPlanMarkdown(plan(auditWith(1))), /Prediction only: true[\s\S]*Production writes: 0/));
test("shadow report omits titles and URLs", () => {
  const result = buildSanitizedRolloutReport({ plan: plan(auditWith(1)), run_id: "42", run_attempt: "1", event_name: "workflow_dispatch", ref: "refs/heads/main", main_sha_verified: true, request_diagnostics: { aggregate: { requests_attempted: 2 }, queries: [{ query: "secret product" }] } });
  const text = JSON.stringify(result);
  assert.doesNotMatch(text, /secret product|https?:\/\//);
  assert.equal(result.database_writes, 0);
});
test("shadow markdown says would-write is not approval", () => assert.match(renderAutomaticIngestionShadowReportMarkdown(buildReport()), /predictions, not approvals/));
test("secret scan catches actual secret", () => assert.deepEqual(findAutomaticIngestionRolloutSecretLeaks([{ name: "x", text: "private-value-123" }], ["private-value-123"]), ["x"]));
test("secret scan allows ordinary product wording", () => assert.deepEqual(findAutomaticIngestionRolloutSecretLeaks([{ name: "x", text: "Secret character" }]), []));

test("simulation workflow has workflow_dispatch only", () => {
  assert.match(simulationWorkflow, /^on:\s*\r?\n\s+workflow_dispatch:/m);
  assert.doesNotMatch(simulationWorkflow, /^\s+(schedule|push|pull_request|workflow_run|repository_dispatch):/m);
});
test("simulation task is fixed market", () => assert.match(simulationWorkflow, /BACKFILL_TASK:\s*market/));
test("simulation uses runner temp only after the job starts", () => {
  const jobEnv = simulationWorkflow.match(/jobs:[\s\S]*?\n\s+steps:/)?.[0] ?? "";
  assert.doesNotMatch(jobEnv, /runner\.temp/);
  assert.match(simulationWorkflow, /Run market shadow dry-run[\s\S]*MARKET_AUDIT_OUTPUT_DIR:\s*\$\{\{ runner\.temp \}\}/);
});
test("simulation exposes exactly two stage options", () => {
  const block = simulationWorkflow.match(/stage:[\s\S]*?jobs:/)?.[0] ?? "";
  assert.match(block, /market-shadow/);
  assert.match(block, /market-bounded/);
  assert.equal((block.match(/^\s+- market-/gm) ?? []).length, 2);
});
test("simulation fixes write-disabled environment", () => {
  assert.match(simulationWorkflow, /INGESTION_WRITE_DISABLED:\s*"true"/);
  assert.match(simulationWorkflow, /MARKET_BACKFILL_WRITE_DISABLED:\s*"true"/);
  assert.match(simulationWorkflow, /AUTOMATIC_INGESTION_WRITE_ENABLED:\s*"false"/);
});
for (const command of ["db:upsert-all", "canary-write", "db:cleanup", "cleanup-provisional", "migration"]) {
  test(`simulation excludes ${command}`, () => assert.doesNotMatch(simulationWorkflow, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
}
test("simulation uploads Run-scoped artifact", () => assert.match(simulationWorkflow, /ingestion-shadow-report-\$\{\{ github\.run_id \}\}/));
test("simulation scans secrets before upload", () => assert.ok(simulationWorkflow.indexOf("Scan sanitized rollout artifact") < simulationWorkflow.indexOf("Upload sanitized rollout artifact")));
test("simulation has exact main guard", () => assert.match(simulationWorkflow, /test "\$GITHUB_SHA" = "\$origin_main_sha"/));
test("simulation runs fixed market dry-run", () => assert.match(simulationWorkflow, /--mode=dry-run[\s\S]*--limit=5[\s\S]*--priority=1[\s\S]*--release=released[\s\S]*--source-scope=planner-apis/));

test("Production schedules remain unchanged", () => {
  for (const cron of ["7 * * * *", "17,47 * * * *", "37 * * * *"]) assert.match(productionWorkflow, new RegExp(cron.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal((productionWorkflow.match(/^\s+- cron:/gm) ?? []).length, 3);
});
test("scheduled throttle blocks are successful expected no-ops", () => {
  for (const [history, reason] of [
    [[completed(10)], "rollout_throttled"],
    [[completed(800)], "rollout_daily_budget_exhausted"],
  ]) {
    const result = rollout({ history_rows: history });
    assert.equal(result.reason_code, reason);
    assert.equal(result.expected_noop, true);
    assert.equal(result.expected_noop_reason, reason);
    assert.equal(result.production_writes_allowed, false);
  }
});
test("real automatic safety failures are not classified as expected no-ops", () => {
  for (const result of [
    rollout({ stage: "market-bounded", configured_policy_digest: "f".repeat(64), automatic_write_enabled: "true" }),
    rollout({ concurrency: { available: true, active_count: 1, stale_count: 0 } }),
    rollout({ schedule: "37 * * * *" }),
    rollout({ github_rows: null }),
  ]) assert.equal(result.expected_noop, false);
});
test("scheduled task selection precedes checkout and routes inactive tasks to explicit no-ops", () => {
  assert.ok(productionWorkflow.indexOf("Select ingestion task") < productionWorkflow.indexOf("Checkout full history for canary write"));
  assert.match(productionWorkflow, /"7 \* \* \* \*"\|"37 \* \* \* \*"\)[\s\S]*mode=scheduled-noop[\s\S]*scheduled_noop=true[\s\S]*scheduled_noop_reason=rollout_not_enabled_for_task/);
  assert.match(productionWorkflow, /"17,47 \* \* \* \*"\)[\s\S]*task=market[\s\S]*mode=rollout[\s\S]*execute_sources=true/);
  assert.match(productionWorkflow, /\*\)[\s\S]*Unsupported scheduled ingestion cron: \$SCHEDULE[\s\S]*exit 1/);
});
test("scheduled no-ops skip setup and all mutation-adjacent paths", () => {
  assert.match(productionWorkflow, /Report inactive scheduled ingestion task[\s\S]*Mode: scheduled-noop[\s\S]*Database writes: 0/);
  assert.match(productionWorkflow, /Checkout shallow history[\s\S]*scheduled_noop != 'true'/);
  assert.match(productionWorkflow, /actions\/setup-node@v6[\s\S]*scheduled_noop != 'true'/);
  assert.match(productionWorkflow, /- run: npm ci[\s\S]*scheduled_noop != 'true'/);
  assert.match(productionWorkflow, /Upload ingestion log[\s\S]*scheduled_noop != 'true'/);
  for (const name of ["Resolve rollout policy and throttle", "Run controlled market backfill", "Run bounded market persistence", "Run ingestion"]) {
    const block = productionWorkflow.slice(productionWorkflow.indexOf(`- name: ${name}`), productionWorkflow.indexOf("\n      - name:", productionWorkflow.indexOf(`- name: ${name}`) + 1));
    assert.doesNotMatch(block, /scheduled-noop/);
  }
});
test("scheduled no-ops cannot satisfy rollout, persistence, ingestion, or cleanup conditions", () => {
  const step = (name) => {
    const start = productionWorkflow.indexOf(`- name: ${name}`);
    const end = productionWorkflow.indexOf("\n      - name:", start + 1);
    return productionWorkflow.slice(start, end === -1 ? undefined : end);
  };

  assert.match(step("Verify exact main SHA for Production mutation or rollout"), /mode == 'write' \|\| steps\.ingestion\.outputs\.mode == 'rollout'/);
  for (const name of [
    "Resolve rollout policy and throttle",
    "Generate blocked bounded result before source fetch",
    "Generate rollout prediction plan",
    "Generate bounded persistence preview",
    "Scan rollout report",
    "Upload sanitized rollout report",
    "Enforce rollout result",
  ]) assert.match(step(name), /mode == 'rollout'/);
  assert.match(step("Run controlled market backfill"), /github\.event_name == 'workflow_dispatch'[\s\S]*task == 'market'[\s\S]*mode != 'write'[\s\S]*\|\|[\s\S]*mode == 'rollout'/);
  assert.match(step("Run bounded market persistence"), /github\.event_name == 'schedule'[\s\S]*17,47 \* \* \* \*[\s\S]*task == 'market'[\s\S]*mode == 'rollout'/);
  for (const name of [
    "Run execution preflight",
    "Capture before snapshot",
    "Run ingestion",
    "Clean replaced provisional variants",
    "Remove validation-only signal rows",
    "Remove irrelevant unlinked market rows",
    "Capture after snapshot",
    "Finalize ingestion run report",
    "Enforce Production ingestion result",
  ]) assert.match(step(name), /mode == 'write'|production_ingestion\.outcome == 'success'/);
});
test("expected throttle no-ops skip persistence and do not fail the workflow", () => {
  const blocked = productionWorkflow.slice(productionWorkflow.indexOf("Generate blocked bounded result before source fetch"), productionWorkflow.indexOf("Run execution preflight"));
  assert.match(blocked, /expected_noop != 'true'/);
  const enforce = productionWorkflow.slice(productionWorkflow.indexOf("Enforce rollout result"), productionWorkflow.indexOf("Upload sanitized market canary result"));
  assert.match(enforce, /expected_noop != 'true'/);
  assert.match(productionWorkflow, /Report expected rollout no-op[\s\S]*Source fetch: skipped[\s\S]*Bounded persistence: skipped[\s\S]*Database writes: 0/);
});
test("main SHA validation cannot be downgraded to an expected no-op", () => {
  assert.match(rolloutScript, /if \(!mainVerified\) decision = \{[\s\S]*expected_noop: false,[\s\S]*expected_noop_reason: null,/);
});
test("market-shadow marker is generated only by an allowed scheduled preflight", () => {
  const marker = productionWorkflow.slice(productionWorkflow.indexOf("Write market-shadow throttle marker"), productionWorkflow.indexOf("Run controlled market backfill"));
  assert.match(marker, /github\.event_name == 'schedule'[\s\S]*task == 'market'[\s\S]*stage == 'market-shadow'[\s\S]*allowed == 'true'/);
  assert.match(marker, /ingestion-rollout-throttle-market-shadow-market-\$\{\{ github\.run_id \}\}/);
  assert.match(marker, /rollout_preflight_allowed/);
});
test("manual dispatch keeps scheduled no-op disabled", () => {
  assert.match(productionWorkflow, /scheduled_noop=false[\s\S]*if \[ -n "\$SCHEDULE" \]; then[\s\S]*else[\s\S]*mode="\$\{MANUAL_MODE:-dry-run\}"/);
  assert.match(productionWorkflow, /canary-write[\s\S]*Canary write cannot run on a schedule/);
});
test("Production workflow defaults rollout stage disabled", () => assert.match(productionWorkflow, /AUTOMATIC_INGESTION_ROLLOUT_STAGE:[^\n]*disabled/));
test("Production workflow defaults policy digest empty", () => assert.match(productionWorkflow, /AUTOMATIC_INGESTION_ROLLOUT_POLICY_DIGEST:/));
test("Production workflow resolves rollout before backfill", () => assert.ok(productionWorkflow.indexOf("Resolve rollout policy and throttle") < productionWorkflow.indexOf("Run controlled market backfill")));
test("Production workflow scans rollout report", () => assert.match(productionWorkflow, /Scan rollout report/));
test("Production workflow uploads blocked rollout report", () => assert.match(productionWorkflow, /always\(\).*mode == 'rollout'.*report_generated/));
test("Production rollout invokes only the dedicated bounded persistence runner", () => {
  assert.match(productionWorkflow, /Run bounded market persistence/);
  assert.match(productionWorkflow, /market:bounded-persist -- persist/);
});
test("Production canary path remains available", () => {
  assert.match(productionWorkflow, /mode == 'canary-write'/);
  assert.match(productionWorkflow, /market-canary-result-/);
  assert.match(productionWorkflow, /between one and four candidate keys/);
});
test("manual audit workflow remains rollout-free", () => assert.doesNotMatch(manualWorkflow, /automatic-ingestion-rollout|market-bounded/));
test("Safety Check workflow remains rollout-free", () => assert.doesNotMatch(safetyWorkflow, /automatic-ingestion-rollout|market-bounded/));
test("all rollout reason codes are distinct", () => assert.equal(new Set(AUTOMATIC_INGESTION_ROLLOUT_REASON_CODES).size, AUTOMATIC_INGESTION_ROLLOUT_REASON_CODES.length));

function rollout(overrides = {}) {
  return evaluateAutomaticIngestionRollout({
    policy,
    policy_digest: digest,
    stage: "market-shadow",
    task: "market",
    schedule: "17,47 * * * *",
    event_name: "schedule",
    history_rows: [],
    running_rows: [],
    github_rows: [],
    now: new Date("2026-08-02T00:00:00.000Z"),
    concurrency: { available: true, state: "clear", active_count: 0, stale_count: 0 },
    circuit_breaker: { available: true, state: "closed" },
    durable_run_store_available: true,
    production_snapshot_available: true,
    automatic_write_enabled: "false",
    ...overrides,
  });
}

function throttle(overrides = {}) {
  const now = new Date("2026-08-02T00:00:00.000Z");
  return evaluateAutomaticIngestionThrottle({
    stage: "market-shadow",
    task: "market",
    policy: policy.stages["market-shadow"],
    history_rows: [],
    running_rows: [],
    github_rows: [],
    now,
    ...overrides,
  });
}

function completed(minutesAgo) {
  return completedFor("market-shadow", minutesAgo);
}

function completedFor(stage, minutesAgo) {
  return { id: `run-${stage}-${minutesAgo}`, task: "market", status: "succeeded", finished_at: new Date(new Date("2026-08-02T00:00:00.000Z") - minutesAgo * 60_000).toISOString(), summary: { rollout_stage: stage } };
}

function running(minutesAgo) {
  return { id: `running-${minutesAgo}`, task: "market", status: "running", started_at: new Date(new Date("2026-08-02T00:00:00.000Z") - minutesAgo * 60_000).toISOString() };
}

function candidate(index = 1) {
  return {
    candidate_key: index.toString(16).padStart(16, "0"),
    source: { provider: "rakuten_ichiba", listing_id: `listing-${index}`, public_url: `https://example.com/${index}` },
    listing: { title: `Product ${index}`, price: 500 + index, status: "active", listing_type: "single" },
    target: { variant_id: "variant-1", variant_slug: "variant-1", variant_name: "Variant 1", series_id: "series-1", series_slug: "series-1", series_name: "Series 1", search_query: "Series 1 Variant 1" },
    assessment: { accepted: true, review_required: false, reason: "variant_and_parent_evidence_confirmed", confidence: 0.86, matched_variant_ids: ["variant-1"] },
    checks: { variant_evidence_present: true, parent_series_evidence_present: true, set_signal_detected: false, multiple_variant_candidates: false, explicit_variant_conflict: false, explicit_label_other_variant_match: false, explicit_label_unresolved: false, parent_series_edition_conflict: false },
  };
}

function selection(index = 0) {
  return { variant_id: `variant-${index + 1}`, variant_slug: `variant-${index + 1}`, variant_name: `Variant ${index + 1}`, series_id: `series-${index + 1}`, series_slug: `series-${index + 1}`, series_name: `Series ${index + 1}`, query: `Series ${index + 1} Variant ${index + 1}` };
}

function auditWith(count) {
  const candidates = Array.from({ length: count }, (_, index) => candidate(index + 1));
  const value = {
    schema_version: 1,
    mode: "dry-run",
    source_scope: "planner-apis",
    workflow: { run_id: "40000000001", head_sha: "a".repeat(40) },
    selection: { selected_variant_count: 1, query_count: 1, selected_variants: [selection()] },
    result: { candidate_count: count, accepted_count: count, review_count: 0, report_complete: true, truncated_count: 0 },
    database_writes: { listings: 0, observations: 0, ingestion_runs: 0 },
    candidates,
  };
  return value;
}

function normalizeAuditTotals(value) {
  value.result.candidate_count = value.candidates.length;
  value.result.accepted_count = value.candidates.filter((entry) => entry.assessment.accepted === true).length;
  value.result.review_count = value.candidates.filter((entry) => entry.assessment.review_required === true).length;
  return value;
}

function plan(audit, plannedCounts) {
  return buildAutomaticMarketRolloutPlan({ policy, policy_digest: digest, stage: "market-bounded", audit: normalizeAuditTotals(audit), head_sha: "a".repeat(40), throttle: { state: "clear" }, planned_counts: plannedCounts });
}

function capturePlanError(value, plannedCounts) {
  try {
    plan(value, plannedCounts);
    assert.fail("Expected rollout plan to fail closed.");
  } catch (error) {
    return error;
  }
}

function buildReport() {
  return buildSanitizedRolloutReport({ plan: plan(auditWith(1)), run_id: "42", run_attempt: "1", event_name: "workflow_dispatch", ref: "refs/heads/main", main_sha_verified: true });
}

function scheduleFor(task) {
  return task === "official" ? "7 * * * *" : task === "stock" ? "37 * * * *" : "17,47 * * * *";
}

function clone(value) {
  return structuredClone(value);
}
