import { LISTING_TYPES } from "./gacha-schema.js";
import { isSafeMarketSearchQuery } from "../fetchers/market-query-planner.js";

const SINGLE_TYPES = new Set([
  LISTING_TYPES.SINGLE,
  LISTING_TYPES.RARE_SINGLE,
  LISTING_TYPES.SECRET_SINGLE,
]);

export function assessMarketCandidate(listing = {}, query = {}, catalog = {}) {
  const targetVariant = catalog.variantById?.get(query.variant_id)
    ?? (catalog.variants ?? []).find((entry) => entry.id === query.variant_id);
  const parentSeries = catalog.seriesById?.get(query.series_id || targetVariant?.series_id)
    ?? (catalog.series ?? []).find((entry) => entry.id === (query.series_id || targetVariant?.series_id));
  if (!targetVariant || !parentSeries) return review("target_catalog_record_missing");
  if (!isSafeMarketSearchQuery(query.query, targetVariant, parentSeries)) return review("unsafe_search_query");

  const classification = classifyStrictCandidate(listing, catalog);
  if (!SINGLE_TYPES.has(classification.listing_type)) return review("not_single_item", classification);
  if (classification.confidence < 0.8) return review("classification_confidence_low", classification);

  const matchedIds = [...new Set(classification.details?.matched_variant_ids ?? [])];
  if (matchedIds.length !== 1 || matchedIds[0] !== targetVariant.id) {
    return review(matchedIds.length > 1 ? "multiple_variant_candidates" : "target_variant_not_confirmed", classification);
  }

  const explicitVariantId = String(listing.variant_id || listing.variantId || "").trim();
  if (explicitVariantId && explicitVariantId !== targetVariant.id) return review("explicit_variant_conflict", classification);

  const normalizedTitle = normalize(listing.title || listing.name);
  const variantTerms = [targetVariant.name, targetVariant.slug].map(normalize).filter((term) => term.length >= 2);
  const parentTerms = [parentSeries.name, parentSeries.franchise, parentSeries.slug]
    .map(normalize)
    .filter((term) => term.length >= 3);
  if (!variantTerms.some((term) => normalizedTitle.includes(term))) return review("variant_name_not_explicit", classification);
  if (!parentTerms.some((term) => normalizedTitle.includes(term))) return review("parent_series_evidence_missing", classification);

  return {
    accepted: true,
    reviewRequired: false,
    reason: "variant_and_parent_evidence_confirmed",
    variantId: targetVariant.id,
    seriesId: parentSeries.id,
    listingType: classification.listing_type,
    confidence: classification.confidence,
    classification,
  };
}

function classifyStrictCandidate(listing, catalog) {
  const title = normalize(listing.title || listing.name);
  const setKeyword = ["コンプ", "全種", "セット", "まとめ", "2種", "3種", "2点", "3点"]
    .find((keyword) => title.includes(normalize(keyword)));
  if (setKeyword) {
    return { listing_type: LISTING_TYPES.PARTIAL_SET, reason: "set_keyword", confidence: 0.9, details: { matched_keywords: [setKeyword], matched_variant_ids: [] } };
  }

  const matchedVariants = (catalog.variants ?? []).filter((variant) => {
    if (String(variant.variant_type || "").toLowerCase() === "provisional") return false;
    const terms = [variant.name, variant.slug].map(normalize).filter((term) => term.length >= 2);
    return terms.some((term) => title.includes(term));
  });
  const secret = ["シークレット", "シクレ", "secret"].some((term) => title.includes(normalize(term)));
  const rare = ["レア", "rare", "限定カラー", "当たり"].some((term) => title.includes(normalize(term)));
  const listingType = secret ? LISTING_TYPES.SECRET_SINGLE : rare ? LISTING_TYPES.RARE_SINGLE : matchedVariants.length === 1 ? LISTING_TYPES.SINGLE : LISTING_TYPES.UNKNOWN;
  return {
    listing_type: listingType,
    reason: matchedVariants.length === 1 ? "single_variant_detected" : matchedVariants.length > 1 ? "multiple_variants_detected" : "variant_not_detected",
    confidence: matchedVariants.length === 1 ? 0.86 : matchedVariants.length > 1 ? 0.82 : 0.2,
    details: { matched_variant_ids: matchedVariants.map((variant) => variant.id), matched_keywords: [] },
  };
}

export function summarizeCandidateAssessments(assessments = []) {
  return {
    accepted_listings: assessments.filter((entry) => entry.accepted).length,
    ambiguous_listings: assessments.filter((entry) => !entry.accepted).length,
  };
}

export function summarizeFetchedMarketCandidates({ records = [], rawCount = 0, queryPlan = [], feedResults = [], catalog = {} } = {}) {
  const queryByText = new Map(queryPlan.map((query) => [normalizeQuery(query.query), query]));
  const assessments = [];
  const variantsWithResults = new Set();
  for (const record of records) {
    const rawQuery = record.raw?.query;
    const queryText = typeof rawQuery === "string" ? rawQuery : rawQuery?.query || record.raw?.keyword;
    const query = queryByText.get(normalizeQuery(queryText));
    if (!query) {
      assessments.push(review("query_context_missing"));
      continue;
    }
    variantsWithResults.add(query.variant_id);
    assessments.push(assessMarketCandidate(record, query, catalog));
  }
  return {
    requests_attempted: feedResults.length,
    requests_succeeded: feedResults.filter((entry) => entry.ok).length,
    requests_rate_limited: feedResults.filter((entry) => Number(entry.status) === 429).length,
    requests_failed: feedResults.filter((entry) => !entry.ok).length,
    source_results: summarizeSources(feedResults),
    ...summarizeCandidateAssessments(assessments),
    duplicate_listings: Math.max(0, Number(rawCount || 0) - records.length),
    variants_with_results: variantsWithResults.size,
  };
}

function review(reason, classification = null) {
  return {
    accepted: false,
    reviewRequired: true,
    reason,
    variantId: null,
    seriesId: null,
    listingType: classification?.listing_type || LISTING_TYPES.UNKNOWN,
    confidence: Math.min(classification?.confidence ?? 0, 0.49),
    classification,
  };
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s・･\-_/／()（）【】\[\]「」『』!！?？.,，。:：]+/g, "")
    .trim();
}

function normalizeQuery(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function summarizeSources(results) {
  const summary = {};
  for (const result of results) {
    const source = result.source || "unknown";
    if (!summary[source]) summary[source] = { attempted: 0, succeeded: 0, failed: 0, rate_limited: 0 };
    summary[source].attempted += 1;
    summary[source][result.ok ? "succeeded" : "failed"] += 1;
    if (Number(result.status) === 429) summary[source].rate_limited += 1;
  }
  return summary;
}
