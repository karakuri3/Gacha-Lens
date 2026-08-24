import crypto from "node:crypto";
import { stableId } from "../fetchers/feed-source-utils.js";
import { AUTOMATIC_INGESTION_ROLLOUT_REASON_CODES, evaluateAutomaticMarketCandidate } from "./automatic-ingestion-rollout.js";
import { buildMarketCandidateKey, sanitizeMarketPublicUrl } from "./market-candidate-key.js";
import {
  buildMarketplaceListingId,
  canonicalMarketplaceSource,
} from "./market-canary-write.js";
import { normalizeMarketplaceStatus } from "./market-status.js";
import { buildManualMarketBoundedFailureDiagnostic } from "./manual-market-bounded-diagnostics.js";
import { sanitizeMarketplaceAffiliateProvenance } from "./market-affiliate-provenance.js";
import { isNonAuthoritativeManualMarketAudit } from "./manual-market-audit-diagnostic.js";
import {
  MARKET_BOUNDED_PERSISTENCE_HARD_CAP,
  selectDeterministicMarketPersistenceCandidates,
} from "./market-bounded-selection.js";
import {
  marketBoundedCoverageSnapshotsEqual,
  validateMarketBoundedCoverageSnapshot,
} from "./market-bounded-coverage.js";

export const MARKET_BOUNDED_RESULT_STATUSES = Object.freeze([
  "blocked", "no-op", "succeeded", "failed", "rolled-back", "rollback-failed",
]);

export const MARKET_BOUNDED_REASON_CODES = Object.freeze([
  "bounded_persistence_not_enabled",
  "bounded_approval_missing",
  "bounded_approval_mismatch",
  "bounded_audit_missing",
  "bounded_audit_digest_mismatch",
  "bounded_plan_missing",
  "bounded_plan_digest_mismatch",
  "bounded_plan_expired",
  "bounded_candidate_set_mismatch",
  "bounded_candidate_not_safe",
  "bounded_candidate_identity_mismatch",
  "bounded_coverage_snapshot_mismatch",
  "bounded_preflight_changed",
  "bounded_idempotency_conflict",
  "bounded_listing_write_failed",
  "bounded_observation_write_failed",
  "bounded_verification_failed",
  "bounded_rollback_failed",
]);

const CANDIDATE_KEY = /^[0-9a-f]{16}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const HEAD_SHA = /^[0-9a-f]{40}$/;
const DURABLE_RUN_NAMESPACES = Object.freeze({
  manual: "market-bounded-manual-run",
  scheduled: "market-bounded-scheduled-run",
});
const MAX_CANDIDATES = MARKET_BOUNDED_PERSISTENCE_HARD_CAP;
export const MARKET_BOUNDED_PERSISTENCE_POLICIES = Object.freeze({
  p1: Object.freeze({ name: "p1-bounded", max_candidates: MARKET_BOUNDED_PERSISTENCE_HARD_CAP, insert_only: false }),
  p3_seed_v1: Object.freeze({ name: "p3-bounded-seed-v1", max_candidates: 5, insert_only: true }),
  p3_seed_v2: Object.freeze({ name: "p3-bounded-seed-v2", max_candidates: 25, insert_only: true }),
});
const MAX_PLAN_AGE_MS = 15 * 60 * 1000;
const COUNT_KEYS = Object.freeze([
  "market_listings",
  "market_listing_observations",
  "import_issues",
  "ingestion_runs",
  "review_required",
  "series",
  "variants",
  "stock_reports",
  "restock_events",
]);
const LISTING_VERIFY_FIELDS = Object.freeze([
  "id", "variant_id", "matched_variant_id", "series_id", "listing_type", "price", "status",
  "source", "source_type", "source_url", "confidence", "review_required", "raw",
]);
const OBSERVATION_VERIFY_FIELDS = Object.freeze([
  "id", "listing_id", "variant_id", "series_id", "price", "status", "source", "observed_at", "raw",
]);
const DURABLE_RUN_VERIFY_FIELDS = Object.freeze([
  "id", "task", "status", "trigger_source", "started_at", "finished_at", "duration_ms", "summary", "error_message",
]);
const SEMANTIC_TIMESTAMP_FIELDS = Object.freeze({
  market_listing_observations: new Set(["observed_at"]),
  ingestion_runs: new Set(["started_at", "finished_at"]),
});
const VERIFICATION_FIELDS = Object.freeze({
  market_listings: new Set(LISTING_VERIFY_FIELDS),
  market_listing_observations: new Set(OBSERVATION_VERIFY_FIELDS),
  ingestion_runs: new Set(DURABLE_RUN_VERIFY_FIELDS),
  counts: new Set(COUNT_KEYS),
});
const VERIFICATION_MISMATCH_REASONS = new Set([
  "missing_row", "field_mismatch", "count_delta_mismatch",
]);
const ERROR_CATEGORIES = new Set([
  "safety_gate", "identity", "budget", "idempotency", "listing_write", "observation_write",
  "verification", "rollback", "durable_log", "database", "unknown",
]);

export class MarketBoundedWriteError extends Error {
  constructor(reasonCode, category = "safety_gate", message = reasonCode, diagnostic = null, verificationDiagnostic = null) {
    super(message);
    this.name = "MarketBoundedWriteError";
    this.reason_code = MARKET_BOUNDED_REASON_CODES.includes(reasonCode) ? reasonCode : "bounded_verification_failed";
    this.category = ERROR_CATEGORIES.has(category) ? category : "unknown";
    this.identity_diagnostic = sanitizeBoundedIdentityDiagnostic(diagnostic);
    this.verification_diagnostic = sanitizeBoundedVerificationDiagnostic(verificationDiagnostic);
  }
}

export function buildMarketBoundedDurableRunId({
  execution_path,
  workflow_run_id,
  workflow_run_attempt,
  plan_digest,
} = {}) {
  const namespace = DURABLE_RUN_NAMESPACES[execution_path];
  const runId = String(workflow_run_id ?? "").trim();
  const runAttempt = String(workflow_run_attempt ?? "").trim();
  const planDigest = String(plan_digest ?? "").trim().toLowerCase();
  if (!namespace || !runId || !runAttempt || !SHA256.test(planDigest)) {
    throw new Error("Market bounded durable run identity is invalid.");
  }

  const digest = crypto
    .createHash("sha256")
    .update(JSON.stringify(["gacha-lens", namespace, runId, runAttempt, planDigest]), "utf8")
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));

  // RFC 9562 UUID version 8 with the RFC variant bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export function canonicalizeBoundedMarketplaceUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const original = new URL(raw);
    if (original.username || original.password) return null;
    const sanitized = sanitizeMarketPublicUrl(raw);
    if (!sanitized) return null;
    const url = new URL(sanitized);
    url.search = "";
    url.hash = "";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return null;
  }
}

export function resolveBoundedMarketplaceIdentity(row = {}) {
  const source = cleanText(row.source, 80).toLowerCase();
  const expectedProvider = source === "rakuten"
    ? "rakuten_ichiba"
    : source === "yahoo_shopping"
      ? "yahoo_shopping"
      : "";
  const providers = [];
  const externalIds = [];
  const publicUrls = [row.source_url];
  const visited = new Set();
  let current = row.raw;
  let depth = 0;
  let chainInvalid = false;

  while (plainObject(current)) {
    if (visited.has(current) || depth >= 128) {
      chainInvalid = true;
      break;
    }
    visited.add(current);
    providers.push(current.provider);
    externalIds.push(current.source_listing_id, current.listing_id);
    if (expectedProvider === "rakuten_ichiba") externalIds.push(current.itemCode);
    if (expectedProvider === "yahoo_shopping") externalIds.push(current.code);
    publicUrls.push(current.public_url, current.source_url);
    current = current.raw;
    depth += 1;
  }
  if (current !== undefined && current !== null && !plainObject(current)) chainInvalid = true;

  const providerValues = uniqueRequiredValues(providers);
  const externalIdValues = uniqueRequiredValues(externalIds);
  const providedPublicUrls = uniqueRequiredValues(publicUrls);
  const normalizedPublicUrls = providedPublicUrls.map(canonicalizeBoundedMarketplaceUrl);
  const publicUrlInvalid = normalizedPublicUrls.some((value) => !value);
  const publicUrlValues = uniqueRequiredValues(normalizedPublicUrls);
  const provider = providerValues.length === 1 ? providerValues[0] : "";
  const sourceListingId = externalIdValues.length === 1 ? externalIdValues[0] : "";
  const publicUrl = publicUrlValues.length === 1 ? publicUrlValues[0] : "";
  const derivedId = provider && sourceListingId && publicUrl
    ? buildMarketplaceListingId({ provider, sourceListingId, publicUrl })
    : "";
  const conflicts = {
    provider: providerValues.length > 1,
    source_listing_id: externalIdValues.length > 1,
    public_url: publicUrlInvalid || publicUrlValues.length > 1,
    raw_chain: chainInvalid,
  };
  return {
    provider,
    source,
    sourceListingId,
    publicUrl,
    derivedId,
    depth,
    conflicts,
    complete: Boolean(
      expectedProvider
      && provider === expectedProvider
      && source === canonicalMarketplaceSource(provider)
      && sourceListingId
      && publicUrl
      && derivedId
      && !Object.values(conflicts).some(Boolean)
    ),
  };
}

export function sanitizeBoundedIdentityDiagnostic(value) {
  if (!plainObject(value)) return null;
  const candidateKey = CANDIDATE_KEY.test(String(value.candidate_key ?? "")) ? String(value.candidate_key) : null;
  const conflictFields = new Set(["provider", "source", "source_listing_id", "public_url", "listing_id", "variant_id", "series_id", "raw_chain", "unknown"]);
  const conflictField = conflictFields.has(value.conflict_field) ? value.conflict_field : "unknown";
  const provider = ["rakuten_ichiba", "yahoo_shopping"].includes(value.provider) ? value.provider : null;
  return {
    candidate_key: candidateKey,
    conflict_field: conflictField,
    provider,
    listing_id: cleanText(value.listing_id, 180) || null,
  };
}

export function sanitizeBoundedVerificationDiagnostic(value) {
  if (!plainObject(value)) return null;
  const table = String(value.table ?? "");
  const field = String(value.field ?? "");
  const mismatchReason = String(value.mismatch_reason ?? "");
  if (!VERIFICATION_FIELDS[table]?.has(field) || !VERIFICATION_MISMATCH_REASONS.has(mismatchReason)) return null;
  return { table, field, mismatch_reason: mismatchReason };
}

export function calculateMarketAuditDigest(bytes) {
  if (!Buffer.isBuffer(bytes) && typeof bytes !== "string") throw fail("bounded_audit_missing", "identity");
  return sha256(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, "utf8"));
}

export function canonicalJson(value) {
  return JSON.stringify(sortCanonical(value));
}

export function calculateMarketBoundedPlanDigest(plan) {
  if (!plainObject(plan)) throw fail("bounded_plan_missing", "identity");
  const value = structuredClone(plan);
  delete value.plan_digest;
  return sha256(Buffer.from(canonicalJson(value), "utf8"));
}

export function bindMarketBoundedPlanIdentity(plan, options = {}) {
  if (!plainObject(plan)) throw fail("bounded_plan_missing", "identity");
  const auditDigest = String(options.audit_digest ?? "").trim().toLowerCase();
  if (!SHA256.test(auditDigest)) throw fail("bounded_audit_missing", "identity");
  const generated = validDate(options.generated_at ?? plan.generated_at);
  if (!generated) throw fail("bounded_plan_missing", "identity");
  const expires = validDate(options.expires_at ?? new Date(generated.getTime() + MAX_PLAN_AGE_MS));
  if (!expires || expires <= generated) throw fail("bounded_plan_missing", "identity");
  const bound = {
    ...structuredClone(plan),
    generated_at: generated.toISOString(),
    expires_at: expires.toISOString(),
    audit_digest: auditDigest,
    selected_candidate_keys: [...(plan.selected_candidate_keys ?? [])],
  };
  bound.plan_digest = calculateMarketBoundedPlanDigest(bound);
  return bound;
}

export function expectedMarketBoundedApproval(policyDigest, headSha) {
  return `APPROVE_MARKET_BOUNDED:${policyDigest}:${headSha}`;
}

export function validateMarketBoundedArmingGate(input = {}) {
  const policyDigest = String(input.policy_digest ?? "");
  const headSha = String(input.head_sha ?? "");
  const approval = String(input.bounded_approval ?? "").trim();
  let reasonCode = null;
  if (input.simulation === true) reasonCode = "bounded_persistence_not_enabled";
  else if (input.event_name !== "schedule" || input.ref !== "refs/heads/main" || input.main_sha_verified !== true
    || input.task !== "market" || input.schedule !== "17,47 * * * *" || input.stage !== "market-bounded") {
    reasonCode = "bounded_persistence_not_enabled";
  } else if (String(input.automatic_write_enabled) !== "true" || String(input.bounded_persistence_enabled) !== "true") {
    reasonCode = "bounded_persistence_not_enabled";
  } else if (!approval) reasonCode = "bounded_approval_missing";
  else if (!SHA256.test(policyDigest) || !HEAD_SHA.test(headSha)
    || approval !== expectedMarketBoundedApproval(policyDigest, headSha)) reasonCode = "bounded_approval_mismatch";
  return {
    ok: reasonCode === null,
    reason_code: reasonCode,
    bounded_persistence_enabled: String(input.bounded_persistence_enabled) === "true",
    bounded_approval_valid: reasonCode === null,
    persistence_authorized: reasonCode === null,
  };
}

export function validateMarketBoundedPlanIdentity(input = {}) {
  const auditBytes = input.audit_bytes;
  const audit = input.audit;
  const plan = input.plan;
  if (!auditBytes || !plainObject(audit)) throw fail("bounded_audit_missing", "identity");
  if (isNonAuthoritativeManualMarketAudit(audit)) throw fail("bounded_candidate_not_safe", "identity");
  if (!plainObject(plan)) throw fail("bounded_plan_missing", "identity");
  const auditDigest = calculateMarketAuditDigest(auditBytes);
  if (plan.audit_digest !== auditDigest) throw fail("bounded_audit_digest_mismatch", "identity");
  if (!SHA256.test(String(plan.plan_digest ?? "")) || calculateMarketBoundedPlanDigest(plan) !== plan.plan_digest) {
    throw fail("bounded_plan_digest_mismatch", "identity");
  }
  const workflow = input.workflow ?? {};
  const expectedEvent = input.simulation === true ? "workflow_dispatch" : "schedule";
  if (String(audit.workflow?.run_id) !== String(plan.source_run_id)
    || String(plan.source_run_id) !== String(workflow.run_id)
    || String(audit.workflow?.run_attempt) !== String(workflow.run_attempt)
    || String(audit.workflow?.head_sha) !== String(plan.head_sha)
    || String(plan.head_sha) !== String(workflow.head_sha)
    || audit.workflow?.event_name !== expectedEvent
    || workflow.event_name !== expectedEvent
    || plan.stage !== "market-bounded"
    || plan.policy_digest !== input.policy_digest) {
    throw fail("bounded_preflight_changed", "identity");
  }
  const generated = validDate(plan.generated_at);
  const expires = validDate(plan.expires_at);
  const now = validDate(input.now ?? new Date());
  if (!generated || !expires || !now || now < generated || expires - generated !== MAX_PLAN_AGE_MS || now > expires) {
    throw fail("bounded_plan_expired", "identity");
  }
  return { audit_digest: auditDigest, plan_digest: plan.plan_digest, expires_at: plan.expires_at };
}

export function selectExactMarketBoundedCandidates(audit, plan, coverageSnapshot) {
  const candidates = Array.isArray(audit?.candidates) ? audit.candidates : [];
  const keys = candidates.map((candidate) => String(candidate?.candidate_key ?? ""));
  if (keys.some((key) => !CANDIDATE_KEY.test(key)) || new Set(keys).size !== keys.length) {
    throw fail("bounded_candidate_set_mismatch", "identity");
  }
  for (const candidate of candidates) {
    if (buildMarketCandidateKey(candidate) !== candidate.candidate_key) {
      throw fail("bounded_candidate_identity_mismatch", "identity");
    }
  }
  const eligible = candidates.filter((candidate) => evaluateAutomaticMarketCandidate(candidate).eligible);
  const selectedKeys = Array.isArray(plan?.selected_candidate_keys) ? plan.selected_candidate_keys : [];
  let currentCoverage;
  try {
    currentCoverage = validateMarketBoundedCoverageSnapshot(coverageSnapshot);
    validateMarketBoundedCoverageSnapshot(plan?.coverage_snapshot);
  } catch {
    throw fail("bounded_coverage_snapshot_mismatch", "identity");
  }
  if (plan.coverage_snapshot_digest !== plan.coverage_snapshot.snapshot_digest
    || !marketBoundedCoverageSnapshotsEqual(plan.coverage_snapshot, currentCoverage)) {
    throw fail("bounded_coverage_snapshot_mismatch", "identity");
  }
  let recomputed;
  try {
    recomputed = selectDeterministicMarketPersistenceCandidates({
      candidates: eligible,
      selectedVariants: audit?.selection?.selected_variants,
      coverageSnapshot: currentCoverage,
      capacity: MAX_CANDIDATES,
    });
  } catch {
    throw fail("bounded_candidate_set_mismatch", "identity");
  }
  if (selectedKeys.length > MAX_CANDIDATES || new Set(selectedKeys).size !== selectedKeys.length
    || selectedKeys.some((key) => !CANDIDATE_KEY.test(key))
    || canonicalJson(selectedKeys) !== canonicalJson(recomputed.selectedCandidateKeys)
    || Number(plan?.candidate_count) !== candidates.length
    || Number(plan?.total_candidate_count) !== candidates.length
    || Number(plan?.auto_eligible_count) !== eligible.length
    || Number(plan?.safe_candidate_count) !== eligible.length
    || Number(plan?.review_required_candidate_count) !== candidates.filter((candidate) => candidate.assessment?.review_required === true).length
    || Number(plan?.selected_for_persistence_count) !== recomputed.selectedCandidateKeys.length
    || Number(plan?.safe_not_selected_count) !== recomputed.safeNotSelectedCandidateKeys.length
    || Number(plan?.selected_distinct_variant_count) !== recomputed.selectedDistinctVariantCount
    || Number(plan?.selected_new_variant_count) !== recomputed.selectedNewVariantCount
    || Number(plan?.selected_previously_persisted_candidate_count) !== recomputed.selectedPreviouslyPersistedCandidateCount
    || Number(plan?.selected_variant_count) !== audit?.selection?.selected_variants?.length
    || canonicalJson(plan?.safe_not_selected_candidate_keys) !== canonicalJson(recomputed.safeNotSelectedCandidateKeys)
    || canonicalJson(plan?.safe_not_selected_candidates) !== canonicalJson(recomputed.safeNotSelectedCandidateKeys.map((candidateKey) => ({
      candidate_key: candidateKey,
      reason: "bounded_selection_capacity",
    })))) {
    throw fail("bounded_candidate_set_mismatch", "identity");
  }
  if (recomputed.selected.some((candidate) => !evaluateAutomaticMarketCandidate(candidate).eligible)) {
    throw fail("bounded_candidate_not_safe", "safety_gate");
  }
  return recomputed.selected;
}

export function buildMarketBoundedRows({ audit, plan, workflow, coverage_snapshot, observed_at = new Date() } = {}) {
  if (isNonAuthoritativeManualMarketAudit(audit)) throw fail("bounded_candidate_not_safe", "identity");
  const candidates = selectExactMarketBoundedCandidates(audit, plan, coverage_snapshot);
  const observed = validDate(observed_at);
  if (!observed) throw fail("bounded_candidate_not_safe", "safety_gate");
  const observedIso = observed.toISOString();
  const listingRows = [];
  const observationRows = [];
  for (const candidate of candidates) {
    const evaluation = evaluateAutomaticMarketCandidate(candidate);
    if (!evaluation.eligible || buildMarketCandidateKey(candidate) !== candidate.candidate_key) {
      throw fail("bounded_candidate_not_safe", "safety_gate");
    }
    const provider = candidate.source.provider;
    const source = canonicalMarketplaceSource(provider);
    const sourceUrl = sanitizeMarketPublicUrl(candidate.source.public_url);
    const affiliateDestination = candidate.source.affiliate_destination;
    const affiliateProvenance = affiliateDestination
      ? sanitizeMarketplaceAffiliateProvenance({
        provider,
        listingId: candidate.source.listing_id,
        publicUrl: sourceUrl,
        affiliateUrl: affiliateDestination.url,
        affiliateUrlSource: affiliateDestination.source,
        affiliateUrlContract: affiliateDestination.contract,
        sourceDocumentation: affiliateDestination.documentation,
      })
      : null;
    if (affiliateDestination && !affiliateProvenance) throw fail("bounded_candidate_identity_mismatch", "identity");
    const listingId = buildMarketplaceListingId({
      provider,
      sourceListingId: candidate.source.listing_id,
      publicUrl: sourceUrl,
      title: candidate.listing.title,
    });
    const status = normalizeMarketplaceStatus(candidate.listing.status);
    if (!source || !sourceUrl || !listingId || status !== "active") throw fail("bounded_candidate_identity_mismatch", "identity");
    const marker = {
      stage: "market-bounded",
      workflow_run_id: String(workflow.run_id),
      workflow_run_attempt: String(workflow.run_attempt),
      head_sha: String(workflow.head_sha),
      policy_digest: plan.policy_digest,
      audit_digest: plan.audit_digest,
      plan_digest: plan.plan_digest,
      candidate_key: candidate.candidate_key,
    };
    const marketSafety = {
      accepted: true,
      review_required: false,
      reason: candidate.assessment.reason,
      variant_id: candidate.target.variant_id,
      series_id: candidate.target.series_id,
      listing_type: "single",
      confidence: Number(candidate.assessment.confidence),
    };
    const listingRow = {
      id: listingId,
      variant_id: candidate.target.variant_id,
      matched_variant_id: candidate.target.variant_id,
      series_id: candidate.target.series_id,
      title: cleanText(candidate.listing.title, 300),
      listing_type: "single",
      market_review_type: "single",
      classification_reason: candidate.assessment.reason,
      classification_confidence: Number(candidate.assessment.confidence),
      classification_details: { market_safety: marketSafety },
      price: Number(candidate.listing.price),
      status,
      source,
      source_type: "marketplace",
      source_url: sourceUrl,
      listed_at: isoOrNull(candidate.listing.listed_at) ?? observedIso,
      sold_at: null,
      last_observed_at: observedIso,
      confidence: Number(candidate.assessment.confidence),
      review_required: false,
      raw: {
        provider,
        source_listing_id: cleanText(candidate.source.listing_id, 300),
        public_url: sourceUrl,
        ...(affiliateProvenance ? {
          affiliate_url: affiliateProvenance.url,
          affiliate_url_source: affiliateProvenance.source,
          affiliate_url_contract: affiliateProvenance.contract,
          source_documentation: affiliateProvenance.documentation,
        } : {}),
        query_text: cleanText(candidate.target.search_query, 300),
        query_variant_id: candidate.target.variant_id,
        query_series_id: candidate.target.series_id,
        market_safety_assessed: true,
        market_safety: marketSafety,
        automatic_rollout: marker,
      },
    };
    const observationRow = {
      id: stableId("market-bounded-observation", marker.workflow_run_id, marker.workflow_run_attempt, marker.policy_digest, marker.candidate_key, listingId),
      listing_id: listingId,
      variant_id: candidate.target.variant_id,
      series_id: candidate.target.series_id,
      price: Number(candidate.listing.price),
      status,
      source,
      observed_at: observedIso,
      raw: { automatic_rollout: marker },
    };
    if (JSON.stringify(listingRow).includes("canary_audit_run_id") || JSON.stringify(observationRow).includes("canary_candidate_key")) {
      throw fail("bounded_candidate_identity_mismatch", "identity");
    }
    listingRows.push(listingRow);
    observationRows.push(observationRow);
  }
  return { candidates, listingRows, observationRows };
}

export function planMarketBoundedOperations({
  listingRows = [],
  observationRows = [],
  existingListings = [],
  existingObservations = [],
  persistencePolicy = MARKET_BOUNDED_PERSISTENCE_POLICIES.p1,
} = {}) {
  assertRowCardinality(listingRows, observationRows, persistencePolicy);
  assertUniqueDatabaseRows(existingListings, listingRows, "market_listings");
  assertUniqueDatabaseRows(existingObservations, observationRows, "market_listing_observations");
  const existingListingById = new Map(existingListings.map((row) => [row.id, row]));
  const existingObservationById = new Map(existingObservations.map((row) => [row.id, row]));
  const listings = listingRows.map((row) => {
    const existing = existingListingById.get(row.id);
    if (!existing) return { id: row.id, operation: "insert", row };
    assertListingIdentity(existing, row);
    return { id: row.id, operation: equalFields(existing, row, LISTING_VERIFY_FIELDS, "market_listings") ? "unchanged" : "update", row };
  });
  const observations = observationRows.map((row) => {
    const existing = existingObservationById.get(row.id);
    if (!existing) return { id: row.id, operation: "insert", row };
    if (!equalFields(existing, row, OBSERVATION_VERIFY_FIELDS, "market_listing_observations")) throw fail("bounded_idempotency_conflict", "idempotency");
    return { id: row.id, operation: "unchanged", row };
  });
  return { listings, observations };
}

export async function persistMarketBounded({
  listingRows,
  observationRows,
  durableRunRow = null,
  durableRunId = durableRunRow?.id ?? null,
  buildDurableRunRow = null,
  store,
  onStage = () => {},
  persistencePolicy = MARKET_BOUNDED_PERSISTENCE_POLICIES.p1,
} = {}) {
  const persistenceContract = resolvePersistencePolicy(persistencePolicy);
  const maxCandidates = persistenceContract.max_candidates;
  assertRowCardinality(listingRows, observationRows, persistencePolicy);
  const listingIds = listingRows.map((row) => row.id);
  const observationIds = observationRows.map((row) => row.id);
  let beforeListings = [];
  let beforeObservations = [];
  let beforeDurableRows = [];
  let beforeCounts = {};
  let operations;
  let writeAttempted = false;
  let stage = "preflight";
  try {
    [beforeListings, beforeObservations, beforeDurableRows, beforeCounts] = await Promise.all([
      store.fetchRowsByIds("market_listings", listingIds),
      store.fetchRowsByIds("market_listing_observations", observationIds),
      durableRunId ? store.fetchRowsByIds("ingestion_runs", [durableRunId]) : Promise.resolve([]),
      store.fetchCounts(),
    ]);
    assertCompleteCounts(beforeCounts);
    operations = planMarketBoundedOperations({ listingRows, observationRows, existingListings: beforeListings, existingObservations: beforeObservations, persistencePolicy });
    if (persistenceContract.insert_only && [...operations.listings, ...operations.observations].some((entry) => entry.operation !== "insert")) {
      throw fail("bounded_preflight_changed", "idempotency");
    }
    if (buildDurableRunRow) {
      durableRunRow = buildDurableRunRow(operations);
      if (!durableRunRow || durableRunRow.id !== durableRunId) throw fail("bounded_preflight_changed", "durable_log");
    }
    const listingWrites = operations.listings.filter((entry) => entry.operation !== "unchanged").map((entry) => entry.row);
    const observationWrites = operations.observations.filter((entry) => entry.operation !== "unchanged").map((entry) => entry.row);
    if (listingWrites.length > maxCandidates || observationWrites.length > maxCandidates) throw fail("bounded_preflight_changed", "budget");
    stage = "listing_write";
    onStage(stage);
    if (listingWrites.length) {
      writeAttempted = true;
      await store.upsertRows("market_listings", listingWrites, { batchSize: 2, allowSchemaFallback: false });
      verifyRows(await store.fetchRowsByIds("market_listings", listingIds), listingRows, LISTING_VERIFY_FIELDS, "market_listings");
    }
    stage = "observation_write";
    onStage(stage);
    if (observationWrites.length) {
      writeAttempted = true;
      await store.upsertRows("market_listing_observations", observationWrites, { batchSize: 2, allowSchemaFallback: false });
    }
    const durableOperation = !durableRunRow ? "unchanged"
      : !beforeDurableRows.length ? "insert"
      : equalFields(beforeDurableRows[0], durableRunRow, Object.keys(durableRunRow), "ingestion_runs") ? "unchanged" : "update";
    if (durableRunRow && durableOperation !== "unchanged") {
      writeAttempted = true;
      await store.upsertRows("ingestion_runs", [durableRunRow], { batchSize: 1, allowSchemaFallback: false });
    }
    stage = "verification";
    onStage(stage);
    const [savedListings, savedObservations, afterCounts] = await Promise.all([
      store.fetchRowsByIds("market_listings", listingIds),
      store.fetchRowsByIds("market_listing_observations", observationIds),
      store.fetchCounts(),
    ]);
    verifyRows(savedListings, listingRows, LISTING_VERIFY_FIELDS, "market_listings");
    verifyRows(savedObservations, observationRows, OBSERVATION_VERIFY_FIELDS, "market_listing_observations");
    if (durableRunRow) verifyRows(await store.fetchRowsByIds("ingestion_runs", [durableRunRow.id]), [durableRunRow], Object.keys(durableRunRow), "ingestion_runs");
    operations.durable_run = durableOperation;
    const deltas = verifyBoundedCountDeltas(beforeCounts, afterCounts, operations);
    return { ok: true, operations, verification: { rows_verified: true, deltas_verified: true }, database_deltas: deltas, rollback: emptyRollback(), database_writes: listingWrites.length + observationWrites.length + (durableOperation === "unchanged" ? 0 : 1) };
  } catch (error) {
    const rollback = writeAttempted
      ? await rollbackMarketBounded({ store, listingRows, observationRows, durableRunRow, beforeListings, beforeObservations, beforeDurableRows, beforeCounts })
      : emptyRollback();
    const reason = rollback.attempted && !rollback.verified ? "bounded_rollback_failed" : mapStageReason(stage, error);
    const verificationDiagnostic = sanitizeBoundedVerificationDiagnostic(error?.verification_diagnostic);
    const wrapped = fail(reason, rollback.attempted ? "rollback" : error?.category, reason, null, verificationDiagnostic);
    wrapped.bounded_result = { ok: false, operations: operations ?? { listings: [], observations: [] }, verification: { rows_verified: false, deltas_verified: false }, verification_diagnostic: verificationDiagnostic, rollback, database_deltas: {}, database_writes: 0 };
    throw wrapped;
  }
}

export async function rollbackMarketBounded({ store, listingRows, observationRows, durableRunRow = null, beforeListings, beforeObservations, beforeDurableRows = [], beforeCounts } = {}) {
  const result = { attempted: true, verified: false, listings_deleted: 0, observations_deleted: 0, listings_restored: 0, observations_restored: 0 };
  try {
    const beforeListingIds = new Set(beforeListings.map((row) => row.id));
    const beforeObservationIds = new Set(beforeObservations.map((row) => row.id));
    const newObservationIds = observationRows.map((row) => row.id).filter((id) => !beforeObservationIds.has(id));
    const newListingIds = listingRows.map((row) => row.id).filter((id) => !beforeListingIds.has(id));
    result.observations_deleted = await store.deleteRowsByIds("market_listing_observations", newObservationIds, { batchSize: 2 });
    if (durableRunRow && !beforeDurableRows.length) await store.deleteRowsByIds("ingestion_runs", [durableRunRow.id], { batchSize: 1 });
    if (beforeDurableRows.length) await store.upsertRows("ingestion_runs", beforeDurableRows, { batchSize: 1, allowSchemaFallback: false });
    if (newListingIds.length && store.fetchObservationsByListingIds) {
      const references = await store.fetchObservationsByListingIds(newListingIds);
      if (references.some((row) => !newObservationIds.includes(row.id))) throw fail("bounded_rollback_failed", "rollback");
    }
    result.listings_deleted = await store.deleteRowsByIds("market_listings", newListingIds, { batchSize: 2 });
    if (beforeListings.length) await store.upsertRows("market_listings", beforeListings, { batchSize: 2, allowSchemaFallback: false });
    result.listings_restored = beforeListings.length;
    if (beforeObservations.length) await store.upsertRows("market_listing_observations", beforeObservations, { batchSize: 2, allowSchemaFallback: false });
    result.observations_restored = beforeObservations.length;
    const [restoredListings, restoredObservations, restoredDurableRows, restoredCounts] = await Promise.all([
      store.fetchRowsByIds("market_listings", listingRows.map((row) => row.id)),
      store.fetchRowsByIds("market_listing_observations", observationRows.map((row) => row.id)),
      durableRunRow ? store.fetchRowsByIds("ingestion_runs", [durableRunRow.id]) : Promise.resolve([]),
      store.fetchCounts(),
    ]);
    verifyRestoredRows(restoredListings, beforeListings, listingRows.map((row) => row.id));
    verifyRestoredRows(restoredObservations, beforeObservations, observationRows.map((row) => row.id));
    if (durableRunRow) verifyRestoredRows(restoredDurableRows, beforeDurableRows, [durableRunRow.id]);
    if (canonicalJson(restoredCounts) !== canonicalJson(beforeCounts)) throw fail("bounded_rollback_failed", "rollback");
    return { ...result, verified: true };
  } catch {
    return result;
  }
}

export function buildMarketBoundedResult(input = {}) {
  const operations = input.operations ?? { listings: [], observations: [] };
  const candidateRows = input.rows ?? { candidates: [], listingRows: [], observationRows: [] };
  const listingOps = new Map(operations.listings?.map((entry) => [entry.id, entry.operation]));
  const observationOps = new Map(operations.observations?.map((entry) => [entry.id, entry.operation]));
  const status = MARKET_BOUNDED_RESULT_STATUSES.includes(input.status) ? input.status : "blocked";
  return {
    schema_version: 1,
    workflow: sanitizeWorkflow(input.workflow),
    execution: {
      stage: "market-bounded",
      task: "market",
      schedule: input.schedule ?? "17,47 * * * *",
      automatic_write_enabled: input.automatic_write_enabled === true,
      bounded_persistence_enabled: input.bounded_persistence_enabled === true,
      bounded_approval_valid: input.bounded_approval_valid === true,
    },
    identity: {
      policy_digest: safeDigest(input.plan?.policy_digest),
      audit_digest: safeDigest(input.plan?.audit_digest),
      plan_digest: safeDigest(input.plan?.plan_digest),
      coverage_snapshot_digest: safeDigest(input.plan?.coverage_snapshot_digest),
      head_sha: safeHead(input.workflow?.head_sha),
    },
    candidates: candidateRows.candidates?.map((candidate, index) => ({
      candidate_key: candidate.candidate_key,
      provider: candidate.source.provider,
      variant_id: candidate.target.variant_id,
      variant_name: cleanText(candidate.target.variant_name, 160),
      series_id: candidate.target.series_id,
      listing_id: candidateRows.listingRows?.[index]?.id ?? null,
      price: Number(candidate.listing.price),
      status: normalizeMarketplaceStatus(candidate.listing.status),
      listing_operation: listingOps.get(candidateRows.listingRows?.[index]?.id) ?? "not_started",
      observation_operation: observationOps.get(candidateRows.observationRows?.[index]?.id) ?? "not_started",
      verified: input.verification?.rows_verified === true,
    })) ?? [],
    operations: operationCounts(operations),
    verification: {
      rows_verified: input.verification?.rows_verified === true,
      deltas_verified: input.verification?.deltas_verified === true,
    },
    rollback: sanitizeRollback(input.rollback),
    database_deltas: sanitizeDeltas(input.database_deltas),
    result: {
      status,
      reason_code: input.reason_code && [...MARKET_BOUNDED_REASON_CODES, ...AUTOMATIC_INGESTION_ROLLOUT_REASON_CODES].includes(input.reason_code) ? input.reason_code : null,
      error_category: input.error_category && ERROR_CATEGORIES.has(input.error_category) ? input.error_category : null,
      error_message: input.error_message ? sanitizedFailureMessage(input.reason_code, input.error_category) : null,
    },
    identity_diagnostic: sanitizeBoundedIdentityDiagnostic(input.identity_diagnostic),
    verification_diagnostic: sanitizeBoundedVerificationDiagnostic(input.verification_diagnostic),
    failure_diagnostic: input.failure_diagnostic
      ? buildManualMarketBoundedFailureDiagnostic(input.failure_diagnostic)
      : null,
    database_writes: Number(input.database_writes) || 0,
  };
}

export function renderMarketBoundedResultMarkdown(result) {
  return [
    "# Market bounded persistence result",
    "",
    `- Run: ${result.workflow.run_id || "unknown"}`,
    `- Status: ${result.result.status}`,
    `- Reason code: ${result.result.reason_code ?? "none"}`,
    `- Error category: ${result.result.error_category ?? "none"}`,
    `- Identity conflict: ${result.identity_diagnostic?.conflict_field ?? "none"}`,
    `- Verification table: ${result.verification_diagnostic?.table ?? "none"}`,
    `- Verification field: ${result.verification_diagnostic?.field ?? "none"}`,
    `- Verification mismatch: ${result.verification_diagnostic?.mismatch_reason ?? "none"}`,
    `- Failure checkpoint: ${result.failure_diagnostic?.checkpoint ?? "none"}`,
    `- Checkpoint reason code: ${result.failure_diagnostic?.checkpoint_reason_code ?? "none"}`,
    `- Upstream reason code: ${result.failure_diagnostic?.upstream_reason_code ?? "none"}`,
    `- Persistence invoked: ${result.failure_diagnostic?.persistence_invoked ?? false}`,
    `- Rollback attempted: ${result.failure_diagnostic?.rollback_attempted ?? false}`,
    `- Rollback verified: ${result.failure_diagnostic?.rollback_verified ?? false}`,
    `- Head SHA: ${result.identity.head_sha ?? "unknown"}`,
    `- Policy digest: ${result.identity.policy_digest ?? "unknown"}`,
    `- Audit digest: ${result.identity.audit_digest ?? "unknown"}`,
    `- Plan digest: ${result.identity.plan_digest ?? "unknown"}`,
    `- Coverage snapshot digest: ${result.identity.coverage_snapshot_digest ?? "unknown"}`,
    `- Candidates: ${result.candidates.length}`,
    `- Listing operations: ${sumOperations(result.operations, "listing")}`,
    `- Observation operations: ${sumOperations(result.operations, "observation")}`,
    `- Rows verified: ${result.verification.rows_verified}`,
    `- Deltas verified: ${result.verification.deltas_verified}`,
    `- Rollback: ${result.rollback.verified ? "verified" : result.rollback.attempted ? "failed" : "not attempted"}`,
    `- Production writes: ${result.database_writes}`,
    "",
  ].join("\n");
}

function resolvePersistencePolicy(policy) {
  if (policy === MARKET_BOUNDED_PERSISTENCE_POLICIES.p1) return MARKET_BOUNDED_PERSISTENCE_POLICIES.p1;
  if (policy === MARKET_BOUNDED_PERSISTENCE_POLICIES.p3_seed_v1) return MARKET_BOUNDED_PERSISTENCE_POLICIES.p3_seed_v1;
  if (policy === MARKET_BOUNDED_PERSISTENCE_POLICIES.p3_seed_v2) return MARKET_BOUNDED_PERSISTENCE_POLICIES.p3_seed_v2;
  throw fail("bounded_preflight_changed", "budget");
}

function assertRowCardinality(listingRows, observationRows, persistencePolicy) {
  const maxCandidates = resolvePersistencePolicy(persistencePolicy).max_candidates;
  if (!Array.isArray(listingRows) || !Array.isArray(observationRows)
    || listingRows.length !== observationRows.length || listingRows.length > maxCandidates) {
    throw fail("bounded_preflight_changed", "budget");
  }
}

function assertUniqueDatabaseRows(existingRows, desiredRows, table) {
  const desiredIds = new Set(desiredRows.map((row) => row.id));
  const seen = new Set();
  for (const row of existingRows) {
    if (!desiredIds.has(row.id) || seen.has(row.id)) throw fail("bounded_preflight_changed", "database", `${table} snapshot is incomplete.`);
    seen.add(row.id);
  }
}

function assertListingIdentity(existing, desired) {
  const left = resolveBoundedMarketplaceIdentity(existing);
  const right = resolveBoundedMarketplaceIdentity(desired);
  const conflictField = boundedIdentityConflictField(left, right, existing, desired);
  if (conflictField) {
    throw fail("bounded_candidate_identity_mismatch", "identity", "bounded_candidate_identity_mismatch", {
      candidate_key: desired?.raw?.automatic_rollout?.candidate_key,
      conflict_field: conflictField,
      provider: right.provider,
      listing_id: desired?.id,
    });
  }
}

function boundedIdentityConflictField(left, right, existing, desired) {
  if (left.conflicts.raw_chain || right.conflicts.raw_chain) return "raw_chain";
  if (!left.complete || !right.complete) {
    return ["provider", "source_listing_id", "public_url"].find((key) => left.conflicts[key] || right.conflicts[key]) ?? "unknown";
  }
  if (left.provider !== right.provider || left.source !== right.source) return "provider";
  if (left.sourceListingId !== right.sourceListingId) return "source_listing_id";
  if (left.publicUrl !== right.publicUrl) return "public_url";
  if (left.derivedId !== existing.id || right.derivedId !== desired.id || existing.id !== desired.id) return "listing_id";
  if (existing.variant_id !== desired.variant_id) return "variant_id";
  if (existing.series_id !== desired.series_id) return "series_id";
  return null;
}

function verifyBoundedCountDeltas(before, after, operations) {
  assertCompleteCounts(before);
  assertCompleteCounts(after);
  const deltas = Object.fromEntries(COUNT_KEYS.map((key) => [key, Number(after[key]) - Number(before[key])]));
  const expectedListings = operations.listings.filter((entry) => entry.operation === "insert").length;
  const expectedObservations = operations.observations.filter((entry) => entry.operation === "insert").length;
  const expectedRuns = operations.durable_run === "insert" ? 1 : 0;
  const expected = { market_listings: expectedListings, market_listing_observations: expectedObservations, ingestion_runs: expectedRuns };
  for (const [field, value] of Object.entries(expected)) {
    if (deltas[field] !== value) throw verificationFail("counts", field, "count_delta_mismatch");
  }
  for (const field of COUNT_KEYS.filter((key) => !(key in expected))) {
    if (deltas[field] !== 0) throw verificationFail("counts", field, "count_delta_mismatch");
  }
  return deltas;
}

function assertCompleteCounts(value) {
  if (!plainObject(value) || COUNT_KEYS.some((key) => !Number.isInteger(Number(value[key])) || Number(value[key]) < 0)) {
    throw fail("bounded_preflight_changed", "database");
  }
}

function verifyRows(actualRows, expectedRows, fields, table) {
  const actual = new Map(actualRows.map((row) => [row.id, row]));
  for (const row of expectedRows) {
    if (!actual.has(row.id)) throw verificationFail(table, "id", "missing_row");
    const saved = actual.get(row.id);
    for (const field of fields) {
      if (!equalField(saved?.[field] ?? null, row?.[field] ?? null, table, field)) {
        throw verificationFail(table, field, "field_mismatch");
      }
    }
  }
}

function verifyRestoredRows(actualRows, beforeRows, allIds) {
  const actual = new Map(actualRows.map((row) => [row.id, row]));
  const before = new Map(beforeRows.map((row) => [row.id, row]));
  for (const id of allIds) {
    if (!before.has(id) && actual.has(id)) throw fail("bounded_rollback_failed", "rollback");
    if (before.has(id) && canonicalJson(actual.get(id)) !== canonicalJson(before.get(id))) throw fail("bounded_rollback_failed", "rollback");
  }
}

function equalFields(left, right, fields, table) {
  return fields.every((field) => equalField(left?.[field] ?? null, right?.[field] ?? null, table, field));
}

function equalField(left, right, table, field) {
  if (!SEMANTIC_TIMESTAMP_FIELDS[table]?.has(field)) return canonicalJson(left) === canonicalJson(right);
  if (left === null && right === null) return true;
  if (left === null || right === null) return false;
  const leftDate = validDate(left);
  const rightDate = validDate(right);
  return Boolean(leftDate && rightDate && leftDate.getTime() === rightDate.getTime());
}

function verificationFail(table, field, mismatchReason) {
  return fail("bounded_verification_failed", "verification", "bounded_verification_failed", null, {
    table,
    field,
    mismatch_reason: mismatchReason,
  });
}

function operationCounts(operations) {
  const result = { listing_inserts: 0, listing_updates: 0, listing_unchanged: 0, observation_inserts: 0, observation_updates: 0, observation_unchanged: 0 };
  for (const entry of operations.listings ?? []) result[`listing_${entry.operation === "unchanged" ? "unchanged" : `${entry.operation}s`}`] += 1;
  for (const entry of operations.observations ?? []) result[`observation_${entry.operation === "unchanged" ? "unchanged" : `${entry.operation}s`}`] += 1;
  return result;
}

function emptyRollback() {
  return { attempted: false, verified: false, listings_deleted: 0, observations_deleted: 0, listings_restored: 0, observations_restored: 0 };
}

function sanitizeRollback(value) {
  const safe = value ?? emptyRollback();
  return {
    attempted: safe.attempted === true,
    verified: safe.verified === true,
    listings_deleted: nonnegative(safe.listings_deleted),
    observations_deleted: nonnegative(safe.observations_deleted),
    listings_restored: nonnegative(safe.listings_restored),
    observations_restored: nonnegative(safe.observations_restored),
  };
}

function sanitizeWorkflow(value = {}) {
  return {
    run_id: cleanText(value.run_id, 40),
    run_attempt: cleanText(value.run_attempt, 10),
    head_sha: safeHead(value.head_sha),
    event_name: cleanText(value.event_name, 40),
    ref: cleanText(value.ref, 120),
  };
}

function sanitizeDeltas(value = {}) {
  return Object.fromEntries(COUNT_KEYS.map((key) => [key, Number.isFinite(Number(value[key])) ? Number(value[key]) : 0]));
}

function sanitizePlanValue(value) {
  if (Array.isArray(value)) return value.map(sanitizePlanValue);
  if (!plainObject(value)) {
    if (typeof value === "number" && !Number.isFinite(value)) throw fail("bounded_plan_digest_mismatch", "identity");
    return value;
  }
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sanitizePlanValue(value[key])]));
}

function sortCanonical(value) {
  return sanitizePlanValue(value);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function safeDigest(value) {
  const text = String(value ?? "").toLowerCase();
  return SHA256.test(text) ? text : null;
}

function safeHead(value) {
  const text = String(value ?? "").toLowerCase();
  return HEAD_SHA.test(text) ? text : null;
}

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isoOrNull(value) {
  return validDate(value)?.toISOString() ?? null;
}

function cleanText(value, max = 300) {
  return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function sanitizedFailureMessage(reasonCode, category) {
  const safeReason = [...MARKET_BOUNDED_REASON_CODES, ...AUTOMATIC_INGESTION_ROLLOUT_REASON_CODES].includes(reasonCode)
    ? reasonCode
    : "bounded_verification_failed";
  const safeCategory = ERROR_CATEGORIES.has(category) ? category : "unknown";
  return cleanText(`Bounded persistence failed (${safeCategory}: ${safeReason}).`, 300);
}

function nonnegative(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueRequiredValues(values) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function mapStageReason(stage, error) {
  if (error?.reason_code && MARKET_BOUNDED_REASON_CODES.includes(error.reason_code)) return error.reason_code;
  if (stage === "listing_write") return "bounded_listing_write_failed";
  if (stage === "observation_write") return "bounded_observation_write_failed";
  return "bounded_verification_failed";
}

function fail(reasonCode, category = "safety_gate", message = reasonCode, diagnostic = null, verificationDiagnostic = null) {
  return new MarketBoundedWriteError(reasonCode, category, cleanText(message, 300), diagnostic, verificationDiagnostic);
}

function sumOperations(value, prefix) {
  return ["inserts", "updates", "unchanged"].reduce((sum, suffix) => sum + Number(value[`${prefix}_${suffix}`] ?? 0), 0);
}
