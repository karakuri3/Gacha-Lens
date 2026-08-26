import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildOfficialQualiaSeriesCanaryReadyResult,
  authorizeOfficialQualiaSeriesCanary,
  buildOfficialQualiaSeriesReadinessAudit,
  buildQualiaSeriesStableIdentity,
  executeOfficialQualiaSeriesCanaryTransaction,
  finalizeOfficialQualiaSeriesCanaryTerminalResult,
  validateOfficialQualiaSeriesReadinessAudit,
} from "../lib/domain/official-qualia-series-canary.js";
import { createOfficialMemoryTransactionAdapter, findOfficialBoundedLeaks } from "../lib/domain/official-bounded-write.js";
import { findOfficialAuditLeaks } from "../lib/domain/official-read-only-audit.js";
import { runOfficialQualiaSeriesReadinessAudit } from "../scripts/official-qualia-series-readiness-audit.mjs";

const HEAD = "a".repeat(40);
const AUDIT_RUN_ID = "901";
const auditWorkflow = fs.readFileSync(".github/workflows/gacha-official-qualia-series-read-only-audit.yml", "utf8");
const canaryWorkflow = fs.readFileSync(".github/workflows/gacha-official-qualia-series-bounded-canary.yml", "utf8");
const readinessScript = fs.readFileSync("scripts/official-qualia-series-readiness-audit.mjs", "utf8");
const canaryScript = fs.readFileSync("scripts/official-qualia-series-bounded-canary.mjs", "utf8");
const canaryDomain = fs.readFileSync("lib/domain/official-qualia-series-canary.js", "utf8");
const qualiaPostgresAdapter = fs.readFileSync("lib/server/official-qualia-series-postgres.js", "utf8");
const f0Workflow = fs.readFileSync(".github/workflows/gacha-official-bounded-auto.yml", "utf8");
const kitanWorkflow = fs.readFileSync(".github/workflows/gacha-official-kitan-bounded-auto.yml", "utf8");
const p3Workflow = fs.readFileSync(".github/workflows/gacha-market-p3-bounded-seed-v2-auto.yml", "utf8");

test("safe Qualia metadata builds one deterministic series-only insert candidate", () => {
  const first = readiness([qualiaRecord()]);
  const second = readiness([qualiaRecord()]);
  assert.equal(first.final_verdict, "OFFICIAL_QUALIA_SERIES_READINESS_READY");
  assert.equal(first.manual_canary_ready, true);
  assert.equal(first.plan.selected_candidate_count, 1);
  assert.equal(first.plan.series_inserts, 1);
  assert.equal(first.plan.series_updates, 0);
  assert.equal(first.plan.variant_inserts, 0);
  assert.equal(first.plan.variant_updates, 0);
  assert.equal(first.plan.selected_candidate.variant_count, 0);
  assert.deepEqual(first.plan.selected_candidate.variants, []);
  assert.equal(first.plan.selected_candidate.variant_writes, 0);
  assert.deepEqual(first.plan.selected_candidate.apply_contract.variants, []);
  assert.equal(first.plan.selected_candidate.apply_contract.restock_event, null);
  assert.equal(first.plan.selected_candidate.series_id, second.plan.selected_candidate.series_id);
  assert.match(first.plan.selected_candidate.canonical_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(first.plan.selected_candidate.canonical_digest, first.plan.selected_candidate_digest);
  assert.equal(first.canonical_digest, second.canonical_digest);
  assert.equal(first.database.writes, 0);
});

test("formal Qualia Lineup evidence never enters the series-only apply contract", () => {
  const record = qualiaRecord({ formalVariants: ["A", "B", "C"] });
  const report = readiness([record], {}, { records: [record], metadataRecords: [] });
  assert.equal(report.source.formal_variant_records_observed, 1);
  assert.equal(report.plan.selected_candidate.variant_count, 0);
  assert.deepEqual(report.plan.selected_candidate.variants, []);
  assert.deepEqual(report.plan.selected_candidate.apply_contract.variants, []);
  assert.equal(report.plan.variant_inserts, 0);
  assert.equal(report.plan.variant_updates, 0);
});

for (const [label, mutate, expected] of [
  ["missing source identity", (record) => ({ ...record, source_product_id: "" }), "qualia_source_identity_invalid"],
  ["invalid official URL", (record) => ({ ...record, official_url: "https://example.com/product/view/2999" }), "qualia_source_identity_invalid"],
  ["missing series name", (record) => ({ ...record, series_name: "" }), "qualia_series_name_invalid"],
  ["malformed price", (record) => ({ ...record, price: Number.NaN }), "qualia_price_invalid"],
  ["non-positive price", (record) => ({ ...record, price: 0 }), "qualia_price_invalid"],
  ["missing release evidence", (record) => ({ ...record, release_date: null, release_month: null }), "qualia_release_evidence_invalid"],
  ["contradictory release evidence", (record) => ({ ...record, release_date: "2026-07-31", release_month: "2026-08" }), "qualia_release_evidence_invalid"],
  ["wrong archive month", (record) => ({ ...record, release_month: "2026-07" }), "qualia_current_archive_release_mismatch"],
  ["unsafe capability", (record) => ({ ...record, capability: { series_metadata_status: "unavailable" } }), "qualia_series_metadata_capability_unsafe"],
]) test(`Qualia ${label} fails closed`, () => {
  const report = readiness([mutate(qualiaRecord())]);
  assert.equal(report.manual_canary_ready, false);
  assert.match(report.plan.rejected_candidates[0].reasons.join(","), new RegExp(expected));
  assert.equal(report.database.writes, 0);
});

test("multiple safe Qualia products select exactly one newest deterministic series", () => {
  const records = Array.from({ length: 5 }, (_, index) => qualiaRecord({
    id: String(3000 + index),
    name: `Qualia safe ${index}`,
    releaseDate: `2026-08-${String(index + 1).padStart(2, "0")}`,
  }));
  const report = readiness(records);
  assert.equal(report.plan.eligible_candidate_count, 5);
  assert.equal(report.plan.selected_candidate_count, 1);
  assert.equal(report.plan.selected_candidate.source_product_id, "3004");
  assert.equal(report.plan.series_inserts, 1);
  assert.equal(report.plan.variant_inserts, 0);
});

test("Qualia release status is frozen conservatively at the audit date", () => {
  for (const [record, archiveCursor, expected, precision] of [
    [qualiaRecord({ releaseDate: "2026-08-01" }), "2026-08", true, "exact_date"],
    [qualiaRecord({ releaseDate: "2026-08-20" }), "2026-08", true, "exact_date"],
    [qualiaRecord({ releaseDate: "2026-08-30" }), "2026-08", false, "exact_date"],
    [qualiaRecord({ releaseMonth: "2026-07" }), "2026-07", true, "month_only"],
    [qualiaRecord({ releaseMonth: "2026-09" }), "2026-09", false, "month_only"],
    [qualiaRecord({ releaseMonth: "2026-08" }), "2026-08", false, "month_only_current_conservative"],
  ]) {
    const report = readiness([record], {}, { archiveCursor });
    assert.equal(report.plan.selected_candidate.release_status.released, expected);
    assert.equal(report.plan.selected_candidate.release_status.precision, precision);
  }
});

test("all exact existing Qualia rows are classified as NO_CHANGES", () => {
  const initial = readiness([qualiaRecord()]);
  const existing = { ...initial.plan.selected_candidate.apply_contract.series.values, raw: {} };
  const report = readiness([qualiaRecord()], { series: [existing] });
  assert.equal(report.final_verdict, "OFFICIAL_QUALIA_SERIES_READINESS_NO_CHANGES");
  assert.equal(report.manual_canary_ready, false);
  assert.equal(report.plan.noop_candidates.length, 1);
  assert.equal(report.plan.series_inserts, 0);
});

test("one malformed Qualia record does not block a separate safe insert candidate", () => {
  const report = readiness([qualiaRecord({ id: "3001" }), { ...qualiaRecord({ id: "3002" }), price: 0 }]);
  assert.equal(report.final_verdict, "OFFICIAL_QUALIA_SERIES_READINESS_READY");
  assert.equal(report.plan.selected_candidate.source_product_id, "3001");
  assert.equal(report.plan.rejected_candidates.length, 1);
});

test("global database drift and incomplete targeted reads block the audit", () => {
  const drift = readiness([qualiaRecord()], {}, { databaseAfter: { ...counts(), series: counts().series + 1 } });
  assert.equal(drift.final_verdict, "OFFICIAL_QUALIA_SERIES_READINESS_BLOCKED");
  assert.match(drift.blockers.join(","), /production_database_delta_detected/);
  const incomplete = readiness([qualiaRecord()], { complete: false });
  assert.equal(incomplete.final_verdict, "OFFICIAL_QUALIA_SERIES_READINESS_BLOCKED");
  assert.match(incomplete.blockers.join(","), /production_catalog_targeted_read_incomplete/);
});

test("series-only validator rejects any attempted variant write", () => {
  const report = structuredClone(readiness([qualiaRecord()]));
  report.plan.selected_candidate.variants = [{ id: "forbidden" }];
  assert.throws(() => validateOfficialQualiaSeriesReadinessAudit(report), /series_only|candidate/i);
});

test("an existing Qualia row requiring update is excluded from canary writes", () => {
  const initial = readiness([qualiaRecord()]);
  const existing = { ...initial.plan.selected_candidate.apply_contract.series.values, price: 400, raw: {} };
  const report = readiness([qualiaRecord()], { series: [existing] });
  assert.equal(report.final_verdict, "OFFICIAL_QUALIA_SERIES_READINESS_BLOCKED");
  assert.equal(report.plan.manual_update_required.length, 1);
  assert.equal(report.plan.selected_candidate_count, 0);
  assert.match(report.blockers.join(","), /qualia_manual_update_required/);
  assert.equal(report.plan.series_updates, 0);
  assert.equal(report.database.writes, 0);
});

test("NOOP plus a manual Qualia update remains explicitly blocked without a write plan", () => {
  const noopCandidate = readiness([qualiaRecord({ id: "2999" })]).plan.selected_candidate;
  const updateCandidate = readiness([qualiaRecord({ id: "3000", name: "Second product" })]).plan.selected_candidate;
  const noop = { ...noopCandidate.apply_contract.series.values, raw: {} };
  const needsManualUpdate = { ...updateCandidate.apply_contract.series.values, price: 400, raw: {} };
  const report = readiness([qualiaRecord({ id: "2999" }), qualiaRecord({ id: "3000", name: "Second product" })], { series: [noop, needsManualUpdate] });
  assert.equal(report.final_verdict, "OFFICIAL_QUALIA_SERIES_READINESS_BLOCKED");
  assert.match(report.blockers.join(","), /qualia_manual_update_required/);
  assert.equal(report.plan.noop_candidates.length, 1);
  assert.equal(report.plan.manual_update_required.length, 1);
  assert.equal(report.plan.series_updates, 0);
  assert.equal(report.database.writes, 0);
});

test("readiness source failure replaces a stale READY artifact with sanitized zero-write BLOCKED evidence", async () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "qualia-readiness-"));
  const secret = "private-service-role-value";
  try {
    fs.writeFileSync(path.join(outputDirectory, "official-qualia-series-readiness-audit.json"), JSON.stringify({ final_verdict: "OFFICIAL_QUALIA_SERIES_READINESS_READY" }));
    const { report } = await runOfficialQualiaSeriesReadinessAudit({
      args: { "output-dir": outputDirectory, "expected-main-sha": HEAD, "run-id": AUDIT_RUN_ID },
      env: { SUPABASE_SERVICE_ROLE_KEY: secret, GITHUB_EVENT_NAME: "workflow_dispatch" },
      dependencies: {
        currentHeadSha: () => HEAD,
        captureCounts: async () => counts(),
        fetchProvider: async () => { throw new Error(`network failed: ${secret}`); },
      },
    });
    const json = fs.readFileSync(path.join(outputDirectory, "official-qualia-series-readiness-audit.json"), "utf8");
    const markdown = fs.readFileSync(path.join(outputDirectory, "official-qualia-series-readiness-audit.md"), "utf8");
    assert.equal(report.final_verdict, "OFFICIAL_QUALIA_SERIES_READINESS_BLOCKED");
    assert.equal(report.database.writes, 0);
    assert.equal(report.plan.series_inserts, 0);
    assert.equal(report.plan.variant_inserts, 0);
    assert.equal(report.reason_code, "qualia_series_readiness_unexpected_failure");
    assert.doesNotMatch(json, /OFFICIAL_QUALIA_SERIES_READINESS_READY/);
    assert.doesNotMatch(markdown, /OFFICIAL_QUALIA_SERIES_READINESS_READY/);
    assert.deepEqual(findOfficialAuditLeaks([
      { name: "official-qualia-series-readiness-audit.json", text: json },
      { name: "official-qualia-series-readiness-audit.md", text: markdown },
    ], [secret]), []);
    validateOfficialQualiaSeriesReadinessAudit(JSON.parse(json));
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test("Qualia ownership, URL, and factual identity drift conflicts block insertion", () => {
  const base = qualiaRecord();
  const id = buildQualiaSeriesStableIdentity(base.source_product_id);
  const ownership = readiness([base], { series: [{ id, brand: "別会社", source_type: "manual", official_url: base.official_url }] });
  assert.match(ownership.plan.rejected_candidates[0].reasons.join(","), /qualia_series_source_ownership_conflict/);

  const urlCollision = readiness([base], { series: [{ id: "different", name: "different", brand: "クオリア", source_type: "official_site", official_url: base.official_url, release_month: "2025-01", price: 300 }] });
  assert.match(urlCollision.plan.rejected_candidates[0].reasons.join(","), /qualia_series_official_url_collision/);

  const drift = readiness([base], { series: [{ id: "old-id", name: base.series_name, brand: "クオリア", source_type: "official_site", official_url: "https://www.qualia-45.jp/product/view/1000", release_month: base.release_month, price: base.price }] });
  assert.match(drift.plan.rejected_candidates[0].reasons.join(","), /qualia_series_identity_drift_possible/);
  assert.equal(drift.manual_canary_ready, false);
});

test("Qualia authorization binds exact main, audit run, audit and candidate/apply digests, and provider-specific approval", () => {
  const report = readiness([qualiaRecord()]);
  assert.equal(authorize(report).ok, true);
  const wrongDigest = `sha256:${"b".repeat(64)}`;
  for (const change of [
    { headSha: "b".repeat(40) },
    { originMainSha: "b".repeat(40) },
    { eventName: "schedule" },
    { auditRunId: "999" },
    { auditDigest: wrongDigest },
    { approval: `APPROVE_OFFICIAL_QUALIA_SERIES_CANARY:${HEAD}:${wrongDigest}` },
    { approval: `APPROVE_OFFICIAL_KITAN_CANARY:${HEAD}:${report.canonical_digest}` },
  ]) assert.throws(() => authorize(report, change));
  const tampered = structuredClone(report);
  tampered.plan.selected_apply_contract_digest = wrongDigest;
  assert.throws(() => authorize(tampered));
});

test("Qualia transaction inserts exactly one series and zero variants", async () => {
  const authorization = authorize(readiness([qualiaRecord()]));
  const adapter = transactionAdapter({ series: [], variants: [], restock_events: [] });
  const result = await executeOfficialQualiaSeriesCanaryTransaction({ adapter, authorization, workflow: { run_id: "902", head_sha: HEAD } });
  assert.equal(result.final_verdict, "OFFICIAL_BOUNDED_WRITE_COMMITTED");
  assert.equal(result.operations.series, 1);
  assert.equal(result.operations.variants, 0);
  assert.equal(result.operations.restock_events, 0);
  assert.equal(result.database_writes, 1);
  assert.equal(result.production_counts.delta.series, 1);
  assert.equal(result.production_counts.delta.variants, 0);
  assert.equal(result.production_counts.precommit_delta.series, 1);
});

test("Qualia transaction precondition mismatch rolls back with zero durable writes", async () => {
  const authorization = authorize(readiness([qualiaRecord()]));
  const adapter = transactionAdapter({
    series: [{ ...authorization.candidate.apply_contract.series.values, name: "drifted" }],
    variants: [],
    restock_events: [],
  });
  const result = await executeOfficialQualiaSeriesCanaryTransaction({ adapter, authorization, workflow: { run_id: "902", head_sha: HEAD } });
  assert.equal(result.final_verdict, "OFFICIAL_BOUNDED_WRITE_ROLLED_BACK");
  assert.equal(result.database_writes, 0);
  assert.equal(result.transaction.rollback_attempted, true);
  assert.equal(result.transaction.rollback_verified, true);
});

test("commit outcome unknown and committed post-verify failures retain attempted write truth", async () => {
  const authorization = authorize(readiness([qualiaRecord()]));
  const commitBase = transactionAdapter({ series: [], variants: [], restock_events: [] });
  const unknown = await executeOfficialQualiaSeriesCanaryTransaction({
    adapter: { ...commitBase, async commit() { await commitBase.commit(); throw new Error("connection_lost_after_commit"); } },
    authorization,
    workflow: { run_id: "902", head_sha: HEAD },
  });
  assert.equal(unknown.final_verdict, "OFFICIAL_BOUNDED_WRITE_COMMIT_OUTCOME_UNKNOWN");
  assert.equal(unknown.database_writes, 1);
  assert.equal(unknown.transaction.state, "commit_outcome_unknown");

  const verifyBase = transactionAdapter({ series: [], variants: [], restock_events: [] });
  let committed = false;
  const postVerify = await executeOfficialQualiaSeriesCanaryTransaction({
    adapter: {
      ...verifyBase,
      async commit() { await verifyBase.commit(); committed = true; },
      async readRow(...args) { if (committed) throw new Error("post_commit_read_failed"); return verifyBase.readRow(...args); },
    },
    authorization,
    workflow: { run_id: "902", head_sha: HEAD },
  });
  assert.equal(postVerify.final_verdict, "OFFICIAL_BOUNDED_WRITE_COMMITTED_POST_VERIFY_FAILED");
  assert.equal(postVerify.database_writes, 1);
  assert.equal(postVerify.transaction.state, "committed_post_verify_failed");
});

test("unexpected pre-COMMIT whole-Production delta rolls back", async () => {
  const authorization = authorize(readiness([qualiaRecord()]));
  const base = transactionAdapter({ series: [], variants: [], restock_events: [] });
  let countCalls = 0;
  const result = await executeOfficialQualiaSeriesCanaryTransaction({
    adapter: {
      ...base,
      async captureCounts() {
        countCalls += 1;
        const counts = await base.captureCounts();
        return countCalls === 1 ? counts : { ...counts, variants: counts.variants + 1 };
      },
    },
    authorization,
    workflow: { run_id: "902", head_sha: HEAD },
  });
  assert.equal(result.final_verdict, "OFFICIAL_BOUNDED_WRITE_ROLLED_BACK");
  assert.equal(result.reason_code, "qualia_series_canary_precommit_production_delta");
  assert.equal(result.database_writes, 0);
  assert.equal(result.transaction.rollback_verified, true);
  assert.equal(result.production_counts.precommit_delta.variants, 1);
});

test("unexpected post-COMMIT whole-Production delta remains a committed postflight failure", async () => {
  const authorization = authorize(readiness([qualiaRecord()]));
  const base = transactionAdapter({ series: [], variants: [], restock_events: [] });
  let countCalls = 0;
  const result = await executeOfficialQualiaSeriesCanaryTransaction({
    adapter: {
      ...base,
      async captureCounts() {
        countCalls += 1;
        const value = await base.captureCounts();
        return countCalls === 3 ? { ...value, variants: value.variants + 1 } : value;
      },
    },
    authorization,
    workflow: { run_id: "902", head_sha: HEAD },
  });
  assert.equal(result.final_verdict, "OFFICIAL_BOUNDED_WRITE_COMMITTED_POST_VERIFY_FAILED");
  assert.equal(result.reason_code, "qualia_series_canary_unexpected_production_delta");
  assert.equal(result.database_writes, 1);
  assert.equal(result.production_counts.delta.variants, 1);
});

test("terminal finalizer converts only missing or READY results to truthful zero-write BLOCKED", () => {
  const report = readiness([qualiaRecord()]);
  const authorization = authorize(report);
  const ready = buildOfficialQualiaSeriesCanaryReadyResult({ authorization, workflow: { run_id: "902", head_sha: HEAD } });
  const blocked = finalizeOfficialQualiaSeriesCanaryTerminalResult({ existing: ready, workflow: { run_id: "902", head_sha: HEAD }, auditRunId: AUDIT_RUN_ID, auditDigest: report.canonical_digest, reasonCode: "qualia_series_canary_main_verification_failed" });
  assert.equal(blocked.final_verdict, "OFFICIAL_BOUNDED_WRITE_BLOCKED");
  assert.equal(blocked.database_writes, 0);
  assert.equal(blocked.transaction.state, "not_started");
  assert.equal(blocked.transaction.rollback_attempted, false);
  assert.equal(blocked.reason_code, "qualia_series_canary_main_verification_failed");
  assert.equal(blocked.selected_candidate.apply_contract_digest, authorization.apply_contract_digest);

  for (const terminal of [
    { ...blocked, final_verdict: "OFFICIAL_BOUNDED_WRITE_COMMIT_OUTCOME_UNKNOWN", database_writes: 1, transaction: { state: "commit_outcome_unknown", rollback_attempted: false, rollback_verified: false } },
    { ...blocked, final_verdict: "OFFICIAL_BOUNDED_WRITE_COMMITTED_POST_VERIFY_FAILED", database_writes: 1, transaction: { state: "committed_post_verify_failed", rollback_attempted: false, rollback_verified: false } },
    { ...blocked, final_verdict: "OFFICIAL_BOUNDED_WRITE_COMMITTED", database_writes: 1, transaction: { state: "committed", rollback_attempted: false, rollback_verified: false } },
    blocked,
  ]) assert.equal(finalizeOfficialQualiaSeriesCanaryTerminalResult({ existing: terminal, reasonCode: "overwrite_forbidden" }), terminal);
});

test("Qualia workflows are dispatch-only and statically preserve the series-only authorization boundary", () => {
  for (const workflow of [auditWorkflow, canaryWorkflow]) {
    assert.match(workflow, /workflow_dispatch:/);
    assert.doesNotMatch(workflow, /\bschedule:|\bpush:|\bpull_request:|\bworkflow_run:|\brepository_dispatch:/);
  }
  assert.match(auditWorkflow, /INGESTION_WRITE_DISABLED: "true"/);
  assert.match(auditWorkflow, /official-qualia-series-readiness-audit/);
  const readinessScanBlock = auditWorkflow.slice(auditWorkflow.indexOf("Scan sanitized Qualia series readiness artifact"), auditWorkflow.indexOf("Upload sanitized Qualia series readiness artifact"));
  assert.match(readinessScanBlock, /id: scan/);
  assert.match(readinessScanBlock, /if: \$\{\{ always\(\) \}\}/);
  assert.doesNotMatch(readinessScanBlock, /steps\.audit\.outcome/);
  assert.match(canaryWorkflow, /APPROVE_OFFICIAL_QUALIA_SERIES_CANARY:<MAIN_SHA>:<AUDIT_DIGEST>/);
  assert.doesNotMatch(canaryWorkflow, /apply_contract_digest:/);
  assert.match(canaryWorkflow, /official-qualia-series-readiness-audit-\$\{\{ inputs\.audit_run_id \}\}/);
  assert.match(canaryWorkflow, /Finalize truthful Qualia series canary result/);
  assert.equal((canaryWorkflow.match(/SUPABASE_DB_URL: \$\{\{ secrets\.SUPABASE_DB_URL \}\}/g) || []).length, 1);
  const executeBlock = canaryWorkflow.slice(canaryWorkflow.indexOf("Execute transactional Qualia"), canaryWorkflow.indexOf("Finalize truthful Qualia"));
  assert.match(executeBlock, /SUPABASE_DB_URL: \$\{\{ secrets\.SUPABASE_DB_URL \}\}/);
  assert.ok(canaryWorkflow.indexOf("Authorize Qualia series bounded canary") < canaryWorkflow.indexOf("SUPABASE_DB_URL:"));
  assert.match(readinessScript, /dependencies\.fetchProvider \|\| fetchOfficialProviderSourceExpansionDiagnostic/);
  assert.match(readinessScript, /fetchRowsLimited\("series"/);
  assert.doesNotMatch(readinessScript, /fetchRowsLimited\("variants"|writeRow|INSERT INTO|UPDATE public/);
  assert.ok(canaryScript.indexOf("const authorization = resolveAuthorization()") < canaryScript.indexOf("client = new Client"));
  assert.match(canaryScript, /createOfficialQualiaSeriesPostgresTransactionAdapter/);
  assert.match(canaryDomain, /variant_writes: 0/);
  assert.match(qualiaPostgresAdapter, /BEGIN ISOLATION LEVEL SERIALIZABLE/);
  assert.match(qualiaPostgresAdapter, /official_url = \$2/);
});

test("Qualia artifacts reject approval or credential leakage", () => {
  const report = readiness([qualiaRecord()]);
  const authorization = authorize(report);
  const result = buildOfficialQualiaSeriesCanaryReadyResult({ authorization, workflow: { run_id: "902", head_sha: HEAD } });
  assert.deepEqual(findOfficialBoundedLeaks([{ name: "result.json", text: JSON.stringify(result) }], ["private-approval", "postgres://secret"]), []);
  assert.match(JSON.stringify(report), /"variant_writes":0/);
  assert.doesNotMatch(JSON.stringify(report), /authorization|service_role|SUPABASE_DB_URL/);
});

test("existing F0, Kitan automatic, and P3 V2 workflow meanings remain isolated from Qualia", () => {
  assert.doesNotMatch(f0Workflow, /qualia/i);
  assert.doesNotMatch(kitanWorkflow, /qualia/i);
  assert.doesNotMatch(p3Workflow, /qualia/i);
});

function readiness(records, catalog = {}, options = {}) {
  const providerRecords = options.records ?? [];
  const metadataRecords = options.metadataRecords ?? records;
  const provider = {
    source: "qualia",
    manufacturer: "クオリア",
    mode: "CURRENT",
    archive_cursor: options.archiveCursor || "2026-08",
    detail_attempted: records.length,
    successful_records: providerRecords.length,
    metadata_only_records: metadataRecords.length,
    rejected_records: 0,
    issue_codes: [],
    records: providerRecords,
    metadata_records: metadataRecords,
  };
  return validateOfficialQualiaSeriesReadinessAudit(buildOfficialQualiaSeriesReadinessAudit({
    provider,
    catalog: { series: catalog.series || [], complete: catalog.complete !== false },
    databaseBefore: options.databaseBefore || counts(),
    databaseAfter: options.databaseAfter || counts(),
    workflow: { run_id: AUDIT_RUN_ID, head_sha: HEAD, event_name: "workflow_dispatch", audit_date: "2026-08-20" },
  }));
}

function authorize(report, values = {}) {
  return authorizeOfficialQualiaSeriesCanary({
    report,
    auditRunId: values.auditRunId || AUDIT_RUN_ID,
    auditDigest: values.auditDigest || report.canonical_digest,
    approval: values.approval || `APPROVE_OFFICIAL_QUALIA_SERIES_CANARY:${HEAD}:${report.canonical_digest}`,
    eventName: values.eventName || "workflow_dispatch",
    headSha: values.headSha || HEAD,
    originMainSha: values.originMainSha || HEAD,
  });
}

function transactionAdapter(initial) {
  const base = createOfficialMemoryTransactionAdapter(initial);
  const initialSeries = structuredClone(initial?.series || []);
  return {
    ...base,
    async readSeriesIdentityRows(candidate) {
      return initialSeries.filter((row) => row.id === candidate.series_id
        || row.official_url === candidate.official_url
        || (row.name === candidate.series_name && row.brand === "クオリア"));
    },
  };
}

function qualiaRecord({ id = "2999", name = "最新公式ラインナップ", releaseDate = null, releaseMonth = "2026-08", price = 500, formalVariants = [] } = {}) {
  return {
    source: "qualia",
    source_product_id: id,
    official_url: `https://www.qualia-45.jp/product/view/${id}`,
    series_name: name,
    release_date: releaseDate,
    release_month: releaseMonth,
    price,
    formal_lineup: formalVariants.length > 0,
    variants: formalVariants.map((variantName) => ({ name: variantName })),
    image_scope_candidate: "unknown",
    series_image_candidate: null,
    source_count_conflict: false,
    capability: {
      series_metadata_status: "safe",
      variant_catalog_status: formalVariants.length ? "safe" : "unavailable",
      source_count_conflict: false,
    },
  };
}

function counts() {
  return { series: 10, variants: 20, restock_events: 0, import_issues: 0, review_required: 0, provisional_variants: 0 };
}
