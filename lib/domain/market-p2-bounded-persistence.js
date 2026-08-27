import crypto from "node:crypto";
import { stableId } from "../fetchers/feed-source-utils.js";
import { PRIORITY_TWO_DISTINCT_EVIDENCE_QUERY_PROFILE } from "../fetchers/market-p2-distinct-evidence-query-planner.js";
import { buildMarketplaceListingId, canonicalMarketplaceSource } from "./market-canary-write.js";
import {
  canonicalJson,
  canonicalizeBoundedMarketplaceUrl,
  MARKET_BOUNDED_PERSISTENCE_POLICIES,
  persistMarketBounded,
  resolveBoundedMarketplaceIdentity,
  rollbackMarketBounded,
} from "./market-bounded-write.js";
import {
  buildSanitizedMarketplaceStorefrontProvenance,
  compareIndependentStorefrontEvidence,
  resolveMarketplaceStorefrontEvidence,
  storefrontIdentityKey,
} from "./market-storefront-identity.js";

const HEAD_SHA = /^[0-9a-f]{40}$/;
const CANDIDATE_KEY = /^[0-9a-f]{16}$/;
const CONTROL = /[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
const ALLOWED_MODES = new Set(["dry-run", "canary-write"]);
const COUNT_KEYS = Object.freeze([
  "market_listings", "market_listing_observations", "import_issues", "ingestion_runs",
  "series", "variants", "complete_set",
]);

export const MARKET_P2_BOUNDED_CONFIRMATION = "APPROVE_MARKET_P2_BOUNDED_CANARY_V1";
export const MARKET_P2_BOUNDED_MAX_SELECTED_VARIANTS = 5;
export const MARKET_P2_BOUNDED_MAX_WRITES = 2;
export const MARKET_P2_BOUNDED_CANARY_WRITES = 1;
export const MARKET_P2_BOUNDED_POLICY = Object.freeze({
  version: 1,
  priority: 2,
  release: "released",
  query_profile: PRIORITY_TWO_DISTINCT_EVIDENCE_QUERY_PROFILE,
  max_selected_variants: MARKET_P2_BOUNDED_MAX_SELECTED_VARIANTS,
  max_persistence_candidates: MARKET_P2_BOUNDED_MAX_WRITES,
  canary_persistence_candidates: MARKET_P2_BOUNDED_CANARY_WRITES,
  one_variant_per_series: true,
  existing_active_single_count_before: 1,
  existing_active_single_count_after: 2,
  insert_only: true,
  merchant_identity_eligibility: false,
});
export const MARKET_P2_BOUNDED_POLICY_DIGEST = crypto.createHash("sha256").update(canonicalJson(MARKET_P2_BOUNDED_POLICY)).digest("hex");

export function expectedMarketP2BoundedApproval(headSha, candidateKey) {
  return `${MARKET_P2_BOUNDED_CONFIRMATION}:${MARKET_P2_BOUNDED_POLICY_DIGEST}:${headSha}:${candidateKey}`;
}

export function validateMarketP2BoundedInvocation(input = {}) {
  const mode = text(input.mode, 32);
  const limit = Number(input.limit);
  const headSha = text(input.head_sha, 40).toLowerCase();
  const expectedMainSha = text(input.expected_main_sha, 40).toLowerCase();
  const originMainSha = text(input.origin_main_sha, 40).toLowerCase();
  const candidateKey = text(input.candidate_key, 16).toLowerCase();
  if (input.event_name !== "workflow_dispatch" || input.ref !== "refs/heads/main" || !ALLOWED_MODES.has(mode)
    || !Number.isInteger(limit) || limit < 1 || limit > MARKET_P2_BOUNDED_MAX_SELECTED_VARIANTS
    || !HEAD_SHA.test(headSha) || expectedMainSha !== headSha || originMainSha !== headSha) {
    throw new Error("P2 bounded invocation is not exactly bound to current main.");
  }
  if (mode === "dry-run") {
    if (candidateKey || text(input.approval, 300)) throw new Error("P2 bounded dry-run must not include write authorization.");
    return { mode, limit, write_authorized: false, candidate_key: null };
  }
  if (!CANDIDATE_KEY.test(candidateKey)
    || input.approval !== expectedMarketP2BoundedApproval(headSha, candidateKey)) {
    throw new Error("P2 bounded canary approval is invalid.");
  }
  return { mode, limit, write_authorized: true, candidate_key: candidateKey };
}

export function selectMarketP2BoundedCandidates({ audit = {}, diagnostic = {}, existingListings = [], limit = MARKET_P2_BOUNDED_MAX_WRITES } = {}) {
  const capacity = Number(limit);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > MARKET_P2_BOUNDED_MAX_WRITES) throw new Error("P2 bounded persistence limit is invalid.");
  if (diagnostic?.priority !== 2 || diagnostic?.query_profile !== PRIORITY_TWO_DISTINCT_EVIDENCE_QUERY_PROFILE) throw new Error("P2 bounded diagnostic contract is invalid.");
  const auditCandidates = new Map((audit.candidates ?? []).map((candidate) => [candidate?.candidate_key, candidate]));
  const existingByVariant = groupEligibleExistingListings(existingListings);
  const ranked = [];
  for (const variant of diagnostic.variants ?? []) {
    const variantId = text(variant.variant_id, 140);
    const seriesId = text(variant.series_id, 140);
    const existing = existingByVariant.get(variantId) ?? [];
    if (!variantId || !seriesId || Number(variant.priority) !== 2 || existing.length !== 1) continue;
    for (const evidence of variant.accepted_distinct ?? []) {
      const candidate = auditCandidates.get(evidence.candidate_key);
      if (!isEligibleMarketP2BoundedCandidate(candidate, evidence)) continue;
      ranked.push({
        candidate,
        evidence,
        existing_listing: existing[0],
        rank_class: normalizeProvider(evidence.provider) === normalizeProvider(existing[0].source ?? existing[0].raw?.provider) ? "A" : "B",
      });
    }
  }
  ranked.sort(compareRankedCandidates);
  const selected = [];
  const variants = new Set();
  const series = new Set();
  for (const entry of ranked) {
    const variantId = text(entry.candidate.target?.variant_id, 140);
    const seriesId = text(entry.candidate.target?.series_id, 140);
    if (!variantId || !seriesId || variants.has(variantId) || series.has(seriesId)) continue;
    selected.push(entry);
    variants.add(variantId);
    series.add(seriesId);
    if (selected.length === capacity) break;
  }
  return {
    selected,
    eligible_candidate_count: ranked.length,
    selected_candidate_keys: selected.map((entry) => entry.candidate.candidate_key),
    selected_variant_ids: selected.map((entry) => entry.candidate.target.variant_id),
    one_variant_per_series: series.size === selected.length,
  };
}

export function isEligibleMarketP2BoundedCandidate(candidate, evidence) {
  return Boolean(candidate
    && CANDIDATE_KEY.test(text(candidate.candidate_key, 16))
    && candidate.assessment?.accepted === true
    && candidate.assessment?.review_required !== true
    && Number(candidate.assessment?.confidence) >= 0.8
    && candidate.listing?.status === "active"
    && candidate.listing?.listing_type === "single"
    && candidate.checks?.set_signal_detected !== true
    && evidence?.classification === "accepted_distinct"
    && evidence?.candidate_key === candidate.candidate_key
    && evidence?.status === "active"
    && evidence?.independent_storefront_evidence === true
    && storefrontIdentityKey(evidence));
}

export function buildMarketP2BoundedRows({ selected = [], workflow = {}, observed_at = new Date() } = {}) {
  if (!Array.isArray(selected) || selected.length < 1 || selected.length > MARKET_P2_BOUNDED_MAX_WRITES) throw new Error("P2 bounded row selection is invalid.");
  const observed = new Date(observed_at);
  const runId = text(workflow.run_id, 80);
  const headSha = text(workflow.head_sha, 40).toLowerCase();
  if (!Number.isFinite(observed.getTime()) || !runId || !HEAD_SHA.test(headSha)) throw new Error("P2 bounded workflow identity is invalid.");
  const pairs = selected.map((entry) => buildRows(entry, { runId, headSha, observedAt: observed.toISOString() }));
  return {
    candidates: selected.map((entry) => ({
      candidate_key: entry.candidate.candidate_key,
      variant_id: entry.candidate.target.variant_id,
      series_id: entry.candidate.target.series_id,
    })),
    listingRows: pairs.map((entry) => entry.listing),
    observationRows: pairs.map((entry) => entry.observation),
  };
}

export function assertMarketP2BoundedPrewrite({ rows, selected = [], existingActiveListings = [], listingIdConflicts = [], observationIdConflicts = [], sourceIdentityConflicts = [], sourceUrlConflicts = [] } = {}) {
  const listingRows = rows?.listingRows ?? [];
  const observationRows = rows?.observationRows ?? [];
  if (!listingRows.length || listingRows.length > MARKET_P2_BOUNDED_MAX_WRITES || listingRows.length !== observationRows.length || selected.length !== listingRows.length) {
    throw new Error("P2 bounded prewrite batch is invalid.");
  }
  const existingByVariant = groupEligibleExistingListings(existingActiveListings);
  const uniqueFields = [
    listingRows.map((row) => row.id), listingRows.map((row) => row.variant_id), listingRows.map((row) => row.series_id),
    listingRows.map((row) => canonicalizeBoundedMarketplaceUrl(row.source_url)), observationRows.map((row) => row.id),
  ];
  const hasConflict = [listingIdConflicts, observationIdConflicts, sourceIdentityConflicts, sourceUrlConflicts].some((rowsValue) => !Array.isArray(rowsValue) || rowsValue.length > 0);
  if (hasConflict || uniqueFields.some((entries) => entries.some((entry) => !entry) || new Set(entries).size !== entries.length)) throw new Error("P2 bounded prewrite identity conflict.");
  for (let index = 0; index < selected.length; index += 1) {
    const entry = selected[index];
    const row = listingRows[index];
    const existing = existingByVariant.get(row.variant_id) ?? [];
    const candidateStorefront = resolveSelectedCandidateStorefront(entry);
    const existingStorefront = existing.length === 1
      ? resolveMarketplaceStorefrontEvidence(existing[0])
      : null;
    const independentlyVerified = compareIndependentStorefrontEvidence(candidateStorefront, existingStorefront ? [existingStorefront] : []);
    if (existing.length !== 1 || entry.evidence?.independent_storefront_evidence !== true
      || !storefrontIdentityKey(candidateStorefront) || !storefrontIdentityKey(existingStorefront)
      || independentlyVerified !== true
      || normalizeProvider(entry.evidence.provider) !== normalizeProvider(row.raw?.provider)
      || text(entry.evidence.source_listing_id, 140) !== text(row.raw?.source_listing_id, 140)) {
      throw new Error("P2 bounded prewrite storefront or coverage state changed.");
    }
  }
  return true;
}

export function validateMarketP2BoundedPostwrite({ beforeCounts, afterCounts, selected = [], activeListingsAfter = [] } = {}) {
  const before = sanitizeCounts(beforeCounts);
  const after = sanitizeCounts(afterCounts);
  const count = selected.length;
  if (!before || !after || count < 1 || count > MARKET_P2_BOUNDED_MAX_WRITES) throw new Error("P2 bounded postwrite counts are unavailable.");
  const expected = { market_listings: count, market_listing_observations: count };
  for (const key of COUNT_KEYS) {
    const delta = after[key] - before[key];
    if (delta !== (expected[key] ?? 0)) throw new Error("P2 bounded Production delta is unexpected.");
  }
  const byVariant = groupEligibleExistingListings(activeListingsAfter);
  if (selected.some((entry) => (byVariant.get(entry.candidate.target.variant_id) ?? []).length !== 2)) throw new Error("P2 bounded target coverage did not move from one to two.");
  return { verified: true, deltas: Object.fromEntries(COUNT_KEYS.map((key) => [key, after[key] - before[key]])), target_active_listing_count_after: 2 };
}

export async function persistMarketP2Bounded({ rows, selected, store, beforeCounts } = {}) {
  if (typeof store?.fetchActiveEligibleListingsByVariantIds !== "function" || typeof store?.fetchP2PrewriteConflicts !== "function") {
    throw new Error("P2 bounded prewrite store is incomplete.");
  }
  const [freshExisting, conflicts] = await Promise.all([
    store.fetchActiveEligibleListingsByVariantIds(selected.map((entry) => entry.candidate.target.variant_id)),
    store.fetchP2PrewriteConflicts(rows),
  ]);
  assertMarketP2BoundedPrewrite({ rows, selected, existingActiveListings: freshExisting, ...conflicts });
  const outcome = await persistMarketBounded({
    listingRows: rows.listingRows,
    observationRows: rows.observationRows,
    store,
    persistencePolicy: MARKET_BOUNDED_PERSISTENCE_POLICIES.p2_distinct_v1,
  });
  try {
    const [afterCounts, activeListingsAfter] = await Promise.all([
      store.fetchCounts(),
      store.fetchActiveEligibleListingsByVariantIds(selected.map((entry) => entry.candidate.target.variant_id)),
    ]);
    return { ...outcome, postwrite: validateMarketP2BoundedPostwrite({ beforeCounts, afterCounts, selected, activeListingsAfter }) };
  } catch (error) {
    const rollback = await rollbackMarketBounded({
      store,
      listingRows: rows.listingRows,
      observationRows: rows.observationRows,
      beforeListings: [],
      beforeObservations: [],
      beforeCounts,
    });
    error.p2_bounded_rollback = rollback;
    throw error;
  }
}

export function buildMarketP2BoundedArtifact(input = {}) {
  const selected = input.selection?.selected ?? [];
  const before = sanitizeCounts(input.before);
  const after = sanitizeCounts(input.after);
  const mode = ALLOWED_MODES.has(input.mode) ? input.mode : "dry-run";
  const status = ["ready", "dry-run", "succeeded", "blocked", "rolled-back", "rollback-failed"].includes(input.status) ? input.status : "blocked";
  const databaseWrites = status === "rollback-failed" ? null : Number(input.outcome?.database_writes) || 0;
  const value = {
    schema_version: 1,
    kind: "priority_2_bounded_persistence",
    status,
    mode,
    priority: 2,
    query_profile: PRIORITY_TWO_DISTINCT_EVIDENCE_QUERY_PROFILE,
    policy_digest: MARKET_P2_BOUNDED_POLICY_DIGEST,
    head_sha: HEAD_SHA.test(text(input.workflow?.head_sha, 40)) ? text(input.workflow.head_sha, 40) : null,
    run_id: text(input.workflow?.run_id, 80) || null,
    limits: { selected_variants: MARKET_P2_BOUNDED_MAX_SELECTED_VARIANTS, persistence_candidates: MARKET_P2_BOUNDED_MAX_WRITES, canary_candidates: MARKET_P2_BOUNDED_CANARY_WRITES },
    write_authorized: input.write_authorized === true,
    write_eligible: input.write_authorized === true && selected.length === 1,
    database_writes: databaseWrites,
    write_outcome_unknown: status === "rollback-failed",
    production_counts_before: before,
    production_counts_after: after,
    expected_deltas: { market_listings: selected.length, market_listing_observations: selected.length, import_issues: 0, ingestion_runs: 0, series: 0, variants: 0, complete_set: 0 },
    write_contract: { listing_inserts: selected.length, observation_inserts: selected.length, listing_updates: 0, observation_updates: 0, deletes: 0 },
    eligible_candidate_count: Number(input.selection?.eligible_candidate_count) || 0,
    selected_candidates: selected.map((entry) => ({
      candidate_key: entry.candidate.candidate_key,
      variant_id: text(entry.candidate.target?.variant_id, 140),
      variant_name: text(entry.candidate.target?.variant_name, 180),
      series_id: text(entry.candidate.target?.series_id, 140),
      series_name: text(entry.candidate.target?.series_name, 220),
      provider: normalizeProvider(entry.evidence.provider),
      source_listing_id: text(entry.evidence.source_listing_id, 140),
      public_url: canonicalizeBoundedMarketplaceUrl(entry.evidence.public_url),
      price: Number(entry.evidence.price),
      status: text(entry.evidence.status, 32),
      reason: text(entry.evidence.reason, 120),
      confidence: Number(entry.evidence.confidence),
      storefront_id: text(entry.evidence.storefront_id, 120),
      storefront_name: text(entry.evidence.storefront_name, 180) || null,
      storefront_identity_source: text(entry.evidence.storefront_identity_source, 120),
      rank_class: entry.rank_class,
      independent_storefront_evidence: true,
      merchant_identity: null,
      merchant_identity_status: "unknown",
      existing_listing: sanitizeExistingListingForArtifact(entry.existing_listing),
    })),
    postwrite: input.outcome?.postwrite ?? null,
    rollback: input.rollback ? { attempted: input.rollback.attempted === true, verified: input.rollback.verified === true } : { attempted: false, verified: false },
    failure: input.reason_code ? { reason_code: text(input.reason_code, 120) } : null,
  };
  validateMarketP2BoundedArtifact(value);
  return value;
}

export function validateMarketP2BoundedArtifact(value) {
  if (value?.schema_version !== 1 || value.kind !== "priority_2_bounded_persistence" || value.priority !== 2
    || value.query_profile !== PRIORITY_TWO_DISTINCT_EVIDENCE_QUERY_PROFILE || value.policy_digest !== MARKET_P2_BOUNDED_POLICY_DIGEST
    || !Array.isArray(value.selected_candidates) || value.selected_candidates.length > MARKET_P2_BOUNDED_MAX_WRITES
    || value.selected_candidates.some((candidate) => !CANDIDATE_KEY.test(candidate.candidate_key) || !candidate.variant_id || !candidate.series_id
      || !candidate.source_listing_id || !candidate.public_url || !candidate.storefront_id || !candidate.storefront_identity_source
      || candidate.status !== "active" || !candidate.reason || !Number.isFinite(candidate.confidence) || candidate.confidence < 0.8 || candidate.confidence > 1
      || candidate.independent_storefront_evidence !== true || candidate.merchant_identity !== null || candidate.merchant_identity_status !== "unknown")) {
    throw new Error("P2 bounded artifact is invalid.");
  }
  const shouldBeWriteEligible = value.mode === "canary-write" && value.write_authorized === true && value.selected_candidates.length === 1;
  if (value.write_eligible !== shouldBeWriteEligible
    || (value.status === "dry-run" && (value.mode !== "dry-run" || value.database_writes !== 0 || value.write_authorized !== false || canonicalJson(value.production_counts_before) !== canonicalJson(value.production_counts_after)))
    || (value.status === "succeeded" && (!shouldBeWriteEligible || value.database_writes !== 2 || value.postwrite?.verified !== true))
    || (value.status === "rollback-failed" && (value.database_writes !== null || value.write_outcome_unknown !== true || value.rollback?.attempted !== true || value.rollback?.verified !== false))
    || (value.status !== "rollback-failed" && value.write_outcome_unknown !== false)) {
    throw new Error("P2 bounded artifact outcome is inconsistent.");
  }
  return true;
}

export function renderMarketP2BoundedArtifactMarkdown(value) {
  validateMarketP2BoundedArtifact(value);
  return `${[
    "# Priority 2 bounded persistence",
    "",
    `- Status: ${value.status}`,
    `- Mode: ${value.mode}`,
    `- Head SHA: ${value.head_sha ?? "unknown"}`,
    `- Policy digest: ${value.policy_digest}`,
    `- Selected candidates: ${value.selected_candidates.length}`,
    `- Write authorized: ${value.write_authorized}`,
    `- Database writes: ${value.database_writes}`,
    `- Postwrite verified: ${value.postwrite?.verified === true}`,
    "",
    "| Candidate | Series | Variant | Provider | Storefront | Rank |",
    "|---|---|---|---|---|---|",
    ...value.selected_candidates.map((entry) => `| ${md(entry.candidate_key)} | ${md(entry.series_name)} | ${md(entry.variant_name)} | ${md(entry.provider)} | ${md(entry.storefront_id)} | ${entry.rank_class} |`),
    "",
  ].join("\n")}\n`;
}

function buildRows(entry, { runId, headSha, observedAt }) {
  if (!isEligibleMarketP2BoundedCandidate(entry.candidate, entry.evidence)) throw new Error("P2 bounded candidate is not eligible.");
  const candidate = entry.candidate;
  const provider = normalizeProvider(entry.evidence.provider);
  const source = canonicalMarketplaceSource(provider);
  const sourceListingId = text(entry.evidence.source_listing_id, 140);
  const sourceUrl = canonicalizeBoundedMarketplaceUrl(entry.evidence.public_url);
  const listingId = buildMarketplaceListingId({ provider, sourceListingId, publicUrl: sourceUrl, title: candidate.listing.title });
  const storefront = buildSanitizedMarketplaceStorefrontProvenance({ source: provider, raw: { provider, storefront_id: entry.evidence.storefront_id, storefront_name: entry.evidence.storefront_name, storefront_identity_source: entry.evidence.storefront_identity_source } });
  if (!source || !sourceListingId || !sourceUrl || !listingId || !storefront.storefront_id) throw new Error("P2 bounded marketplace identity is incomplete.");
  const marker = { stage: "p2-bounded-persistence", workflow_run_id: runId, head_sha: headSha, policy_digest: MARKET_P2_BOUNDED_POLICY_DIGEST, candidate_key: candidate.candidate_key };
  const marketSafety = { accepted: true, review_required: false, reason: text(candidate.assessment.reason, 120), variant_id: candidate.target.variant_id, series_id: candidate.target.series_id, listing_type: "single", confidence: Number(candidate.assessment.confidence) };
  const listing = {
    id: listingId,
    variant_id: candidate.target.variant_id,
    matched_variant_id: candidate.target.variant_id,
    series_id: candidate.target.series_id,
    title: text(candidate.listing.title, 300),
    listing_type: "single",
    market_review_type: "single",
    classification_reason: marketSafety.reason,
    classification_confidence: marketSafety.confidence,
    classification_details: { market_safety: marketSafety },
    price: Number(candidate.listing.price),
    status: "active",
    source,
    source_type: "marketplace",
    source_url: sourceUrl,
    listed_at: observedAt,
    sold_at: null,
    last_observed_at: observedAt,
    confidence: marketSafety.confidence,
    review_required: false,
    raw: {
      provider,
      source_listing_id: sourceListingId,
      public_url: sourceUrl,
      query_text: text(candidate.target.search_query, 300),
      query_variant_id: candidate.target.variant_id,
      query_series_id: candidate.target.series_id,
      market_safety_assessed: true,
      market_safety: marketSafety,
      ...storefront,
      p2_bounded_persistence: marker,
    },
  };
  const identity = resolveBoundedMarketplaceIdentity(listing);
  if (!identity.complete || identity.derivedId !== listing.id || identity.sourceListingId !== sourceListingId || identity.publicUrl !== sourceUrl) throw new Error("P2 bounded marketplace identity is inconsistent.");
  const observation = {
    id: stableId("market-p2-bounded-observation", runId, candidate.candidate_key, listingId),
    listing_id: listingId,
    variant_id: candidate.target.variant_id,
    series_id: candidate.target.series_id,
    price: Number(candidate.listing.price),
    status: "active",
    source,
    observed_at: observedAt,
    raw: { p2_bounded_persistence: marker },
  };
  return { listing, observation };
}

function groupEligibleExistingListings(rows = []) {
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!isEligibleExistingListing(row)) continue;
    const variantId = text(row.matched_variant_id || row.variant_id, 140);
    if (!groups.has(variantId)) groups.set(variantId, []);
    groups.get(variantId).push(row);
  }
  return groups;
}

function isEligibleExistingListing(row) {
  return Boolean(text(row?.matched_variant_id || row?.variant_id, 140)
    && row?.status === "active"
    && row?.listing_type === "single"
    && row?.review_required !== true
    && Number.isFinite(Number(row?.price))
    && Number(row.price) > 0
    && isRecentlyObserved(row)
    && storefrontIdentityKey({ provider: normalizeProvider(row?.source ?? row?.raw?.provider), ...buildSanitizedMarketplaceStorefrontProvenance(row) }));
}

function isRecentlyObserved(row) {
  const value = row?.last_observed_at || row?.listed_at || row?.updated_at || row?.created_at;
  const observed = new Date(value ?? NaN).getTime();
  const age = Date.now() - observed;
  return Number.isFinite(observed) && age >= 0 && age <= 30 * 24 * 60 * 60 * 1000;
}

function compareRankedCandidates(left, right) {
  return left.rank_class.localeCompare(right.rank_class, "en")
    || Number(right.candidate.assessment.confidence) - Number(left.candidate.assessment.confidence)
    || String(left.candidate.candidate_key).localeCompare(String(right.candidate.candidate_key), "en");
}

function sanitizeExistingListingForArtifact(row = {}) {
  const provenance = buildSanitizedMarketplaceStorefrontProvenance(row);
  return {
    listing_id: text(row.id, 140),
    provider: normalizeProvider(row.source ?? row.raw?.provider),
    source_url: canonicalizeBoundedMarketplaceUrl(row.source_url),
    storefront_id: text(provenance.storefront_id, 120),
    storefront_identity_source: text(provenance.storefront_identity_source, 120),
    active_eligible_listing_count_before: 1,
  };
}

function resolveSelectedCandidateStorefront(entry = {}) {
  const evidence = entry.evidence ?? {};
  const provider = normalizeProvider(evidence.provider);
  return resolveMarketplaceStorefrontEvidence({
    source: provider,
    raw: {
      provider,
      storefront_id: evidence.storefront_id,
      storefront_name: evidence.storefront_name,
      storefront_identity_source: evidence.storefront_identity_source,
    },
  });
}

function sanitizeCounts(counts) {
  if (!counts || typeof counts !== "object") return null;
  const value = Object.fromEntries(COUNT_KEYS.map((key) => [key, Number(counts[key])]));
  return Object.values(value).every((entry) => Number.isInteger(entry) && entry >= 0) ? value : null;
}

function normalizeProvider(value) {
  const provider = text(value, 64).toLowerCase();
  if (["rakuten", "rakuten_ichiba"].includes(provider)) return "rakuten_ichiba";
  if (["yahoo", "yahoo_shopping"].includes(provider)) return "yahoo_shopping";
  return provider;
}

function text(value, limit) { return String(value ?? "").normalize("NFKC").replace(CONTROL, "").replace(/\s+/g, " ").trim().slice(0, limit); }
function md(value) { return text(value, 300).replace(/[|\r\n]+/g, " "); }
