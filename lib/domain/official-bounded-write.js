import {
  canonicalJson,
  digestOfficialPreconditionRow,
  digestOfficialRow,
  officialCanonicalDigest,
  toOfficialDatabaseRow,
  validateOfficialApplyOperation,
} from "./official-apply-contract.js";
import {
  OFFICIAL_READ_ONLY_AUDIT_SCHEMA_VERSION,
  validateOfficialReadOnlyAudit,
} from "./official-read-only-audit.js";

export const OFFICIAL_BOUNDED_RESULT_SCHEMA_VERSION = 1;
export const OFFICIAL_BOUNDED_CANARY_LIMITS = Object.freeze({
  max_series: 1,
  max_variants: 12,
  max_restock_events: 1,
});

const APPROVAL_PATTERN = /^APPROVE_OFFICIAL_BOUNDED:([0-9a-f]{40}):(sha256:[0-9a-f]{64})$/;

export function requireOfficialDatabaseUrl(value) {
  const normalized = text(value);
  if (!normalized) throw boundedError("official_bounded_database_url_missing");
  let url;
  try { url = new URL(normalized); } catch { throw boundedError("official_bounded_database_url_invalid"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username || !url.password) {
    throw boundedError("official_bounded_database_url_invalid");
  }
  return normalized;
}

export function authorizeOfficialBoundedWrite({
  report,
  auditRunId,
  auditDigest,
  approval,
  headSha,
  originMainSha,
} = {}) {
  validateOfficialReadOnlyAudit(report);
  const currentSha = normalizedSha(headSha);
  const originSha = normalizedSha(originMainSha);
  const reportSha = normalizedSha(report?.workflow?.head_sha);
  const requestedRunId = numericId(auditRunId);
  const reportRunId = numericId(report?.workflow?.run_id);
  const requestedDigest = text(auditDigest);
  const match = text(approval).match(APPROVAL_PATTERN);

  if (!currentSha || currentSha !== originSha || currentSha !== reportSha) {
    throw boundedError("official_bounded_main_sha_mismatch");
  }
  if (!requestedRunId || requestedRunId !== reportRunId) {
    throw boundedError("official_bounded_audit_run_mismatch");
  }
  if (requestedDigest !== report.canonical_digest) {
    throw boundedError("official_bounded_audit_digest_mismatch");
  }
  if (!match || normalizedSha(match[1]) !== currentSha || match[2] !== report.canonical_digest) {
    throw boundedError("official_bounded_approval_mismatch");
  }
  if (report.final_verdict !== "OFFICIAL_READ_ONLY_PLAN_READY" || report.report_complete !== true
    || report.plan?.state !== "ready" || report.database?.writes !== 0
    || report.database?.inserts !== 0 || report.database?.updates !== 0 || report.database?.deletes !== 0) {
    throw boundedError("official_bounded_audit_not_ready");
  }
  if (sumObject(report.plan?.would_delete) !== 0 || report.plan?.cleanup_operations !== 0) {
    throw boundedError("official_bounded_destructive_plan_rejected");
  }
  if (Number(report.plan?.would_insert?.import_issues) !== 0
    || Number(report.plan?.would_update?.import_issues) !== 0) {
    throw boundedError("official_bounded_import_issue_write_rejected");
  }

  const selection = selectOfficialBoundedCanary(report);
  if (!selection.ok) throw boundedError(selection.reason_code);
  assertOfficialCanonicalReleaseSafe(selection.candidate);
  return {
    ok: true,
    schema_version: OFFICIAL_READ_ONLY_AUDIT_SCHEMA_VERSION,
    head_sha: currentSha,
    audit_run_id: requestedRunId,
    audit_digest: report.canonical_digest,
    approval_digest: match[2],
    candidate: selection.candidate,
  };
}

export function selectOfficialBoundedCanary(report) {
  const candidates = asArray(report?.plan?.candidates)
    .slice()
    .sort((left, right) => text(left.series_id).localeCompare(text(right.series_id), "en"));
  for (const candidate of candidates) {
    const reason = candidateCanaryBlocker(candidate);
    if (!reason) return { ok: true, candidate, reason_code: null };
  }
  return { ok: false, candidate: null, reason_code: "official_bounded_no_safe_candidate" };
}

export function assertOfficialCanonicalReleaseSafe(candidate) {
  const canonical = candidate?.canonical_release;
  const contract = candidate?.apply_contract;
  if (!canonical || !contract) throw boundedError("official_bounded_canonical_release_missing");
  assertReleaseMatches(contract.series.values, canonical);
  for (const variant of asArray(contract.variants)) assertReleaseMatches(variant.values, canonical);

  const event = contract.restock_event;
  if (!event) return true;
  const values = event.values;
  const evidenceCanonical = values.evidence?.canonical_release;
  if (values.series_id !== candidate.series_id || values.variant_id !== null || values.matched_variant_id !== null
    || values.source_type !== "official_site" || values.confidence !== 1 || values.review_required !== false
    || values.classification_reason !== "official_rerelease_evidence") {
    throw boundedError("official_bounded_rerelease_contract_invalid");
  }
  if (!releaseEqual(evidenceCanonical, canonical)) {
    throw boundedError("official_bounded_rerelease_canonical_release_mismatch");
  }
  return true;
}

export async function executeOfficialBoundedTransaction({ adapter, authorization, workflow = {} } = {}) {
  if (!authorization?.ok || !authorization.candidate) throw boundedError("official_bounded_authorization_missing");
  if (!adapter || ["begin", "readRow", "writeRow", "commit", "rollback"].some((name) => typeof adapter[name] !== "function")) {
    throw boundedError("official_bounded_transaction_adapter_invalid");
  }
  const candidate = authorization.candidate;
  assertOfficialCanonicalReleaseSafe(candidate);
  const operations = buildOfficialCandidateOperations(candidate);
  const beforeDigests = {};
  const afterDigests = {};
  const beforeRows = new Map();
  const writeCounts = { series: 0, variants: 0, restock_events: 0 };
  let began = false;
  let commitAttempted = false;
  let committed = false;

  try {
    await adapter.begin();
    began = true;
    for (const operation of operations) {
      const current = await adapter.readRow(operation.table, operation.id, { lock: true });
      assertOfficialOperationPrecondition(operation, current);
      beforeRows.set(operationKey(operation), current ? structuredClone(current) : null);
      beforeDigests[operationKey(operation)] = current ? digestOfficialPreconditionRow(operation.table, current) : null;
    }
    for (const operation of operations.filter((entry) => entry.operation !== "none")) {
      await adapter.writeRow(operation.table, operation.operation, operation.values);
      writeCounts[operation.table] += 1;
    }
    for (const operation of operations) {
      const current = await adapter.readRow(operation.table, operation.id, { lock: true });
      assertOfficialOperationExpectedRow(operation, current, beforeRows.get(operationKey(operation)));
    }
    assertOfficialOperationWriteCounts(operations, writeCounts);
    commitAttempted = true;
    await adapter.commit();
    committed = true;

    for (const operation of operations) {
      const current = await adapter.readRow(operation.table, operation.id, { lock: false });
      assertOfficialOperationExpectedRow(operation, current, beforeRows.get(operationKey(operation)));
      afterDigests[operationKey(operation)] = digestOfficialPreconditionRow(operation.table, current);
    }
    return buildOfficialBoundedResult({
      workflow,
      authorization,
      beforeDigests,
      afterDigests,
      writeCounts,
      databaseWrites: Object.values(writeCounts).reduce((sum, value) => sum + value, 0),
      transactionState: "committed",
      rollbackAttempted: false,
      rollbackVerified: false,
      finalVerdict: "OFFICIAL_BOUNDED_WRITE_COMMITTED",
    });
  } catch (error) {
    let rollbackAttempted = false;
    let rollbackVerified = false;

    /*
     * Once COMMIT has been sent, a thrown client error cannot prove whether
     * the server committed or not. Do not use a later ROLLBACK response as
     * proof of rollback; the transaction may already have committed.
     */
    if (began && !committed && !commitAttempted) {
      rollbackAttempted = true;

      try {
        await adapter.rollback();
        rollbackVerified = true;
      } catch {
        rollbackVerified = false;
      }
    }

    const attemptedWriteCount = Object.values(writeCounts)
      .reduce((sum, value) => sum + value, 0);

    const commitOutcomeUnknown =
      commitAttempted &&
      !committed;

    const committedPostVerifyFailed = committed;

    return buildOfficialBoundedResult({
      workflow,
      authorization,
      beforeDigests,
      afterDigests: {},
      writeCounts:
        committedPostVerifyFailed || commitOutcomeUnknown
          ? writeCounts
          : { series: 0, variants: 0, restock_events: 0 },
      databaseWrites:
        committedPostVerifyFailed || commitOutcomeUnknown
          ? attemptedWriteCount
          : 0,
      transactionState: committedPostVerifyFailed
        ? "committed_post_verify_failed"
        : commitOutcomeUnknown
          ? "commit_outcome_unknown"
          : rollbackVerified
            ? "rolled_back"
            : "rollback_failed",
      rollbackAttempted,
      rollbackVerified,
      finalVerdict: committedPostVerifyFailed
        ? "OFFICIAL_BOUNDED_WRITE_COMMITTED_POST_VERIFY_FAILED"
        : commitOutcomeUnknown
          ? "OFFICIAL_BOUNDED_WRITE_COMMIT_OUTCOME_UNKNOWN"
          : began && !committed && rollbackVerified
            ? "OFFICIAL_BOUNDED_WRITE_ROLLED_BACK"
            : "OFFICIAL_BOUNDED_WRITE_BLOCKED",
      reasonCode: text(error?.reason_code) || "official_bounded_transaction_failed",
    });
  }
}

export function buildOfficialBoundedBlockedResult({ workflow = {}, auditRunId, auditDigest, reasonCode } = {}) {
  return {
    schema_version: OFFICIAL_BOUNDED_RESULT_SCHEMA_VERSION,
    run_id: numericId(workflow.run_id),
    head_sha: normalizedSha(workflow.head_sha) || null,
    audit_run_id: numericId(auditRunId),
    audit_digest: validDigest(auditDigest) ? auditDigest : null,
    approval_digest: validDigest(auditDigest) ? auditDigest : null,
    selected_candidate: null,
    before_digests: {},
    after_digests: {},
    operations: { series: 0, variants: 0, restock_events: 0 },
    planned_operations: emptyOperationCounts(),
    committed_operations: emptyOperationCounts(),
    database_writes: 0,
    deletes: 0,
    cleanup_operations: 0,
    transaction: { state: "not_started", rollback_attempted: false, rollback_verified: false },
    reason_code: text(reasonCode) || "official_bounded_authorization_failed",
    final_verdict: "OFFICIAL_BOUNDED_WRITE_BLOCKED",
  };
}

export function buildOfficialBoundedReadyResult({ workflow = {}, authorization } = {}) {
  if (!authorization?.ok || !authorization.candidate) throw boundedError("official_bounded_authorization_missing");
  return validateOfficialBoundedResult({
    schema_version: OFFICIAL_BOUNDED_RESULT_SCHEMA_VERSION,
    run_id: numericId(workflow.run_id),
    head_sha: normalizedSha(workflow.head_sha) || authorization.head_sha,
    audit_run_id: authorization.audit_run_id,
    audit_digest: authorization.audit_digest,
    approval_digest: authorization.approval_digest,
    selected_candidate: {
      series_id: authorization.candidate.series_id,
      apply_contract_digest: authorization.candidate.apply_contract.canonical_digest,
    },
    before_digests: {},
    after_digests: {},
    operations: { series: 0, variants: 0, restock_events: 0 },
    planned_operations: summarizeOperations(buildOfficialCandidateOperations(authorization.candidate)),
    committed_operations: emptyOperationCounts(),
    database_writes: 0,
    deletes: 0,
    cleanup_operations: 0,
    transaction: { state: "not_started", rollback_attempted: false, rollback_verified: false },
    reason_code: null,
    final_verdict: "OFFICIAL_BOUNDED_WRITE_READY",
  });
}

export function validateOfficialBoundedResult(result) {
  if (result?.schema_version !== OFFICIAL_BOUNDED_RESULT_SCHEMA_VERSION) throw new Error("Official bounded result schema is invalid.");
  if (![
    "OFFICIAL_BOUNDED_WRITE_READY",
    "OFFICIAL_BOUNDED_WRITE_BLOCKED",
    "OFFICIAL_BOUNDED_WRITE_COMMITTED",
    "OFFICIAL_BOUNDED_WRITE_ROLLED_BACK",
    "OFFICIAL_BOUNDED_WRITE_COMMITTED_POST_VERIFY_FAILED",
    "OFFICIAL_BOUNDED_WRITE_COMMIT_OUTCOME_UNKNOWN",
  ].includes(result.final_verdict)) throw new Error("Official bounded result verdict is invalid.");
  if (result.deletes !== 0 || result.cleanup_operations !== 0) throw new Error("Official bounded result is destructive.");
  const operationValues = [result.operations?.series, result.operations?.variants, result.operations?.restock_events];
  if (operationValues.some((value) => !Number.isInteger(value) || value < 0)
    || result.operations.series > 1 || result.operations.variants > OFFICIAL_BOUNDED_CANARY_LIMITS.max_variants
    || result.operations.restock_events > OFFICIAL_BOUNDED_CANARY_LIMITS.max_restock_events
    || result.database_writes !== operationValues.reduce((sum, value) => sum + value, 0)) {
    throw new Error("Official bounded result write counts are invalid.");
  }
  validateOperationCounts(result.planned_operations);
  validateOperationCounts(result.committed_operations);
  if (findForbiddenObjectKeys(result).length) throw new Error("Official bounded result contains forbidden fields.");
  return result;
}

export function formatOfficialBoundedResultMarkdown(result) {
  return [
    "# Official bounded write result",
    "",
    `- Verdict: ${result.final_verdict}`,
    `- Run ID: ${result.run_id ?? "none"}`,
    `- Head SHA: ${result.head_sha ?? "none"}`,
    `- Audit run ID: ${result.audit_run_id ?? "none"}`,
    `- Audit digest: ${result.audit_digest ?? "none"}`,
    `- Selected series: ${result.selected_candidate?.series_id ?? "none"}`,
    `- Series writes: ${result.operations.series}`,
    `- Variant writes: ${result.operations.variants}`,
    `- Restock event writes: ${result.operations.restock_events}`,
    `- Planned inserts / updates: ${operationTypeTotal(result.planned_operations, "insert")} / ${operationTypeTotal(result.planned_operations, "update")}`,
    `- Committed inserts / updates: ${operationTypeTotal(result.committed_operations, "insert")} / ${operationTypeTotal(result.committed_operations, "update")}`,
    `- Database writes: ${result.database_writes}`,
    "- Deletes: 0",
    "- Cleanup operations: 0",
    `- Transaction: ${result.transaction.state}`,
    `- Reason: ${result.reason_code ?? "none"}`,
    "",
  ].join("\n");
}

export function findOfficialBoundedLeaks(files, explicitValues = []) {
  const secrets = asArray(explicitValues).map(text).filter((value) => value.length >= 8);
  const findings = [];
  for (const file of asArray(files)) {
    const body = String(file?.text ?? "");
    let parsed = null;
    if (text(file?.name).endsWith(".json")) {
      try { parsed = JSON.parse(body); } catch { findings.push(`${file.name}:invalid_json`); }
    }
    if (parsed && findForbiddenObjectKeys(parsed).length) findings.push(`${file.name}:forbidden_fields`);
    if (secrets.some((secret) => body.includes(secret))) findings.push(`${file.name}:explicit_secret_value`);
  }
  return [...new Set(findings)].sort();
}

export function createOfficialMemoryTransactionAdapter(initial = {}, { failAfterWrites = null } = {}) {
  let committed = cloneStore(initial);
  let transaction = null;
  let writes = 0;
  return {
    async begin() {
      if (transaction) throw new Error("transaction_already_started");
      transaction = cloneStore(committed);
    },
    async readRow(table, id) {
      const store = transaction ?? committed;
      return structuredClone(store[table]?.get(id) ?? null);
    },
    async captureCounts() {
      const store = transaction ?? committed;
      const variants = [...(store.variants?.values() ?? [])];
      return {
        series: store.series?.size ?? 0,
        variants: store.variants?.size ?? 0,
        restock_events: store.restock_events?.size ?? 0,
        import_issues: 0,
        review_required: variants.filter((row) => row.review_required === true).length,
        provisional_variants: variants.filter((row) => row.variant_type === "provisional").length,
      };
    },
    async writeRow(table, operation, values) {
      if (!transaction) throw new Error("transaction_not_started");
      writes += 1;
      if (Number.isInteger(failAfterWrites) && writes > failAfterWrites) throw new Error("simulated_mid_transaction_failure");
      const current = transaction[table].get(values.id);
      if (operation === "insert" && current) throw new Error("duplicate_insert");
      if (operation === "update" && !current) throw new Error("missing_update");
      const databaseRow = toOfficialDatabaseRow(table, values);
      transaction[table].set(values.id, structuredClone(operation === "update" ? { ...current, ...databaseRow } : databaseRow));
      return 1;
    },
    async commit() {
      if (!transaction) throw new Error("transaction_not_started");
      committed = transaction;
      transaction = null;
    },
    async rollback() {
      if (!transaction) throw new Error("transaction_not_started");
      transaction = null;
    },
    snapshot() {
      return Object.fromEntries(Object.entries(committed)
        .map(([table, rows]) => [table, [...rows.values()].map((row) => structuredClone(row))]));
    },
  };
}

function candidateCanaryBlocker(candidate) {
  const contract = candidate?.apply_contract;
  if (!text(candidate?.series_id) || asArray(candidate?.blockers).length) return "candidate_blocked";
  if (candidate.provisional_replacement_candidate === true) return "provisional_cleanup_required";
  if (!contract || contract.deletes !== 0 || contract.cleanup_operations !== 0 || contract.import_issue_writes !== 0) return "destructive_contract";
  try {
    validateOfficialApplyOperation(contract.series, "series");
    for (const operation of asArray(contract.variants)) validateOfficialApplyOperation(operation, "variants");
    if (contract.restock_event) validateOfficialApplyOperation(contract.restock_event, "restock_events");
  } catch {
    return "invalid_apply_contract";
  }
  if (asArray(contract.variants).length > OFFICIAL_BOUNDED_CANARY_LIMITS.max_variants) return "variant_cap_exceeded";
  if (contract.restock_event && OFFICIAL_BOUNDED_CANARY_LIMITS.max_restock_events < 1) return "restock_event_cap_exceeded";
  if ([contract.series, ...asArray(contract.variants), ...(contract.restock_event ? [contract.restock_event] : [])]
    .every((operation) => operation.operation === "none")) return "candidate_has_no_writes";
  try { assertOfficialCanonicalReleaseSafe(candidate); } catch { return "canonical_release_unsafe"; }
  return null;
}

export function buildOfficialCandidateOperations(candidate, limits = OFFICIAL_BOUNDED_CANARY_LIMITS) {
  const contract = candidate.apply_contract;
  const operations = [contract.series, ...asArray(contract.variants), ...(contract.restock_event ? [contract.restock_event] : [])];
  const maxVariants = Number.isInteger(limits?.max_variants) ? limits.max_variants : OFFICIAL_BOUNDED_CANARY_LIMITS.max_variants;
  const maxRestockEvents = Number.isInteger(limits?.max_restock_events)
    ? limits.max_restock_events
    : OFFICIAL_BOUNDED_CANARY_LIMITS.max_restock_events;
  if (operations.length > 1 + maxVariants + maxRestockEvents) {
    throw boundedError("official_bounded_operation_cap_exceeded");
  }
  return operations;
}

export function assertOfficialOperationPrecondition(operation, current) {
  if (operation.operation === "insert") {
    if (current) throw boundedError("official_bounded_insert_identity_exists");
    return;
  }
  if (!current || digestOfficialPreconditionRow(operation.table, current) !== operation.precondition_digest) {
    throw boundedError("official_bounded_precondition_drift");
  }
}

export function assertOfficialOperationExpectedRow(operation, current, before) {
  if (!current) throw boundedError("official_bounded_post_write_row_missing");
  if (operation.operation !== "none"
    && digestOfficialRow(operation.table, current) !== digestOfficialRow(operation.table, operation.values)) {
    throw boundedError("official_bounded_post_write_verification_failed");
  }
  const expectedFull = operation.operation === "none"
    ? operation.precondition_digest
    : digestOfficialPreconditionRow(operation.table, {
      ...(before || {}),
      ...toOfficialDatabaseRow(operation.table, operation.values),
    });
  if (digestOfficialPreconditionRow(operation.table, current) !== expectedFull) {
    throw boundedError("official_bounded_unexpected_target_change");
  }
}

export function assertOfficialOperationWriteCounts(operations, actual) {
  const expected = { series: 0, variants: 0, restock_events: 0 };
  for (const operation of operations) if (operation.operation !== "none") expected[operation.table] += 1;
  if (canonicalJson(expected) !== canonicalJson(actual)) throw boundedError("official_bounded_write_count_mismatch");
}

function assertReleaseMatches(values, canonical) {
  if (!releaseEqual(values, canonical)) throw boundedError("official_bounded_canonical_release_overwrite");
}

function releaseEqual(left, right) {
  return nullableDate(left?.release_date) === nullableDate(right?.release_date)
    && nullableText(left?.release_month) === nullableText(right?.release_month)
    && nullableText(left?.release_week) === nullableText(right?.release_week);
}

function buildOfficialBoundedResult({
  workflow,
  authorization,
  beforeDigests,
  afterDigests,
  writeCounts,
  databaseWrites,
  transactionState,
  rollbackAttempted,
  rollbackVerified,
  finalVerdict,
  reasonCode = null,
}) {
  return validateOfficialBoundedResult({
    schema_version: OFFICIAL_BOUNDED_RESULT_SCHEMA_VERSION,
    run_id: numericId(workflow.run_id),
    head_sha: normalizedSha(workflow.head_sha) || authorization.head_sha,
    audit_run_id: authorization.audit_run_id,
    audit_digest: authorization.audit_digest,
    approval_digest: authorization.approval_digest,
    selected_candidate: {
      series_id: authorization.candidate.series_id,
      apply_contract_digest: authorization.candidate.apply_contract.canonical_digest,
    },
    before_digests: sortObject(beforeDigests),
    after_digests: sortObject(afterDigests),
    operations: writeCounts,
    planned_operations: summarizeOperations(buildOfficialCandidateOperations(authorization.candidate)),
    committed_operations: transactionState.startsWith("committed")
      ? summarizeOperations(buildOfficialCandidateOperations(authorization.candidate), { writesOnly: true })
      : emptyOperationCounts(),
    database_writes: databaseWrites,
    deletes: 0,
    cleanup_operations: 0,
    transaction: {
      state: transactionState,
      rollback_attempted: rollbackAttempted,
      rollback_verified: rollbackVerified,
    },
    reason_code: reasonCode,
    final_verdict: finalVerdict,
  });
}

function cloneStore(initial) {
  return Object.fromEntries(["series", "variants", "restock_events"].map((table) => [
    table,
    new Map((initial?.[table] instanceof Map ? [...initial[table].values()] : asArray(initial?.[table]))
      .map((row) => [text(row.id), structuredClone(row)])),
  ]));
}

function findForbiddenObjectKeys(value, path = "$") {
  if (Array.isArray(value)) return value.flatMap((entry, index) => findForbiddenObjectKeys(entry, `${path}[${index}]`));
  if (!value || typeof value !== "object") return [];
  const findings = [];
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:raw|raw_response|headers|cookies?|authorization|approval|token|secret|password|api_key|application_id|access_key|service_role_key|db_url|seller)$/i.test(key)) {
      findings.push(`${path}.${key}`);
    }
    findings.push(...findForbiddenObjectKeys(child, `${path}.${key}`));
  }
  return findings;
}

function operationKey(operation) {
  return `${operation.table}:${operation.id}`;
}

function sumObject(value) {
  return Object.values(value && typeof value === "object" ? value : {}).reduce((sum, entry) => sum + Number(entry || 0), 0);
}

function summarizeOperations(operations, { writesOnly = false } = {}) {
  const summary = emptyOperationCounts();
  for (const operation of operations) {
    if (writesOnly && operation.operation === "none") continue;
    summary[operation.table][operation.operation] += 1;
  }
  return summary;
}

function emptyOperationCounts() {
  return Object.fromEntries(["series", "variants", "restock_events"]
    .map((table) => [table, { insert: 0, update: 0, none: 0 }]));
}

function validateOperationCounts(value) {
  for (const table of ["series", "variants", "restock_events"]) {
    for (const operation of ["insert", "update", "none"]) {
      if (!Number.isInteger(value?.[table]?.[operation]) || value[table][operation] < 0) {
        throw new Error("Official bounded result operation summary is invalid.");
      }
    }
  }
}

function operationTypeTotal(value, operation) {
  return ["series", "variants", "restock_events"]
    .reduce((sum, table) => sum + Number(value?.[table]?.[operation] || 0), 0);
}

function sortObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right, "en")));
}

function boundedError(reasonCode) {
  const error = new Error(reasonCode);
  error.reason_code = reasonCode;
  return error;
}

function validDigest(value) {
  return /^sha256:[0-9a-f]{64}$/.test(text(value));
}

function normalizedSha(value) {
  const normalized = text(value).toLowerCase();
  return /^[0-9a-f]{40}$/.test(normalized) ? normalized : "";
}

function numericId(value) {
  const normalized = text(value);
  return /^\d+$/.test(normalized) ? normalized : null;
}

function nullableDate(value) {
  const normalized = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function nullableText(value) {
  return text(value) || null;
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return value == null ? "" : String(value).trim();
}
