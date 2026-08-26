import { officialCanonicalDigest, validateOfficialApplyOperation } from "./official-apply-contract.js";
import { executeOfficialBoundedTransaction } from "./official-bounded-write.js";
import { validateOfficialKitanReadinessAudit } from "./official-kitan-canary.js";

export const OFFICIAL_KITAN_BOUNDED_AUTO_SCHEMA_VERSION = 1;
export const OFFICIAL_KITAN_BOUNDED_AUTO_APPROVAL = "APPROVE_OFFICIAL_KITAN_BOUNDED_AUTO_V1";
export const OFFICIAL_KITAN_BOUNDED_AUTO_LIMITS = Object.freeze({ max_series: 1, max_variants: 12, max_restock_events: 0, max_deletes: 0, max_cleanup_operations: 0, max_import_issue_writes: 0 });

export function resolveOfficialKitanBoundedAutoGate({ enabled, approval } = {}) {
  const active = text(enabled) === "true" && text(approval) === OFFICIAL_KITAN_BOUNDED_AUTO_APPROVAL;
  return { enabled: active, reason_code: active ? null : "official_kitan_bounded_auto_disabled" };
}

export function buildOfficialKitanBoundedAutoDisabledResult({ workflow = {} } = {}) {
  return result({ workflow, gate: false, auditDigest: null, plan: emptyPlan(), database: emptyDatabase(), reasonCode: "official_kitan_bounded_auto_disabled", finalVerdict: "OFFICIAL_KITAN_BOUNDED_AUTO_DISABLED" });
}

export function prepareOfficialKitanBoundedAuto({ report, auditRunId, auditDigest, headSha, originMainSha, workflow = {} } = {}) {
  validateOfficialKitanReadinessAudit(report);
  const head = sha(headSha);
  const origin = sha(originMainSha);
  if (!head || head !== origin || head !== sha(report.workflow?.head_sha)) throw coded("official_kitan_bounded_auto_main_sha_mismatch");
  if (id(auditRunId) !== id(report.workflow?.run_id) || id(auditRunId) !== id(workflow.run_id)) throw coded("official_kitan_bounded_auto_audit_run_mismatch");
  if (text(auditDigest) !== report.canonical_digest) throw coded("official_kitan_bounded_auto_audit_digest_mismatch");
  if (report.report_complete !== true || report.database?.writes !== 0 || (report.blockers || []).length) throw coded("official_kitan_bounded_auto_audit_blocked");
  const classified = classifyCandidates(report.plan?.automatic_candidates, report.plan?.selected_candidate);
  const selected = classified.safe_new_insert_candidates[0] || null;
  const plan = {
    eligible_source_candidate_count: classified.eligible_source_candidate_count,
    safe_new_insert_candidate_count: classified.safe_new_insert_candidates.length,
    existing_noop_count: classified.existing_noop_count,
    manual_update_required_count: classified.manual_update_required_count,
    conflict_excluded_count: Number(report.source?.source_count_conflict_excluded_count || 0),
    selected_candidate: selected ? summarize(selected) : null,
    selected_apply_contract_digest: selected?.apply_contract?.canonical_digest || null,
  };
  if (!selected) return result({ workflow, gate: true, auditDigest, plan, database: emptyDatabase(), reasonCode: "no_new_insert_candidate", finalVerdict: "OFFICIAL_KITAN_BOUNDED_AUTO_NOOP" });
  validateInsertOnly(selected);
  return result({ workflow, gate: true, auditDigest, plan, database: emptyDatabase(), reasonCode: null, finalVerdict: "OFFICIAL_KITAN_BOUNDED_AUTO_READY", candidate: selected });
}

export function authorizeOfficialKitanBoundedAuto({ report, prepared, auditRunId, auditDigest, headSha, originMainSha, applyDigest } = {}) {
  if (prepared?.final_verdict !== "OFFICIAL_KITAN_BOUNDED_AUTO_READY" || !prepared._candidate) throw coded("official_kitan_bounded_auto_not_ready");
  validateOfficialKitanReadinessAudit(report);
  const head = sha(headSha);
  if (!head || head !== sha(originMainSha) || head !== sha(prepared.head_sha)) throw coded("official_kitan_bounded_auto_main_sha_mismatch");
  if (id(auditRunId) !== id(prepared.run_id) || id(auditRunId) !== id(report.workflow?.run_id) || text(auditDigest) !== text(prepared.audit_digest) || text(auditDigest) !== text(report.canonical_digest) || head !== sha(report.workflow?.head_sha)) throw coded("official_kitan_bounded_auto_audit_binding_mismatch");
  const auditedCandidate = (report.plan?.automatic_candidates || []).find((candidate) => candidate.series_id === prepared._candidate.series_id && candidate.source_product_id === prepared._candidate.source_product_id);
  if (!auditedCandidate) throw coded("official_kitan_bounded_auto_audited_candidate_missing");
  const preparedDigest = candidateDigest(prepared._candidate);
  const auditedDigest = candidateDigest(auditedCandidate);
  if (preparedDigest !== auditedDigest || text(applyDigest) !== text(prepared.plan.selected_apply_contract_digest) || text(applyDigest) !== text(prepared._candidate.apply_contract?.canonical_digest) || text(applyDigest) !== text(auditedCandidate.apply_contract?.canonical_digest)) throw coded("official_kitan_bounded_auto_apply_digest_mismatch");
  validateInsertOnly(auditedCandidate);
  return { ok: true, kind: "kitan_bounded_automatic", head_sha: head, audit_run_id: id(auditRunId), audit_digest: text(auditDigest), approval_digest: text(auditDigest), candidate: auditedCandidate };
}

export async function executeOfficialKitanBoundedAutoTransaction({ adapter, authorization, workflow = {} } = {}) {
  if (authorization?.kind !== "kitan_bounded_automatic") throw coded("official_kitan_bounded_auto_authorization_missing");
  validateInsertOnly(authorization.candidate);
  return executeOfficialBoundedTransaction({ adapter, authorization, workflow });
}

export function finalizeOfficialKitanBoundedAutoTransaction({ prepared, bounded, before = null, after = null, postflightReason = null } = {}) {
  if (!bounded?.final_verdict) throw coded("official_kitan_bounded_auto_transaction_result_missing");
  const expected = bounded.final_verdict === "OFFICIAL_BOUNDED_WRITE_COMMITTED";
  const database = { before, after, delta: before && after ? countDelta(before, after) : null, writes: Number(bounded.database_writes || 0), deletes: 0, cleanup_operations: 0, import_issue_writes: 0 };
  const exactDelta = expected && !postflightReason && exactInsertDelta(database.delta, bounded.operations?.variants);
  const finalVerdict = bounded.final_verdict === "OFFICIAL_BOUNDED_WRITE_COMMITTED"
    ? exactDelta ? "OFFICIAL_KITAN_BOUNDED_AUTO_COMMITTED" : "OFFICIAL_KITAN_BOUNDED_AUTO_POSTFLIGHT_FAILED"
    : bounded.final_verdict === "OFFICIAL_BOUNDED_WRITE_COMMIT_OUTCOME_UNKNOWN"
      ? "OFFICIAL_KITAN_BOUNDED_AUTO_COMMIT_OUTCOME_UNKNOWN"
      : bounded.final_verdict === "OFFICIAL_BOUNDED_WRITE_COMMITTED_POST_VERIFY_FAILED"
        ? "OFFICIAL_KITAN_BOUNDED_AUTO_COMMITTED_POST_VERIFY_FAILED"
        : bounded.final_verdict;
  return {
    ...prepared,
    _candidate: undefined,
    database,
    database_writes: database.writes,
    operations: bounded.operations,
    planned_operations: bounded.planned_operations,
    committed_operations: bounded.committed_operations,
    before_digests: bounded.before_digests,
    after_digests: bounded.after_digests,
    transaction: bounded.transaction,
    underlying_verdict: bounded.final_verdict,
    reason_code: postflightReason || bounded.reason_code || null,
    final_verdict: finalVerdict,
  };
}

export function formatOfficialKitanBoundedAutoMarkdown(value) {
  return ["# Official Kitan bounded automatic result", "", `- Verdict: ${value.final_verdict}`, `- Provider: kitan_club`, `- Run ID: ${value.run_id || "none"}`, `- Head SHA: ${value.head_sha || "none"}`, `- Gate enabled: ${value.automatic_gate_enabled}`, `- Audit digest: ${value.audit_digest || "none"}`, `- Eligible source candidates: ${value.plan.eligible_source_candidate_count}`, `- Safe new inserts: ${value.plan.safe_new_insert_candidate_count}`, `- Existing no-ops: ${value.plan.existing_noop_count}`, `- Manual updates required: ${value.plan.manual_update_required_count}`, `- Selected series: ${value.plan.selected_candidate?.series_id || "none"}`, `- Database writes: ${value.database_writes}`, `- Deletes: 0`, `- Cleanup operations: 0`, `- Reason: ${value.reason_code || "none"}`, ""].join("\n");
}

function classifyCandidates(eligible, selected) {
  // The readiness report deliberately exposes summaries for non-selected candidates.
  // Only the selected candidate carries a write contract, so it is the only entry that
  // can ever reach execution; a fresh audit orders candidates deterministically.
  const candidates = [selected, ...(Array.isArray(eligible) ? eligible : [])].filter(Boolean);
  const unique = [...new Map(candidates.map((candidate) => [text(candidate.series_id), candidate])).values()];
  const safeNew = unique.filter((candidate) => candidate.apply_contract && isInsertOnly(candidate)).sort(compare);
  return {
    eligible_source_candidate_count: unique.length,
    safe_new_insert_candidates: safeNew,
    existing_noop_count: unique.filter((candidate) => candidate.operation === "none").length,
    manual_update_required_count: unique.filter((candidate) => candidate.operation === "update" || candidate.variants?.some((variant) => variant.operation === "update")).length,
    conflict_excluded_count: 0,
  };
}
function isInsertOnly(candidate) { return candidate?.apply_contract?.series?.operation === "insert" && Array.isArray(candidate.apply_contract?.variants) && candidate.apply_contract.variants.length > 0 && candidate.apply_contract.variants.every((operation) => operation.operation === "insert"); }
function validateInsertOnly(candidate) {
  if (!isInsertOnly(candidate) || candidate.variant_count < 1 || candidate.variant_count > OFFICIAL_KITAN_BOUNDED_AUTO_LIMITS.max_variants || candidate.apply_contract?.restock_event || candidate.apply_contract?.deletes !== 0 || candidate.apply_contract?.cleanup_operations !== 0 || candidate.apply_contract?.import_issue_writes !== 0) throw coded("official_kitan_bounded_auto_insert_only_contract_invalid");
  validateOfficialApplyOperation(candidate.apply_contract.series, "series");
  candidate.apply_contract.variants.forEach((operation) => validateOfficialApplyOperation(operation, "variants"));
  const clone = structuredClone(candidate.apply_contract); delete clone.canonical_digest;
  if (candidate.apply_contract.canonical_digest !== officialCanonicalDigest(clone)) throw coded("official_kitan_bounded_auto_apply_digest_invalid");
}
function compare(left, right) { return releaseKey(right).localeCompare(releaseKey(left)) || text(left.source_product_id).localeCompare(text(right.source_product_id), "en") || text(left.series_id).localeCompare(text(right.series_id), "en"); }
function releaseKey(candidate) { return text(candidate?.canonical_release?.release_date) || text(candidate?.canonical_release?.release_month) || "0000-00-00"; }
function summarize(candidate) { return { series_id: candidate.series_id, source_product_id: candidate.source_product_id, series_name: candidate.series_name, variant_count: candidate.variant_count, official_url: candidate.official_url }; }
function emptyPlan() { return { eligible_source_candidate_count: 0, safe_new_insert_candidate_count: 0, existing_noop_count: 0, manual_update_required_count: 0, conflict_excluded_count: 0, selected_candidate: null, selected_apply_contract_digest: null }; }
function emptyDatabase() { return { before: null, after: null, delta: null, writes: 0, deletes: 0, cleanup_operations: 0, import_issue_writes: 0 }; }
function result({ workflow, gate, auditDigest, plan, database, reasonCode, finalVerdict, candidate = null }) { return { schema_version: OFFICIAL_KITAN_BOUNDED_AUTO_SCHEMA_VERSION, provider: "kitan_club", automatic_gate_enabled: gate, run_id: id(workflow.run_id), head_sha: sha(workflow.head_sha) || null, audit_digest: text(auditDigest) || null, plan, database, database_writes: database.writes, deletes: 0, cleanup_operations: 0, import_issue_writes: 0, transaction: { state: "not_started", rollback_attempted: false, rollback_verified: false }, reason_code: reasonCode, final_verdict: finalVerdict, ...(candidate ? { _candidate: candidate } : {}) }; }
function text(value) { return value == null ? "" : String(value).trim(); }
function sha(value) { const normalized = text(value).toLowerCase(); return /^[0-9a-f]{40}$/.test(normalized) ? normalized : ""; }
function id(value) { const normalized = text(value); return /^\d+$/.test(normalized) ? normalized : null; }
function candidateDigest(candidate) { return officialCanonicalDigest(candidate); }
function countDelta(before, after) { return Object.fromEntries(["series", "variants", "restock_events", "import_issues", "review_required", "provisional_variants"].map((key) => [key, Number(after?.[key]) - Number(before?.[key])])); }
function exactInsertDelta(delta, variants) { return Boolean(delta) && delta.series === 1 && delta.variants === Number(variants) && delta.restock_events === 0 && delta.import_issues === 0 && delta.review_required === 0 && delta.provisional_variants === 0; }
function coded(reason_code) { const error = new Error(reason_code); error.reason_code = reason_code; return error; }
