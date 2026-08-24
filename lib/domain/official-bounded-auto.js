import {
  digestOfficialPreconditionRow,
  validateOfficialApplyOperation,
} from "./official-apply-contract.js";
import {
  assertOfficialCanonicalReleaseSafe,
  assertOfficialOperationExpectedRow,
  assertOfficialOperationPrecondition,
  assertOfficialOperationWriteCounts,
  buildOfficialCandidateOperations,
} from "./official-bounded-write.js";
import { validateOfficialReadOnlyAudit } from "./official-read-only-audit.js";

export const OFFICIAL_BOUNDED_AUTO_SCHEMA_VERSION = 1;
export const OFFICIAL_BOUNDED_AUTO_SCHEDULE = Object.freeze({
  cron: "27 2 * * *",
  utc: "daily at 02:27 UTC",
  jst: "daily at 11:27 JST",
});
export const OFFICIAL_BOUNDED_AUTO_LIMITS = Object.freeze({
  max_series_inserts: 4,
  max_series_updates: 4,
  max_series_writes: 4,
  max_variant_inserts: 40,
  max_variant_updates: 40,
  max_variant_writes: 40,
  max_restock_event_writes: 4,
});

const APPROVAL_PREFIX = "APPROVE_OFFICIAL_BOUNDED_AUTO_V1";
const EXPECTED_SOURCES = Object.freeze({
  gashapon_schedule: "gashapon",
  gashapon_products: "gashapon",
  takaratomy_search: "takaratomy_arts",
});
const COUNT_KEYS = Object.freeze([
  "series",
  "variants",
  "restock_events",
  "import_issues",
  "review_required",
  "provisional_variants",
]);

export function expectedOfficialAutoApproval(headSha) {
  const sha = normalizedSha(headSha);
  return sha ? `${APPROVAL_PREFIX}:${sha}` : "";
}

export function resolveOfficialAutoGate({
  enabled,
  approval,
  eventName,
  ref,
  headSha,
  originMainSha,
} = {}) {
  const head = normalizedSha(headSha);
  const origin = normalizedSha(originMainSha);
  if (eventName !== "schedule" || ref !== "refs/heads/main" || !head || head !== origin) {
    return gateDecision("blocked", "official_auto_main_sha_mismatch", head, false);
  }
  if (text(enabled) !== "true") {
    return gateDecision("disabled", "official_auto_disabled", head, false);
  }
  const approvalValid = text(approval) === expectedOfficialAutoApproval(head);
  if (!approvalValid) {
    return gateDecision("blocked", "official_auto_approval_mismatch", head, false);
  }
  return gateDecision("enabled", null, head, true);
}

export function authorizeOfficialAutomaticWrite({ report, headSha, originMainSha } = {}) {
  validateOfficialReadOnlyAudit(report);
  const head = normalizedSha(headSha);
  const origin = normalizedSha(originMainSha);
  if (!head || head !== origin || head !== normalizedSha(report?.workflow?.head_sha)) {
    throw autoError("official_auto_main_sha_mismatch");
  }
  if (report.report_complete !== true || report.final_verdict !== "OFFICIAL_READ_ONLY_PLAN_READY"
    || report.plan?.state !== "ready") {
    throw autoError("official_auto_audit_not_ready");
  }
  if (report.database?.writes !== 0 || report.database?.inserts !== 0
    || report.database?.updates !== 0 || report.database?.deletes !== 0) {
    throw autoError("official_auto_audit_write_detected");
  }
  if (sumObject(report.plan?.would_delete) !== 0 || report.plan?.cleanup_operations !== 0) {
    throw autoError("official_auto_delete_candidate_rejected");
  }
  if (Number(report.plan?.would_insert?.import_issues) !== 0
    || Number(report.plan?.would_update?.import_issues) !== 0) {
    throw autoError("official_auto_import_issue_write_rejected");
  }
  assertExpectedSources(report.sources);

  const candidates = asArray(report.plan?.candidates);
  if (Number(report.plan?.candidate_count) !== candidates.length) {
    throw autoError("official_auto_candidate_shape_invalid");
  }
  const operations = [];
  for (const candidate of candidates) {
    if (asArray(candidate?.blockers).length || candidate?.provisional_replacement_candidate === true) {
      throw autoError("official_auto_review_or_cleanup_candidate_rejected");
    }
    assertOfficialCanonicalReleaseSafe(candidate);
    if (asArray(candidate.variants).some((variant) => variant.existing_review_required === true)
      || candidate.restock_event?.existing_review_required === true) {
      throw autoError("official_auto_existing_review_required_change_rejected");
    }
    for (const operation of buildOfficialCandidateOperations(candidate, {
      max_variants: OFFICIAL_BOUNDED_AUTO_LIMITS.max_variant_writes,
      max_restock_events: OFFICIAL_BOUNDED_AUTO_LIMITS.max_restock_event_writes,
    })) {
      validateOfficialApplyOperation(operation, operation.table);
      assertAutomaticOperationSafe(operation);
      operations.push(operation);
    }
  }
  if (duplicateValues(operations.map(operationKey)).length) {
    throw autoError("official_auto_duplicate_target_identity");
  }

  const proposal = summarizeProposal(operations);
  assertProposalMatchesAudit(proposal, report.plan);
  assertProposalWithinLimits(proposal);
  return {
    ok: true,
    decision: proposal.database_writes === 0 ? "no_changes" : "write",
    head_sha: head,
    audit_run_id: numericId(report.workflow.run_id),
    audit_digest: report.canonical_digest,
    operations,
    proposal,
    audit: sanitizeAuditSummary(report),
  };
}

export async function executeOfficialAutomaticTransaction({ adapter, authorization, workflow = {} } = {}) {
  if (!authorization?.ok || authorization.decision !== "write" || !authorization.operations?.length) {
    throw autoError("official_auto_authorization_missing");
  }
  const methods = ["begin", "readRow", "writeRow", "captureCounts", "commit", "rollback"];
  if (!adapter || methods.some((name) => typeof adapter[name] !== "function")) {
    throw autoError("official_auto_transaction_adapter_invalid");
  }
  const operations = authorization.operations;
  const beforeRows = new Map();
  const beforeDigests = {};
  const afterDigests = {};
  const writeCounts = { series: 0, variants: 0, restock_events: 0 };
  let databaseBefore = null;
  let databaseAfter = null;
  let began = false;
  let commitAttempted = false;
  let committed = false;

  try {
    await adapter.begin();
    began = true;
    databaseBefore = normalizeCountSnapshot(await adapter.captureCounts());
    for (const operation of operations) {
      const current = await adapter.readRow(operation.table, operation.id, { lock: true });
      assertOfficialOperationPrecondition(operation, current);
      beforeRows.set(operationKey(operation), current ? structuredClone(current) : null);
      beforeDigests[operationKey(operation)] = current
        ? digestOfficialPreconditionRow(operation.table, current)
        : null;
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
    const preCommitCounts = normalizeCountSnapshot(await adapter.captureCounts());
    assertExpectedCountDelta(databaseBefore, preCommitCounts, authorization.proposal);
    commitAttempted = true;
    await adapter.commit();
    committed = true;

    for (const operation of operations) {
      const current = await adapter.readRow(operation.table, operation.id, { lock: false });
      assertOfficialOperationExpectedRow(operation, current, beforeRows.get(operationKey(operation)));
      afterDigests[operationKey(operation)] = digestOfficialPreconditionRow(operation.table, current);
    }
    databaseAfter = normalizeCountSnapshot(await adapter.captureCounts());
    assertExpectedCountDelta(databaseBefore, databaseAfter, authorization.proposal);
    return buildOfficialAutoResult({
      workflow,
      gate: { state: "enabled", reason_code: null, approval_valid: true },
      authorization,
      beforeDigests,
      afterDigests,
      writeCounts,
      databaseBefore,
      databaseAfter,
      transactionState: "committed",
      rollbackAttempted: false,
      rollbackVerified: false,
      finalVerdict: "OFFICIAL_BOUNDED_AUTO_COMMITTED",
    });
  } catch (error) {
    let rollbackAttempted = false;
    let rollbackVerified = false;
    if (began && !committed && !commitAttempted) {
      rollbackAttempted = true;
      try {
        await adapter.rollback();
        rollbackVerified = true;
      } catch {
        rollbackVerified = false;
      }
    }
    const attemptedWrites = Object.values(writeCounts).reduce((sum, value) => sum + value, 0);
    const commitOutcomeUnknown = commitAttempted && !committed;
    const postCommitFailure = committed;
    return buildOfficialAutoResult({
      workflow,
      gate: { state: "enabled", reason_code: null, approval_valid: true },
      authorization,
      beforeDigests,
      afterDigests: {},
      writeCounts: postCommitFailure || commitOutcomeUnknown
        ? writeCounts
        : { series: 0, variants: 0, restock_events: 0 },
      databaseBefore,
      databaseAfter,
      transactionState: postCommitFailure
        ? "committed_post_verify_failed"
        : commitOutcomeUnknown
          ? "commit_outcome_unknown"
          : rollbackVerified ? "rolled_back" : "rollback_failed",
      rollbackAttempted,
      rollbackVerified,
      databaseWrites: postCommitFailure || commitOutcomeUnknown ? attemptedWrites : 0,
      reasonCode: text(error?.reason_code) || "official_auto_transaction_failed",
      finalVerdict: postCommitFailure
        ? "OFFICIAL_BOUNDED_AUTO_COMMITTED_POST_VERIFY_FAILED"
        : commitOutcomeUnknown
          ? "OFFICIAL_BOUNDED_AUTO_COMMIT_OUTCOME_UNKNOWN"
          : rollbackVerified
            ? "OFFICIAL_BOUNDED_AUTO_ROLLED_BACK"
            : "OFFICIAL_BOUNDED_AUTO_BLOCKED",
    });
  }
}

export function buildOfficialAutoGateResult({ workflow = {}, gate } = {}) {
  const disabled = gate?.state === "disabled";
  return validateOfficialAutoResult({
    ...emptyResult(workflow),
    gate: normalizeGate(gate),
    decision: { state: disabled ? "disabled" : "blocked", reason_code: text(gate?.reason_code) || null },
    report_complete: true,
    final_verdict: disabled ? "OFFICIAL_BOUNDED_AUTO_DISABLED" : "OFFICIAL_BOUNDED_AUTO_BLOCKED",
  });
}

export function buildOfficialAutoPreparedResult({ workflow = {}, gate, authorization } = {}) {
  if (!authorization?.ok) throw autoError("official_auto_authorization_missing");
  const noChanges = authorization.decision === "no_changes";
  return validateOfficialAutoResult({
    ...emptyResult(workflow),
    gate: normalizeGate(gate),
    audit: authorization.audit,
    proposal: authorization.proposal,
    target_ids: targetIds(authorization.operations),
    decision: { state: noChanges ? "no_changes" : "ready", reason_code: null },
    report_complete: true,
    final_verdict: noChanges ? "OFFICIAL_BOUNDED_AUTO_NO_CHANGES" : "OFFICIAL_BOUNDED_AUTO_READY",
  });
}

export function buildOfficialAutoBlockedResult({ workflow = {}, gate, reasonCode, audit = null, authorization = null } = {}) {
  return validateOfficialAutoResult({
    ...emptyResult(workflow),
    gate: normalizeGate(gate),
    audit: authorization?.audit ?? audit,
    proposal: authorization?.proposal ?? emptyProposal(),
    target_ids: authorization ? targetIds(authorization.operations) : { series: [], variants: [], restock_events: [] },
    decision: { state: "blocked", reason_code: text(reasonCode) || "official_auto_blocked" },
    report_complete: true,
    final_verdict: "OFFICIAL_BOUNDED_AUTO_BLOCKED",
  });
}

export function validateOfficialAutoResult(result) {
  if (result?.schema_version !== OFFICIAL_BOUNDED_AUTO_SCHEMA_VERSION
    || result?.report_type !== "official_bounded_automatic_result") {
    throw new Error("Official automatic result schema is invalid.");
  }
  if (![
    "OFFICIAL_BOUNDED_AUTO_DISABLED",
    "OFFICIAL_BOUNDED_AUTO_READY",
    "OFFICIAL_BOUNDED_AUTO_NO_CHANGES",
    "OFFICIAL_BOUNDED_AUTO_BLOCKED",
    "OFFICIAL_BOUNDED_AUTO_COMMITTED",
    "OFFICIAL_BOUNDED_AUTO_ROLLED_BACK",
    "OFFICIAL_BOUNDED_AUTO_COMMITTED_POST_VERIFY_FAILED",
    "OFFICIAL_BOUNDED_AUTO_COMMIT_OUTCOME_UNKNOWN",
  ].includes(result.final_verdict)) throw new Error("Official automatic result verdict is invalid.");
  if (result.proposal?.deletes !== 0 || result.actual_writes?.deletes !== 0) {
    throw new Error("Official automatic result contains deletes.");
  }
  assertProposalWithinLimits(result.proposal);
  const writeTotal = Number(result.actual_writes?.series || 0)
    + Number(result.actual_writes?.variants || 0)
    + Number(result.actual_writes?.restock_events || 0);
  if (result.database_writes !== writeTotal) throw new Error("Official automatic write total is invalid.");
  if (["disabled", "no_changes", "ready"].includes(result.decision?.state)
    && result.database_writes !== 0) {
    throw new Error("Official automatic non-write decision contains writes.");
  }
  if (findForbiddenObjectKeys(result).length) throw new Error("Official automatic result contains forbidden fields.");
  return result;
}

export function formatOfficialAutoResultMarkdown(result) {
  const sourceRows = asArray(result.audit?.sources).map((source) =>
    `| ${source.source} | ${source.provider} | ${source.records} | ${source.detail_successes}/${source.detail_attempts} |`);
  return [
    "# Official bounded automatic result",
    "",
    `- Verdict: ${result.final_verdict}`,
    `- Run ID: ${result.workflow.run_id ?? "none"}`,
    `- Head SHA: ${result.workflow.head_sha ?? "none"}`,
    `- Schedule: ${result.schedule.utc} / ${result.schedule.jst}`,
    `- Gate state: ${result.gate.state}`,
    `- Approval valid: ${result.gate.approval_valid}`,
    `- Decision: ${result.decision.state}`,
    `- Reason: ${result.decision.reason_code ?? "none"}`,
    `- Proposed series inserts / updates: ${result.proposal.series.insert} / ${result.proposal.series.update}`,
    `- Proposed variant inserts / updates: ${result.proposal.variants.insert} / ${result.proposal.variants.update}`,
    `- Proposed restock event inserts / updates: ${result.proposal.restock_events.insert} / ${result.proposal.restock_events.update}`,
    "- Proposed deletes: 0",
    `- Actual database writes: ${result.database_writes}`,
    `- Transaction: ${result.transaction.state}`,
    `- Zero or expected delta verified: ${result.verification.zero_or_expected_delta}`,
    "",
    "## Sources",
    "",
    "| Source | Provider | Records | Detail success |",
    "| --- | --- | ---: | ---: |",
    ...(sourceRows.length ? sourceRows : ["| none | none | 0 | 0/0 |"]),
    "",
    "## Production counts",
    "",
    `- Audit before: ${formatCounts(result.audit?.database_before)}`,
    `- Audit after: ${formatCounts(result.audit?.database_after)}`,
    `- Transaction before: ${formatCounts(result.production.before)}`,
    `- Transaction after: ${formatCounts(result.production.after)}`,
    "",
    "## Bounded limits",
    "",
    `- Series writes: ${result.limits.max_series_writes}`,
    `- Variant writes: ${result.limits.max_variant_writes}`,
    `- Restock event writes: ${result.limits.max_restock_event_writes}`,
    "- Automatic deletes: 0",
    "",
  ].join("\n");
}

export function findOfficialAutoLeaks(files, explicitValues = []) {
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

function buildOfficialAutoResult({
  workflow,
  gate,
  authorization,
  beforeDigests,
  afterDigests,
  writeCounts,
  databaseBefore,
  databaseAfter,
  transactionState,
  rollbackAttempted,
  rollbackVerified,
  finalVerdict,
  databaseWrites = null,
  reasonCode = null,
}) {
  const writes = databaseWrites ?? Object.values(writeCounts).reduce((sum, value) => sum + value, 0);
  const committed = transactionState === "committed";
  return validateOfficialAutoResult({
    ...emptyResult(workflow),
    gate: normalizeGate(gate),
    audit: authorization.audit,
    proposal: authorization.proposal,
    target_ids: targetIds(authorization.operations),
    decision: { state: committed ? "committed" : "blocked", reason_code: reasonCode },
    actual_writes: { ...writeCounts, deletes: 0 },
    database_writes: writes,
    production: {
      before: databaseBefore,
      after: databaseAfter,
      delta: buildCountDelta(databaseBefore, databaseAfter),
    },
    target_digests: {
      before: sortObject(beforeDigests),
      after: sortObject(afterDigests),
    },
    transaction: {
      state: transactionState,
      rollback_attempted: rollbackAttempted,
      rollback_verified: rollbackVerified,
    },
    verification: {
      targets_verified: committed,
      zero_or_expected_delta: committed,
    },
    report_complete: true,
    final_verdict: finalVerdict,
  });
}

function emptyResult(workflow) {
  return {
    schema_version: OFFICIAL_BOUNDED_AUTO_SCHEMA_VERSION,
    report_type: "official_bounded_automatic_result",
    workflow: {
      run_id: numericId(workflow?.run_id),
      head_sha: normalizedSha(workflow?.head_sha) || null,
      event_name: text(workflow?.event_name) || null,
    },
    schedule: OFFICIAL_BOUNDED_AUTO_SCHEDULE,
    gate: { state: "unknown", reason_code: null, approval_valid: false },
    limits: OFFICIAL_BOUNDED_AUTO_LIMITS,
    audit: null,
    proposal: emptyProposal(),
    target_ids: { series: [], variants: [], restock_events: [] },
    decision: { state: "blocked", reason_code: null },
    actual_writes: { series: 0, variants: 0, restock_events: 0, deletes: 0 },
    database_writes: 0,
    production: { before: null, after: null, delta: null },
    target_digests: { before: {}, after: {} },
    transaction: { state: "not_started", rollback_attempted: false, rollback_verified: false },
    verification: { targets_verified: false, zero_or_expected_delta: true },
    report_complete: false,
    final_verdict: "OFFICIAL_BOUNDED_AUTO_BLOCKED",
  };
}

function emptyProposal() {
  return {
    candidate_count: 0,
    series: { insert: 0, update: 0, none: 0 },
    variants: { insert: 0, update: 0, none: 0 },
    restock_events: { insert: 0, update: 0, none: 0 },
    review_required_count: 0,
    deletes: 0,
    database_writes: 0,
  };
}

function summarizeProposal(operations) {
  const proposal = emptyProposal();
  proposal.candidate_count = new Set(operations.filter((entry) => entry.table === "series").map((entry) => entry.id)).size;
  for (const operation of operations) proposal[operation.table][operation.operation] += 1;
  proposal.database_writes = ["series", "variants", "restock_events"]
    .reduce((sum, table) => sum + proposal[table].insert + proposal[table].update, 0);
  return proposal;
}

function assertProposalWithinLimits(proposal) {
  if (!proposal || proposal.deletes !== 0 || proposal.review_required_count !== 0) {
    throw autoError("official_auto_destructive_or_review_plan");
  }
  const seriesWrites = Number(proposal.series?.insert || 0) + Number(proposal.series?.update || 0);
  const variantWrites = Number(proposal.variants?.insert || 0) + Number(proposal.variants?.update || 0);
  const restockWrites = Number(proposal.restock_events?.insert || 0) + Number(proposal.restock_events?.update || 0);
  if (Number(proposal.series?.insert || 0) > OFFICIAL_BOUNDED_AUTO_LIMITS.max_series_inserts
    || Number(proposal.series?.update || 0) > OFFICIAL_BOUNDED_AUTO_LIMITS.max_series_updates
    || seriesWrites > OFFICIAL_BOUNDED_AUTO_LIMITS.max_series_writes
    || Number(proposal.variants?.insert || 0) > OFFICIAL_BOUNDED_AUTO_LIMITS.max_variant_inserts
    || Number(proposal.variants?.update || 0) > OFFICIAL_BOUNDED_AUTO_LIMITS.max_variant_updates
    || variantWrites > OFFICIAL_BOUNDED_AUTO_LIMITS.max_variant_writes
    || restockWrites > OFFICIAL_BOUNDED_AUTO_LIMITS.max_restock_event_writes) {
    throw autoError("official_auto_candidate_cap_exceeded");
  }
}

function assertProposalMatchesAudit(proposal, plan) {
  const expected = {
    series: { insert: Number(plan?.would_insert?.series), update: Number(plan?.would_update?.series) },
    variants: { insert: Number(plan?.would_insert?.variants), update: Number(plan?.would_update?.variants) },
    restock_events: { insert: Number(plan?.would_insert?.restock_events), update: Number(plan?.would_update?.restock_events) },
  };
  for (const table of Object.keys(expected)) {
    if (proposal[table].insert !== expected[table].insert || proposal[table].update !== expected[table].update) {
      throw autoError("official_auto_plan_total_mismatch");
    }
  }
}

function assertAutomaticOperationSafe(operation) {
  const values = operation.values;
  if (values.source_type !== "official_site") throw autoError("official_auto_source_contamination");
  if (operation.table === "variants" && (values.review_required !== false || values.variant_type === "provisional")) {
    throw autoError("official_auto_review_or_provisional_variant");
  }
  if (operation.table === "restock_events" && (values.review_required !== false || values.confidence !== 1)) {
    throw autoError("official_auto_review_required_event");
  }
}

function assertExpectedSources(sources) {
  const rows = asArray(sources);
  if (rows.length !== Object.keys(EXPECTED_SOURCES).length) throw autoError("official_auto_source_contamination");
  for (const [source, provider] of Object.entries(EXPECTED_SOURCES)) {
    const row = rows.find((entry) => entry.source === source);
    if (!row || row.provider !== provider || row.http_success !== true || row.parser_success !== true
      || row.detail_failures !== 0 || row.zero_lineups !== 0 || asArray(row.issue_codes).length) {
      throw autoError("official_auto_source_incomplete_or_contaminated");
    }
  }
}

function assertExpectedCountDelta(before, after, proposal) {
  const expected = {
    series: proposal.series.insert,
    variants: proposal.variants.insert,
    restock_events: proposal.restock_events.insert,
    import_issues: 0,
    review_required: 0,
    provisional_variants: 0,
  };
  for (const key of COUNT_KEYS) {
    if (after[key] - before[key] !== expected[key]) throw autoError("official_auto_unexpected_database_delta");
  }
}

function sanitizeAuditSummary(report) {
  return {
    run_id: numericId(report.workflow.run_id),
    canonical_digest: report.canonical_digest,
    source_counts: Object.fromEntries(report.sources.map((source) => [source.source, source.records])),
    sources: report.sources.map((source) => ({
      source: source.source,
      provider: source.provider,
      records: source.records,
      discovered_urls: source.discovered_urls,
      detail_attempts: source.detail_attempts,
      detail_successes: source.detail_successes,
      detail_failures: source.detail_failures,
      formal_lineups: source.formal_lineups,
    })),
    fetched_official_counts: {
      formal_lineups: report.totals.formal_lineups,
      new_series: report.totals.new_series,
      existing_series: report.totals.existing_series,
      new_variants: report.totals.new_variants,
      existing_variants: report.totals.existing_variants,
    },
    database_before: normalizeCountSnapshot(report.database.before),
    database_after: normalizeCountSnapshot(report.database.after),
  };
}

function targetIds(operations) {
  return Object.fromEntries(["series", "variants", "restock_events"].map((table) => [
    table,
    operations.filter((entry) => entry.table === table && entry.operation !== "none")
      .map((entry) => entry.id).sort((left, right) => left.localeCompare(right, "en")),
  ]));
}

function normalizeCountSnapshot(value) {
  if (!value || COUNT_KEYS.some((key) => !Number.isInteger(Number(value[key])) || Number(value[key]) < 0)) {
    throw autoError("official_auto_database_snapshot_incomplete");
  }
  return Object.fromEntries(COUNT_KEYS.map((key) => [key, Number(value[key])]));
}

function buildCountDelta(before, after) {
  if (!before || !after) return null;
  return Object.fromEntries(COUNT_KEYS.map((key) => [key, after[key] - before[key]]));
}

function gateDecision(state, reasonCode, headSha, approvalValid) {
  return { state, reason_code: reasonCode, head_sha: headSha || null, approval_valid: approvalValid };
}

function normalizeGate(gate) {
  return {
    state: ["enabled", "disabled", "blocked"].includes(gate?.state) ? gate.state : "blocked",
    reason_code: text(gate?.reason_code) || null,
    approval_valid: gate?.approval_valid === true,
  };
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

function formatCounts(value) {
  if (!value) return "not captured";
  return COUNT_KEYS.map((key) => `${key}=${value[key]}`).join(", ");
}

function operationKey(operation) {
  return `${operation.table}:${operation.id}`;
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicate = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicate.add(value);
    seen.add(value);
  }
  return [...duplicate].sort();
}

function sumObject(value) {
  return Object.values(value && typeof value === "object" ? value : {})
    .reduce((sum, entry) => sum + Number(entry || 0), 0);
}

function sortObject(value) {
  return Object.fromEntries(Object.entries(value || {})
    .sort(([left], [right]) => left.localeCompare(right, "en")));
}

function normalizedSha(value) {
  const normalized = text(value).toLowerCase();
  return /^[0-9a-f]{40}$/.test(normalized) ? normalized : "";
}

function numericId(value) {
  const normalized = text(value);
  return /^\d+$/.test(normalized) ? normalized : null;
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function autoError(reasonCode) {
  const error = new Error(reasonCode);
  error.reason_code = reasonCode;
  return error;
}
