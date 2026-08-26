import { createHash } from "node:crypto";
import {
  OFFICIAL_APPLY_CONTRACT_SCHEMA_VERSION,
  buildOfficialApplyOperation,
  buildOfficialSeriesWriteValues,
  digestOfficialRow,
  digestOfficialPreconditionRow,
  officialCanonicalDigest,
  validateOfficialApplyOperation,
} from "./official-apply-contract.js";
import {
  OFFICIAL_BOUNDED_RESULT_SCHEMA_VERSION,
  assertOfficialCanonicalReleaseSafe,
  assertOfficialOperationExpectedRow,
  assertOfficialOperationPrecondition,
  assertOfficialOperationWriteCounts,
  buildOfficialCandidateOperations,
  buildOfficialBoundedBlockedResult,
  buildOfficialBoundedReadyResult,
  validateOfficialBoundedResult,
} from "./official-bounded-write.js";

export const OFFICIAL_QUALIA_SERIES_CANARY_SCHEMA_VERSION = 1;
export const OFFICIAL_QUALIA_SERIES_CANARY_LIMITS = Object.freeze({
  max_series_inserts: 1,
  max_series_updates: 0,
  max_variant_inserts: 0,
  max_variant_updates: 0,
  max_restock_events: 0,
  max_deletes: 0,
  max_cleanup_operations: 0,
  max_import_issue_writes: 0,
});

const APPROVAL = /^APPROVE_OFFICIAL_QUALIA_SERIES_CANARY:([0-9a-f]{40}):(sha256:[0-9a-f]{64})$/;
const COUNTS = Object.freeze(["series", "variants", "restock_events", "import_issues", "review_required", "provisional_variants"]);
const TERMINAL_VERDICTS = new Set([
  "OFFICIAL_BOUNDED_WRITE_BLOCKED",
  "OFFICIAL_BOUNDED_WRITE_COMMITTED",
  "OFFICIAL_BOUNDED_WRITE_ROLLED_BACK",
  "OFFICIAL_BOUNDED_WRITE_COMMITTED_POST_VERIFY_FAILED",
  "OFFICIAL_BOUNDED_WRITE_COMMIT_OUTCOME_UNKNOWN",
]);

export function buildQualiaSeriesStableIdentity(sourceProductId) {
  const productId = text(sourceProductId);
  if (!/^\d+$/.test(productId)) throw qualiaError("qualia_source_product_id_invalid");
  const value = createHash("sha256").update(`qualia:${productId}`).digest("hex").slice(0, 24);
  return `official:qualia:series:${value}`;
}

export function buildOfficialQualiaSeriesReadinessAudit({ provider, catalog = {}, databaseBefore, databaseAfter, workflow = {} } = {}) {
  const blockers = [];
  const rejected = [];
  const insertCandidates = [];
  const noopCandidates = [];
  const manualUpdates = [];
  const before = normalizeCounts(databaseBefore);
  const after = normalizeCounts(databaseAfter);
  const auditDate = auditDateJst(workflow.audit_date);
  const archiveCursor = text(provider?.archive_cursor);
  const sourceRecords = uniqueBySourceProduct([
    ...asArray(provider?.metadata_records),
    ...asArray(provider?.records),
  ]);

  if (!completeCounts(databaseBefore) || !completeCounts(databaseAfter)) blockers.push("production_database_snapshot_incomplete");
  if (!sameCounts(before, after)) blockers.push("production_database_delta_detected");
  if (catalog.complete === false) blockers.push("production_catalog_targeted_read_incomplete");
  if (text(provider?.source) !== "qualia" || text(provider?.manufacturer) !== "クオリア") blockers.push("qualia_source_unavailable");
  if (text(provider?.mode) !== "CURRENT" || !/^\d{4}-\d{2}$/.test(archiveCursor)) blockers.push("qualia_current_archive_unverified");
  if (!sourceRecords.length) blockers.push("qualia_source_zero_safe_metadata_records");
  if (!detailOutcomesComplete(provider)) blockers.push("qualia_source_detail_outcomes_incomplete");

  const seriesRows = asArray(catalog.series);
  const seenIds = new Set();
  for (const record of sourceRecords) {
    const prepared = prepareQualiaSeriesRecord(record, { provider, auditDate, archiveCursor });
    if (!prepared.ok) {
      rejected.push(rejection(record, prepared.reasons));
      continue;
    }
    const canonical = prepared.record;
    if (seenIds.has(canonical.id)) {
      rejected.push(rejection(record, ["qualia_series_identity_collision"]));
      blockers.push("qualia_identity_conflict_present");
      continue;
    }
    seenIds.add(canonical.id);

    const existingById = seriesRows.filter((row) => text(row?.id) === canonical.id);
    const existingByUrl = seriesRows.filter((row) => canonicalQualiaProductUrl(row?.official_url) === canonical.official_url);
    const sameNameRows = seriesRows.filter((row) => text(row?.id) !== canonical.id
      && normalizeName(row?.name) === normalizeName(canonical.name));
    const reasons = [];
    if (existingById.length > 1 || existingByUrl.length > 1) reasons.push("qualia_series_identity_ambiguous");
    const existing = existingById[0] || null;
    if (existing && (text(existing.source_type) !== "official_site" || text(existing.brand) !== "クオリア")) {
      reasons.push("qualia_series_source_ownership_conflict");
    }
    if (existingByUrl.some((row) => text(row?.id) !== canonical.id)) reasons.push("qualia_series_official_url_collision");
    const factualMatches = sameNameRows.filter((row) => sameQualiaFactualIdentity(row, canonical));
    if (factualMatches.length === 1) reasons.push("qualia_series_identity_drift_possible");
    if (factualMatches.length > 1) reasons.push("qualia_series_identity_ambiguous");
    if (reasons.length) {
      rejected.push(rejection(record, reasons));
      blockers.push("qualia_identity_conflict_present");
      continue;
    }

    const values = buildOfficialSeriesWriteValues(canonical);
    const operation = existing
      ? (digestOfficialRow("series", existing) === digestOfficialRow("series", values) ? "none" : "update")
      : "insert";
    const applyContract = buildSeriesOnlyApplyContract({ operation, values, existing });
    const candidate = {
      provider: "qualia",
      source_product_id: canonical.source_product_id,
      series_id: canonical.id,
      series_name: canonical.name,
      manufacturer: "クオリア",
      official_url: canonical.official_url,
      series_image_candidate: canonical.image_url,
      image_scope: canonical.image_url ? "series_representative" : "unavailable",
      operation_classification: operation === "insert" ? "new_series_insert" : operation === "none" ? "exact_noop" : "manual_update_required",
      canonical_release: { release_date: canonical.release_date, release_month: canonical.release_month, release_week: null },
      release_status: canonical.release_status,
      price: canonical.price,
      variant_count: 0,
      variants: [],
      variant_writes: 0,
      production_precondition: {
        series_id_absent: operation === "insert",
        official_url_absent: operation === "insert",
        factual_identity_absent: operation === "insert",
        expected_operation: operation,
      },
      apply_contract: applyContract,
    };
    candidate.canonical_digest = candidateDigest(candidate);
    if (operation === "insert") insertCandidates.push(candidate);
    else if (operation === "none") noopCandidates.push(summarizeCandidate(candidate));
    else manualUpdates.push(summarizeCandidate(candidate));
  }

  const selected = insertCandidates.slice().sort(compareCandidates).at(0) || null;
  const reportComplete = completeCounts(databaseBefore)
    && completeCounts(databaseAfter)
    && sameCounts(before, after)
    && catalog.complete !== false
    && text(provider?.source) === "qualia"
    && text(provider?.manufacturer) === "クオリア"
    && text(provider?.mode) === "CURRENT"
    && /^\d{4}-\d{2}$/.test(archiveCursor)
    && sourceRecords.length > 0
    && detailOutcomesComplete(provider);
  if (!selected && !noopCandidates.length && !manualUpdates.length) blockers.push("qualia_no_safe_series_candidate");

  const ready = reportComplete && blockers.length === 0 && selected != null;
  const noop = reportComplete && blockers.length === 0 && selected == null && noopCandidates.length > 0 && manualUpdates.length === 0;
  if (!selected && manualUpdates.length > 0) blockers.push("qualia_manual_update_required");
  const report = {
    schema_version: OFFICIAL_QUALIA_SERIES_CANARY_SCHEMA_VERSION,
    report_type: "official_qualia_series_readiness_audit",
    provider: "qualia",
    production_integration_enabled: false,
    automatic_production_eligible: false,
    execution: { mode: "read-only", manual_only: true, series_only: true, insert_only: true, deletes_allowed: false, cleanup_enabled: false },
    workflow: { run_id: numericId(workflow.run_id), head_sha: sha(workflow.head_sha), event_name: text(workflow.event_name) || "local", audit_date_jst: auditDate },
    source: {
      mode: text(provider?.mode) || null,
      archive_cursor: archiveCursor || null,
      source_records: sourceRecords.length,
      metadata_only_records: Number(provider?.metadata_only_records || 0),
      formal_variant_records_observed: asArray(provider?.records).filter((record) => asArray(record?.variants).length > 0).length,
      issue_codes: [...new Set(asArray(provider?.issue_codes).map(text).filter(Boolean))].sort(),
    },
    limits: { ...OFFICIAL_QUALIA_SERIES_CANARY_LIMITS },
    plan: {
      eligible_candidate_count: insertCandidates.length,
      selected_candidate_count: selected ? 1 : 0,
      candidate_count: selected ? 1 : 0,
      selected_candidate: selected,
      selected_candidate_digest: selected?.canonical_digest || null,
      selected_apply_contract_digest: selected?.apply_contract?.canonical_digest || null,
      eligible_candidates: insertCandidates.map(summarizeCandidate),
      noop_candidates: noopCandidates,
      manual_update_required: manualUpdates,
      rejected_candidates: rejected,
      series_inserts: selected ? 1 : 0,
      series_updates: 0,
      variant_inserts: 0,
      variant_updates: 0,
      restock_events: 0,
      deletes: 0,
      cleanup_operations: 0,
      import_issue_writes: 0,
    },
    database: { before, after, delta: countDelta(before, after), writes: 0, deletes: 0, cleanup_operations: 0, import_issue_writes: 0 },
    report_complete: reportComplete,
    manual_canary_ready: ready,
    blockers: [...new Set(blockers)].sort(),
    final_verdict: ready
      ? "OFFICIAL_QUALIA_SERIES_READINESS_READY"
      : noop
        ? "OFFICIAL_QUALIA_SERIES_READINESS_NO_CHANGES"
        : "OFFICIAL_QUALIA_SERIES_READINESS_BLOCKED",
  };
  report.canonical_digest = reportDigest(report);
  return report;
}

export function buildOfficialQualiaSeriesReadinessBlockedArtifact({ workflow = {}, reasonCode, databaseBefore, databaseAfter } = {}) {
  const before = completeCounts(databaseBefore) ? normalizeCounts(databaseBefore) : null;
  const after = completeCounts(databaseAfter) ? normalizeCounts(databaseAfter) : null;
  const report = {
    schema_version: OFFICIAL_QUALIA_SERIES_CANARY_SCHEMA_VERSION,
    report_type: "official_qualia_series_readiness_audit",
    provider: "qualia",
    production_integration_enabled: false,
    automatic_production_eligible: false,
    execution: { mode: "read-only", manual_only: true, series_only: true, insert_only: true, deletes_allowed: false, cleanup_enabled: false },
    workflow: { run_id: numericId(workflow.run_id), head_sha: sha(workflow.head_sha), event_name: text(workflow.event_name) || "local", audit_date_jst: auditDateJst(workflow.audit_date) },
    source: { mode: null, archive_cursor: null, source_records: 0, metadata_only_records: 0, formal_variant_records_observed: 0, issue_codes: [] },
    limits: { ...OFFICIAL_QUALIA_SERIES_CANARY_LIMITS },
    plan: {
      eligible_candidate_count: 0,
      selected_candidate_count: 0,
      candidate_count: 0,
      selected_candidate: null,
      selected_candidate_digest: null,
      selected_apply_contract_digest: null,
      eligible_candidates: [],
      noop_candidates: [],
      manual_update_required: [],
      rejected_candidates: [],
      series_inserts: 0,
      series_updates: 0,
      variant_inserts: 0,
      variant_updates: 0,
      restock_events: 0,
      deletes: 0,
      cleanup_operations: 0,
      import_issue_writes: 0,
    },
    database: {
      before,
      after,
      delta: before && after ? countDelta(before, after) : null,
      snapshot_status: before && after ? "complete" : "unavailable",
      writes: 0,
      deletes: 0,
      cleanup_operations: 0,
      import_issue_writes: 0,
    },
    report_complete: false,
    manual_canary_ready: false,
    blockers: [safeReadinessReasonCode(reasonCode)],
    reason_code: safeReadinessReasonCode(reasonCode),
    final_verdict: "OFFICIAL_QUALIA_SERIES_READINESS_BLOCKED",
  };
  report.canonical_digest = reportDigest(report);
  return report;
}

export function validateOfficialQualiaSeriesReadinessAudit(report) {
  if (report?.schema_version !== OFFICIAL_QUALIA_SERIES_CANARY_SCHEMA_VERSION
    || report?.report_type !== "official_qualia_series_readiness_audit"
    || report?.provider !== "qualia") throw new Error("Qualia series readiness audit schema is invalid.");
  if (report.production_integration_enabled !== false || report.automatic_production_eligible !== false
    || report.execution?.mode !== "read-only" || report.execution?.series_only !== true || report.execution?.insert_only !== true
    || report.database?.writes !== 0 || report.database?.deletes !== 0 || report.plan?.series_updates !== 0
    || report.plan?.variant_inserts !== 0 || report.plan?.variant_updates !== 0 || report.plan?.restock_events !== 0
    || report.plan?.deletes !== 0 || report.plan?.cleanup_operations !== 0 || report.plan?.import_issue_writes !== 0) {
    throw new Error("Qualia series readiness audit violates the series-only read-only boundary.");
  }
  if (JSON.stringify(report.limits) !== JSON.stringify(OFFICIAL_QUALIA_SERIES_CANARY_LIMITS)) {
    throw new Error("Qualia series readiness limits are invalid.");
  }
  if (!Number.isInteger(report.plan?.eligible_candidate_count) || report.plan.eligible_candidate_count < 0
    || report.plan?.selected_candidate_count !== (report.plan?.selected_candidate ? 1 : 0)
    || report.plan?.candidate_count !== report.plan?.selected_candidate_count || report.plan.candidate_count > 1
    || asArray(report.plan?.eligible_candidates).length !== report.plan.eligible_candidate_count
    || report.plan.series_inserts !== report.plan.selected_candidate_count) {
    throw new Error("Qualia series readiness candidate selection is invalid.");
  }
  if (report.plan?.selected_candidate) {
    assertQualiaSeriesOnlyCandidate(report.plan.selected_candidate);
    if (report.plan.selected_candidate_digest !== report.plan.selected_candidate.canonical_digest
      || report.plan.selected_apply_contract_digest !== report.plan.selected_candidate.apply_contract.canonical_digest) {
      throw new Error("Qualia selected apply contract digest is invalid.");
    }
  }
  const ready = report.final_verdict === "OFFICIAL_QUALIA_SERIES_READINESS_READY";
  const noChanges = report.final_verdict === "OFFICIAL_QUALIA_SERIES_READINESS_NO_CHANGES";
  if (report.manual_canary_ready !== ready || (ready && (!report.report_complete || report.blockers?.length))) {
    throw new Error("Qualia readiness verdict is inconsistent.");
  }
  if (noChanges && (!report.report_complete || report.blockers?.length || report.plan.selected_candidate_count !== 0
    || report.plan.noop_candidates?.length < 1 || report.plan.manual_update_required?.length !== 0)) {
    throw new Error("Qualia no-changes verdict is inconsistent.");
  }
  if (!ready && !noChanges && report.final_verdict !== "OFFICIAL_QUALIA_SERIES_READINESS_BLOCKED") {
    throw new Error("Qualia readiness verdict is invalid.");
  }
  if ((report.final_verdict === "OFFICIAL_QUALIA_SERIES_READINESS_READY" || noChanges)
    && (!completeCounts(report.database.before) || !completeCounts(report.database.after)
      || !sameCounts(report.database.before, report.database.after))) {
    throw new Error("Qualia readiness audit detected database drift.");
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(text(report.canonical_digest)) || reportDigest(report) !== report.canonical_digest) {
    throw new Error("Qualia readiness audit digest is invalid.");
  }
  return report;
}

export function authorizeOfficialQualiaSeriesCanary({ report, auditRunId, auditDigest, approval, eventName, headSha, originMainSha } = {}) {
  validateOfficialQualiaSeriesReadinessAudit(report);
  const current = sha(headSha);
  const origin = sha(originMainSha);
  const match = text(approval).match(APPROVAL);
  const candidate = report.plan?.selected_candidate;
  const contractDigest = text(candidate?.apply_contract?.canonical_digest);
  if (text(eventName) !== "workflow_dispatch" || report.workflow?.event_name !== "workflow_dispatch") {
    throw qualiaError("qualia_series_canary_event_mismatch");
  }
  if (!current || current !== origin || current !== sha(report.workflow?.head_sha)) throw qualiaError("qualia_series_canary_main_sha_mismatch");
  if (!numericId(auditRunId) || numericId(auditRunId) !== numericId(report.workflow?.run_id)) throw qualiaError("qualia_series_canary_audit_run_mismatch");
  if (text(auditDigest) !== report.canonical_digest) throw qualiaError("qualia_series_canary_audit_digest_mismatch");
  if (report.plan.selected_apply_contract_digest !== contractDigest
    || report.plan.selected_candidate_digest !== candidate?.canonical_digest) {
    throw qualiaError("qualia_series_canary_apply_digest_mismatch");
  }
  if (!match || match[1] !== current || match[2] !== report.canonical_digest) {
    throw qualiaError("qualia_series_canary_approval_mismatch");
  }
  if (report.final_verdict !== "OFFICIAL_QUALIA_SERIES_READINESS_READY" || report.manual_canary_ready !== true
    || report.plan.selected_candidate_count !== 1 || report.plan.candidate_count !== 1) {
    throw qualiaError("qualia_series_canary_audit_not_ready");
  }
  assertQualiaSeriesOnlyCandidate(candidate);
  return {
    ok: true,
    kind: "qualia_series_manual_canary",
    head_sha: current,
    audit_run_id: numericId(auditRunId),
    audit_digest: report.canonical_digest,
    approval_digest: report.canonical_digest,
    candidate_digest: candidate.canonical_digest,
    apply_contract_digest: contractDigest,
    candidate,
  };
}

export function buildOfficialQualiaSeriesCanaryReadyResult({ authorization, workflow = {} } = {}) {
  const result = buildOfficialBoundedReadyResult({ authorization, workflow });
  return { ...result, provider: "qualia", series_only: true, variant_writes: 0, import_issue_writes: 0 };
}

export async function executeOfficialQualiaSeriesCanaryTransaction({ adapter, authorization, workflow = {} } = {}) {
  if (authorization?.kind !== "qualia_series_manual_canary") throw qualiaError("qualia_series_canary_authorization_missing");
  if (!adapter || ["begin", "readRow", "readSeriesIdentityRows", "captureCounts", "writeRow", "commit", "rollback"]
    .some((name) => typeof adapter[name] !== "function")) throw qualiaError("qualia_series_canary_transaction_adapter_invalid");
  const candidate = authorization.candidate;
  assertQualiaSeriesOnlyCandidate(candidate);
  if (candidate.canonical_digest !== authorization.candidate_digest
    || candidate.apply_contract.canonical_digest !== authorization.apply_contract_digest) {
    throw qualiaError("qualia_series_canary_authorized_contract_drift");
  }
  const operations = buildOfficialCandidateOperations(candidate, { max_variants: 0, max_restock_events: 0 });
  if (operations.length !== 1 || operations[0].table !== "series" || operations[0].operation !== "insert") {
    throw qualiaError("qualia_series_canary_series_only_contract_invalid");
  }
  const operation = operations[0];
  const beforeDigests = {};
  const afterDigests = {};
  const writeCounts = { series: 0, variants: 0, restock_events: 0 };
  let before = null;
  let precommit = null;
  let after = null;
  let beforeRow = null;
  let began = false;
  let commitAttempted = false;
  let committed = false;

  try {
    await adapter.begin();
    began = true;
    before = requireCompleteCounts(await adapter.captureCounts(), "qualia_series_canary_preflight_count_incomplete");
    const current = await adapter.readRow(operation.table, operation.id, { lock: true });
    assertOfficialOperationPrecondition(operation, current);
    beforeRow = current ? structuredClone(current) : null;
    beforeDigests[operationKey(operation)] = current ? digestOfficialPreconditionRow(operation.table, current) : null;
    const identityRows = await adapter.readSeriesIdentityRows(candidate, { lock: true });
    if (!Array.isArray(identityRows) || identityRows.length) throw qualiaError("qualia_series_canary_identity_precondition_drift");
    assertQualiaSeriesOnlyCandidate(candidate);
    if (candidate.canonical_digest !== authorization.candidate_digest
      || candidate.apply_contract.canonical_digest !== authorization.apply_contract_digest) {
      throw qualiaError("qualia_series_canary_authorized_contract_drift");
    }
    await adapter.writeRow(operation.table, operation.operation, operation.values);
    writeCounts.series = 1;
    const inserted = await adapter.readRow(operation.table, operation.id, { lock: true });
    assertOfficialOperationExpectedRow(operation, inserted, beforeRow);
    assertOfficialOperationWriteCounts(operations, writeCounts);
    precommit = requireCompleteCounts(await adapter.captureCounts(), "qualia_series_canary_precommit_count_incomplete");
    if (!exactSeriesInsertDelta(countDelta(before, precommit))) throw qualiaError("qualia_series_canary_precommit_production_delta");
    commitAttempted = true;
    await adapter.commit();
    committed = true;

    const persisted = await adapter.readRow(operation.table, operation.id, { lock: false });
    assertOfficialOperationExpectedRow(operation, persisted, beforeRow);
    afterDigests[operationKey(operation)] = digestOfficialPreconditionRow(operation.table, persisted);
    after = requireCompleteCounts(await adapter.captureCounts(), "qualia_series_canary_post_commit_count_incomplete");
    if (!exactSeriesInsertDelta(countDelta(before, after))) throw qualiaError("qualia_series_canary_unexpected_production_delta");
    return buildQualiaTransactionResult({
      workflow, authorization, beforeDigests, afterDigests, writeCounts,
      databaseWrites: 1, transactionState: "committed", finalVerdict: "OFFICIAL_BOUNDED_WRITE_COMMITTED",
      before, precommit, after,
    });
  } catch (error) {
    let rollbackAttempted = false;
    let rollbackVerified = false;
    if (began && !committed && !commitAttempted) {
      rollbackAttempted = true;
      try { await adapter.rollback(); rollbackVerified = true; } catch { rollbackVerified = false; }
    }
    const commitOutcomeUnknown = commitAttempted && !committed;
    const committedPostVerifyFailed = committed;
    const durableWritePossible = commitOutcomeUnknown || committedPostVerifyFailed;
    return buildQualiaTransactionResult({
      workflow,
      authorization,
      beforeDigests,
      afterDigests: {},
      writeCounts: durableWritePossible ? writeCounts : { series: 0, variants: 0, restock_events: 0 },
      databaseWrites: durableWritePossible ? writeCounts.series : 0,
      transactionState: committedPostVerifyFailed
        ? "committed_post_verify_failed"
        : commitOutcomeUnknown
          ? "commit_outcome_unknown"
          : rollbackVerified
            ? "rolled_back"
            : began
              ? "rollback_failed"
              : "not_started",
      rollbackAttempted,
      rollbackVerified,
      finalVerdict: committedPostVerifyFailed
        ? "OFFICIAL_BOUNDED_WRITE_COMMITTED_POST_VERIFY_FAILED"
        : commitOutcomeUnknown
          ? "OFFICIAL_BOUNDED_WRITE_COMMIT_OUTCOME_UNKNOWN"
          : rollbackVerified
            ? "OFFICIAL_BOUNDED_WRITE_ROLLED_BACK"
            : "OFFICIAL_BOUNDED_WRITE_BLOCKED",
      reasonCode: text(error?.reason_code) || "qualia_series_canary_transaction_failed",
      before,
      precommit,
      after,
    });
  }
}

export function finalizeOfficialQualiaSeriesCanaryTerminalResult({ existing = null, workflow = {}, auditRunId, auditDigest, reasonCode } = {}) {
  if (TERMINAL_VERDICTS.has(existing?.final_verdict)) return existing;
  const blocked = buildOfficialBoundedBlockedResult({ workflow, auditRunId, auditDigest, reasonCode: text(reasonCode) || "qualia_series_canary_workflow_failed" });
  if (existing?.final_verdict === "OFFICIAL_BOUNDED_WRITE_READY") {
    blocked.selected_candidate = existing.selected_candidate;
    blocked.planned_operations = existing.planned_operations;
  }
  return {
    ...blocked,
    provider: "qualia",
    series_only: true,
    variant_writes: 0,
    import_issue_writes: 0,
    production_counts: { before: null, after: null, delta: null },
  };
}

export function formatOfficialQualiaSeriesReadinessMarkdown(report) {
  return [
    "# Official Qualia series-only readiness audit",
    "",
    `- Verdict: ${report.final_verdict}`,
    `- Run ID: ${report.workflow.run_id ?? "none"}`,
    `- Head SHA: ${report.workflow.head_sha ?? "none"}`,
    `- Archive cursor: ${report.source.archive_cursor ?? "none"}`,
    `- Manual canary ready: ${report.manual_canary_ready}`,
    `- Eligible series inserts: ${report.plan.eligible_candidate_count}`,
    `- Selected series: ${report.plan.selected_candidate?.series_id ?? "none"}`,
    `- Exact NOOP candidates: ${report.plan.noop_candidates.length}`,
    `- Manual updates excluded: ${report.plan.manual_update_required.length}`,
    "- Variant inserts / updates: 0 / 0",
    "- Restock / deletes / cleanup / import issue writes: 0 / 0 / 0 / 0",
    `- Database writes: ${report.database.writes}`,
    `- Canonical digest: ${report.canonical_digest}`,
    "",
  ].join("\n");
}

export function formatOfficialQualiaSeriesCanaryMarkdown(result) {
  const before = result.production_counts?.before;
  const after = result.production_counts?.after;
  const delta = result.production_counts?.delta;
  return [
    "# Official Qualia series-only bounded canary",
    "",
    `- Verdict: ${result.final_verdict}`,
    `- Run ID: ${result.run_id ?? "none"}`,
    `- Head SHA: ${result.head_sha ?? "none"}`,
    `- Audit run ID: ${result.audit_run_id ?? "none"}`,
    `- Audit digest: ${result.audit_digest ?? "none"}`,
    `- Selected series: ${result.selected_candidate?.series_id ?? "none"}`,
    `- Selected apply contract: ${result.selected_candidate?.apply_contract_digest ?? "none"}`,
    `- Series writes: ${result.operations?.series ?? 0}`,
    `- Variant writes: ${result.operations?.variants ?? 0}`,
    "- Restock / deletes / cleanup / import issue writes: 0 / 0 / 0 / 0",
    `- Database writes: ${result.database_writes ?? 0}`,
    `- Production counts before: ${before ? JSON.stringify(before) : "unavailable"}`,
    `- Production counts after: ${after ? JSON.stringify(after) : "unavailable"}`,
    `- Production delta: ${delta ? JSON.stringify(delta) : "unavailable"}`,
    `- Transaction: ${result.transaction?.state ?? "not_started"}`,
    `- Reason: ${result.reason_code ?? "none"}`,
    "",
  ].join("\n");
}

function buildQualiaTransactionResult({
  workflow,
  authorization,
  beforeDigests,
  afterDigests,
  writeCounts,
  databaseWrites,
  transactionState,
  rollbackAttempted = false,
  rollbackVerified = false,
  finalVerdict,
  reasonCode = null,
  before = null,
  precommit = null,
  after = null,
}) {
  const operations = buildOfficialCandidateOperations(authorization.candidate, { max_variants: 0, max_restock_events: 0 });
  const result = validateOfficialBoundedResult({
    schema_version: OFFICIAL_BOUNDED_RESULT_SCHEMA_VERSION,
    run_id: numericId(workflow.run_id),
    head_sha: sha(workflow.head_sha) || authorization.head_sha,
    audit_run_id: authorization.audit_run_id,
    audit_digest: authorization.audit_digest,
    approval_digest: authorization.approval_digest,
    selected_candidate: {
      series_id: authorization.candidate.series_id,
      candidate_digest: authorization.candidate_digest,
      apply_contract_digest: authorization.apply_contract_digest,
    },
    before_digests: sortObject(beforeDigests),
    after_digests: sortObject(afterDigests),
    operations: writeCounts,
    planned_operations: summarizeOperations(operations),
    committed_operations: transactionState.startsWith("committed") ? summarizeOperations(operations, true) : emptyOperationCounts(),
    database_writes: databaseWrites,
    deletes: 0,
    cleanup_operations: 0,
    transaction: { state: transactionState, rollback_attempted: rollbackAttempted, rollback_verified: rollbackVerified },
    reason_code: reasonCode,
    final_verdict: finalVerdict,
  });
  return {
    ...result,
    provider: "qualia",
    series_only: true,
    variant_writes: 0,
    import_issue_writes: 0,
    production_counts: {
      before,
      precommit,
      after,
      precommit_delta: before && precommit ? countDelta(before, precommit) : null,
      delta: before && after ? countDelta(before, after) : null,
    },
  };
}

function prepareQualiaSeriesRecord(record, { provider, auditDate, archiveCursor }) {
  const reasons = [];
  const officialUrl = canonicalQualiaProductUrl(record?.official_url);
  const sourceProductId = text(record?.source_product_id);
  const seriesName = normalizeName(record?.series_name);
  const price = Number(record?.price);
  const releaseDate = text(record?.release_date) || null;
  const releaseMonth = text(record?.release_month) || null;
  if (text(record?.source) !== "qualia" || text(provider?.manufacturer) !== "クオリア"
    || (text(record?.manufacturer) && text(record.manufacturer) !== "クオリア")) reasons.push("qualia_provider_invalid");
  if (record?.capability?.series_metadata_status !== "safe") reasons.push("qualia_series_metadata_capability_unsafe");
  if (!officialUrl || !/^\d+$/.test(sourceProductId) || qualiaProductId(officialUrl) !== sourceProductId) reasons.push("qualia_source_identity_invalid");
  if (!seriesName || seriesName.length > 200 || /[<>\u0000-\u001f]/.test(seriesName)) reasons.push("qualia_series_name_invalid");
  if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) reasons.push("qualia_price_invalid");
  if (!validReleaseEvidence(releaseDate, releaseMonth)) reasons.push("qualia_release_evidence_invalid");
  const evidenceMonth = releaseDate?.slice(0, 7) || releaseMonth;
  if (archiveCursor && evidenceMonth !== archiveCursor) reasons.push("qualia_current_archive_release_mismatch");
  if (record?.source_count_conflict === true || record?.capability?.source_count_conflict === true) reasons.push("qualia_metadata_contradiction");
  if (reasons.length) return { ok: false, reasons: [...new Set(reasons)].sort() };
  const releaseStatus = resolveReleaseStatus({ release_date: releaseDate, release_month: releaseMonth }, auditDate);
  const image = record?.image_scope_candidate === "series" && validQualiaImage(record?.series_image_candidate)
    ? canonicalHttpsUrl(record.series_image_candidate)
    : null;
  const id = buildQualiaSeriesStableIdentity(sourceProductId);
  return {
    ok: true,
    record: {
      id,
      slug: id,
      source_product_id: sourceProductId,
      name: seriesName,
      franchise: null,
      brand: "クオリア",
      category: null,
      release_date: releaseDate,
      release_month: releaseMonth,
      release_week: null,
      price,
      image_url: image,
      official_url: officialUrl,
      released: releaseStatus.released,
      release_status: releaseStatus,
    },
  };
}

function buildSeriesOnlyApplyContract({ operation, values, existing }) {
  const contract = {
    schema_version: OFFICIAL_APPLY_CONTRACT_SCHEMA_VERSION,
    series: buildOfficialApplyOperation({ table: "series", operation, values, existing }),
    variants: [],
    restock_event: null,
    deletes: 0,
    cleanup_operations: 0,
    import_issue_writes: 0,
  };
  contract.canonical_digest = officialCanonicalDigest(contract);
  return contract;
}

function assertQualiaSeriesOnlyCandidate(candidate) {
  const contract = candidate?.apply_contract;
  if (candidate?.provider !== "qualia" || candidate?.manufacturer !== "クオリア"
    || candidate?.operation_classification !== "new_series_insert" || candidate?.variant_count !== 0
    || !Array.isArray(candidate?.variants) || candidate.variants.length !== 0 || candidate?.variant_writes !== 0
    || candidate?.production_precondition?.expected_operation !== "insert"
    || candidate?.production_precondition?.series_id_absent !== true
    || candidate?.production_precondition?.official_url_absent !== true
    || candidate?.production_precondition?.factual_identity_absent !== true
    || contract?.schema_version !== OFFICIAL_APPLY_CONTRACT_SCHEMA_VERSION
    || contract?.series?.operation !== "insert" || !Array.isArray(contract?.variants) || contract.variants.length !== 0 || contract?.restock_event
    || contract?.deletes !== 0 || contract?.cleanup_operations !== 0 || contract?.import_issue_writes !== 0) {
    throw qualiaError("qualia_series_canary_series_only_contract_invalid");
  }
  validateOfficialApplyOperation(contract.series, "series");
  const clone = structuredClone(contract);
  delete clone.canonical_digest;
  if (contract.canonical_digest !== officialCanonicalDigest(clone)) throw qualiaError("qualia_series_canary_contract_digest_invalid");
  if (candidate.canonical_digest !== candidateDigest(candidate)) throw qualiaError("qualia_series_canary_candidate_digest_invalid");
  assertOfficialCanonicalReleaseSafe(candidate);
  return true;
}

function summarizeCandidate(candidate) {
  return {
    source_product_id: candidate.source_product_id,
    series_id: candidate.series_id,
    series_name: candidate.series_name,
    official_url: candidate.official_url,
    operation_classification: candidate.operation_classification,
    release_status: candidate.release_status,
    price: candidate.price,
    variant_count: 0,
    variant_writes: 0,
    canonical_digest: candidate.canonical_digest,
  };
}

function compareCandidates(left, right) {
  return releaseKey(right).localeCompare(releaseKey(left))
    || text(left.source_product_id).localeCompare(text(right.source_product_id), "en")
    || text(left.series_id).localeCompare(text(right.series_id), "en");
}

function sameQualiaFactualIdentity(existing, incoming) {
  if (text(existing?.brand) !== "クオリア" || text(existing?.source_type) !== "official_site") return false;
  return sameReleaseEvidence(existing, incoming) && Number(existing?.price) === Number(incoming?.price);
}

function sameReleaseEvidence(existing, incoming) {
  const existingDate = text(existing?.release_date);
  const incomingDate = text(incoming?.release_date);
  if (existingDate && incomingDate) return existingDate === incomingDate;
  return text(existing?.release_month) && text(existing.release_month) === text(incoming?.release_month);
}

function resolveReleaseStatus(record, auditDate) {
  const releaseDate = text(record?.release_date);
  const releaseMonth = text(record?.release_month);
  if (releaseDate) return { audit_date_jst: auditDate, released: releaseDate <= auditDate, precision: "exact_date" };
  const auditMonth = auditDate.slice(0, 7);
  return { audit_date_jst: auditDate, released: releaseMonth < auditMonth, precision: releaseMonth === auditMonth ? "month_only_current_conservative" : "month_only" };
}

function detailOutcomesComplete(provider) {
  const attempted = Number(provider?.detail_attempted);
  const completed = Number(provider?.successful_records || 0) + Number(provider?.metadata_only_records || 0) + Number(provider?.rejected_records || 0);
  return Number.isInteger(attempted) && attempted > 0 && attempted === completed;
}

function validReleaseEvidence(releaseDate, releaseMonth) {
  const dateValid = !releaseDate || validDate(releaseDate);
  const monthValid = !releaseMonth || validMonth(releaseMonth);
  return Boolean((releaseDate || releaseMonth) && dateValid && monthValid && (!releaseDate || !releaseMonth || releaseDate.slice(0, 7) === releaseMonth));
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(value))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validMonth(value) {
  return /^\d{4}-(?:0[1-9]|1[0-2])$/.test(text(value));
}

function canonicalQualiaProductUrl(value) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/product\/view\/(\d+)\/?$/);
    if (url.protocol !== "https:" || !["qualia-45.jp", "www.qualia-45.jp"].includes(url.hostname)
      || url.username || url.password || url.port || url.search || !match) return null;
    url.hostname = "www.qualia-45.jp";
    url.pathname = `/product/view/${match[1]}`;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function qualiaProductId(url) {
  return canonicalQualiaProductUrl(url)?.match(/\/product\/view\/(\d+)$/)?.[1] || null;
}

function validQualiaImage(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["qualia-45.jp", "www.qualia-45.jp"].includes(url.hostname)
      && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}

function canonicalHttpsUrl(value) {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}

function normalizeName(value) {
  return text(value).normalize("NFKC").replace(/\s+/g, " ");
}

function rejection(record, reasons) {
  return { source_product_id: text(record?.source_product_id) || null, reasons: [...new Set(reasons)].sort() };
}

function releaseKey(candidate) {
  return text(candidate?.canonical_release?.release_date) || text(candidate?.canonical_release?.release_month) || "0000-00-00";
}

function reportDigest(report) {
  const clone = structuredClone(report);
  delete clone.canonical_digest;
  return officialCanonicalDigest(clone);
}

function candidateDigest(candidate) {
  const clone = structuredClone(candidate);
  delete clone.canonical_digest;
  return officialCanonicalDigest(clone);
}

function requireCompleteCounts(value, reasonCode) {
  if (!completeCounts(value)) throw qualiaError(reasonCode);
  return normalizeCounts(value);
}

function emptyOperationCounts() {
  return Object.fromEntries(["series", "variants", "restock_events"]
    .map((table) => [table, { insert: 0, update: 0, none: 0 }]));
}

function summarizeOperations(operations, writesOnly = false) {
  const summary = emptyOperationCounts();
  for (const operation of operations) {
    if (writesOnly && operation.operation === "none") continue;
    summary[operation.table][operation.operation] += 1;
  }
  return summary;
}

function operationKey(operation) {
  return `${operation.table}:${operation.id}`;
}

function sortObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right, "en")));
}

function exactSeriesInsertDelta(delta) {
  return delta?.series === 1 && COUNTS.filter((key) => key !== "series").every((key) => delta[key] === 0);
}

function countDelta(before, after) {
  return Object.fromEntries(COUNTS.map((key) => [key, Number(after?.[key]) - Number(before?.[key])]));
}

function normalizeCounts(value) {
  return Object.fromEntries(COUNTS.map((key) => [key, Number.isInteger(value?.[key]) && value[key] >= 0 ? value[key] : 0]));
}

function completeCounts(value) {
  return COUNTS.every((key) => Number.isInteger(value?.[key]) && value[key] >= 0);
}

function sameCounts(before, after) {
  return COUNTS.every((key) => before[key] === after[key]);
}

function uniqueBySourceProduct(records) {
  return [...new Map(records.map((record, index) => [text(record?.source_product_id) || `missing:${index}`, record])).values()];
}

function auditDateJst(value) {
  const supplied = text(value);
  if (validDate(supplied)) return supplied;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date())
    .reduce((result, part) => part.type === "literal" ? result : { ...result, [part.type]: part.value }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function numericId(value) {
  const normalized = text(value);
  return /^\d+$/.test(normalized) ? normalized : null;
}

function sha(value) {
  const normalized = text(value).toLowerCase();
  return /^[0-9a-f]{40}$/.test(normalized) ? normalized : null;
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function qualiaError(reason_code) {
  const error = new Error(reason_code);
  error.reason_code = reason_code;
  return error;
}

function safeReadinessReasonCode(value) {
  const normalized = text(value).toLowerCase();
  return /^qualia_series_readiness_[a-z0-9_]{1,80}$/.test(normalized)
    ? normalized
    : "qualia_series_readiness_unexpected_failure";
}
