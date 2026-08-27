import crypto from "node:crypto";
import { stableId } from "../fetchers/feed-source-utils.js";
import { buildMarketplaceListingId, canonicalMarketplaceSource, persistMarketCanary } from "./market-canary-write.js";
import { sanitizeMarketPublicUrl } from "./market-candidate-key.js";
import { normalizeMarketplaceStatus } from "./market-status.js";

export const SERIES_COMPLETE_SET_CANARY_CONFIRMATION_PREFIX = "APPROVE_SERIES_COMPLETE_SET_CANARY";
export const SERIES_COMPLETE_SET_CANARY_MAX_CANDIDATES = 1;

const SHA = /^[0-9a-f]{40}$/;
const RUN_ID = /^\d+$/;
const PROVIDERS = new Set(["rakuten_ichiba", "yahoo_shopping"]);
const STATUSES = new Set(["active", "sold", "sold_out"]);

export function buildSeriesCompleteSetReadiness({ diagnostic, auditRunId, headSha, productionCountsBefore = null, productionCountsAfter = null } = {}) {
  const source = validateDiagnostic(diagnostic, auditRunId, headSha);
  const accepted = source.accepted_preview.map(normalizeCandidate).filter(Boolean);
  const uniqueBySeries = new Map();
  for (const candidate of accepted.sort(compareCandidate)) {
    if (!uniqueBySeries.has(candidate.series_id)) uniqueBySeries.set(candidate.series_id, candidate);
  }
  const selected = [...uniqueBySeries.values()][0] ?? null;
  const countsEqual = productionCountsBefore && productionCountsAfter && canonical(productionCountsBefore) === canonical(productionCountsAfter);
  const blockers = [];
  if (!countsEqual) blockers.push("production_zero_delta_unverified");
  if (!selected) blockers.push("no_safe_series_complete_set_candidate");
  const report = {
    schema_version: 1,
    kind: "series_complete_set_canary_readiness",
    workflow: { audit_run_id: String(auditRunId), head_sha: headSha },
    source_diagnostic: { kind: source.kind, complete_set_accepted_count: source.complete_set_accepted_count, unique_series_with_complete_set_evidence: source.unique_series_with_complete_set_evidence },
    accepted_complete_set_candidate_count: accepted.length,
    unique_series_count: uniqueBySeries.size,
    selected_candidate_count: selected ? 1 : 0,
    selected_candidate: selected,
    candidate_preview: [...uniqueBySeries.values()].map(sanitizeCandidate),
    production_counts_before: productionCountsBefore,
    production_counts_after: productionCountsAfter,
    expected_operations: selected ? { market_listings: "insert_or_update:1", market_listing_observations: "insert_or_update:1", ingestion_runs: 0, import_issues: 0, variants: 0 } : { market_listings: 0, market_listing_observations: 0, ingestion_runs: 0, import_issues: 0, variants: 0 },
    database_writes: 0,
    blockers,
    canary_eligible: blockers.length === 0,
    write_eligible: false,
  };
  report.canonical_digest = digest(report);
  return report;
}

export function expectedSeriesCompleteSetCanaryApproval({ headSha, readinessDigest, candidateDigest } = {}) {
  return `${SERIES_COMPLETE_SET_CANARY_CONFIRMATION_PREFIX}:${headSha}:${readinessDigest}:${candidateDigest}`;
}

export function validateSeriesCompleteSetCanaryInvocation({ eventName, ref, expectedMainSha, headSha, originMainSha, readiness, readinessDigest, approval } = {}) {
  if (eventName !== "workflow_dispatch" || ref !== "refs/heads/main") throw new Error("Series complete-set canary requires workflow_dispatch on main.");
  if (!SHA.test(String(expectedMainSha)) || expectedMainSha !== headSha || headSha !== originMainSha) throw new Error("Series complete-set canary main SHA is not exactly approved.");
  if (!readiness?.canary_eligible || readiness?.selected_candidate_count !== 1 || readiness?.database_writes !== 0 || readiness?.workflow?.head_sha !== headSha) throw new Error("Series complete-set readiness is not eligible.");
  if (readiness.canonical_digest !== readinessDigest || digest(readiness) !== readinessDigest) throw new Error("Series complete-set readiness digest is invalid.");
  const candidate = normalizeCandidate(readiness.selected_candidate);
  if (!candidate || approval !== expectedSeriesCompleteSetCanaryApproval({ headSha, readinessDigest, candidateDigest: candidate.canonical_digest })) throw new Error("Series complete-set canary approval is invalid.");
  return candidate;
}

export function buildSeriesCompleteSetCanaryRows({ candidate: input, readiness, workflow, observedAt = new Date() } = {}) {
  const candidate = normalizeCandidate(input);
  if (!candidate || readiness?.selected_candidate?.canonical_digest !== candidate.canonical_digest || readiness?.canary_eligible !== true) throw new Error("Series complete-set canary candidate is invalid.");
  const observed = new Date(observedAt);
  if (!Number.isFinite(observed.getTime())) throw new Error("Series complete-set canary observation time is invalid.");
  const source = canonicalMarketplaceSource(candidate.provider);
  const sourceUrl = sanitizeMarketPublicUrl(candidate.source_url);
  const listingId = buildMarketplaceListingId({ provider: candidate.provider, sourceListingId: candidate.source_listing_id, publicUrl: sourceUrl, title: candidate.title });
  if (!source || !sourceUrl || !listingId || !STATUSES.has(candidate.status)) throw new Error("Series complete-set marketplace identity is invalid.");
  const marker = {
    execution_path: "series-complete-set-canary",
    audit_run_id: readiness.workflow.audit_run_id,
    readiness_digest: readiness.canonical_digest,
    candidate_digest: candidate.canonical_digest,
    workflow_run_id: clean(workflow?.run_id),
    workflow_run_attempt: clean(workflow?.run_attempt),
    head_sha: clean(workflow?.head_sha),
  };
  if (!RUN_ID.test(marker.workflow_run_id) || !RUN_ID.test(marker.workflow_run_attempt) || !SHA.test(marker.head_sha)) throw new Error("Series complete-set canary workflow identity is invalid.");
  const safety = { accepted: true, review_required: false, reason: candidate.reason, series_id: candidate.series_id, variant_id: null, matched_variant_id: null, listing_type: "complete_set", market_review_type: "full_set", confidence: candidate.confidence };
  const raw = { provider: candidate.provider, source_listing_id: candidate.source_listing_id, public_url: sourceUrl, market_safety_assessed: true, market_safety: safety, series_complete_set_canary: marker, canary_audit_run_id: readiness.workflow.audit_run_id, canary_candidate_key: candidate.canary_candidate_key };
  const listingRow = { id: listingId, variant_id: null, matched_variant_id: null, series_id: candidate.series_id, title: candidate.title, listing_type: "complete_set", market_review_type: "full_set", classification_reason: candidate.reason, classification_confidence: candidate.confidence, classification_details: { market_safety: safety }, price: candidate.price, status: candidate.status, source, source_type: "marketplace", source_url: sourceUrl, listed_at: observed.toISOString(), sold_at: candidate.status === "sold" ? observed.toISOString() : null, last_observed_at: observed.toISOString(), confidence: candidate.confidence, review_required: false, raw };
  const observationRow = { id: stableId("market-series-complete-set-canary-observation", marker.audit_run_id, marker.readiness_digest, candidate.canonical_digest, listingId), listing_id: listingId, variant_id: null, series_id: candidate.series_id, price: candidate.price, status: candidate.status, source, observed_at: observed.toISOString(), raw: { series_complete_set_canary: marker, canary_audit_run_id: readiness.workflow.audit_run_id, canary_candidate_key: candidate.canary_candidate_key } };
  return { candidate, listingRows: [listingRow], observationRows: [observationRow], marker };
}

export function assertSeriesCompleteSetCanaryPrewrite({ rows, sourceUrlRows = [] } = {}) {
  const listing = rows?.listingRows?.[0];
  const observation = rows?.observationRows?.[0];
  if (!listing || !observation || listing.variant_id !== null || listing.matched_variant_id !== null || observation.variant_id !== null || listing.listing_type !== "complete_set" || listing.market_review_type !== "full_set") throw new Error("Series complete-set canary scope is invalid.");
  if (sourceUrlRows.some((row) => row.id !== listing.id || row.variant_id != null || row.matched_variant_id != null)) throw new Error("Series complete-set canary identity conflicts with variant evidence.");
  return true;
}

export async function persistSeriesCompleteSetCanary({ rows, store, onStage } = {}) {
  if (rows?.listingRows?.length !== 1 || rows?.observationRows?.length !== 1) throw new Error("Series complete-set canary is limited to one series.");
  return persistMarketCanary({ listingRows: rows.listingRows, observationRows: rows.observationRows, store, onStage });
}

export function renderSeriesCompleteSetReadinessMarkdown(report = {}) {
  return ["# Series complete-set bounded canary readiness", "", `- Audit run: ${report.workflow?.audit_run_id ?? "none"}`, `- Head SHA: ${report.workflow?.head_sha ?? "none"}`, `- Accepted complete-set candidates: ${report.accepted_complete_set_candidate_count ?? 0}`, `- Unique series: ${report.unique_series_count ?? 0}`, `- Selected candidate: ${report.selected_candidate?.series_id ?? "none"}`, `- Canary eligible: ${report.canary_eligible === true}`, "- Database writes: 0", `- Canonical digest: ${report.canonical_digest ?? "none"}`, "", "## Blocking reasons", ...(report.blockers ?? []).map((reason) => `- ${reason}`), ""].join("\n");
}

function validateDiagnostic(diagnostic, auditRunId, headSha) {
  if (diagnostic?.kind !== "series_complete_set_read_only_diagnostic" || diagnostic?.workflow?.run_id !== String(auditRunId) || diagnostic?.workflow?.head_sha !== headSha || diagnostic?.database_writes !== 0 || diagnostic?.zero_delta_verified !== true || diagnostic?.canary_eligible !== false || diagnostic?.write_eligible !== false) throw new Error("Series complete-set source diagnostic is not an authoritative read-only result.");
  if (!Array.isArray(diagnostic.accepted_preview) || Number(diagnostic.complete_set_accepted_count) !== diagnostic.accepted_preview.length) throw new Error("Series complete-set source diagnostic candidates are incomplete.");
  return diagnostic;
}

function normalizeCandidate(value) {
  const source = clean(value?.source ?? value?.provider).toLowerCase();
  const provider = source === "rakuten" ? "rakuten_ichiba" : source === "yahoo" ? "yahoo_shopping" : source;
  const sourceListingId = clean(value?.source_listing_id || value?.listing_id);
  const sourceUrl = sanitizeMarketPublicUrl(value?.source_url);
  const candidate = { series_id: clean(value?.series_id), series_name: clean(value?.series_name), provider, source_listing_id: sourceListingId, source_url: sourceUrl, title: clean(value?.title), price: Number(value?.price), status: normalizeMarketplaceStatus(value?.status), confidence: Number(value?.confidence), reason: clean(value?.reason), listing_type: value?.listing_type, market_review_type: value?.market_review_type, formal_lineup_count: Number(value?.formal_lineup_count), detected_complete_count: value?.detected_complete_count == null ? null : Number(value.detected_complete_count) };
  if (!candidate.series_id || !candidate.series_name || !PROVIDERS.has(provider) || !sourceListingId || !sourceUrl || !candidate.title || !Number.isFinite(candidate.price) || candidate.price <= 0 || !STATUSES.has(candidate.status) || !Number.isFinite(candidate.confidence) || candidate.confidence < 0.8 || candidate.reason !== "series_complete_set_confirmed" || candidate.listing_type !== "complete_set" || candidate.market_review_type !== "full_set" || candidate.formal_lineup_count < 2) return null;
  candidate.canonical_digest = digest(candidate);
  candidate.canary_candidate_key = candidate.canonical_digest.slice(0, 16);
  return candidate;
}

function sanitizeCandidate(candidate) { return candidate ? { series_id: candidate.series_id, series_name: candidate.series_name, provider: candidate.provider, source_listing_id: candidate.source_listing_id, source_url: candidate.source_url, price: candidate.price, status: candidate.status, confidence: candidate.confidence, reason: candidate.reason, formal_lineup_count: candidate.formal_lineup_count, detected_complete_count: candidate.detected_complete_count, canonical_digest: candidate.canonical_digest } : null; }
function compareCandidate(left, right) { return right.confidence - left.confidence || right.formal_lineup_count - left.formal_lineup_count || left.series_id.localeCompare(right.series_id, "en") || left.source_listing_id.localeCompare(right.source_listing_id, "en"); }
function digest(value) { const copy = structuredClone(value); delete copy.canonical_digest; return crypto.createHash("sha256").update(canonical(copy), "utf8").digest("hex"); }
function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function clean(value) { return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim(); }
