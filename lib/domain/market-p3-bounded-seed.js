import { stableId } from "../fetchers/feed-source-utils.js";
import { buildMarketplaceListingId, canonicalMarketplaceSource } from "./market-canary-write.js";
import {
  MARKET_BOUNDED_PERSISTENCE_POLICIES,
  canonicalizeBoundedMarketplaceUrl,
  persistMarketBounded,
  resolveBoundedMarketplaceIdentity,
} from "./market-bounded-write.js";
import { sanitizeMarketPublicUrl } from "./market-candidate-key.js";
import { normalizeMarketplaceStatus } from "./market-status.js";

const CONFIRMATION = "APPROVE_P3_BOUNDED_SEED_V1";
const HEAD_SHA = /^[0-9a-f]{40}$/;
const CANDIDATE_KEY = /^[0-9a-f]{16}$/;
const P3_REASON = "variant_and_parent_evidence_confirmed";

export const P3_BOUNDED_SEED_CONFIRMATION = CONFIRMATION;
export const P3_BOUNDED_SEED_HARD_CAP = 5;
export const P3_BOUNDED_SEED_QUERY_PROFILE = "priority_3_seed_strict";

export function validateP3BoundedSeedInvocation({ event_name, ref, confirmation, expected_main_sha, head_sha, origin_main_sha } = {}) {
  if (event_name !== "workflow_dispatch" || ref !== "refs/heads/main" || confirmation !== CONFIRMATION) {
    throw new Error("P3 bounded seed invocation is not authorized.");
  }
  const expected = String(expected_main_sha ?? "").trim();
  const head = String(head_sha ?? "").trim();
  const origin = String(origin_main_sha ?? "").trim();
  if (!HEAD_SHA.test(expected) || head !== expected || origin !== expected) {
    throw new Error("P3 bounded seed main revision is not exact.");
  }
  return true;
}

export function parseP3BoundedSeedLimit(value) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > P3_BOUNDED_SEED_HARD_CAP) {
    throw new Error("P3 bounded seed limit must be between 1 and 5.");
  }
  return limit;
}

export function calculateP3BoundedSeedNoResultVariants(selectedVariantCount, variantsWithResults) {
  const selected = Number.isFinite(Number(selectedVariantCount))
    ? Math.max(0, Math.floor(Number(selectedVariantCount)))
    : 0;
  const withResults = Number.isFinite(Number(variantsWithResults))
    ? Math.max(0, Math.floor(Number(variantsWithResults)))
    : 0;
  return Math.max(0, selected - withResults);
}

export function selectP3BoundedSeedCandidates(candidates = [], { limit = P3_BOUNDED_SEED_HARD_CAP } = {}) {
  const capacity = parseP3BoundedSeedLimit(limit);
  if (!Array.isArray(candidates)) throw new Error("P3 bounded seed candidates are invalid.");
  const safe = candidates.filter(isEligibleP3BoundedSeedCandidate);
  const grouped = new Map();
  for (const candidate of safe) {
    const variantId = String(candidate.target.variant_id);
    if (!grouped.has(variantId)) grouped.set(variantId, []);
    grouped.get(variantId).push(candidate);
  }
  const bestByVariant = [...grouped.values()].map((values) => values.sort(compareCandidate)[0]);
  const bySeries = new Map();
  for (const candidate of bestByVariant) {
    const seriesId = String(candidate.target.series_id);
    if (!bySeries.has(seriesId)) bySeries.set(seriesId, []);
    bySeries.get(seriesId).push(candidate);
  }
  const selected = [...bySeries.values()]
    .map((values) => values.sort(compareCandidate)[0])
    .sort(compareCandidate)
    .slice(0, capacity);
  return {
    selected,
    safe_candidate_count: safe.length,
    selected_candidate_keys: selected.map((candidate) => candidate.candidate_key),
    selected_variant_ids: selected.map((candidate) => candidate.target.variant_id),
    one_listing_per_variant: new Set(selected.map((candidate) => candidate.target.variant_id)).size === selected.length,
  };
}

export function isEligibleP3BoundedSeedCandidate(candidate = {}) {
  const checks = candidate.checks ?? {};
  const provider = String(candidate?.source?.provider ?? "");
  const sourceListingId = safeText(candidate?.source?.listing_id, 300);
  const source = canonicalMarketplaceSource(provider);
  const sourceUrl = canonicalizeBoundedMarketplaceUrl(candidate?.source?.public_url);
  const listingId = buildMarketplaceListingId({
    provider,
    sourceListingId,
    publicUrl: sourceUrl,
    title: candidate?.listing?.title,
  });
  const price = Number(candidate?.listing?.price);
  return Boolean(CANDIDATE_KEY.test(String(candidate?.candidate_key ?? ""))
    && candidate?.assessment?.accepted === true
    && candidate?.assessment?.review_required === false
    && candidate?.assessment?.reason === P3_REASON
    && Number(candidate?.assessment?.confidence) >= 0.86
    && normalizeMarketplaceStatus(candidate?.listing?.status) === "active"
    && candidate?.listing?.listing_type === "single"
    && checks.variant_evidence_present === true
    && checks.parent_series_evidence_present === true
    && checks.set_signal_detected !== true
    && checks.multiple_variant_candidates !== true
    && checks.explicit_variant_conflict !== true
    && checks.explicit_label_unresolved !== true
    && checks.explicit_label_other_variant_match !== true
    && checks.parent_series_edition_conflict !== true
    && checks.catalog_parent_variant_identity_ambiguous !== true
    && source
    && sourceListingId
    && sourceUrl
    && listingId
    && Number.isFinite(price)
    && price > 0
    && String(candidate?.target?.variant_id ?? "").trim()
    && String(candidate?.target?.series_id ?? "").trim());
}

export function buildP3BoundedSeedRows({ candidates = [], workflow = {}, observed_at = new Date() } = {}) {
  if (!Array.isArray(candidates) || candidates.length > P3_BOUNDED_SEED_HARD_CAP
    || new Set(candidates.map((candidate) => candidate?.target?.variant_id)).size !== candidates.length
    || new Set(candidates.map((candidate) => candidate?.target?.series_id)).size !== candidates.length
    || candidates.some((candidate) => !isEligibleP3BoundedSeedCandidate(candidate))) {
    throw new Error("P3 bounded seed persistence pool is invalid.");
  }
  const observed = new Date(observed_at);
  if (!Number.isFinite(observed.getTime())) throw new Error("P3 bounded seed observation time is invalid.");
  const runId = String(workflow.run_id ?? "").trim();
  const headSha = String(workflow.head_sha ?? "").trim();
  if (!runId || !HEAD_SHA.test(headSha)) throw new Error("P3 bounded seed workflow identity is invalid.");
  const observedAt = observed.toISOString();
  const pairs = candidates.map((candidate) => buildRowsForCandidate(candidate, { runId, headSha, observedAt }));
  const listingRows = pairs.map((pair) => pair.listing);
  const observationRows = pairs.map((pair) => pair.observation);
  return { candidates, listingRows, observationRows };
}

export function assertP3BoundedSeedPrewrite({ rows, variantListings = [], sourceUrlRows = [], existingListings = [], existingObservations = [] } = {}) {
  const listingRows = rows?.listingRows ?? [];
  const observationRows = rows?.observationRows ?? [];
  if (!listingRows.length || listingRows.length > P3_BOUNDED_SEED_HARD_CAP || listingRows.length !== observationRows.length) {
    throw new Error("P3 bounded seed prewrite batch size is invalid.");
  }
  const values = [
    listingRows.map((row) => row.variant_id),
    listingRows.map((row) => row.series_id),
    listingRows.map((row) => row.id),
    observationRows.map((row) => row.id),
    listingRows.map((row) => canonicalizeBoundedMarketplaceUrl(row.source_url)),
  ];
  if (values.some((entries) => entries.some((entry) => !entry) || new Set(entries).size !== entries.length)
    || variantListings.length || sourceUrlRows.length || existingListings.length || existingObservations.length) {
    throw new Error("P3 bounded seed prewrite found existing or duplicate market evidence.");
  }
  return true;
}

export async function persistP3BoundedSeed({ rows, store, onStage } = {}) {
  assertP3BoundedSeedPrewrite({ rows });
  return persistMarketBounded({
    listingRows: rows.listingRows,
    observationRows: rows.observationRows,
    store,
    onStage,
    persistencePolicy: MARKET_BOUNDED_PERSISTENCE_POLICIES.p3_seed_v1,
  });
}

export function buildP3BoundedSeedResult({ workflow = {}, requested_limit, selection = {}, report = null, before = null, after = null, outcome = null, error = null, status = "blocked" } = {}) {
  const bounded = error?.bounded_result ?? outcome ?? {};
  const candidates = selection.selected ?? [];
  return {
    schema_version: 1,
    status: ["succeeded", "no-op", "blocked", "rolled-back", "rollback-failed"].includes(status) ? status : "blocked",
    workflow: { run_id: safeText(workflow.run_id, 30), head_sha: safeHead(workflow.head_sha) },
    contract: {
      priority: 3,
      release: "released",
      source_scope: "planner-apis",
      query_profile: P3_BOUNDED_SEED_QUERY_PROFILE,
      requested_limit: Number(requested_limit) || 0,
      hard_cap: P3_BOUNDED_SEED_HARD_CAP,
      one_listing_per_variant: selection.one_listing_per_variant === true,
    },
    selection: {
      selected_variant_ids: candidates.map((candidate) => safeText(candidate?.target?.variant_id, 160)),
      persistence_candidate_keys: candidates.map((candidate) => CANDIDATE_KEY.test(String(candidate?.candidate_key ?? "")) ? candidate.candidate_key : null).filter(Boolean),
      safe_candidate_count: Number(selection.safe_candidate_count) || 0,
      selected_count: candidates.length,
    },
    retrieval: sanitizeRetrieval(report),
    production_counts_before: sanitizeCounts(before),
    production_counts_after: sanitizeCounts(after),
    operations: sanitizeOperations(bounded.operations),
    database_deltas: sanitizeCounts(bounded.database_deltas),
    database_writes: Number.isInteger(Number(bounded.database_writes)) ? Number(bounded.database_writes) : 0,
    verification: { rows_verified: bounded.verification?.rows_verified === true, deltas_verified: bounded.verification?.deltas_verified === true },
    rollback: sanitizeRollback(bounded.rollback),
    failure: error ? { stage: safeText(error.category, 40) || "unknown", reason: safeText(error.reason_code, 80) || "p3_bounded_seed_failed" } : null,
  };
}

export function renderP3BoundedSeedResultMarkdown(result) {
  return [
    "# Priority 3 bounded seed result", "",
    `- Run: ${result.workflow.run_id || "unknown"}`,
    `- Status: ${result.status}`,
    `- Requested limit: ${result.contract.requested_limit}`,
    `- Persistence candidates: ${result.selection.persistence_candidate_keys.length}`,
    `- Database writes: ${result.database_writes}`,
    `- Rows verified: ${result.verification.rows_verified}`,
    `- Deltas verified: ${result.verification.deltas_verified}`,
    `- Rollback attempted: ${result.rollback.attempted}`,
    `- Rollback verified: ${result.rollback.verified}`,
    `- Failure stage: ${result.failure?.stage ?? "none"}`,
    `- Failure reason: ${result.failure?.reason ?? "none"}`,
    "",
  ].join("\n");
}

function buildRowsForCandidate(candidate, { runId, headSha, observedAt }) {
  const provider = candidate.source.provider;
  const source = canonicalMarketplaceSource(provider);
  const sourceUrl = canonicalizeBoundedMarketplaceUrl(sanitizeMarketPublicUrl(candidate.source.public_url));
  const listingId = buildMarketplaceListingId({ provider, sourceListingId: candidate.source.listing_id, publicUrl: sourceUrl, title: candidate.listing.title });
  const status = normalizeMarketplaceStatus(candidate.listing.status);
  if (!source || !sourceUrl || !listingId || status !== "active") throw new Error("P3 bounded seed marketplace identity is invalid.");
  const marker = {
    stage: "p3-bounded-seed-v1",
    workflow_run_id: runId,
    head_sha: headSha,
    candidate_key: candidate.candidate_key,
  };
  const marketSafety = {
    accepted: true, review_required: false, reason: candidate.assessment.reason,
    variant_id: candidate.target.variant_id, series_id: candidate.target.series_id,
    listing_type: "single", confidence: Number(candidate.assessment.confidence),
  };
  const listing = {
    id: listingId, variant_id: candidate.target.variant_id, matched_variant_id: candidate.target.variant_id,
    series_id: candidate.target.series_id, title: safeText(candidate.listing.title, 300),
    listing_type: "single", market_review_type: "single", classification_reason: candidate.assessment.reason,
    classification_confidence: Number(candidate.assessment.confidence), classification_details: { market_safety: marketSafety },
    price: Number(candidate.listing.price), status, source, source_type: "marketplace", source_url: sourceUrl,
    listed_at: observedAt, sold_at: null, last_observed_at: observedAt, confidence: Number(candidate.assessment.confidence), review_required: false,
    raw: { provider, source_listing_id: safeText(candidate.source.listing_id, 300), public_url: sourceUrl, query_text: safeText(candidate.target.search_query, 300), query_variant_id: candidate.target.variant_id, query_series_id: candidate.target.series_id, market_safety_assessed: true, market_safety: marketSafety, p3_bounded_seed: marker },
  };
  const observation = {
    id: stableId("market-p3-bounded-seed-observation", runId, candidate.candidate_key, listingId), listing_id: listingId,
    variant_id: candidate.target.variant_id, series_id: candidate.target.series_id, price: Number(candidate.listing.price),
    status, source, observed_at: observedAt, raw: { p3_bounded_seed: marker },
  };
  const identity = resolveBoundedMarketplaceIdentity(listing);
  if (!identity.complete || identity.sourceListingId !== safeText(candidate.source.listing_id, 300) || identity.publicUrl !== sourceUrl || identity.derivedId !== listingId) {
    throw new Error("P3 bounded seed marketplace identity is inconsistent.");
  }
  return { listing, observation };
}

function compareCandidate(left, right) {
  for (const [a, b] of [
    [left?.checks?.explicit_label_target_match === true, right?.checks?.explicit_label_target_match === true],
    [left?.checks?.parent_series_exact_evidence_present === true, right?.checks?.parent_series_exact_evidence_present === true],
    [discriminatorSatisfied(left), discriminatorSatisfied(right)],
  ]) if (a !== b) return a ? -1 : 1;
  const confidence = Number(right?.assessment?.confidence) - Number(left?.assessment?.confidence);
  return confidence || String(left?.candidate_key ?? "").localeCompare(String(right?.candidate_key ?? ""), "en");
}
function discriminatorSatisfied(candidate) { return candidate?.checks?.parent_series_discriminator_required !== true || candidate?.checks?.parent_series_discriminator_evidence_present === true; }
function safeHead(value) { const sha = String(value ?? "").trim(); return HEAD_SHA.test(sha) ? sha : null; }
function safeText(value, max) { return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max); }
function sanitizeCounts(value) { const keys = ["market_listings", "market_listing_observations", "import_issues", "ingestion_runs", "review_required", "series", "variants", "stock_reports", "restock_events"]; return Object.fromEntries(keys.map((key) => [key, Number.isInteger(Number(value?.[key])) ? Number(value[key]) : 0])); }
function sanitizeOperations(value = {}) { return { listings: (value.listings ?? []).map((row) => ({ id: safeText(row.id, 180), operation: safeOperation(row.operation) })), observations: (value.observations ?? []).map((row) => ({ id: safeText(row.id, 180), operation: safeOperation(row.operation) })) }; }
function safeOperation(value) { return ["insert", "update", "unchanged"].includes(value) ? value : "unknown"; }
function sanitizeRollback(value = {}) { return { attempted: value?.attempted === true, verified: value?.verified === true, listings_deleted: Number(value?.listings_deleted) || 0, observations_deleted: Number(value?.observations_deleted) || 0, listings_restored: Number(value?.listings_restored) || 0, observations_restored: Number(value?.observations_restored) || 0 }; }
function sanitizeRetrieval(report) { return { candidate_count: Number(report?.result?.candidate_count) || 0, accepted_count: Number(report?.result?.accepted_count) || 0, review_count: Number(report?.result?.review_count) || 0, report_complete: report?.result?.report_complete === true, truncated_count: Number(report?.result?.truncated_count) || 0 }; }
