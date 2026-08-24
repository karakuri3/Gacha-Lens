import crypto from "node:crypto";
import { stableId } from "../fetchers/feed-source-utils.js";
import { buildMarketplaceListingId, canonicalMarketplaceSource } from "./market-canary-write.js";
import { canonicalizeBoundedMarketplaceUrl, persistMarketBounded } from "./market-bounded-write.js";
import { sanitizeMarketPublicUrl } from "./market-candidate-key.js";
import { normalizeMarketplaceStatus } from "./market-status.js";

export const P3_SEED_CANARY_CONFIRMATION = "APPROVE_ONE_P3_SEED_CANARY";
export const P3_SEED_CANARY_MIN_CONFIDENCE = 0.86;
export const P3_SEED_CANARY_MAX_CANDIDATES = 1;

const SOURCE_LISTING_ID = /^[a-z0-9][a-z0-9-]{0,80}:[a-z0-9][a-z0-9-]{0,120}$/i;

export function loadP3SeedCanaryTarget(value) {
  const target = typeof value === "string" ? JSON.parse(value) : value;
  if (!target || target.schema_version !== 1) throw new Error("P3 seed canary target config is invalid.");
  const required = ["variant_id", "series_id", "series_name", "variant_name", "provider", "source_listing_id", "public_url"];
  if (required.some((key) => !clean(target[key]))) throw new Error("P3 seed canary target config is incomplete.");
  if (target.provider !== "rakuten_ichiba" || !SOURCE_LISTING_ID.test(target.source_listing_id)) throw new Error("P3 seed canary target identity is invalid.");
  const publicUrl = canonicalizeBoundedMarketplaceUrl(target.public_url);
  if (!publicUrl) throw new Error("P3 seed canary target URL is invalid.");
  return { schema_version: 1, ...Object.fromEntries(required.map((key) => [key, clean(target[key])])), public_url: publicUrl };
}

export function p3SeedCanaryTargetDigest(target) {
  return crypto.createHash("sha256").update(JSON.stringify(loadP3SeedCanaryTarget(target)), "utf8").digest("hex");
}

export function validateP3SeedCanaryInvocation(input = {}) {
  if (input.event_name !== "workflow_dispatch" || input.ref !== "refs/heads/main") throw new Error("P3 seed canary requires workflow_dispatch on main.");
  if (input.confirmation !== P3_SEED_CANARY_CONFIRMATION) throw new Error("P3 seed canary confirmation is invalid.");
  const approved = String(input.expected_main_sha ?? "").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(approved) || approved !== String(input.head_sha ?? "").toLowerCase() || approved !== String(input.origin_main_sha ?? "").toLowerCase()) {
    throw new Error("P3 seed canary main SHA is not exactly approved.");
  }
  return true;
}

export function selectExactP3SeedCanaryCandidate(candidates = [], targetInput) {
  const target = loadP3SeedCanaryTarget(targetInput);
  const matches = candidates.filter((candidate) => exactIdentity(candidate, target));
  if (matches.length !== 1) throw new Error("P3 seed canary exact listing was not returned exactly once.");
  const candidate = matches[0];
  const checks = candidate.checks ?? {};
  if (
    normalizeMarketplaceStatus(candidate.listing?.status) !== "active"
    || candidate.listing?.listing_type !== "single"
    || candidate.assessment?.accepted !== true
    || candidate.assessment?.review_required !== false
    || candidate.assessment?.reason !== "variant_and_parent_evidence_confirmed"
    || Number(candidate.assessment?.confidence) < P3_SEED_CANARY_MIN_CONFIDENCE
    || checks.variant_evidence_present !== true
    || checks.parent_series_evidence_present !== true
    || checks.set_signal_detected === true
    || checks.multiple_variant_candidates === true
    || checks.explicit_variant_conflict === true
    || checks.explicit_label_unresolved === true
    || checks.parent_series_edition_conflict === true
  ) throw new Error("P3 seed canary live safety verification failed.");
  return candidate;
}

export function buildP3SeedCanaryRows({ candidate, target: targetInput, workflow, observed_at = new Date() } = {}) {
  const target = loadP3SeedCanaryTarget(targetInput);
  if (!exactIdentity(candidate, target)) throw new Error("P3 seed canary row identity is invalid.");
  const observed = new Date(observed_at);
  if (!Number.isFinite(observed.getTime())) throw new Error("P3 seed canary observation time is invalid.");
  const source = canonicalMarketplaceSource(target.provider);
  const sourceUrl = sanitizeMarketPublicUrl(target.public_url);
  const listingId = buildMarketplaceListingId({ provider: target.provider, sourceListingId: target.source_listing_id, publicUrl: sourceUrl, title: candidate.listing.title });
  if (!source || !sourceUrl || !listingId) throw new Error("P3 seed canary marketplace identity is invalid.");
  const marker = { execution_path: "p3-seed-canary", workflow_run_id: String(workflow.run_id), workflow_run_attempt: String(workflow.run_attempt), head_sha: String(workflow.head_sha), target_digest: p3SeedCanaryTargetDigest(target), candidate_key: candidate.candidate_key };
  const safety = { accepted: true, review_required: false, reason: candidate.assessment.reason, variant_id: target.variant_id, series_id: target.series_id, listing_type: "single", confidence: Number(candidate.assessment.confidence) };
  const listingRow = { id: listingId, variant_id: target.variant_id, matched_variant_id: target.variant_id, series_id: target.series_id, title: clean(candidate.listing.title), listing_type: "single", market_review_type: "single", classification_reason: candidate.assessment.reason, classification_confidence: Number(candidate.assessment.confidence), classification_details: { market_safety: safety }, price: Number(candidate.listing.price), status: "active", source, source_type: "marketplace", source_url: sourceUrl, listed_at: observed.toISOString(), sold_at: null, last_observed_at: observed.toISOString(), confidence: Number(candidate.assessment.confidence), review_required: false, raw: { provider: target.provider, source_listing_id: target.source_listing_id, public_url: sourceUrl, query_text: clean(candidate.target.search_query), query_variant_id: target.variant_id, query_series_id: target.series_id, market_safety_assessed: true, market_safety: safety, p3_seed_canary: marker } };
  const observationRow = { id: stableId("market-p3-seed-canary-observation", marker.workflow_run_id, marker.workflow_run_attempt, marker.target_digest, marker.candidate_key, listingId), listing_id: listingId, variant_id: target.variant_id, series_id: target.series_id, price: Number(candidate.listing.price), status: "active", source, observed_at: observed.toISOString(), raw: { p3_seed_canary: marker } };
  return { candidate, listingRows: [listingRow], observationRows: [observationRow], marker };
}

export async function persistP3SeedCanary({ rows, store, durableRunId, buildDurableRunRow }) {
  if (!rows || rows.listingRows?.length !== P3_SEED_CANARY_MAX_CANDIDATES || rows.observationRows?.length !== P3_SEED_CANARY_MAX_CANDIDATES) throw new Error("P3 seed canary write budget is invalid.");
  return persistMarketBounded({ listingRows: rows.listingRows, observationRows: rows.observationRows, durableRunId, buildDurableRunRow, store });
}

function exactIdentity(candidate = {}, target) {
  return candidate?.target?.variant_id === target.variant_id
    && candidate?.target?.series_id === target.series_id
    && candidate?.source?.provider === target.provider
    && candidate?.source?.listing_id === target.source_listing_id
    && canonicalizeBoundedMarketplaceUrl(candidate?.source?.public_url) === target.public_url;
}

function clean(value) { return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim(); }
