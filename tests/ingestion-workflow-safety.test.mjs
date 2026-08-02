import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const production = fs.readFileSync(".github/workflows/gacha-ingestion.yml", "utf8");
const safety = fs.readFileSync(".github/workflows/gacha-ingestion-safety-check.yml", "utf8");
const manual = fs.readFileSync(".github/workflows/gacha-market-manual-audit.yml", "utf8");
const guard = fs.readFileSync("scripts/ingestion-execution-guard.mjs", "utf8");
const runner = fs.readFileSync("scripts/run-ingestion.mjs", "utf8");
const ingestionRunner = fs.readFileSync("lib/ingestion-runner.js", "utf8");
test("production preflight precedes Production ingestion", () => assert.ok(production.indexOf("Run execution preflight") < production.indexOf("name: Run ingestion")));
test("main verification reports drift through preflight instead of bypassing its artifact", () => {
  const step = production.slice(production.indexOf("Verify exact main SHA"), production.indexOf("Run execution preflight"));
  assert.doesNotMatch(step, /test \"\$GITHUB_SHA\"/);
  assert.match(step, /origin_main_sha/);
});
test("blocked preflight excludes ingestion", () => assert.match(production, /execution_preflight\.outputs\.allowed == 'true'/));
test("blocked preflight excludes cleanup", () => assert.match(production, /execution_preflight\.outputs\.allowed == 'true'[\s\S]*Clean replaced provisional/));
test("Production report upload is always guarded", () => assert.match(production, /always\(\)[\s\S]*Upload sanitized ingestion run report/));
test("schedule values are unchanged", () => { for (const cron of ["7 * * * *", "17,47 * * * *", "37 * * * *"]) assert.match(production, new RegExp(cron.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))); });
test("automatic write variable defaults false", () => assert.match(production, /AUTOMATIC_INGESTION_WRITE_ENABLED:[^\n]*false/));
test("manual approval input exists", () => assert.match(production, /production_write_approval:/));
test("process write guard exists", () => { assert.match(runner, /INGESTION_WRITE_DISABLED/); assert.match(runner, /INGESTION_EXECUTION_AUTHORIZED/); });
test("Production running log is strict", () => assert.match(ingestionRunner, /required: strictDurableLog/));
test("Production summary uses allowlisted metadata", () => assert.match(ingestionRunner, /strictDurableLog \? metadata/));
test("durable metadata has no environment or credential fields", () => assert.doesNotMatch(ingestionRunner.slice(ingestionRunner.indexOf("function ingestionRunMetadata")), /service_role|authorization|cookie|password|credential/i));
test("Production durable failure text is sanitized", () => assert.match(ingestionRunner, /strictDurableLog \? "Ingestion task failed\."/));
test("safety workflow is dispatch only", () => { assert.match(safety, /workflow_dispatch:/); assert.doesNotMatch(safety, /\bschedule:|\bpush:|\bpull_request:|\bworkflow_run:|\brepository_dispatch:/); });
test("safety workflow keeps task as its only input", () => {
  const dispatch = safety.slice(safety.indexOf("workflow_dispatch:"), safety.indexOf("\njobs:"));
  assert.deepEqual([...dispatch.matchAll(/^ {6}([a-z_]+):$/gm)].map((match) => match[1]), ["task"]);
});
test("safety workflow has write-disabled env", () => { assert.match(safety, /INGESTION_WRITE_DISABLED: "true"/); assert.match(safety, /MARKET_BACKFILL_WRITE_DISABLED: "true"/); });
test("safety workflow fixes the read-only execution contract", () => {
  assert.match(safety, /--mode=read-only/);
  assert.match(safety, /--source-scope=none/);
  assert.match(safety, /--execute-sources=false/);
});
test("safety workflow captures and finalizes the after snapshot", () => {
  const preflight = safety.indexOf("name: Run read-only safety preflight");
  const snapshotStep = safety.indexOf("name: Capture read-only after snapshot");
  const finalizeStep = safety.indexOf("name: Finalize read-only safety report");
  const scanStep = safety.indexOf("name: Scan safety report");
  const uploadStep = safety.indexOf("name: Upload sanitized safety report");
  const enforceStep = safety.indexOf("name: Enforce read-only safety result");
  assert.ok(preflight < snapshotStep && snapshotStep < finalizeStep && finalizeStep < scanStep && scanStep < uploadStep && uploadStep < enforceStep);
  assert.match(safety, /ingestion-execution-guard\.mjs snapshot/);
  assert.match(safety, /ingestion-execution-guard\.mjs finalize-read-only/);
  assert.match(safety.slice(snapshotStep, finalizeStep), /continue-on-error: true/);
  assert.match(safety.slice(finalizeStep, scanStep), /if: \$\{\{ always\(\) \}\}/);
  assert.match(safety, /zero_delta_verified/);
  assert.match(safety, /steps\.scan\.outcome == 'success'/);
  assert.match(safety, /steps\.upload\.outcome/);
});
test("read-only guard exposes sanitized final outputs", () => {
  assert.match(guard, /command === "finalize-read-only"/);
  for (const output of ["final_status", "final_ok", "database_writes", "zero_delta_verified"]) {
    assert.match(guard, new RegExp(`writeOutput\\(\"${output}\"`));
  }
  assert.match(guard, /source_scope: options\["source-scope"\]/);
  assert.match(guard, /execute_sources: options\["execute-sources"\] === "true"/);
  assert.match(guard, /origin_main_sha: options\["origin-main-sha"\]/);
  assert.match(guard, /cleanup_started: false/);
});
test("safety workflow has no ingestion command", () => assert.doesNotMatch(safety, /db:upsert|run-ingestion\.mjs|market:backfill/));
test("safety workflow has no cleanup command", () => assert.doesNotMatch(safety, /db:cleanup|cleanup-/));
test("safety artifact includes run ID", () => assert.match(safety, /ingestion-safety-check-\$\{\{ github\.run_id \}\}/));
test("manual audit workflow remains unchanged in purpose", () => { assert.match(manual, /Gacha Market Manual Audit/); assert.match(manual, /MARKET_BACKFILL_WRITE_DISABLED: "true"/); });
test("canary limit remains four", () => assert.match(production, /greater than one and four candidate keys|between one and four candidate keys/));
