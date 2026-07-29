import { dedupeMarketObservationsByListingDay } from "./market-observation-history.js";
import { stableId } from "../fetchers/feed-source-utils.js";

const SCHEMA_VERSION = 1;
const CANDIDATE_KEY = /^[0-9a-f]{16}$/;
const AUDIT_RUN_ID = /^\d+$/;
const ALLOWED_STATUSES = new Set(["active", "sold", "sold_out", "pre_release"]);
const DEDICATED_MARKER_PREFIX = "market-canary-observation-";
const NEXT_MANUAL_STEP = "manual canaries on fresh audits with different series or providers";

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
  const candidateQuality = aggregateCandidateQuality(evidence.audits);
  const phase4 = aggregatePhase4(evidence.canaries);
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
    `- Successful canaries: ${report.phase4.successful_canaries}`,
    `- Failed canaries: ${report.phase4.failed_canaries}`,
    `- Listing writes: ${report.phase4.listing_writes}`,
    `- Observation writes: ${report.phase4.observation_writes}`,
    `- Verified writes: ${report.phase4.verified_writes}`,
    `- Rollbacks attempted: ${report.phase4.rollbacks_attempted}`,
    `- Rollbacks verified: ${report.phase4.rollbacks_verified}`,
    "",
    "## Safety",
    "",
    `- Consumption markers: ${report.safety.consumption_markers}`,
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
    duplicateCount: [...pairCounts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0),
    malformedCount,
    unverifiedCount,
    reviewRequiredWrites,
    validMarkers,
    markerAudits,
  };
}

function aggregatePhase4(canaries) {
  const successful = canaries.filter((row) => row.ok && row.verification);
  return {
    successful_canaries: successful.length,
    failed_canaries: canaries.length - successful.length,
    listing_writes: sum(canaries, "listing_writes"),
    observation_writes: sum(canaries, "observation_writes"),
    verified_writes: successful.reduce((total, row) => total + row.listing_writes, 0),
    rollbacks_attempted: canaries.filter((row) => row.rollback.attempted).length,
    rollbacks_verified: canaries.filter((row) => row.rollback.attempted && row.rollback.verified).length,
  };
}

function aggregateCandidateQuality(audits) {
  const audited = sum(audits, "candidate_count");
  const accepted = sum(audits, "accepted_count");
  const review = sum(audits, "review_required_count");
  return {
    audited_candidates: audited,
    accepted_candidates: accepted,
    review_required_candidates: review,
    no_result_variants: sum(audits, "no_result_variant_count"),
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
    if (evidence?.verification) target.verified_write_count += 1;
    if (malformedListingIdentity(listing)) target.malformed_identity_count += 1;
  }
  for (const canary of canaries.filter((row) => row.rollback.attempted)) {
    for (const provider of canary.providers) get(provider.provider).rollback_count += provider.rollback_count;
  }
  return [...providers.values()].sort((left, right) => left.provider.localeCompare(right.provider, "en"));
}

function determineReadiness({ databaseWrites, reportComplete, phase4, safety }) {
  const failures = [];
  if (databaseWrites !== 0) failures.push("database_writes_nonzero");
  if (!reportComplete) failures.push("report_incomplete");
  if (phase4.successful_canaries < 1) failures.push("no_verified_phase4_canary");
  if (safety.malformed_consumption_markers > 0) failures.push("malformed_consumption_markers");
  if (safety.duplicate_consumption_markers > 0) failures.push("duplicate_consumption_markers");
  if (safety.rollback_failures > 0) failures.push("rollback_failures");
  if (safety.review_required_writes > 0) failures.push("review_required_writes");
  if (safety.unverified_canary_observations > 0) failures.push("unverified_canary_observations");
  if (!safety.workflow_unchanged) failures.push("workflow_changed");
  return {
    verdict: failures.length ? "NOT_READY" : "READY_FOR_MORE_MANUAL_CANARIES",
    reasons: failures.length ? failures.sort() : [
      "phase4_canary_verified",
      "consumption_markers_valid",
      "production_read_complete",
      "automatic_writes_not_authorized",
    ],
    next_allowed_step: NEXT_MANUAL_STEP,
  };
}

function normalizeEvidence(value) {
  const source = plainObject(value) ? value : {};
  const audits = array(source.audits).map((row) => ({
    run_id: text(row?.run_id),
    report_complete: row?.report_complete === true,
    truncated_count: finiteCount(row?.truncated_count),
    candidate_count: finiteCount(row?.candidate_count),
    accepted_count: finiteCount(row?.accepted_count),
    review_required_count: finiteCount(row?.review_required_count),
    no_result_variant_count: finiteCount(row?.no_result_variant_count),
    providers: normalizeAuditProviders(row?.providers),
  })).sort((left, right) => compareNumericText(left.run_id, right.run_id));
  const canaries = array(source.canaries).map((row) => ({
    run_id: text(row?.run_id),
    source_audit_run_id: text(row?.source_audit_run_id),
    ok: row?.ok === true,
    verification: row?.verification === true,
    listing_writes: finiteCount(row?.listing_writes),
    observation_writes: finiteCount(row?.observation_writes),
    candidate_keys: array(row?.candidate_keys).map(text).sort(),
    rollback: {
      attempted: row?.rollback?.attempted === true,
      verified: row?.rollback?.verified === true,
    },
    providers: normalizeCanaryProviders(row?.providers),
  })).sort((left, right) => compareNumericText(left.run_id, right.run_id));
  const complete = source.complete === true
    && audits.length > 0
    && canaries.length > 0
    && audits.every((row) => AUDIT_RUN_ID.test(row.run_id) && row.report_complete && row.truncated_count === 0)
    && canaries.every((row) => (
      AUDIT_RUN_ID.test(row.run_id)
      && AUDIT_RUN_ID.test(row.source_audit_run_id)
      && row.candidate_keys.length > 0
      && row.candidate_keys.every((key) => CANDIDATE_KEY.test(key))
    ));
  return {
    audits,
    canaries,
    complete,
    workflowUnchanged: source.workflow_unchanged === true,
  };
}

function buildCanaryEvidenceLookup(canaries) {
  return new Map(canaries.flatMap((canary) => canary.candidate_keys.map((candidateKey) => [
    `${canary.source_audit_run_id}\u0000${candidateKey}`,
    { verified: canary.ok && canary.verification && (!canary.rollback.attempted || canary.rollback.verified) },
  ])));
}

function normalizeAuditProviders(values) {
  return array(values).map((row) => ({
    provider: normalizeProvider(row?.provider),
    audited_candidate_count: finiteCount(row?.audited_candidate_count),
    accepted_count: finiteCount(row?.accepted_count),
    review_required_count: finiteCount(row?.review_required_count),
  })).sort((left, right) => left.provider.localeCompare(right.provider, "en"));
}

function normalizeCanaryProviders(values) {
  return array(values).map((row) => ({
    provider: normalizeProvider(row?.provider),
    rollback_count: finiteCount(row?.rollback_count),
  })).sort((left, right) => left.provider.localeCompare(right.provider, "en"));
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
