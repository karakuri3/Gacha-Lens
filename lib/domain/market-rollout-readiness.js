import { dedupeMarketObservationsByListingDay } from "./market-observation-history.js";
import { stableId } from "../fetchers/feed-source-utils.js";

const SCHEMA_VERSION = 2;
const CANDIDATE_KEY = /^[0-9a-f]{16}$/;
const AUDIT_RUN_ID = /^\d+$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const ALLOWED_STATUSES = new Set(["active", "sold", "sold_out", "pre_release"]);
const ALLOWED_OUTCOMES = new Set(["success", "failed_safe", "failed_with_rollback", "failed_unsafe"]);
const DEDICATED_MARKER_PREFIX = "market-canary-observation-";
const NEXT_MANUAL_STEP = "manual canaries on fresh audits with different series or providers";
const PRODUCTION_DELTA_KEYS = [
  "market_listings",
  "market_listing_observations",
  "import_issues",
  "ingestion_runs",
  "review_required",
];

export function buildMarketRolloutReadinessReport(input = {}) {
  const generatedAt = validIso(input.generatedAt) ?? new Date().toISOString();
  const databaseWrites = finiteCount(input.databaseWrites);
  const listings = array(input.marketListings);
  const observations = array(input.observations);
  const evidence = normalizeEvidence(input.phase4);
  const listingById = new Map(listings.map((row) => [text(row?.id), row]).filter(([id]) => id));
  const markerAuditLookup = buildCanaryEvidenceLookup(evidence.canaries);
  const markerAudit = auditConsumptionMarkers(observations, listingById, markerAuditLookup);
  const duplicateDailyObservations = countDuplicateListingDays(observations);
  const publicHistoryRows = dedupeMarketObservationsByListingDay(observations);
  const rollbackFailures = evidence.canaries.filter((canary) => (
    canary.rollback.attempted && !canary.rollback.verified
  )).length;
  const candidateQuality = aggregateCandidateQuality(evidence);
  const phase4 = aggregatePhase4(evidence);
  const providerQuality = buildProviderQuality({
    audits: evidence.audits,
    canaries: evidence.canaries,
    listings,
    markerRows: markerAudit.validMarkers,
    listingById,
  });
  const productionReadComplete = input.productionReadComplete === true;
  const reportComplete = productionReadComplete
    && evidence.complete
    && input.fetchErrorCount === 0;

  const safety = {
    consumption_markers: markerAudit.markerCount,
    missing_consumption_markers: markerAudit.missingCount,
    duplicate_consumption_markers: markerAudit.duplicateCount,
    malformed_consumption_markers: markerAudit.malformedCount,
    duplicate_daily_observations: duplicateDailyObservations,
    public_history_observation_count: publicHistoryRows.length,
    unverified_canary_observations: markerAudit.unverifiedCount,
    review_required_writes: markerAudit.reviewRequiredWrites,
    rollback_failures: rollbackFailures,
    workflow_unchanged: evidence.workflowUnchanged,
  };
  const readiness = determineReadiness({
    databaseWrites,
    reportComplete,
    phase4,
    safety,
    evidenceFailures: evidence.failures,
  });

  const report = {
    schema_version: SCHEMA_VERSION,
    generated_at: generatedAt,
    mode: "read-only",
    database_writes: databaseWrites,
    report_complete: reportComplete,
    source_counts: {
      market_listings: listings.length,
      market_listing_observations: observations.length,
      ingestion_runs: array(input.ingestionRuns).length,
      import_issues: array(input.importIssues).length,
    },
    phase4,
    source_audits: evidence.audits.map(sanitizeAuditEvidence),
    canary_attempts: evidence.canaries.map(sanitizeCanaryEvidence),
    candidate_quality: candidateQuality,
    safety,
    marker_audits: markerAudit.markerAudits,
    provider_quality: providerQuality,
    readiness,
  };
  validateMarketRolloutReadinessReport(report);
  return report;
}

export function validateMarketRolloutReadinessReport(report) {
  if (!plainObject(report)) throw new Error("Readiness report must be an object.");
  if (report.schema_version !== SCHEMA_VERSION) throw new Error("Readiness schema version is invalid.");
  if (report.mode !== "read-only") throw new Error("Readiness report must be read-only.");
  if (finiteCount(report.database_writes) !== report.database_writes) {
    throw new Error("Readiness database write count is invalid.");
  }
  if (!validIso(report.generated_at)) throw new Error("Readiness generated_at is invalid.");
  if (!["NOT_READY", "READY_FOR_MORE_MANUAL_CANARIES"].includes(report.readiness?.verdict)) {
    throw new Error("Readiness verdict is invalid.");
  }
  if (!Array.isArray(report.readiness?.reasons) || !report.readiness.reasons.every(nonemptyText)) {
    throw new Error("Readiness reasons are invalid.");
  }
  if (report.readiness?.next_allowed_step !== NEXT_MANUAL_STEP) {
    throw new Error("Readiness next step exceeds the manual canary boundary.");
  }
  assertSortedUnique(report.provider_quality, (row) => row.provider, "provider");
  assertSortedUnique(report.marker_audits, (row) => row.audit_run_id, "marker audit");
  assertSortedUnique(report.source_audits, (row) => row.run_id, "source audit");
  assertSortedUnique(report.canary_attempts, (row) => row.run_id, "canary attempt");
  for (const markerAudit of report.marker_audits) {
    if (!AUDIT_RUN_ID.test(markerAudit.audit_run_id)) throw new Error("Marker audit run ID is invalid.");
  }
  const serialized = JSON.stringify(report);
  if (/(service[_ -]?role|authorization|bearer|api[_ -]?key|seller|raw[_ -]?(response|payload)|supabase_url|private_url)/i.test(serialized)) {
    throw new Error("Readiness report contains unsafe fields.");
  }
  return true;
}

export function renderMarketRolloutReadinessMarkdown(report = {}) {
  validateMarketRolloutReadinessReport(report);
  const lines = [
    "# Market Rollout Readiness",
    "",
    `- Verdict: ${report.readiness.verdict}`,
    `- Mode: ${report.mode}`,
    `- Report complete: ${report.report_complete}`,
    `- Database writes: ${report.database_writes}`,
    `- Next allowed step: ${report.readiness.next_allowed_step}`,
    "",
    "## Reasons",
    "",
    ...report.readiness.reasons.map((reason) => `- ${escapeMarkdown(reason)}`),
    "",
    "## Phase 4 Evidence",
    "",
    `- Source audits: ${report.phase4.source_audits}`,
    `- Successful canaries: ${report.phase4.successful_canaries}`,
    `- Failed canaries: ${report.phase4.failed_canaries}`,
    `- Failed safely: ${report.phase4.failed_safe_canaries}`,
    `- Failed unsafely: ${report.phase4.failed_unsafe_canaries}`,
    `- Listing writes: ${report.phase4.listing_writes}`,
    `- Observation writes: ${report.phase4.observation_writes}`,
    `- Verified writes: ${report.phase4.verified_writes}`,
    `- Rollbacks attempted: ${report.phase4.rollbacks_attempted}`,
    `- Rollbacks verified: ${report.phase4.rollbacks_verified}`,
    "",
    "### Failure stages",
    "",
    ...renderCountList(report.phase4.failure_stages),
    "",
    "### Error codes",
    "",
    ...renderCountList(report.phase4.error_codes),
    "",
    "## Candidate Quality",
    "",
    `- Scope: ${report.candidate_quality.scope}`,
    `- Audit count: ${report.candidate_quality.audit_count}`,
    `- Evidence complete: ${report.candidate_quality.evidence_complete}`,
    `- Audited candidates: ${report.candidate_quality.audited_candidates}`,
    `- Accepted candidates: ${report.candidate_quality.accepted_candidates}`,
    `- Review-required candidates: ${report.candidate_quality.review_required_candidates}`,
    "",
    "## Canary Attempts",
    "",
    "| Run | Source audit | Outcome | Failed stage | Error code | Listing writes | Observation writes | Markers |",
    "|---|---|---|---|---|---:|---:|---:|",
    ...report.canary_attempts.map((row) => (
      `| ${row.run_id} | ${row.source_audit_run_id} | ${escapeMarkdown(row.outcome)} | ${escapeMarkdown(row.failed_stage || "none")} | ${escapeMarkdown(row.error_code || "none")} | ${row.listing_writes} | ${row.observation_writes} | ${row.consumption_markers} |`
    )),
    "",
    "## Safety",
    "",
    `- Consumption markers: ${report.safety.consumption_markers}`,
    `- Missing markers: ${report.safety.missing_consumption_markers}`,
    `- Duplicate markers: ${report.safety.duplicate_consumption_markers}`,
    `- Malformed markers: ${report.safety.malformed_consumption_markers}`,
    `- Duplicate listing/day observations: ${report.safety.duplicate_daily_observations}`,
    `- Unverified canary observations: ${report.safety.unverified_canary_observations}`,
    `- Review-required writes: ${report.safety.review_required_writes}`,
    `- Rollback failures: ${report.safety.rollback_failures}`,
    "",
    "## Provider Quality",
    "",
    "| Provider | Audited | Accepted | Review | Canary | Verified | Active | Sold | Malformed identity |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...report.provider_quality.map((row) => (
      `| ${escapeMarkdown(row.provider)} | ${row.audited_candidate_count} | ${row.accepted_count} | ${row.review_required_count} | ${row.canary_write_count} | ${row.verified_write_count} | ${row.active_count} | ${row.sold_count} | ${row.malformed_identity_count} |`
    )),
    "",
  ];
  return lines.join("\n");
}

function auditConsumptionMarkers(observations, listingById, canaryEvidence) {
  const markers = observations.filter(hasMarkerSignal).sort(compareMarker);
  const pairCounts = new Map();
  const validMarkers = [];
  let malformedCount = 0;
  let unverifiedCount = 0;
  let reviewRequiredWrites = 0;

  for (const observation of markers) {
    const raw = plainObject(observation?.raw) ? observation.raw : {};
    const auditRunId = text(raw.canary_audit_run_id);
    const candidateKey = text(raw.canary_candidate_key);
    const listingId = text(observation?.listing_id);
    const markerId = text(observation?.id);
    const dedicated = markerId.startsWith(DEDICATED_MARKER_PREFIX);
    const expectedDedicatedId = stableId(
      "market-canary-observation",
      auditRunId,
      candidateKey,
      listingId,
    );
    const malformed = !AUDIT_RUN_ID.test(auditRunId)
      || !CANDIDATE_KEY.test(candidateKey)
      || !listingId
      || !markerId
      || (dedicated && markerId !== expectedDedicatedId);
    if (malformed) {
      malformedCount += 1;
      continue;
    }

    const pair = `${auditRunId}\u0000${candidateKey}`;
    pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1);
    const listing = listingById.get(listingId);
    const evidence = canaryEvidence.get(pair);
    const statusValid = ALLOWED_STATUSES.has(text(observation.status).toLowerCase());
    const dedicatedListingMarkerMatches = !dedicated || (
      text(listing?.raw?.canary_audit_run_id) === auditRunId
      && text(listing?.raw?.canary_candidate_key) === candidateKey
    );
    if (!listing || !evidence?.verified || !statusValid || !dedicatedListingMarkerMatches) {
      unverifiedCount += 1;
    }
    if (listing?.review_required === true) reviewRequiredWrites += 1;
    validMarkers.push({ auditRunId, candidateKey, markerId, listingId });
  }

  const markerAudits = [...validMarkers.reduce((map, marker) => {
    const current = map.get(marker.auditRunId) ?? { audit_run_id: marker.auditRunId, marker_count: 0, candidateKeys: new Set() };
    current.marker_count += 1;
    current.candidateKeys.add(marker.candidateKey);
    map.set(marker.auditRunId, current);
    return map;
  }, new Map()).values()]
    .map((entry) => ({
      audit_run_id: entry.audit_run_id,
      marker_count: entry.marker_count,
      candidate_count: entry.candidateKeys.size,
    }))
    .sort((left, right) => compareNumericText(left.audit_run_id, right.audit_run_id));

  return {
    markerCount: markers.length,
    missingCount: [...canaryEvidence.keys()].filter((pair) => !pairCounts.has(pair)).length,
    duplicateCount: [...pairCounts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0),
    malformedCount,
    unverifiedCount,
    reviewRequiredWrites,
    validMarkers,
    markerAudits,
  };
}

function aggregatePhase4(evidence) {
  const successful = evidence.canaries.filter((row) => row.outcome === "success" && row.evidence_valid);
  const failed = evidence.canaries.filter((row) => !successful.includes(row));
  const failedSafe = failed.filter((row) => (
    row.evidence_valid
    && (row.outcome === "failed_safe"
      || (row.outcome === "failed_with_rollback" && row.rollback.attempted && row.rollback.verified))
  ));
  const failedUnsafe = failed.filter((row) => !failedSafe.includes(row));
  return {
    complete: evidence.complete,
    source_audits: evidence.audits.length,
    successful_canaries: successful.length,
    failed_canaries: failed.length,
    failed_safe_canaries: failedSafe.length,
    failed_unsafe_canaries: failedUnsafe.length,
    listing_writes: sum(successful, "listing_writes"),
    observation_writes: sum(successful, "observation_writes"),
    verified_writes: successful.reduce((total, row) => total + row.listing_writes, 0),
    rollbacks_attempted: evidence.canaries.filter((row) => row.rollback.attempted).length,
    rollbacks_verified: evidence.canaries.filter((row) => row.rollback.attempted && row.rollback.verified).length,
    failure_stages: aggregateTextCounts(failed.map((row) => row.failed_stage).filter(Boolean)),
    error_codes: aggregateTextCounts(failed.map((row) => row.error_code).filter(Boolean)),
  };
}

function aggregateCandidateQuality(evidence) {
  const audited = sum(evidence.audits, "candidate_count");
  const accepted = sum(evidence.audits, "accepted_count");
  const review = sum(evidence.audits, "review_required_count");
  return {
    scope: evidence.candidateQualityComplete ? "all_reviewed_phase4_audits" : "partial",
    audit_count: evidence.audits.length,
    evidence_complete: evidence.candidateQualityComplete,
    audited_candidates: audited,
    accepted_candidates: accepted,
    review_required_candidates: review,
    no_result_variants: sum(evidence.audits, "no_result_variant_count"),
    accepted_rate: safeRate(accepted, audited),
    review_required_rate: safeRate(review, audited),
  };
}

function buildProviderQuality({ audits, canaries, listings, markerRows, listingById }) {
  const providers = new Map();
  const get = (provider) => {
    const key = normalizeProvider(provider);
    const current = providers.get(key) ?? {
      provider: key,
      audited_candidate_count: 0,
      accepted_count: 0,
      review_required_count: 0,
      canary_write_count: 0,
      verified_write_count: 0,
      rollback_count: 0,
      active_count: 0,
      sold_count: 0,
      malformed_identity_count: 0,
    };
    providers.set(key, current);
    return current;
  };

  for (const audit of audits) {
    for (const row of audit.providers) {
      const target = get(row.provider);
      target.audited_candidate_count += row.audited_candidate_count;
      target.accepted_count += row.accepted_count;
      target.review_required_count += row.review_required_count;
    }
  }
  for (const listing of listings) {
    const target = get(listing?.raw?.provider || listing?.source);
    const status = text(listing?.status).toLowerCase();
    if (status === "active") target.active_count += 1;
    if (status === "sold" || status === "sold_out") target.sold_count += 1;
  }
  for (const marker of markerRows) {
    const listing = listingById.get(marker.listingId);
    const target = get(listing?.raw?.provider || listing?.source);
    target.canary_write_count += 1;
    const evidence = canaries.find((row) => (
      row.source_audit_run_id === marker.auditRunId
      && row.candidate_keys.includes(marker.candidateKey)
    ));
    if (evidence?.outcome === "success" && evidence.verification) target.verified_write_count += 1;
    if (malformedListingIdentity(listing)) target.malformed_identity_count += 1;
  }
  for (const canary of canaries.filter((row) => row.rollback.attempted)) {
    for (const provider of canary.providers) get(provider.provider).rollback_count += provider.rollback_count;
  }
  return [...providers.values()].sort((left, right) => left.provider.localeCompare(right.provider, "en"));
}

function determineReadiness({ databaseWrites, reportComplete, phase4, safety, evidenceFailures }) {
  const failures = [...evidenceFailures];
  if (databaseWrites !== 0) failures.push("database_writes_nonzero");
  if (!reportComplete && failures.length === 0) failures.push("report_incomplete");
  if (phase4.successful_canaries < 1) failures.push("no_verified_phase4_canary");
  if (phase4.failed_unsafe_canaries > 0) failures.push("failed_unsafe_canary");
  if (safety.malformed_consumption_markers > 0) failures.push("malformed_consumption_markers");
  if (safety.missing_consumption_markers > 0) failures.push("missing_consumption_markers");
  if (safety.duplicate_consumption_markers > 0) failures.push("duplicate_consumption_markers");
  if (safety.rollback_failures > 0) failures.push("rollback_failures");
  if (safety.review_required_writes > 0) failures.push("review_required_writes");
  if (safety.unverified_canary_observations > 0) failures.push("unverified_canary_observations");
  if (!safety.workflow_unchanged) failures.push("workflow_changed");
  const uniqueFailures = [...new Set(failures)].sort();
  return {
    verdict: uniqueFailures.length ? "NOT_READY" : "READY_FOR_MORE_MANUAL_CANARIES",
    reasons: uniqueFailures.length ? uniqueFailures : [
      "phase4_canary_verified",
      "failed_safe_attempts_contained",
      "source_audit_evidence_complete",
      "candidate_quality_all_audits",
      "consumption_markers_valid",
      "production_read_complete",
      "automatic_writes_not_authorized",
    ],
    next_allowed_step: NEXT_MANUAL_STEP,
  };
}

function normalizeEvidence(value) {
  const source = plainObject(value) ? value : {};
  const failures = [];
  const auditRows = array(source.audits);
  const canaryRows = array(source.canaries);
  if (hasDuplicate(auditRows.map((row) => text(row?.run_id)))) failures.push("duplicate_source_audit_run_id");
  if (hasDuplicate(canaryRows.map((row) => text(row?.run_id)))) failures.push("duplicate_canary_run_id");
  const audits = dedupeBy(
    auditRows.map((row) => normalizeAudit(row, failures))
      .sort((left, right) => compareNumericText(left.run_id, right.run_id)),
    (row) => row.run_id,
  );
  const canaries = dedupeBy(
    canaryRows.map((row) => normalizeCanary(row, failures))
      .sort((left, right) => compareNumericText(left.run_id, right.run_id)),
    (row) => row.run_id,
  );
  const auditById = new Map(audits.map((audit) => [audit.run_id, audit]));
  const consumedPairs = new Set();

  for (const canary of canaries) {
    const audit = auditById.get(canary.source_audit_run_id);
    if (!audit) {
      failures.push("missing_source_audit_evidence");
      continue;
    }
    for (const candidateKey of canary.candidate_keys) {
      const candidate = audit.candidates.find((row) => row.candidate_key === candidateKey);
      if (!candidate) {
        failures.push("canary_candidate_missing_from_source_audit");
        continue;
      }
      if (canary.outcome === "success") {
        if (!candidate.accepted || candidate.review_required) {
          failures.push("successful_canary_candidate_not_accepted");
        }
        const pair = `${canary.source_audit_run_id}\u0000${candidateKey}`;
        if (consumedPairs.has(pair)) failures.push("duplicate_consumed_candidate_pair");
        consumedPairs.add(pair);
      }
    }
    if (!providerDistributionMatches(canary, audit)) {
      failures.push("canary_provider_distribution_mismatch");
    }
  }

  const candidateQualityComplete = audits.length > 0
    && audits.every((audit) => audit.evidence_complete);
  if (!candidateQualityComplete) failures.push("candidate_quality_evidence_partial");
  const uniqueFailures = [...new Set(failures)].sort();
  const complete = source.complete === true
    && audits.length > 0
    && canaries.length > 0
    && uniqueFailures.length === 0;
  return {
    audits,
    canaries,
    complete,
    candidateQualityComplete,
    failures: uniqueFailures,
    workflowUnchanged: source.workflow_unchanged === true,
  };
}

function normalizeAudit(row, failures) {
  const runId = text(row?.run_id);
  const candidates = array(row?.candidates).map((candidate) => ({
    candidate_key: text(candidate?.candidate_key),
    provider: normalizeProvider(candidate?.provider),
    accepted: candidate?.accepted === true,
    review_required: candidate?.review_required === true,
  })).sort((left, right) => left.candidate_key.localeCompare(right.candidate_key, "en"));
  const databaseWrites = normalizeCounts(row?.database_writes, ["listings", "observations", "ingestion_runs"]);
  const provenance = normalizeProvenance(row?.provenance);
  const candidateKeys = candidates.map((candidate) => candidate.candidate_key);
  const candidateCount = finiteCount(row?.candidate_count);
  const acceptedCount = finiteCount(row?.accepted_count);
  const reviewCount = finiteCount(row?.review_required_count);
  const providers = aggregateAuditProviders(candidates);
  const valid = AUDIT_RUN_ID.test(runId)
    && COMMIT_SHA.test(text(row?.head_sha))
    && text(row?.mode) === "dry-run"
    && text(row?.source_scope) === "planner-apis"
    && hasExactCounts(row, [
      "truncated_count",
      "selected_variant_count",
      "query_count",
      "candidate_count",
      "accepted_count",
      "review_required_count",
      "no_result_variant_count",
    ])
    && hasExactCounts(row?.database_writes, ["listings", "observations", "ingestion_runs"])
    && row?.report_complete === true
    && finiteCount(row?.truncated_count) === 0
    && finiteCount(row?.selected_variant_count) === finiteCount(row?.query_count)
    && finiteCount(row?.selected_variant_count) >= 1
    && finiteCount(row?.selected_variant_count) <= 5
    && candidateCount === candidates.length
    && acceptedCount === candidates.filter((candidate) => candidate.accepted).length
    && reviewCount === candidates.filter((candidate) => candidate.review_required).length
    && candidateKeys.every((key) => CANDIDATE_KEY.test(key))
    && !hasDuplicate(candidateKeys)
    && candidates.every((candidate) => candidate.accepted !== candidate.review_required)
    && countsAreZero(databaseWrites)
    && provenance.valid
    && provenance.value.artifact_name === `market-candidate-audit-${runId}`
    && provenance.value.commit_sha === text(row?.head_sha);
  if (!provenance.valid) failures.push("missing_source_audit_provenance");
  if (!countsAreZero(databaseWrites)) failures.push("source_audit_database_writes_nonzero");
  if (!row?.report_complete || finiteCount(row?.truncated_count) !== 0) failures.push("source_audit_incomplete");
  if (!valid) failures.push("invalid_source_audit_evidence");
  return {
    run_id: runId,
    head_sha: text(row?.head_sha),
    mode: text(row?.mode),
    source_scope: text(row?.source_scope),
    report_complete: row?.report_complete === true,
    truncated_count: finiteCount(row?.truncated_count),
    selected_variant_count: finiteCount(row?.selected_variant_count),
    query_count: finiteCount(row?.query_count),
    candidate_count: candidateCount,
    accepted_count: acceptedCount,
    review_required_count: reviewCount,
    no_result_variant_count: finiteCount(row?.no_result_variant_count),
    database_writes: databaseWrites,
    candidates,
    providers,
    provenance: provenance.value,
    evidence_complete: valid,
  };
}

function normalizeCanary(row, failures) {
  const runId = text(row?.run_id);
  const sourceAuditRunId = text(row?.source_audit_run_id);
  const outcome = text(row?.outcome);
  const candidateKeys = array(row?.candidate_keys).map(text).sort();
  const providers = array(row?.providers).map((provider) => ({
    provider: normalizeProvider(provider?.provider),
    candidate_count: finiteCount(provider?.candidate_count),
    rollback_count: finiteCount(provider?.rollback_count),
  })).sort((left, right) => left.provider.localeCompare(right.provider, "en"));
  const productionDelta = normalizeCounts(row?.production_delta, PRODUCTION_DELTA_KEYS);
  const provenance = normalizeProvenance(row?.provenance);
  const rollback = {
    attempted: row?.rollback?.attempted === true,
    verified: row?.rollback?.verified === true,
  };
  const canary = {
    run_id: runId,
    source_audit_run_id: sourceAuditRunId,
    head_sha: text(row?.head_sha),
    outcome,
    conclusion: text(row?.conclusion),
    failed_stage: text(row?.failed_stage),
    error_code: text(row?.error_code),
    verification: row?.verification === true,
    listing_writes: finiteCount(row?.listing_writes),
    observation_writes: finiteCount(row?.observation_writes),
    consumption_markers: finiteCount(row?.consumption_markers),
    candidate_keys: candidateKeys,
    providers,
    production_delta: productionDelta,
    rollback,
    workflow_final_state: text(row?.workflow_final_state),
    schedule_run_count: finiteCount(row?.schedule_run_count),
    rerun_count: finiteCount(row?.rerun_count),
    provenance: provenance.value,
  };
  if (!ALLOWED_OUTCOMES.has(outcome)) failures.push("unknown_canary_outcome");
  if (!provenance.valid) failures.push("missing_canary_provenance");
  const structurallyValid = AUDIT_RUN_ID.test(runId)
    && AUDIT_RUN_ID.test(sourceAuditRunId)
    && COMMIT_SHA.test(canary.head_sha)
    && hasExactCounts(row, [
      "listing_writes",
      "observation_writes",
      "consumption_markers",
      "schedule_run_count",
      "rerun_count",
    ])
    && hasExactCounts(row?.production_delta, PRODUCTION_DELTA_KEYS)
    && typeof row?.verification === "boolean"
    && typeof row?.rollback?.attempted === "boolean"
    && typeof row?.rollback?.verified === "boolean"
    && candidateKeys.length > 0
    && candidateKeys.every((key) => CANDIDATE_KEY.test(key))
    && !hasDuplicate(candidateKeys)
    && array(row?.providers).every((provider) => hasExactCounts(provider, ["candidate_count"]))
    && providers.reduce((total, provider) => total + provider.candidate_count, 0) === candidateKeys.length
    && provenance.value.artifact_name === `market-canary-result-${runId}`
    && provenance.value.commit_sha === canary.head_sha;
  if (!structurallyValid) {
    failures.push("invalid_canary_evidence");
  }
  let evidenceValid = provenance.valid && structurallyValid;
  if (outcome === "success" && !validSuccessfulCanary(canary)) {
    failures.push("invalid_successful_canary");
    evidenceValid = false;
  }
  if (outcome === "failed_safe" && !validFailedSafeCanary(canary)) {
    failures.push("invalid_failed_safe_canary");
    evidenceValid = false;
  }
  if (outcome === "failed_with_rollback" && !validRolledBackCanary(canary)) {
    failures.push("rollback_unverified");
    evidenceValid = false;
  }
  if (outcome === "failed_unsafe") {
    failures.push("failed_unsafe_canary");
    evidenceValid = false;
  }
  if (!ALLOWED_OUTCOMES.has(outcome)) evidenceValid = false;
  canary.evidence_valid = evidenceValid;
  return canary;
}

function validSuccessfulCanary(canary) {
  return canary.conclusion === "success"
    && canary.verification
    && canary.listing_writes === canary.candidate_keys.length
    && canary.observation_writes === canary.candidate_keys.length
    && canary.consumption_markers === canary.candidate_keys.length
    && canary.production_delta.market_listings <= canary.listing_writes
    && canary.production_delta.market_listing_observations === canary.observation_writes
    && canary.production_delta.import_issues === 0
    && canary.production_delta.ingestion_runs === 0
    && canary.production_delta.review_required === 0
    && !canary.rollback.attempted
    && canary.workflow_final_state === "disabled_manually"
    && canary.schedule_run_count === 0
    && canary.rerun_count === 0;
}

function validFailedSafeCanary(canary) {
  return canary.conclusion === "failure"
    && Boolean(canary.failed_stage)
    && Boolean(canary.error_code)
    && !canary.verification
    && canary.listing_writes === 0
    && canary.observation_writes === 0
    && canary.consumption_markers === 0
    && !canary.rollback.attempted
    && countsAreZero(canary.production_delta)
    && canary.workflow_final_state === "disabled_manually"
    && canary.schedule_run_count === 0
    && canary.rerun_count === 0;
}

function validRolledBackCanary(canary) {
  return canary.conclusion === "failure"
    && canary.rollback.attempted
    && canary.rollback.verified
    && countsAreZero(canary.production_delta)
    && canary.workflow_final_state === "disabled_manually"
    && canary.schedule_run_count === 0
    && canary.rerun_count === 0;
}

function buildCanaryEvidenceLookup(canaries) {
  return new Map(canaries
    .filter((canary) => canary.outcome === "success" && canary.evidence_valid)
    .flatMap((canary) => canary.candidate_keys.map((candidateKey) => [
      `${canary.source_audit_run_id}\u0000${candidateKey}`,
      { verified: canary.verification && !canary.rollback.attempted },
    ])));
}

function sanitizeAuditEvidence(audit) {
  return {
    run_id: audit.run_id,
    head_sha: audit.head_sha,
    mode: audit.mode,
    source_scope: audit.source_scope,
    report_complete: audit.report_complete,
    truncated_count: audit.truncated_count,
    selected_variant_count: audit.selected_variant_count,
    query_count: audit.query_count,
    candidate_count: audit.candidate_count,
    accepted_count: audit.accepted_count,
    review_required_count: audit.review_required_count,
    no_result_variant_count: audit.no_result_variant_count,
    database_writes: audit.database_writes,
    candidates: audit.candidates,
    provenance: audit.provenance,
  };
}

function sanitizeCanaryEvidence(canary) {
  return {
    run_id: canary.run_id,
    source_audit_run_id: canary.source_audit_run_id,
    head_sha: canary.head_sha,
    outcome: canary.outcome,
    conclusion: canary.conclusion,
    failed_stage: canary.failed_stage,
    error_code: canary.error_code,
    verification: canary.verification,
    listing_writes: canary.listing_writes,
    observation_writes: canary.observation_writes,
    consumption_markers: canary.consumption_markers,
    candidate_keys: canary.candidate_keys,
    providers: canary.providers.map((provider) => ({
      provider: provider.provider,
      candidate_count: provider.candidate_count,
    })),
    production_delta: canary.production_delta,
    rollback: canary.rollback,
    workflow_final_state: canary.workflow_final_state,
    schedule_run_count: canary.schedule_run_count,
    rerun_count: canary.rerun_count,
    provenance: canary.provenance,
  };
}

function normalizeProvenance(value) {
  const source = plainObject(value) ? value : {};
  const normalized = {
    type: text(source.type),
    artifact_id: text(source.artifact_id),
    artifact_name: text(source.artifact_name),
    digest: text(source.digest).toLowerCase(),
    commit_sha: text(source.commit_sha).toLowerCase(),
    expired: source.expired === true,
  };
  return {
    value: normalized,
    valid: normalized.type === "github_actions_artifact"
      && AUDIT_RUN_ID.test(normalized.artifact_id)
      && Boolean(normalized.artifact_name)
      && SHA256.test(normalized.digest)
      && COMMIT_SHA.test(normalized.commit_sha)
      && normalized.expired === false,
  };
}

function aggregateAuditProviders(candidates) {
  const providers = new Map();
  for (const candidate of candidates) {
    const current = providers.get(candidate.provider) ?? {
      provider: candidate.provider,
      audited_candidate_count: 0,
      accepted_count: 0,
      review_required_count: 0,
    };
    current.audited_candidate_count += 1;
    if (candidate.accepted) current.accepted_count += 1;
    if (candidate.review_required) current.review_required_count += 1;
    providers.set(candidate.provider, current);
  }
  return [...providers.values()].sort((left, right) => left.provider.localeCompare(right.provider, "en"));
}

function providerDistributionMatches(canary, audit) {
  const expected = aggregateTextCounts(canary.candidate_keys.map((candidateKey) => (
    audit.candidates.find((candidate) => candidate.candidate_key === candidateKey)?.provider ?? ""
  )));
  const actual = canary.providers
    .map((provider) => ({ value: provider.provider, count: provider.candidate_count }))
    .sort((left, right) => left.value.localeCompare(right.value, "en"));
  return expected.every((row) => row.value)
    && JSON.stringify(expected) === JSON.stringify(actual);
}

function aggregateTextCounts(values) {
  return [...values.reduce((counts, value) => {
    counts.set(value, (counts.get(value) ?? 0) + 1);
    return counts;
  }, new Map()).entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => left.value.localeCompare(right.value, "en"));
}

function renderCountList(values) {
  return values.length
    ? values.map((row) => `- ${escapeMarkdown(row.value)}: ${row.count}`)
    : ["- none"];
}

function normalizeCounts(value, keys) {
  const source = plainObject(value) ? value : {};
  return Object.fromEntries(keys.map((key) => [key, finiteCount(source[key])]));
}

function countsAreZero(value) {
  return Object.values(value).every((count) => count === 0);
}

function hasExactCounts(value, keys) {
  return plainObject(value) && keys.every((key) => (
    Object.hasOwn(value, key)
    && Number.isInteger(value[key])
    && value[key] >= 0
  ));
}

function malformedListingIdentity(listing) {
  if (!listing) return true;
  const provider = text(listing.raw?.provider);
  const sourceListingId = text(listing.raw?.source_listing_id);
  if (!provider || !sourceListingId) return true;
  const expectedPrefix = provider === "rakuten_ichiba" ? "rakuten-" : provider === "yahoo_shopping" ? "yahoo-" : "";
  return !expectedPrefix || !text(listing.id).startsWith(expectedPrefix);
}

function countDuplicateListingDays(observations) {
  const counts = new Map();
  for (const row of observations) {
    const listingId = text(row?.listing_id);
    const price = Number(row?.price);
    const timestamp = validTimestamp(row?.observed_at) ?? validTimestamp(row?.created_at);
    if (!listingId || !Number.isFinite(price) || price <= 0 || timestamp === null) continue;
    const day = new Date(timestamp).toISOString().slice(0, 10);
    const key = `${listingId}\u0000${day}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
}

function hasMarkerSignal(row) {
  const raw = row?.raw;
  return text(row?.id).startsWith(DEDICATED_MARKER_PREFIX)
    || (plainObject(raw) && (
      Object.hasOwn(raw, "canary_audit_run_id")
      || Object.hasOwn(raw, "canary_candidate_key")
    ));
}

function compareMarker(left, right) {
  const leftRaw = plainObject(left?.raw) ? left.raw : {};
  const rightRaw = plainObject(right?.raw) ? right.raw : {};
  return compareNumericText(text(leftRaw.canary_audit_run_id), text(rightRaw.canary_audit_run_id))
    || text(leftRaw.canary_candidate_key).localeCompare(text(rightRaw.canary_candidate_key), "en")
    || text(left?.id).localeCompare(text(right?.id), "en");
}

function compareNumericText(left, right) {
  return left.length - right.length || left.localeCompare(right, "en");
}

function normalizeProvider(value) {
  const provider = text(value).toLowerCase();
  if (provider === "rakuten") return "rakuten_ichiba";
  if (provider === "yahoo") return "yahoo_shopping";
  return provider || "unknown";
}

function assertSortedUnique(values, selector, label) {
  if (!Array.isArray(values)) throw new Error(`Readiness ${label} list is invalid.`);
  const keys = values.map(selector);
  if (new Set(keys).size !== keys.length) throw new Error(`Readiness ${label} list has duplicates.`);
  const sorted = [...keys].sort((left, right) => String(left).localeCompare(String(right), "en"));
  if (keys.some((key, index) => key !== sorted[index])) throw new Error(`Readiness ${label} list is not sorted.`);
}

function hasDuplicate(values) {
  return new Set(values).size !== values.length;
}

function dedupeBy(values, selector) {
  const seen = new Set();
  return values.filter((value) => {
    const key = selector(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function safeRate(numerator, denominator) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : 0;
}

function sum(values, key) {
  return values.reduce((total, row) => total + finiteCount(row?.[key]), 0);
}

function finiteCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function validTimestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function validIso(value) {
  const timestamp = validTimestamp(value);
  return timestamp === null ? null : new Date(timestamp).toISOString();
}

function escapeMarkdown(value) {
  return String(value ?? "").replace(/[\\|`*_[\]{}()<>#+\-.!~]/g, "\\$&");
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return String(value ?? "").trim();
}

function nonemptyText(value) {
  return typeof value === "string" && value.length > 0;
}
