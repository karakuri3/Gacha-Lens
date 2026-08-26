import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createOfficialMemoryTransactionAdapter } from "../lib/domain/official-bounded-write.js";
import { buildKitanStableIdentity, buildOfficialKitanReadinessAudit } from "../lib/domain/official-kitan-canary.js";
import { authorizeOfficialKitanBoundedAuto, buildOfficialKitanBoundedAutoDisabledResult, executeOfficialKitanBoundedAutoTransaction, finalizeOfficialKitanBoundedAutoTerminalResult, finalizeOfficialKitanBoundedAutoTransaction, prepareOfficialKitanBoundedAuto, resolveOfficialKitanBoundedAutoGate } from "../lib/domain/official-kitan-bounded-auto.js";
import { parseProviderDetail } from "../lib/fetchers/official-sources/registry.js";

const HEAD = "a".repeat(40);
const workflow = { run_id: "700", head_sha: HEAD, event_name: "schedule", audit_date: "2026-08-20" };
const autoWorkflow = fs.readFileSync(".github/workflows/gacha-official-kitan-bounded-auto.yml", "utf8");

test("Kitan automatic gate is false by default and exact when enabled", () => {
  for (const input of [{}, { enabled: "false" }, { enabled: "true" }, { enabled: "true", approval: "wrong" }]) assert.equal(resolveOfficialKitanBoundedAutoGate(input).enabled, false);
  assert.equal(resolveOfficialKitanBoundedAutoGate({ enabled: "true", approval: "APPROVE_OFFICIAL_KITAN_BOUNDED_AUTO_V1" }).enabled, true);
  const disabled = buildOfficialKitanBoundedAutoDisabledResult({ workflow });
  assert.equal(disabled.final_verdict, "OFFICIAL_KITAN_BOUNDED_AUTO_DISABLED");
  assert.equal(disabled.database_writes, 0);
});

test("automatic selection skips newest existing no-op and chooses newest safe insert", () => {
  const old = record("old", "2026-08-20");
  const fresh = record("fresh", "2026-08-10");
  const catalog = { series: [{ id: buildKitanStableIdentity("old"), ...seriesValues(old) }], variants: old.variants.map((variant) => ({ id: buildKitanStableIdentity("old", variant.name), series_id: buildKitanStableIdentity("old"), ...variant })) };
  const prepared = prepare(audit([old, fresh], catalog));
  assert.equal(prepared.final_verdict, "OFFICIAL_KITAN_BOUNDED_AUTO_READY");
  assert.equal(prepared.plan.selected_candidate.source_product_id, "fresh");
  assert.equal(prepared.plan.safe_new_insert_candidate_count, 1);
});

test("all no-op or update-only candidates are healthy automatic no-ops", () => {
  const existing = record("existing", "2026-08-20");
  const values = { id: buildKitanStableIdentity("existing"), ...seriesValues(existing) };
  const catalog = { series: [{ ...values, price: 999 }], variants: [] };
  const prepared = prepare(audit([existing], catalog));
  assert.equal(prepared.final_verdict, "OFFICIAL_KITAN_BOUNDED_AUTO_NOOP");
  assert.equal(prepared.plan.manual_update_required_count, 1);
});

test("insert series with an existing variant and source failures block rather than noop", () => {
  const value = record("partial", "2026-08-20");
  const catalog = { series: [], variants: [{ id: buildKitanStableIdentity("partial", value.variants[0].name), series_id: buildKitanStableIdentity("partial"), ...value.variants[0] }] };
  assert.throws(() => prepare(audit([value], catalog)));
  const failed = buildOfficialKitanReadinessAudit({ provider: { source: "kitan_club", parser_success: false, records: [], issue_codes: ["timeout"] }, catalog: { series: [], variants: [] }, databaseBefore: counts(), databaseAfter: counts(), workflow });
  assert.throws(() => prepare(failed));
});

test("all rejected source records block rather than becoming a healthy noop", () => {
  const invalid = { ...record("invalid", "2026-08-20"), price: null };
  const report = audit([invalid]);
  assert.match(report.blockers.join(","), /kitan_no_safe_candidate/);
  assert.throws(() => prepare(report));
});

test("conflict telemetry uses the readiness rejection count, not eligible candidates", () => {
  const conflict = { ...record("conflict", "2026-08-20"), source_count_conflict: true };
  const safe = record("safe", "2026-08-19");
  const prepared = prepare(audit([conflict, safe]));
  assert.equal(prepared.plan.conflict_excluded_count, 1);
});

test("revision, run, audit digest, and selected apply digest are exact before transaction", () => {
  const prepared = prepare(audit([record("ready", "2026-08-20")]));
  for (const values of [{ headSha: "b".repeat(40) }, { originMainSha: "b".repeat(40) }, { auditRunId: "701" }, { auditDigest: "sha256:" + "b".repeat(64) }, { applyDigest: "sha256:" + "b".repeat(64) }]) assert.throws(() => authorize(prepared, values));
});

test("execution rebinds the exact audited candidate and contract before a database connection", () => {
  const report = audit([record("ready", "2026-08-20")]);
  const prepared = prepare(report);
  const tampered = structuredClone(prepared);
  tampered._candidate.apply_contract.variants[0].values.name = "tampered";
  assert.throws(() => authorizeOfficialKitanBoundedAuto({ report, prepared: tampered, auditRunId: workflow.run_id, auditDigest: report.canonical_digest, headSha: HEAD, originMainSha: HEAD, applyDigest: prepared.plan.selected_apply_contract_digest }));
  const absent = audit([record("other", "2026-08-20")]);
  assert.throws(() => authorizeOfficialKitanBoundedAuto({ report: absent, prepared, auditRunId: workflow.run_id, auditDigest: prepared.audit_digest, headSha: HEAD, originMainSha: HEAD, applyDigest: prepared.plan.selected_apply_contract_digest }));
});

test("insert-only bounded transaction commits exact series and variant counts", async () => {
  const prepared = prepare(audit([record("ready", "2026-08-20")]));
  const authorization = authorize(prepared);
  const adapter = createOfficialMemoryTransactionAdapter();
  const result = await executeOfficialKitanBoundedAutoTransaction({ adapter, authorization, workflow });
  assert.equal(result.final_verdict, "OFFICIAL_BOUNDED_WRITE_COMMITTED");
  assert.equal(result.operations.series, 1);
  assert.equal(result.operations.variants, authorization.candidate.variant_count);
  assert.equal(result.operations.restock_events, 0);
});

test("transaction failure verdicts preserve attempted writes and transaction state", () => {
  const prepared = prepare(audit([record("ready", "2026-08-20")]));
  const bounded = { final_verdict: "OFFICIAL_BOUNDED_WRITE_COMMIT_OUTCOME_UNKNOWN", database_writes: 7, operations: { series: 1, variants: 6, restock_events: 0 }, planned_operations: {}, committed_operations: {}, before_digests: { a: "x" }, after_digests: {}, transaction: { state: "commit_outcome_unknown", rollback_attempted: false, rollback_verified: false }, reason_code: "commit_lost" };
  const result = finalizeOfficialKitanBoundedAutoTransaction({ prepared, bounded });
  assert.equal(result.final_verdict, "OFFICIAL_KITAN_BOUNDED_AUTO_COMMIT_OUTCOME_UNKNOWN");
  assert.equal(result.database_writes, 7);
  assert.equal(result.transaction.state, "commit_outcome_unknown");
  const postVerify = finalizeOfficialKitanBoundedAutoTransaction({ prepared, bounded: { ...bounded, final_verdict: "OFFICIAL_BOUNDED_WRITE_COMMITTED_POST_VERIFY_FAILED", transaction: { state: "committed_post_verify_failed", rollback_attempted: false, rollback_verified: false } } });
  assert.equal(postVerify.final_verdict, "OFFICIAL_KITAN_BOUNDED_AUTO_COMMITTED_POST_VERIFY_FAILED");
  assert.equal(postVerify.database_writes, 7);
});

test("postflight mismatch preserves a committed transaction instead of replacing it with zero-write blocked", () => {
  const prepared = prepare(audit([record("ready", "2026-08-20")]));
  const bounded = { final_verdict: "OFFICIAL_BOUNDED_WRITE_COMMITTED", database_writes: 7, operations: { series: 1, variants: 6, restock_events: 0 }, planned_operations: {}, committed_operations: {}, before_digests: {}, after_digests: {}, transaction: { state: "committed", rollback_attempted: false, rollback_verified: false }, reason_code: null };
  const result = finalizeOfficialKitanBoundedAutoTransaction({ prepared, bounded, before: counts(), after: counts(), postflightReason: "official_kitan_bounded_auto_postflight_failed" });
  assert.equal(result.final_verdict, "OFFICIAL_KITAN_BOUNDED_AUTO_POSTFLIGHT_FAILED");
  assert.equal(result.database_writes, 7);
  assert.equal(result.transaction.state, "committed");
});

test("terminal finalizer converts a pre-write READY plan into a zero-write blocked artifact", () => {
  const ready = prepare(audit([record("ready", "2026-08-20")]));
  const blocked = finalizeOfficialKitanBoundedAutoTerminalResult({ existing: ready, workflow, reasonCode: "official_kitan_bounded_auto_main_verification_failed" });
  assert.equal(blocked.final_verdict, "OFFICIAL_KITAN_BOUNDED_AUTO_BLOCKED");
  assert.equal(blocked.database_writes, 0);
  assert.equal(blocked.transaction.state, "not_started");
  assert.equal(blocked.transaction.rollback_attempted, false);
  assert.equal(blocked.reason_code, "official_kitan_bounded_auto_main_verification_failed");
  assert.equal(blocked.plan.selected_apply_contract_digest, ready.plan.selected_apply_contract_digest);
});

test("terminal finalizer never overwrites committed, uncertain, failed postflight, noop, or disabled truth", () => {
  const base = prepare(audit([record("ready", "2026-08-20")]));
  for (const final_verdict of ["OFFICIAL_KITAN_BOUNDED_AUTO_COMMITTED", "OFFICIAL_KITAN_BOUNDED_AUTO_COMMIT_OUTCOME_UNKNOWN", "OFFICIAL_KITAN_BOUNDED_AUTO_COMMITTED_POST_VERIFY_FAILED", "OFFICIAL_KITAN_BOUNDED_AUTO_POSTFLIGHT_FAILED", "OFFICIAL_KITAN_BOUNDED_AUTO_NOOP", "OFFICIAL_KITAN_BOUNDED_AUTO_DISABLED"]) {
    const existing = { ...base, final_verdict, database_writes: final_verdict.includes("UNKNOWN") ? 7 : 0, transaction: { state: final_verdict.includes("UNKNOWN") ? "commit_outcome_unknown" : "committed" } };
    assert.strictEqual(finalizeOfficialKitanBoundedAutoTerminalResult({ existing, workflow, reasonCode: "later_failure" }), existing, final_verdict);
  }
});

test("workflow is schedule-only, gated before audit secrets, and shares the bounded concurrency lock", () => {
  assert.match(autoWorkflow, /cron: "37 2 \* \* \*"/);
  assert.match(autoWorkflow, /group: gacha-official-bounded-write/);
  assert.match(autoWorkflow, /cancel-in-progress: false/);
  assert.doesNotMatch(autoWorkflow, /workflow_dispatch:|\bpush:|pull_request:|workflow_run:|repository_dispatch:/);
  assert.ok(autoWorkflow.indexOf("Resolve false-by-default Kitan automatic gate") < autoWorkflow.indexOf("Run same-run read-only Kitan readiness audit"));
  assert.match(autoWorkflow, /Finalize Kitan automatic terminal result/);
  assert.ok(autoWorkflow.indexOf("Finalize Kitan automatic terminal result") < autoWorkflow.indexOf("Scan sanitized Kitan automatic artifact"));
  assert.match(autoWorkflow, /SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/);
  assert.doesNotMatch(autoWorkflow, /OFFICIAL_BOUNDED_AUTO_ENABLED|APPROVE_OFFICIAL_BOUNDED_AUTO_V1/);
});

function prepare(report) { return prepareOfficialKitanBoundedAuto({ report, auditRunId: workflow.run_id, auditDigest: report.canonical_digest, headSha: HEAD, originMainSha: HEAD, workflow }); }
function authorize(prepared, changes = {}) { return authorizeOfficialKitanBoundedAuto({ report: changes.report || audit([record("ready", "2026-08-20")]), prepared, auditRunId: changes.auditRunId || workflow.run_id, auditDigest: changes.auditDigest || prepared.audit_digest, headSha: changes.headSha || HEAD, originMainSha: changes.originMainSha || HEAD, applyDigest: changes.applyDigest || prepared.plan.selected_apply_contract_digest }); }
function audit(records, catalog = { series: [], variants: [] }) { return buildOfficialKitanReadinessAudit({ provider: { source: "kitan_club", parser_success: true, issue_codes: [], records }, catalog, databaseBefore: counts(), databaseAfter: counts(), workflow }); }
function record(productId, releaseDate) { const html = fs.readFileSync("tests/fixtures/official/kitan-capwatch-qbb-detail.html", "utf8"); const parsed = parseProviderDetail("kitan_club", html, `https://kitan.jp/products/${productId}/`); assert.equal(parsed.ok, true); return { ...parsed.record, source_product_id: productId, official_url: `https://kitan.jp/products/${productId}/`, series_name: `Kitan ${productId}`, release_date: releaseDate, release_month: releaseDate.slice(0, 7) }; }
function seriesValues(record) { return { slug: buildKitanStableIdentity(record.source_product_id), name: record.series_name, brand: "キタンクラブ", source_type: "official_site", official_url: record.official_url, release_date: record.release_date, release_month: record.release_month, price: record.price }; }
function counts() { return { series: 1, variants: 2, restock_events: 0, import_issues: 0, review_required: 0, provisional_variants: 0 }; }
