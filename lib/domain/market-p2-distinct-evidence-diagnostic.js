import { buildMarketCandidateKey, sanitizeMarketPublicUrl } from "./market-candidate-key.js";
import { MARKET_MAX_QUERY_ATTEMPTS_PER_ROOT } from "../fetchers/market-request-budget.js";
import { PRIORITY_TWO_DISTINCT_EVIDENCE_QUERY_PROFILE } from "../fetchers/market-p2-distinct-evidence-query-planner.js";

const CANDIDATE_KEY = /^[0-9a-f]{16}$/;
const CONTROL = /[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
const FORBIDDEN = /(authorization|token|secret|password|cookie|header|api.?key|access.?key|application.?id|affiliate.?id|raw|credential|seller|environment)/i;

export const PRIORITY_TWO_DISTINCT_EVIDENCE_KIND = "priority_2_distinct_evidence_read_only";

export function buildPriorityTwoDistinctEvidenceDiagnostic({ audit = {}, queryPlan = [], existingListings = [], before = null, after = null } = {}) {
  assertAuditContract(audit, queryPlan);
  if (!Array.isArray(existingListings)) throw new Error("Priority 2 existing listings are unavailable.");
  const existingByVariant = new Map();
  for (const listing of existingListings) {
    const variantId = text(listing?.matched_variant_id || listing?.variant_id, 140);
    if (!variantId) continue;
    if (!existingByVariant.has(variantId)) existingByVariant.set(variantId, []);
    existingByVariant.get(variantId).push(sanitizeExistingIdentity(listing));
  }

  const candidatesByVariant = new Map();
  for (const candidate of audit.candidates ?? []) {
    const variantId = text(candidate?.target?.variant_id, 140);
    if (!variantId) continue;
    if (!candidatesByVariant.has(variantId)) candidatesByVariant.set(variantId, []);
    candidatesByVariant.get(variantId).push(candidate);
  }

  const queriesByVariant = new Map(queryPlan.map((query) => [text(query?.variant_id, 140), query]));
  const variants = (audit.selection?.selected_variants ?? []).map((selected) => {
    const variantId = text(selected.variant_id, 140);
    const candidates = candidatesByVariant.get(variantId) ?? [];
    const existing = existingByVariant.get(variantId) ?? [];
    const accepted = candidates.filter((candidate) => candidate?.assessment?.accepted === true && candidate?.listing?.status === "active");
    const classified = accepted.map((candidate) => classifyAcceptedCandidate(candidate, existing));
    const acceptedExisting = classified.filter((entry) => entry.classification === "accepted_existing");
    const acceptedDistinct = classified.filter((entry) => entry.classification === "accepted_distinct");
    return {
      variant_id: variantId,
      series_id: text(selected.series_id, 140),
      series_name: text(selected.series_name, 220),
      variant_name: text(selected.variant_name, 180),
      priority: 2,
      existing_listing_identity: existing,
      queries_attempted: queryAttempts(queriesByVariant.get(variantId) ?? selected),
      results_by_provider: providerResults(audit.request_diagnostics, queriesByVariant.get(variantId) ?? selected),
      accepted_existing_count: acceptedExisting.length,
      accepted_distinct_count: acceptedDistinct.length,
      distinct_candidate_keys: acceptedDistinct.map((entry) => entry.candidate_key),
      accepted_existing: acceptedExisting,
      accepted_distinct: acceptedDistinct,
    };
  });

  const distinct = variants.flatMap((entry) => entry.accepted_distinct);
  const result = {
    schema_version: 1,
    kind: PRIORITY_TWO_DISTINCT_EVIDENCE_KIND,
    priority: 2,
    query_profile: PRIORITY_TWO_DISTINCT_EVIDENCE_QUERY_PROFILE,
    write_eligible: false,
    canary_eligible: false,
    database_writes: 0,
    zero_delta_verified: countsEqual(before, after),
    production_counts_before: sanitizeCounts(before),
    production_counts_after: sanitizeCounts(after),
    selection: {
      selected_variant_count: variants.length,
      selected_variant_ids: variants.map((entry) => entry.variant_id),
    },
    summary: {
      candidate_count: number(audit.result?.candidate_count),
      accepted_count: number(audit.result?.accepted_count),
      review_count: number(audit.result?.review_count),
      accepted_existing_count: variants.reduce((count, entry) => count + entry.accepted_existing_count, 0),
      accepted_distinct_count: distinct.length,
      distinct_safe_variant_count: variants.filter((entry) => entry.accepted_distinct_count > 0).length,
      independent_merchant_distinct_variant_count: 0,
      merchant_identity_status: "unknown",
    },
    request_diagnostics: audit.request_diagnostics ?? null,
    variants,
  };
  validatePriorityTwoDistinctEvidenceDiagnostic(result);
  return result;
}

export function validatePriorityTwoDistinctEvidenceDiagnostic(value) {
  if (!value || value.schema_version !== 1 || value.kind !== PRIORITY_TWO_DISTINCT_EVIDENCE_KIND
    || value.priority !== 2 || value.query_profile !== PRIORITY_TWO_DISTINCT_EVIDENCE_QUERY_PROFILE
    || value.write_eligible !== false || value.canary_eligible !== false || value.database_writes !== 0
    || value.zero_delta_verified !== true
    || !Array.isArray(value.variants) || value.variants.length < 1 || value.variants.length > 25) {
    throw new Error("Priority 2 distinct evidence diagnostic contract is invalid.");
  }
  const ids = value.variants.map((entry) => text(entry.variant_id, 140));
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length || value.selection?.selected_variant_count !== ids.length) {
    throw new Error("Priority 2 distinct evidence selection is invalid.");
  }
  for (const entry of value.variants) {
    if (entry.priority !== 2 || !Array.isArray(entry.existing_listing_identity) || !Array.isArray(entry.queries_attempted)
      || entry.queries_attempted.length < 1 || entry.queries_attempted.length > MARKET_MAX_QUERY_ATTEMPTS_PER_ROOT
      || entry.queries_attempted.some((query) => !text(query, 160))) {
      throw new Error("Priority 2 distinct evidence variant contract is invalid.");
    }
    const distinct = entry.accepted_distinct ?? [];
    const existing = entry.accepted_existing ?? [];
    if (entry.accepted_distinct_count !== distinct.length || entry.accepted_existing_count !== existing.length
      || new Set(entry.distinct_candidate_keys ?? []).size !== (entry.distinct_candidate_keys ?? []).length
      || !distinct.every((candidate) => (entry.distinct_candidate_keys ?? []).includes(candidate.candidate_key))) {
      throw new Error("Priority 2 distinct evidence totals are invalid.");
    }
    for (const candidate of [...distinct, ...existing]) validateCandidate(candidate);
  }
  if (value.summary?.accepted_distinct_count !== value.variants.reduce((count, entry) => count + entry.accepted_distinct_count, 0)
    || value.summary?.distinct_safe_variant_count !== value.variants.filter((entry) => entry.accepted_distinct_count > 0).length
    || value.summary?.merchant_identity_status !== "unknown"
    || value.summary?.independent_merchant_distinct_variant_count !== 0) {
    throw new Error("Priority 2 distinct evidence summary is invalid.");
  }
  inspect(value);
  return true;
}

export function renderPriorityTwoDistinctEvidenceDiagnosticMarkdown(value) {
  validatePriorityTwoDistinctEvidenceDiagnostic(value);
  const lines = [
    "# Priority 2 Distinct Evidence Diagnostic",
    "",
    "- Read-only: true",
    "- Write eligible: false",
    "- Canary eligible: false",
    `- Database writes: ${value.database_writes}`,
    `- Zero delta verified: ${value.zero_delta_verified === true}`,
    `- Selected variants: ${value.selection.selected_variant_count}`,
    `- Distinct safe variants: ${value.summary.distinct_safe_variant_count}`,
    `- Accepted existing: ${value.summary.accepted_existing_count}`,
    `- Accepted distinct: ${value.summary.accepted_distinct_count}`,
    "",
    "## Per variant",
    "",
    "| Series | Variant | Existing | Queries | Accepted existing | Accepted distinct |",
    "|---|---|---:|---|---:|---:|",
    ...value.variants.map((entry) => `| ${md(entry.series_name)} | ${md(entry.variant_name)} | ${entry.existing_listing_identity.length} | ${entry.queries_attempted.map(md).join(" / ")} | ${entry.accepted_existing_count} | ${entry.accepted_distinct_count} |`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function classifyAcceptedCandidate(candidate, existing) {
  const candidateIdentity = sanitizeCandidate(candidate);
  const matches = existing.flatMap((identity) => identityMatches(candidateIdentity, identity));
  return { ...candidateIdentity, classification: matches.length ? "accepted_existing" : "accepted_distinct", existing_match_fields: [...new Set(matches)].sort() };
}

function identityMatches(candidate, existing) {
  const matches = [];
  if (candidate.candidate_key && candidate.candidate_key === existing.canonical_listing_id) matches.push("canonical_listing_id");
  if (candidate.source_listing_id && candidate.source_listing_id === existing.listing_id) matches.push("listing_id");
  if (candidate.provider && candidate.source_listing_id && candidate.provider === existing.source && candidate.source_listing_id === existing.source_listing_id) matches.push("source_listing_id");
  if (candidate.public_url && candidate.public_url === existing.source_url) matches.push("source_url");
  return matches;
}

function sanitizeExistingIdentity(listing = {}) {
  const source = normalizeProvider(listing.source ?? listing.raw?.provider);
  const listingSourceId = sourceListingId(listing);
  const sourceUrl = sanitizeMarketPublicUrl(listing.source_url);
  return {
    listing_id: text(listing.id, 140),
    canonical_listing_id: buildMarketCandidateKey({ provider: source, listing_id: listingSourceId, public_url: sourceUrl }),
    source,
    source_listing_id: listingSourceId,
    source_url: sourceUrl,
  };
}

function sanitizeCandidate(candidate = {}) {
  return {
    candidate_key: text(candidate.candidate_key, 64),
    provider: normalizeProvider(candidate.source?.provider),
    source_listing_id: text(candidate.source?.listing_id, 140),
    public_url: sanitizeMarketPublicUrl(candidate.source?.public_url),
    price: number(candidate.listing?.price),
    status: text(candidate.listing?.status, 32),
    reason: text(candidate.assessment?.reason, 120),
    confidence: confidence(candidate.assessment?.confidence),
    merchant_identity: null,
    independent_merchant_evidence: "unknown",
  };
}

function validateCandidate(candidate) {
  if (!CANDIDATE_KEY.test(candidate.candidate_key) || !candidate.provider || !candidate.source_listing_id
    || !candidate.public_url || !Number.isFinite(candidate.price) || candidate.price <= 0 || candidate.status !== "active"
    || !candidate.reason || candidate.confidence < 0.8 || candidate.confidence > 1
    || !["accepted_existing", "accepted_distinct"].includes(candidate.classification)
    || candidate.independent_merchant_evidence !== "unknown" || candidate.merchant_identity !== null
    || !Array.isArray(candidate.existing_match_fields)) {
    throw new Error("Priority 2 distinct evidence candidate is invalid.");
  }
  if (candidate.classification === "accepted_existing" && candidate.existing_match_fields.length < 1) throw new Error("Existing candidate identity match is missing.");
  if (candidate.classification === "accepted_distinct" && candidate.existing_match_fields.length > 0) throw new Error("Distinct candidate identity is ambiguous.");
}

function queryAttempts(selected = {}) {
  const root = text(selected.query, 160);
  const fallbacks = Array.isArray(selected.fallback_queries) ? selected.fallback_queries.map((entry) => text(entry, 160)).filter(Boolean) : [];
  return [...new Map([root, ...fallbacks].filter(Boolean).map((query) => [query.toLowerCase(), query])).values()];
}

function providerResults(diagnostics, selected = {}) {
  const attempts = new Set(queryAttempts(selected).map((query) => query.toLowerCase()));
  const values = (diagnostics?.queries ?? []).filter((entry) => attempts.has(text(entry.query, 160).toLowerCase()));
  return Object.fromEntries(["rakuten_ichiba", "yahoo_shopping"].map((provider) => [provider, values.filter((entry) => entry.provider === provider).reduce((count, entry) => count + number(entry.results_returned), 0)]));
}

function sourceListingId(listing = {}) {
  const raw = listing.raw && typeof listing.raw === "object" ? listing.raw : {};
  return text(raw.source_listing_id ?? raw.listing_id ?? raw.listingId ?? raw.itemCode ?? raw.item_code ?? raw.code ?? listing.id, 140);
}

function normalizeProvider(value) {
  const provider = text(value, 64).toLowerCase();
  if (["rakuten", "rakuten_ichiba"].includes(provider)) return "rakuten_ichiba";
  if (["yahoo", "yahoo_shopping"].includes(provider)) return "yahoo_shopping";
  return provider;
}

function assertAuditContract(audit, queryPlan) {
  if (audit?.mode !== "dry-run" || audit?.source_scope !== "planner-apis" || audit?.manual_diagnostic?.kind !== PRIORITY_TWO_DISTINCT_EVIDENCE_KIND
    || audit.manual_diagnostic.write_eligible !== false || audit.manual_diagnostic.canary_eligible !== false
    || audit?.result?.report_complete !== true || Number(audit?.result?.truncated_count) !== 0
    || Object.values(audit?.database_writes ?? {}).some((value) => Number(value) !== 0)) {
    throw new Error("Priority 2 distinct evidence audit is not a complete read-only diagnostic.");
  }
  const selected = audit.selection?.selected_variants ?? [];
  if (!selected.length || selected.length > 25 || selected.some((entry) => Number(entry.priority) !== 2)
    || !Array.isArray(queryPlan) || queryPlan.length !== selected.length
    || queryPlan.some((entry) => entry?.query_profile !== PRIORITY_TWO_DISTINCT_EVIDENCE_QUERY_PROFILE
      || Number(entry?.priority) !== 2 || queryAttempts(entry).length > MARKET_MAX_QUERY_ATTEMPTS_PER_ROOT)) {
    throw new Error("Priority 2 distinct evidence audit selection is invalid.");
  }
}

function sanitizeCounts(counts) {
  if (!counts || typeof counts !== "object") return null;
  const expected = ["market_listings", "market_listing_observations", "import_issues", "ingestion_runs", "series", "variants", "complete_set"];
  const result = Object.fromEntries(expected.map((key) => [key, number(counts[key])]));
  return result;
}

function countsEqual(before, after) {
  const left = sanitizeCounts(before); const right = sanitizeCounts(after);
  return Boolean(left && right && JSON.stringify(left) === JSON.stringify(right));
}

function number(value) { const result = Number(value); return Number.isFinite(result) && result >= 0 ? Math.floor(result) : 0; }
function confidence(value) { const result = Number(value); return Number.isFinite(result) ? result : 0; }
function text(value, limit) { return String(value ?? "").normalize("NFKC").replace(CONTROL, "").replace(/\s+/g, " ").trim().slice(0, limit); }
function inspect(value) { if (Array.isArray(value)) return value.forEach(inspect); if (!value || typeof value !== "object") return; for (const [key, child] of Object.entries(value)) { if (FORBIDDEN.test(key)) throw new Error("Priority 2 distinct evidence artifact contains a forbidden field."); inspect(child); } }
function md(value) { return text(value, 300).replace(/[|\r\n]+/g, " "); }
