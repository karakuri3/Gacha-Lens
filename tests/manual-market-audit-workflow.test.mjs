import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  assertManualMarketAuditCountsUnchanged,
  FAILED_MANUAL_MARKET_AUDIT_RUN,
  findManualMarketAuditSecretLeaks,
  MANUAL_MARKET_AUDIT_EXCLUDED_RUN_IDS,
  STUCK_MARKET_AUDIT_RUN,
  validateManualMarketAuditReport,
} from "../lib/domain/manual-market-audit-safety.js";

const root = process.cwd();
const workflowPath = path.join(root, ".github", "workflows", "gacha-market-manual-audit.yml");
const productionWorkflowPath = path.join(root, ".github", "workflows", "gacha-ingestion.yml");
const workflow = fs.readFileSync(workflowPath, "utf8");
const productionWorkflow = fs.readFileSync(productionWorkflowPath, "utf8");

test("manual audit workflow has only workflow_dispatch trigger", () => {
  assert.match(workflow, /^on:\s*\r?\n\s+workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s+(schedule|push|pull_request|workflow_run|repository_dispatch):/m);
});

test("manual audit workflow exposes only a bounded limit input", () => {
  const inputBlock = workflow.match(/inputs:([\s\S]*?)\n\njobs:/)?.[1] ?? "";
  assert.match(inputBlock, /^\s+limit:/m);
  assert.doesNotMatch(inputBlock, /^\s+(mode|task|source_scope|execute_sources|canary_audit_run_id|canary_candidate_keys):/m);
  for (const value of ["1", "2", "3", "4", "5"]) assert.match(inputBlock, new RegExp(`- "${value}"`));
  assert.doesNotMatch(inputBlock, /canary-write|write/);
});

test("manual audit command fixes market dry-run contract internally", () => {
  assert.match(workflow, /--mode=dry-run/);
  assert.match(workflow, /--priority=1/);
  assert.match(workflow, /--release=released/);
  assert.match(workflow, /--source-scope=planner-apis/);
  assert.match(workflow, /--execute-sources/);
  assert.match(workflow, /BACKFILL_TASK:\s*market/);
  assert.doesNotMatch(workflow, /--mode=\$\{\{/);
});

test("manual audit workflow has a second write-mode guard", () => {
  assert.match(workflow, /MARKET_BACKFILL_WRITE_DISABLED:\s*"true"/);
  const backfill = fs.readFileSync(path.join(root, "scripts", "market-backfill.mjs"), "utf8");
  assert.match(backfill, /MARKET_BACKFILL_WRITE_DISABLED === "true" && options\.mode !== "dry-run"/);
  assert.match(backfill, /Market backfill writes are disabled/);
});

test("write mode is rejected before database configuration or ingestion is reached", () => {
  const result = spawnSync(process.execPath, ["scripts/market-backfill.mjs", "--mode=write"], {
    cwd: root,
    env: { ...process.env, MARKET_BACKFILL_WRITE_DISABLED: "true", NEXT_PUBLIC_SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /Market backfill writes are disabled/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /required|fetch failed|upsert/i);
});

test("manual audit workflow verifies complete non-truncated zero-write audit", () => {
  assert.match(workflow, /manual-market-audit-guard\.mjs verify/);
  assert.match(workflow, /manual-market-audit-guard\.mjs compare/);
  assert.match(workflow, /always\(\).*steps\.before_counts\.outcome/);
  assert.match(workflow, /manual-audit-before\.json/);
  assert.match(workflow, /manual-audit-after\.json/);
});

test("manual audit workflow uploads a Run-scoped sanitized artifact", () => {
  assert.match(workflow, /name:\s*market-candidate-audit-\$\{\{ github\.run_id \}\}/);
  assert.match(workflow, /manual-market-audit-guard\.mjs scan/);
  assert.match(workflow, /if-no-files-found:\s*error/);
});

test("manual workflow does not operate or invoke the Production workflow", () => {
  assert.doesNotMatch(workflow, /gacha-ingestion\.yml|workflow (?:enable|disable)|gh workflow|db:upsert|cleanup|migration/i);
  assert.match(productionWorkflow, /name:\s*Gacha ingestion/);
});

test("stuck Run is permanently excluded from audit and canary sources", () => {
  assert.equal(STUCK_MARKET_AUDIT_RUN.audit_source_authorized, false);
  assert.equal(STUCK_MARKET_AUDIT_RUN.canary_source_authorized, false);
  assert.equal(STUCK_MARKET_AUDIT_RUN.permanently_excluded_from_rollout, true);
  assert.match(STUCK_MARKET_AUDIT_RUN.reason, /orphaned queued run with zero jobs and no artifact/);
  assert.ok(MANUAL_MARKET_AUDIT_EXCLUDED_RUN_IDS.includes("30688709185"));
});

test("all superseded audit Runs remain excluded", () => {
  assert.deepEqual(MANUAL_MARKET_AUDIT_EXCLUDED_RUN_IDS, [
    "30532684353", "30565886734", "30572554031", "30655163177", "30688709185", "30694540362",
  ]);
});

test("failed pre-audit Run is permanently excluded from audit and canary sources", () => {
  assert.equal(FAILED_MANUAL_MARKET_AUDIT_RUN.audit_source_authorized, false);
  assert.equal(FAILED_MANUAL_MARKET_AUDIT_RUN.canary_source_authorized, false);
  assert.equal(FAILED_MANUAL_MARKET_AUDIT_RUN.permanently_excluded_from_rollout, true);
  assert.match(FAILED_MANUAL_MARKET_AUDIT_RUN.reason, /failed before market dry-run and produced no artifact/);
  assert.ok(MANUAL_MARKET_AUDIT_EXCLUDED_RUN_IDS.includes("30694540362"));
});

test("optional env loader tolerates a missing file and preserves process env", () => {
  const result = runEnvLoaderCase(`
    process.env.PHASE_5_H_EXISTING = "preserved";
    const loaded = loadOptionalEnvFile("missing.env");
    console.log(JSON.stringify({ loaded, value: process.env.PHASE_5_H_EXISTING }));
  `);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), { loaded: false, value: "preserved" });
});

test("optional env loader reads an existing file", () => {
  const result = runEnvLoaderCase(`
    process.env.PHASE_5_H_PRESERVED = "from-process";
    fs.writeFileSync("present.env", "PHASE_5_H_LOADED=from-file\\nPHASE_5_H_PRESERVED=from-file\\n", "utf8");
    const loaded = loadOptionalEnvFile("present.env");
    console.log(JSON.stringify({ loaded, value: process.env.PHASE_5_H_LOADED, preserved: process.env.PHASE_5_H_PRESERVED }));
  `);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), { loaded: true, value: "from-file", preserved: "from-process" });
});

test("optional env loader only suppresses ENOENT", () => {
  const enoent = runEnvLoaderCase(`
    fs.writeFileSync("race.env", "VALUE=1\\n", "utf8");
    process.loadEnvFile = () => { const error = new Error("gone"); error.code = "ENOENT"; throw error; };
    console.log(JSON.stringify({ loaded: loadOptionalEnvFile("race.env") }));
  `);
  assert.equal(enoent.status, 0, enoent.stderr);
  assert.deepEqual(JSON.parse(enoent.stdout.trim()), { loaded: false });

  const denied = runEnvLoaderCase(`
    fs.writeFileSync("denied.env", "VALUE=1\\n", "utf8");
    process.loadEnvFile = () => { const error = new Error("denied"); error.code = "EACCES"; throw error; };
    loadOptionalEnvFile("denied.env");
  `);
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /denied/);
});

test("manual audit guard starts without .env.local on a runner-like cwd", () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(process.env.TEMP || process.env.TMP || root, "gacha-manual-audit-"));
  const guardPath = path.join(root, "scripts", "manual-market-audit-guard.mjs");
  const result = spawnSync(process.execPath, [guardPath, "snapshot", `--output=${path.join(temporaryDirectory, "counts.json")}`], {
    cwd: temporaryDirectory,
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /ENOENT.*\.env\.local|open ['"]\.env\.local/i);
  assert.match(`${result.stdout}\n${result.stderr}`, /NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required/i);
});

test("valid manual audit report passes", () => {
  assert.equal(validateManualMarketAuditReport(validReport(), validOptions()), true);
});

test("manual report rejects incomplete, truncated and nonzero writes", () => {
  const incomplete = validReport();
  incomplete.result.report_complete = false;
  assert.throws(() => validateManualMarketAuditReport(incomplete, validOptions()), /incomplete/);
  const truncated = validReport();
  truncated.result.truncated_count = 1;
  assert.throws(() => validateManualMarketAuditReport(truncated, validOptions()), /truncated/);
  const written = validReport();
  written.database_writes.listings = 1;
  assert.throws(() => validateManualMarketAuditReport(written, validOptions()), /zero database writes|Production database write/);
});

test("manual report rejects duplicate candidate keys and Gaspard", () => {
  const duplicate = validReport();
  duplicate.candidates.push(structuredClone(duplicate.candidates[0]));
  duplicate.result.candidate_count = 2;
  duplicate.result.accepted_count = 2;
  assert.throws(() => validateManualMarketAuditReport(duplicate, validOptions()), /unique/);
  const gaspard = validReport();
  gaspard.candidates[0].candidate_key = "3908a16901a36053";
  assert.throws(() => validateManualMarketAuditReport(gaspard, validOptions()), /Gaspard/);
});

test("manual report rejects wrong run, head, mode, scope and selection profile", () => {
  for (const mutate of [
    (report) => { report.workflow.run_id = "30688709185"; },
    (report) => { report.workflow.head_sha = "b".repeat(40); },
    (report) => { report.mode = "canary-write"; },
    (report) => { report.source_scope = "all"; },
    (report) => { report.selection_profile.name = "other"; },
    (report) => { report.selection_profile.max_variants_per_series = 2; },
  ]) {
    const report = validReport();
    mutate(report);
    assert.throws(() => validateManualMarketAuditReport(report, validOptions()));
  }
});

test("manual report rejects blocked selection and more than one variant per series", () => {
  const blocked = validReport();
  assert.throws(() => validateManualMarketAuditReport(blocked, { ...validOptions(), blockedVariantIds: ["variant-a"] }), /blocked/);
  const repeated = validReport();
  repeated.selection.selected_variants.push({ ...repeated.selection.selected_variants[0], variant_id: "variant-b", query: "series-a variant-b" });
  repeated.selection.selected_variant_count = 2;
  repeated.selection.query_count = 2;
  repeated.selection_profile.selected_variant_count = 2;
  assert.throws(() => validateManualMarketAuditReport(repeated, validOptions()), /series cap|one variant per series/);
});

test("Production count comparison fails closed on any delta", () => {
  const before = counts();
  assert.equal(assertManualMarketAuditCountsUnchanged(before, { ...before }), true);
  assert.throws(() => assertManualMarketAuditCountsUnchanged(before, { ...before, market_listings: 857 }), /changed Production count/);
});

test("artifact scan catches actual credentials without rejecting product wording", () => {
  assert.deepEqual(findManualMarketAuditSecretLeaks([{ name: "audit.md", text: "Secret character listing" }], ["private-value-123"]), []);
  assert.deepEqual(findManualMarketAuditSecretLeaks([{ name: "audit.json", text: "private-value-123" }], ["private-value-123"]), ["audit.json"]);
  assert.deepEqual(findManualMarketAuditSecretLeaks([{ name: "audit.txt", text: "Authorization: Bearer abcdefghijklmnop" }]), ["audit.txt"]);
});

test("workflow uses minimum read permissions and no automatic trigger", () => {
  assert.match(workflow, /permissions:\s*\r?\n\s+contents:\s*read\s*\r?\n\s+actions:\s*read/);
  assert.doesNotMatch(workflow, /contents:\s*write|actions:\s*write/);
  assert.doesNotMatch(workflow.split("steps:")[0], /\$\{\{\s*runner\./);
});

function validOptions() {
  return { expectedHeadSha: "a".repeat(40), expectedRunId: "40000000001", blockedVariantIds: [] };
}

function validReport() {
  return {
    schema_version: 1,
    generated_at: "2026-08-01T00:00:00.000Z",
    mode: "dry-run",
    source_scope: "planner-apis",
    workflow: { run_id: "40000000001", run_attempt: "1", head_sha: "a".repeat(40), event_name: "workflow_dispatch" },
    selection_profile: {
      name: "manual_canary_diversity",
      max_variants_per_series: 1,
      blocked_variant_count: 1,
      blocked_variants_skipped: 0,
      series_cap_skipped: 0,
      distinct_series_selected: 1,
      selected_variant_count: 1,
    },
    selection: {
      selected_variant_count: 1,
      query_count: 1,
      selected_variants: [{
        variant_id: "variant-a", variant_slug: "variant-a", variant_name: "Variant A",
        series_id: "series-a", series_slug: "series-a", series_name: "Series A",
        priority: 1, priority_reason: "released_no_evidence", query: "series-a variant-a",
      }],
    },
    result: { candidate_count: 1, accepted_count: 1, review_count: 0, no_result_variant_count: 0, report_complete: true, truncated_count: 0 },
    database_writes: { listings: 0, observations: 0, ingestion_runs: 0 },
    candidates: [{
      candidate_key: "1234567890abcdef",
      source: { provider: "provider", listing_id: "listing-a", public_url: "https://example.com/a", public_url_host: "example.com" },
      listing: { title: "Variant A", price: 500, status: "active", listing_type: "single" },
      target: { variant_id: "variant-a", variant_slug: "variant-a", variant_name: "Variant A", series_id: "series-a", series_slug: "series-a", series_name: "Series A", search_query: "series-a variant-a" },
      assessment: { accepted: true, review_required: false, reason: "variant_and_parent_evidence_confirmed", confidence: 0.86, matched_variant_ids: ["variant-a"], matched_variant_names: ["Variant A"], matched_variant_overflow: 0 },
      checks: { variant_evidence_present: true, parent_series_evidence_present: true, set_signal_detected: false, multiple_variant_candidates: false, explicit_variant_conflict: false, explicit_label_present: true, explicit_label_target_match: true, explicit_label_other_variant_match: false, explicit_label_unresolved: false, parent_series_edition_conflict: false, query_context_present: true },
    }],
  };
}

function counts() {
  return { market_listings: 856, market_listing_observations: 898, import_issues: 544, ingestion_runs: 207, review_required: 263 };
}

function runEnvLoaderCase(source) {
  const loaderUrl = new URL("../scripts/load-optional-env.mjs", import.meta.url).href;
  const temporaryDirectory = fs.mkdtempSync(path.join(process.env.TEMP || process.env.TMP || root, "gacha-env-loader-"));
  return spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import fs from "node:fs";
    import { loadOptionalEnvFile } from ${JSON.stringify(loaderUrl)};
    ${source}
  `], {
    cwd: temporaryDirectory,
    env: { ...process.env },
    encoding: "utf8",
  });
}
