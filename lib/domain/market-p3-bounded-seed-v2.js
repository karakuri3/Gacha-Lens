import { stableId } from "../fetchers/feed-source-utils.js";
import { persistMarketBounded, MARKET_BOUNDED_PERSISTENCE_POLICIES, canonicalizeBoundedMarketplaceUrl, resolveBoundedMarketplaceIdentity } from "./market-bounded-write.js";
import { buildMarketplaceListingId, canonicalMarketplaceSource } from "./market-canary-write.js";
import { buildVerifiedAffiliatePersistenceFields } from "./market-affiliate-persistence.js";
import {
  buildP3BoundedSeedResult,
  calculateP3BoundedSeedNoResultVariants,
  isEligibleP3BoundedSeedCandidate,
} from "./market-p3-bounded-seed.js";

const CONFIRMATION = "APPROVE_P3_BOUNDED_SEED_V2";
const AUTO_CANARY_CONFIRMATION = "APPROVE_P3_BOUNDED_SEED_V2_AUTO_CANARY_V1";
const AUTO_APPROVAL = "APPROVE_P3_BOUNDED_SEED_V2_AUTO_V1";
const HEAD_SHA = /^[0-9a-f]{40}$/;
const CANDIDATE_KEY = /^[0-9a-f]{16}$/;

export const P3_BOUNDED_SEED_V2_CONFIRMATION = CONFIRMATION;
export const P3_BOUNDED_SEED_V2_HARD_CAP = 25;
export const P3_BOUNDED_SEED_V2_ALLOWED_LIMITS = Object.freeze([10, 25]);
export const P3_BOUNDED_SEED_V2_QUERY_PROFILE = "priority_3_seed_strict";
export const P3_BOUNDED_SEED_V2_AUTO_CANARY_CONFIRMATION = AUTO_CANARY_CONFIRMATION;
export const P3_BOUNDED_SEED_V2_AUTO_APPROVAL = AUTO_APPROVAL;
export const P3_BOUNDED_SEED_V2_AUTO_LIMIT = 25;

export function validateP3BoundedSeedV2Invocation({ event_name, ref, confirmation, expected_main_sha, head_sha, origin_main_sha } = {}) {
  if (event_name !== "workflow_dispatch" || ref !== "refs/heads/main" || confirmation !== CONFIRMATION) {
    throw new Error("P3 bounded seed v2 invocation is not authorized.");
  }
  const expected = String(expected_main_sha ?? "").trim();
  if (!HEAD_SHA.test(expected) || String(head_sha ?? "").trim() !== expected || String(origin_main_sha ?? "").trim() !== expected) {
    throw new Error("P3 bounded seed v2 main revision is not exact.");
  }
  return true;
}

export function parseP3BoundedSeedV2Limit(value) {
  const limit = Number(value);
  if (!P3_BOUNDED_SEED_V2_ALLOWED_LIMITS.includes(limit)) {
    throw new Error("P3 bounded seed v2 limit must be exactly 10 or 25.");
  }
  return limit;
}

export function validateP3BoundedSeedV2AutoInvocation({ event_name, ref, confirmation, auto_enabled, auto_approval, head_sha, origin_main_sha } = {}) {
  if (ref !== "refs/heads/main" || !HEAD_SHA.test(String(head_sha ?? "").trim()) || String(head_sha ?? "").trim() !== String(origin_main_sha ?? "").trim()) {
    throw new Error("P3 bounded seed v2 auto main revision is not exact.");
  }
  if (event_name === "workflow_dispatch") {
    if (confirmation !== AUTO_CANARY_CONFIRMATION) throw new Error("P3 bounded seed v2 auto canary is not authorized.");
    return "manual-auto-canary";
  }
  if (event_name === "schedule") {
    if (auto_enabled !== "true" || auto_approval !== AUTO_APPROVAL) throw new Error("P3 bounded seed v2 automatic schedule is disabled.");
    return "scheduled-auto";
  }
  throw new Error("P3 bounded seed v2 auto event is not authorized.");
}

export function selectP3BoundedSeedV2Candidates(candidates = [], { limit = 10 } = {}) {
  const capacity = parseP3BoundedSeedV2Limit(limit);
  if (!Array.isArray(candidates)) throw new Error("P3 bounded seed v2 candidates are invalid.");
  const byVariant = groupCandidates(candidates.filter(isEligibleP3BoundedSeedCandidate), (candidate) => candidate?.target?.variant_id);
  const bestByVariant = [...byVariant.values()].map((values) => values.sort(compareCandidate)[0]);
  const bySeries = groupCandidates(bestByVariant, (candidate) => candidate?.target?.series_id);
  const selected = [...bySeries.values()].map((values) => values.sort(compareCandidate)[0]).sort(compareCandidate).slice(0, capacity);
  return {
    selected,
    safe_candidate_count: candidates.filter(isEligibleP3BoundedSeedCandidate).length,
    selected_candidate_keys: selected.map((candidate) => candidate.candidate_key),
    selected_variant_ids: selected.map((candidate) => candidate.target.variant_id),
    one_listing_per_variant: new Set(selected.map((candidate) => candidate.target.variant_id)).size === selected.length,
    one_variant_per_series: new Set(selected.map((candidate) => candidate.target.series_id)).size === selected.length,
  };
}

export function buildP3BoundedSeedV2Rows({ candidates = [], workflow = {}, observed_at = new Date(), stage = "p3-bounded-seed-v2" } = {}) {
  assertP3BoundedSeedV2CandidatePool(candidates);
  const observed = new Date(observed_at);
  const runId = String(workflow.run_id ?? "").trim();
  const headSha = String(workflow.head_sha ?? "").trim();
  if (!Number.isFinite(observed.getTime()) || !runId || !HEAD_SHA.test(headSha)) throw new Error("P3 bounded seed v2 workflow identity is invalid.");
  const observedAt = observed.toISOString();
  if (!["p3-bounded-seed-v2", "p3-bounded-seed-v2-auto"].includes(stage)) throw new Error("P3 bounded seed v2 stage is invalid.");
  const rows = candidates.map((candidate) => buildV2Rows(candidate, { runId, headSha, observedAt, stage }));
  return { candidates, listingRows: rows.map((pair) => pair.listing), observationRows: rows.map((pair) => pair.observation) };
}

export function assertP3BoundedSeedV2Prewrite({ rows, variantListings = [], sourceUrlRows = [], existingListings = [], existingObservations = [] } = {}) {
  const listingRows = rows?.listingRows ?? [];
  const observationRows = rows?.observationRows ?? [];
  if (!listingRows.length || listingRows.length > P3_BOUNDED_SEED_V2_HARD_CAP || listingRows.length !== observationRows.length) {
    throw new Error("P3 bounded seed v2 prewrite batch size is invalid.");
  }
  const values = [
    listingRows.map((row) => row.variant_id), listingRows.map((row) => row.series_id), listingRows.map((row) => row.id),
    observationRows.map((row) => row.id), listingRows.map((row) => canonicalizeBoundedMarketplaceUrl(row.source_url)),
  ];
  if (values.some((entries) => entries.some((entry) => !entry) || new Set(entries).size !== entries.length)
    || variantListings.length || sourceUrlRows.length || existingListings.length || existingObservations.length) {
    throw new Error("P3 bounded seed v2 prewrite found existing or duplicate market evidence.");
  }
  return true;
}

export async function persistP3BoundedSeedV2({ rows, store, onStage } = {}) {
  assertP3BoundedSeedV2Prewrite({ rows });
  return persistMarketBounded({
    listingRows: rows.listingRows,
    observationRows: rows.observationRows,
    store,
    onStage,
    persistencePolicy: MARKET_BOUNDED_PERSISTENCE_POLICIES.p3_seed_v2,
  });
}

export function buildP3BoundedSeedV2Result(input = {}) {
  const base = buildP3BoundedSeedResult(input);
  const candidates = input.selection?.selected ?? [];
  const persistenceSucceeded = base.status === "succeeded"
    && base.verification.rows_verified === true
    && base.verification.deltas_verified === true
    && hasCompleteInsertOperations(base.operations, input.rows, candidates.length);
  return {
    ...base,
    workflow: {
      ...base.workflow,
      event_name: ["workflow_dispatch", "schedule"].includes(input.workflow?.event_name) ? input.workflow.event_name : null,
    },
    contract: { ...base.contract, version: "v2", execution_mode: ["manual-v2", "manual-auto-canary", "scheduled-auto"].includes(input.execution_mode) ? input.execution_mode : "manual-v2", requested_limit: Number(input.requested_limit) || 0, hard_cap: P3_BOUNDED_SEED_V2_HARD_CAP },
    retrieval: { ...base.retrieval, no_result_variant_count: Number(input.report?.result?.no_result_variant_count) || 0 },
    selection: {
      ...base.selection,
      persisted_variant_ids: persistenceSucceeded
        ? candidates.map((candidate) => safeText(candidate?.target?.variant_id, 160))
        : [],
      selected_variants: candidates.map((candidate) => ({
        variant_id: safeText(candidate?.target?.variant_id, 160),
        variant_name: safeText(candidate?.target?.variant_name, 300),
        series_id: safeText(candidate?.target?.series_id, 160),
        series_name: safeText(candidate?.target?.series_name, 300),
      })),
      distinct_selected_series_count: new Set(candidates.map((candidate) => String(candidate?.target?.series_id ?? ""))).size,
      one_variant_per_series: input.selection?.one_variant_per_series === true,
    },
    production_counts_before: sanitizeOptionalCounts(input.before),
    production_counts_after: sanitizeOptionalCounts(input.after),
  };
}

export function renderP3BoundedSeedV2ResultMarkdown(result) {
  return ["# Priority 3 bounded seed v2 result", "", `- Run: ${result.workflow.run_id || "unknown"}`, `- Status: ${result.status}`,
    `- Requested limit: ${result.contract.requested_limit}`, `- Persistence candidates: ${result.selection.persistence_candidate_keys.length}`,
    `- Database writes: ${result.database_writes}`, `- Rows verified: ${result.verification.rows_verified}`,
    `- Deltas verified: ${result.verification.deltas_verified}`, `- Rollback attempted: ${result.rollback.attempted}`,
    `- Rollback verified: ${result.rollback.verified}`, `- Failure stage: ${result.failure?.stage ?? "none"}`, ""].join("\n");
}

export { calculateP3BoundedSeedNoResultVariants };

function assertP3BoundedSeedV2CandidatePool(candidates) {
  if (!Array.isArray(candidates) || !candidates.length || candidates.length > P3_BOUNDED_SEED_V2_HARD_CAP
    || new Set(candidates.map((candidate) => candidate?.target?.variant_id)).size !== candidates.length
    || new Set(candidates.map((candidate) => candidate?.target?.series_id)).size !== candidates.length
    || candidates.some((candidate) => !isEligibleP3BoundedSeedCandidate(candidate))) {
    throw new Error("P3 bounded seed v2 persistence pool is invalid.");
  }
}

function buildV2Rows(candidate, { runId, headSha, observedAt, stage }) {
  const provider = String(candidate.source.provider);
  const sourceListingId = safeText(candidate.source.listing_id, 300);
  const sourceUrl = canonicalizeBoundedMarketplaceUrl(candidate.source.public_url);
  const source = canonicalMarketplaceSource(provider);
  const listingId = buildMarketplaceListingId({ provider, sourceListingId, publicUrl: sourceUrl, title: candidate.listing.title });
  if (!source || !sourceUrl || !sourceListingId || !listingId) throw new Error("P3 bounded seed v2 marketplace identity is invalid.");
  const marker = { stage, workflow_run_id: runId, head_sha: headSha, candidate_key: candidate.candidate_key };
  const marketSafety = { accepted: true, review_required: false, reason: candidate.assessment.reason, variant_id: candidate.target.variant_id, series_id: candidate.target.series_id, listing_type: "single", confidence: Number(candidate.assessment.confidence) };
  const affiliate = buildVerifiedAffiliatePersistenceFields(candidate);
  const listing = {
    id: listingId, variant_id: candidate.target.variant_id, matched_variant_id: candidate.target.variant_id, series_id: candidate.target.series_id,
    title: safeText(candidate.listing.title, 300), listing_type: "single", market_review_type: "single", classification_reason: candidate.assessment.reason,
    classification_confidence: Number(candidate.assessment.confidence), classification_details: { market_safety: marketSafety }, price: Number(candidate.listing.price),
    status: "active", source, source_type: "marketplace", source_url: sourceUrl,
    listed_at: observedAt, sold_at: null, last_observed_at: observedAt, confidence: Number(candidate.assessment.confidence), review_required: false,
    raw: { provider, source_listing_id: sourceListingId, public_url: sourceUrl, query_text: safeText(candidate.target.search_query, 300), query_variant_id: candidate.target.variant_id, query_series_id: candidate.target.series_id, market_safety_assessed: true, market_safety: marketSafety, ...affiliate, p3_bounded_seed: marker },
  };
  const identity = resolveBoundedMarketplaceIdentity(listing);
  if (!identity.complete || identity.sourceListingId !== sourceListingId || identity.publicUrl !== sourceUrl || identity.derivedId !== listingId) {
    throw new Error("P3 bounded seed v2 marketplace identity is inconsistent.");
  }
  const observation = { id: stableId(stage === "p3-bounded-seed-v2-auto" ? "market-p3-bounded-seed-v2-auto-observation" : "market-p3-bounded-seed-v2-observation", runId, candidate.candidate_key, listingId), listing_id: listingId, variant_id: candidate.target.variant_id, series_id: candidate.target.series_id, price: Number(candidate.listing.price), status: "active", source: listing.source, observed_at: observedAt, raw: { p3_bounded_seed: marker } };
  return { listing, observation };
}

function groupCandidates(candidates, keyFor) {
  const groups = new Map();
  for (const candidate of candidates) {
    const key = String(keyFor(candidate) ?? "").trim();
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(candidate);
  }
  return groups;
}
function compareCandidate(left, right) {
  for (const [a, b] of [[left?.checks?.explicit_label_target_match === true, right?.checks?.explicit_label_target_match === true], [left?.checks?.parent_series_exact_evidence_present === true, right?.checks?.parent_series_exact_evidence_present === true], [discriminatorSatisfied(left), discriminatorSatisfied(right)]]) if (a !== b) return a ? -1 : 1;
  return Number(right?.assessment?.confidence) - Number(left?.assessment?.confidence) || String(left?.candidate_key ?? "").localeCompare(String(right?.candidate_key ?? ""), "en");
}
function discriminatorSatisfied(candidate) { return candidate?.checks?.parent_series_discriminator_required !== true || candidate?.checks?.parent_series_discriminator_evidence_present === true; }
function safeText(value, max) { return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max); }
function hasCompleteInsertOperations(operations, rows, count) {
  return Number.isInteger(count) && count > 0
    && operations?.listings?.length === count
    && operations?.observations?.length === count
    && rows?.listingRows?.length === count
    && rows?.observationRows?.length === count
    && operations.listings.every((entry) => entry.operation === "insert")
    && operations.observations.every((entry) => entry.operation === "insert")
    && sameIds(operations.listings, rows.listingRows)
    && sameIds(operations.observations, rows.observationRows);
}
function sameIds(operations, rows) { return operations.every((entry, index) => entry.id === rows[index]?.id); }
function sanitizeOptionalCounts(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keys = ["market_listings", "market_listing_observations", "import_issues", "ingestion_runs", "review_required", "series", "variants", "stock_reports", "restock_events"];
  if (keys.some((key) => !Number.isInteger(Number(value[key])) || Number(value[key]) < 0)) return null;
  return Object.fromEntries(keys.map((key) => [key, Number(value[key])]));
}
