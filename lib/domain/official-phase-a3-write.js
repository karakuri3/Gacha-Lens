import { validateOfficialPhaseA3Snapshot } from "./official-phase-a3.js";

export const OFFICIAL_PHASE_A3_WRITE_RESULT_SCHEMA_VERSION = 1;

const APPROVAL_PATTERN_V2 = /^APPROVE_GACHA_PHASE_A3_WRITE_V2:([0-9a-f]{40}):(\d+):(sha256:[0-9a-f]{64}):(sha256:[0-9a-f]{64})$/;

export function authorizeOfficialPhaseA3Write({
  report,
  auditRunId,
  planDigest,
  writeContractDigest,
  approval,
  headSha,
  originMainSha,
} = {}) {
  validateOfficialPhaseA3Snapshot(report);

  const currentSha = normalizedSha(headSha);
  const originSha = normalizedSha(originMainSha);
  const reportSha = normalizedSha(report?.workflow?.head_sha);
  const requestedRunId = numericId(auditRunId);
  const reportRunId = numericId(report?.workflow?.run_id);
  const requestedDigest = text(planDigest);
  const requestedWriteContractDigest = text(writeContractDigest);
  const match = text(approval).match(APPROVAL_PATTERN_V2);

  if (!currentSha || currentSha !== originSha || currentSha !== reportSha) {
    throw phaseA3WriteError("phase_a3_write_main_sha_mismatch");
  }
  if (!requestedRunId || requestedRunId !== reportRunId) {
    throw phaseA3WriteError("phase_a3_write_audit_run_mismatch");
  }
  if (report?.workflow?.event_name !== "push") {
    throw phaseA3WriteError("phase_a3_write_audit_event_invalid");
  }
  if (requestedDigest !== report?.plan?.plan_digest) {
    throw phaseA3WriteError("phase_a3_write_plan_digest_mismatch");
  }
  if (requestedWriteContractDigest !== report?.plan?.write_contract_digest) {
    throw phaseA3WriteError("phase_a3_write_contract_digest_mismatch");
  }
  if (!match || normalizedSha(match[1]) !== currentSha || numericId(match[2]) !== requestedRunId
    || match[3] !== requestedDigest || match[4] !== requestedWriteContractDigest) {
    throw phaseA3WriteError("phase_a3_write_approval_mismatch");
  }
  if (report?.final_verdict !== "OFFICIAL_PHASE_A3_PREFLIGHT_READY"
    || report?.execution?.mode !== "read-only"
    || report?.execution?.writes_allowed !== false
    || report?.execution?.deletes_allowed !== false
    || report?.execution?.cleanup_enabled !== false) {
    throw phaseA3WriteError("phase_a3_write_audit_not_ready");
  }
  if (Object.values(report?.database?.delta || {}).some((value) => Number(value) !== 0)) {
    throw phaseA3WriteError("phase_a3_write_audit_database_drift");
  }

  const targetSeries = nonNegativeInt(report?.plan?.target_series);
  const targetVariants = nonNegativeInt(report?.plan?.target_variants);
  const safeRecords = nonNegativeInt(report?.counts?.safe_records);
  const safeVariants = nonNegativeInt(report?.counts?.safe_variants);
  if (!targetSeries || !targetVariants || targetSeries !== safeRecords || targetVariants !== safeVariants
    || Number(report?.plan?.writes) !== targetVariants
    || Number(report?.plan?.series_writes) !== 0
    || Number(report?.plan?.restock_event_writes) !== 0
    || Number(report?.plan?.import_issue_writes) !== 0
    || Number(report?.plan?.deletes) !== 0) {
    throw phaseA3WriteError("phase_a3_write_audit_scope_invalid");
  }

  return {
    ok: true,
    head_sha: currentSha,
    audit_run_id: requestedRunId,
    plan_digest: requestedDigest,
    write_contract_digest: requestedWriteContractDigest,
    approval_mode: "stable_contract_v2",
    expectation: {
      plan_digest: null,
      write_contract_digest: requestedWriteContractDigest,
      known_undetailed: nonNegativeInt(report?.counts?.known_undetailed),
      safe_records: safeRecords,
      safe_variants: safeVariants,
      rerelease_records: nonNegativeInt(report?.counts?.rerelease_records),
      unresolved_records: nonNegativeInt(report?.counts?.unresolved_records),
      identity_disambiguations: nonNegativeInt(report?.plan?.identity_disambiguations),
      held_shared_detailed_urls: nonNegativeInt(report?.scan?.held_shared_detailed_urls),
      held_unsupported_provider_urls: nonNegativeInt(report?.scan?.held_unsupported_provider_urls),
    },
    database: {
      series: nonNegativeInt(report?.database?.after?.series),
      variants: nonNegativeInt(report?.database?.after?.variants),
      provisional_variants: nonNegativeInt(report?.database?.after?.provisional_variants),
      restock_events: nonNegativeInt(report?.database?.after?.restock_events),
      import_issues: nonNegativeInt(report?.database?.after?.import_issues),
    },
  };
}

export function expectedOfficialPhaseA3PostCounts(before = {}, plan = {}) {
  const targetSeries = nonNegativeInt(plan?.target_series);
  const targetVariants = nonNegativeInt(plan?.target_variants);
  return {
    series: nonNegativeInt(before.series),
    variants: nonNegativeInt(before.variants) + targetVariants,
    provisional_variants: nonNegativeInt(before.provisional_variants),
    restock_events: nonNegativeInt(before.restock_events),
    import_issues: nonNegativeInt(before.import_issues),
    official_without_real: nonNegativeInt(before.official_without_real) - targetSeries,
  };
}

export function verifyOfficialPhaseA3PostState({
  before,
  after,
  plan,
  insertedIdCount,
  insertedSlugCount,
  targetDetailedCount,
} = {}) {
  const expected = expectedOfficialPhaseA3PostCounts(before, plan);
  const observed = normalizeCounts(after);
  const targetVariants = nonNegativeInt(plan?.target_variants);
  const targetSeries = nonNegativeInt(plan?.target_series);
  if (expected.official_without_real < 0
    || !countsEqual(expected, observed)
    || Number(insertedIdCount) !== targetVariants
    || Number(insertedSlugCount) !== targetVariants
    || Number(targetDetailedCount) !== targetSeries) {
    throw phaseA3WriteError("phase_a3_write_post_verify_failed");
  }
  return {
    ok: true,
    expected,
    observed,
    inserted_id_count: targetVariants,
    inserted_slug_count: targetVariants,
    target_detailed_count: targetSeries,
  };
}

export function buildOfficialPhaseA3WriteResult({
  workflow = {},
  authorization = null,
  plan = null,
  transaction = null,
  before = null,
  after = null,
  postVerify = null,
  reasonCode = null,
  finalVerdict = "OFFICIAL_PHASE_A3_WRITE_BLOCKED",
} = {}) {
  const targetSeries = nonNegativeInt(plan?.target_series || authorization?.expectation?.safe_records);
  const targetVariants = nonNegativeInt(plan?.target_variants || authorization?.expectation?.safe_variants);
  const transactionState = text(transaction?.state) || "not_started";
  const result = {
    schema_version: OFFICIAL_PHASE_A3_WRITE_RESULT_SCHEMA_VERSION,
    run_id: numericId(workflow.run_id),
    head_sha: normalizedSha(workflow.head_sha) || authorization?.head_sha || null,
    audit_run_id: numericId(authorization?.audit_run_id),
    approval_mode: text(authorization?.approval_mode) || null,
    audit_plan_digest: validDigest(authorization?.plan_digest) ? authorization.plan_digest : null,
    execution_plan_digest: validDigest(plan?.plan_digest) ? plan.plan_digest : null,
    audit_write_contract_digest: validDigest(authorization?.write_contract_digest) ? authorization.write_contract_digest : null,
    execution_write_contract_digest: validDigest(plan?.write_contract_digest) ? plan.write_contract_digest : null,
    metadata_drift: validDigest(authorization?.plan_digest) && validDigest(plan?.plan_digest)
      ? authorization.plan_digest !== plan.plan_digest
      : false,
    plan: {
      target_series: targetSeries,
      target_variants: targetVariants,
      identity_disambiguations: nonNegativeInt(plan?.identity_disambiguations),
      series_writes: 0,
      restock_event_writes: 0,
      import_issue_writes: 0,
      deletes: 0,
    },
    database: {
      before: before ? normalizeCounts(before) : null,
      after: after ? normalizeCounts(after) : null,
      delta: before && after ? countsDelta(before, after) : null,
      writes: transactionState === "committed" || transactionState === "committed_post_verify_failed"
        ? nonNegativeInt(transaction?.database_writes)
        : transactionState === "commit_outcome_unknown"
          ? null
          : 0,
      writes_confirmed: transactionState === "committed" || transactionState === "committed_post_verify_failed",
      possible_writes: transactionState === "commit_outcome_unknown"
        ? nonNegativeInt(transaction?.database_writes)
        : 0,
    },
    transaction: {
      state: transactionState,
      rollback_attempted: Boolean(transaction?.rollback_attempted),
      rollback_verified: Boolean(transaction?.rollback_verified),
    },
    post_verify: postVerify ? {
      ok: postVerify.ok === true,
      inserted_id_count: nonNegativeInt(postVerify.inserted_id_count),
      inserted_slug_count: nonNegativeInt(postVerify.inserted_slug_count),
      target_detailed_count: nonNegativeInt(postVerify.target_detailed_count),
      expected: normalizeCounts(postVerify.expected),
      observed: normalizeCounts(postVerify.observed),
    } : null,
    reason_code: safeReasonCode(reasonCode),
    final_verdict: finalVerdict,
  };
  return validateOfficialPhaseA3WriteResult(result);
}

export function validateOfficialPhaseA3WriteResult(result) {
  if (result?.schema_version !== OFFICIAL_PHASE_A3_WRITE_RESULT_SCHEMA_VERSION) {
    throw new Error("Phase A3 write result schema is invalid.");
  }
  if (![
    "OFFICIAL_PHASE_A3_WRITE_BLOCKED",
    "OFFICIAL_PHASE_A3_WRITE_ROLLED_BACK",
    "OFFICIAL_PHASE_A3_WRITE_COMMITTED",
    "OFFICIAL_PHASE_A3_WRITE_COMMITTED_POST_VERIFY_FAILED",
    "OFFICIAL_PHASE_A3_WRITE_COMMIT_OUTCOME_UNKNOWN",
  ].includes(result.final_verdict)) {
    throw new Error("Phase A3 write result verdict is invalid.");
  }
  if (result.plan?.series_writes !== 0 || result.plan?.restock_event_writes !== 0
    || result.plan?.import_issue_writes !== 0 || result.plan?.deletes !== 0) {
    throw new Error("Phase A3 write result scope is invalid.");
  }
  if (result.final_verdict === "OFFICIAL_PHASE_A3_WRITE_COMMITTED") {
    if (result.transaction?.state !== "committed" || result.post_verify?.ok !== true
      || Number(result.database?.writes) !== Number(result.plan?.target_variants)
      || result.approval_mode !== "stable_contract_v2"
      || !validDigest(result.audit_write_contract_digest)
      || result.audit_write_contract_digest !== result.execution_write_contract_digest) {
      throw new Error("Phase A3 committed result is not fully verified.");
    }
  }
  return result;
}

export function formatOfficialPhaseA3WriteResultMarkdown(result) {
  return [
    "# Official Phase A3 write result",
    "",
    "- Verdict: " + result.final_verdict,
    "- Head SHA: " + (result.head_sha || "none"),
    "- Audit run ID: " + (result.audit_run_id || "none"),
    "- Approval mode: " + (result.approval_mode || "none"),
    "- Audit plan digest: " + (result.audit_plan_digest || "none"),
    "- Execution plan digest: " + (result.execution_plan_digest || "none"),
    "- Audit write contract digest: " + (result.audit_write_contract_digest || "none"),
    "- Execution write contract digest: " + (result.execution_write_contract_digest || "none"),
    "- Metadata drift allowed by V2 contract: " + result.metadata_drift,
    "- Target series: " + result.plan.target_series,
    "- Target variants: " + result.plan.target_variants,
    "- Identity disambiguations: " + result.plan.identity_disambiguations,
    "- Transaction: " + result.transaction.state,
    "- Confirmed database writes: " + (result.database.writes == null ? "unknown" : result.database.writes),
    "- Possible writes if commit outcome is unknown: " + result.database.possible_writes,
    "- Writes confirmed: " + result.database.writes_confirmed,
    "- Post-verify: " + (result.post_verify?.ok === true),
    "- Reason: " + (result.reason_code || "none"),
    "- Series writes: 0",
    "- Restock-event writes: 0",
    "- Import-issue writes: 0",
    "- Deletes: 0",
    "",
  ].join("\n");
}

function normalizeCounts(value = {}) {
  return {
    series: nonNegativeInt(value.series),
    variants: nonNegativeInt(value.variants),
    provisional_variants: nonNegativeInt(value.provisional_variants),
    restock_events: nonNegativeInt(value.restock_events),
    import_issues: nonNegativeInt(value.import_issues),
    official_without_real: nonNegativeInt(value.official_without_real),
  };
}

function countsEqual(left, right) {
  return Object.keys(normalizeCounts(left)).every((key) => Number(left?.[key] || 0) === Number(right?.[key] || 0));
}

function countsDelta(before, after) {
  const left = normalizeCounts(before);
  const right = normalizeCounts(after);
  return Object.fromEntries(Object.keys(left).map((key) => [key, right[key] - left[key]]));
}

function nonNegativeInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizedSha(value) {
  const normalized = text(value).toLowerCase();
  return /^[0-9a-f]{40}$/.test(normalized) ? normalized : "";
}

function numericId(value) {
  const normalized = text(value);
  return /^\d+$/.test(normalized) ? normalized : null;
}

function validDigest(value) {
  return /^sha256:[0-9a-f]{64}$/.test(text(value));
}

function safeReasonCode(value) {
  const normalized = text(value);
  return /^[a-z0-9_]{1,120}$/i.test(normalized) ? normalized : null;
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function phaseA3WriteError(reasonCode) {
  const error = new Error(reasonCode);
  error.reason_code = reasonCode;
  return error;
}
