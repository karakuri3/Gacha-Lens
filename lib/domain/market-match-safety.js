import { LISTING_TYPES } from "./gacha-schema.js";
import { isSafeMarketSearchQuery } from "../fetchers/market-query-planner.js";
import {
  analyzeExplicitMarketLabels,
  detectParentSeriesEditionConflict,
} from "./market-title-safety.js";

const SINGLE_TYPES = new Set([
  LISTING_TYPES.SINGLE,
  LISTING_TYPES.RARE_SINGLE,
  LISTING_TYPES.SECRET_SINGLE,
]);
const MAX_MATCH_TEXT_LENGTH = 1000;
const MATCH_IGNORABLE_SEPARATOR = /[\p{Z}\s・･·\-‐‑‒–—―−()]/u;
const MATCH_HARD_SEPARATOR = /\p{P}/u;
const MATCH_WORD_CHARACTER = /[\p{L}\p{N}\p{M}]/u;
const MATCH_BOUNDARY_SENTINEL = "\u0000";

export function buildFormalVariantsBySeries(variants = []) {
  const index = new Map();
  for (const variant of variants ?? []) {
    if (!variant?.id || !variant.name || String(variant.variant_type || "").toLowerCase() === "provisional") continue;
    const seriesId = String(variant.series_id || "").trim();
    if (!seriesId) continue;
    const entries = index.get(seriesId) ?? [];
    entries.push(variant);
    index.set(seriesId, entries);
  }
  return index;
}

export function prepareMarketSafetyCatalog(catalog = {}) {
  if (catalog.formalVariantsBySeries instanceof Map) return catalog;
  return {
    ...catalog,
    formalVariantsBySeries: buildFormalVariantsBySeries(catalog.variants ?? []),
  };
}

export function assessMarketCandidate(listing = {}, query = {}, catalog = {}) {
  const preparedCatalog = prepareMarketSafetyCatalog(catalog);
  const targetVariant = preparedCatalog.variantById?.get(query.variant_id)
    ?? (preparedCatalog.variants ?? []).find((entry) => entry.id === query.variant_id);
  const parentSeries = preparedCatalog.seriesById?.get(query.series_id || targetVariant?.series_id)
    ?? (preparedCatalog.series ?? []).find((entry) => entry.id === (query.series_id || targetVariant?.series_id));
  if (!targetVariant || !parentSeries) return review("target_catalog_record_missing", null, { queryContextPresent: true });
  if (!isSafeMarketSearchQuery(query.query, targetVariant, parentSeries)) return review("unsafe_search_query", null, { queryContextPresent: true });

  const classification = classifyStrictCandidate(listing, {
    catalog: preparedCatalog,
    targetVariant,
    parentSeries,
  });
  const matchedIds = [...new Set(classification.details?.matched_variant_ids ?? [])];
  const normalizedTitle = normalize(listing.title || listing.name);
  const parentTerms = [parentSeries.name, parentSeries.franchise]
    .map(normalize)
    .filter((term) => term.length >= 3);
  const explicitVariantId = String(listing.variant_id || listing.variantId || "").trim();
  const scopedVariants = preparedCatalog.formalVariantsBySeries.get(parentSeries.id) ?? [];
  const explicitLabels = analyzeExplicitMarketLabels(
    listing.title || listing.name,
    scopedVariants,
    targetVariant.id,
  );
  const editionConflict = detectParentSeriesEditionConflict({
    title: listing.title || listing.name,
    parentSeriesName: parentSeries.name,
    targetVariantName: targetVariant.name,
    siblingVariantNames: scopedVariants
      .filter((variant) => variant.id !== targetVariant.id)
      .map((variant) => variant.name),
    beforeIndex: explicitLabels.firstProductLabelStart,
  });
  const targetTextEvidence = findVariantNameOccurrences(
    listing.title || listing.name,
    targetVariant.name,
  ).length > 0;
  const auditChecks = {
    variantEvidencePresent: matchedIds.includes(targetVariant.id)
      && (
        targetTextEvidence
        || explicitLabels.explicitLabelTargetMatch
      ),
    parentSeriesEvidencePresent: parentTerms.some((term) => normalizedTitle.includes(term)),
    setSignalDetected: !SINGLE_TYPES.has(classification.listing_type) && classification.listing_type !== LISTING_TYPES.UNKNOWN,
    multipleVariantCandidates: matchedIds.length > 1,
    explicitVariantConflict: Boolean(explicitVariantId && explicitVariantId !== targetVariant.id),
    explicitLabelPresent: explicitLabels.explicitLabelPresent,
    explicitLabelTargetMatch: explicitLabels.explicitLabelTargetMatch,
    explicitLabelOtherVariantMatch: explicitLabels.explicitLabelOtherVariantMatch,
    explicitLabelUnresolved: explicitLabels.explicitLabelUnresolved,
    parentSeriesEditionConflict: editionConflict,
    queryContextPresent: true,
  };
  if (auditChecks.setSignalDetected) return review("not_single_item", classification, auditChecks);
  if (auditChecks.explicitVariantConflict) return review("explicit_variant_conflict", classification, auditChecks);
  if (auditChecks.explicitLabelOtherVariantMatch) {
    return review("explicit_variant_label_conflict", classification, auditChecks);
  }
  if (auditChecks.explicitLabelUnresolved) {
    return review("explicit_variant_label_unresolved", classification, auditChecks);
  }
  if (auditChecks.parentSeriesEditionConflict) {
    return review("parent_series_edition_conflict", classification, auditChecks);
  }
  if (classification.listing_type === LISTING_TYPES.UNKNOWN) {
    return review(matchedIds.length > 1 ? "multiple_variant_candidates" : "target_variant_not_confirmed", classification, auditChecks);
  }
  if (!SINGLE_TYPES.has(classification.listing_type)) return review("not_single_item", classification, auditChecks);
  if (classification.confidence < 0.8) return review("classification_confidence_low", classification, auditChecks);

  if (matchedIds.length !== 1 || matchedIds[0] !== targetVariant.id) {
    return review(matchedIds.length > 1 ? "multiple_variant_candidates" : "target_variant_not_confirmed", classification, auditChecks);
  }

  if (!auditChecks.variantEvidencePresent) return review("variant_name_not_explicit", classification, auditChecks);
  if (!auditChecks.parentSeriesEvidencePresent) return review("parent_series_evidence_missing", classification, auditChecks);

  return {
    accepted: true,
    reviewRequired: false,
    reason: "variant_and_parent_evidence_confirmed",
    variantId: targetVariant.id,
    seriesId: parentSeries.id,
    listingType: classification.listing_type,
    confidence: classification.confidence,
    classification,
    auditChecks,
  };
}

function classifyStrictCandidate(listing, { catalog, parentSeries }) {
  const sourceTitle = listing.title || listing.name;
  const title = normalize(sourceTitle);
  const setKeyword = ["コンプ", "全種", "セット", "まとめ", "2種", "3種", "2点", "3点"]
    .find((keyword) => title.includes(normalize(keyword)));
  if (setKeyword) {
    return {
      listing_type: LISTING_TYPES.PARTIAL_SET,
      reason: "set_keyword",
      confidence: 0.9,
      details: {
        scope_series_id: parentSeries.id,
        matched_keywords: [setKeyword],
        matched_variant_ids: [],
        suppressed_overlap_variant_ids: [],
      },
    };
  }

  const scopedVariants = catalog.formalVariantsBySeries.get(parentSeries.id) ?? [];
  const explicitLabelMatches = analyzeExplicitMarketLabels(
    sourceTitle,
    scopedVariants,
  ).matchedVariantIds;
  const parentSeriesOccurrences = findVariantNameOccurrences(sourceTitle, parentSeries.name);
  const titleMatches = scopedVariants.flatMap((variant) =>
    findVariantNameOccurrences(sourceTitle, variant.name).map((occurrence) => ({
      ...occurrence,
      variantId: variant.id,
    }))
  );
  const ordinaryTitleMatches = titleMatches.filter((match) => !parentSeriesOccurrences.some((parent) => (
    parent.start <= match.start && parent.end >= match.end
  )));
  const effectiveMatches = ordinaryTitleMatches.filter((match) => !ordinaryTitleMatches.some((candidate) =>
    candidate.term.length > match.term.length
    && candidate.start <= match.start
    && candidate.end >= match.end
  ));
  const matchedVariantIds = [...new Set([
    ...effectiveMatches.map((match) => match.variantId),
    ...explicitLabelMatches,
  ])];
  const suppressedVariantIds = [...new Set(titleMatches
    .map((match) => match.variantId)
    .filter((variantId) => !matchedVariantIds.includes(variantId)))];
  const secret = ["シークレット", "シクレ", "secret"].some((term) => title.includes(normalize(term)));
  const rare = ["レア", "rare", "限定カラー", "当たり"].some((term) => title.includes(normalize(term)));
  const listingType = secret ? LISTING_TYPES.SECRET_SINGLE : rare ? LISTING_TYPES.RARE_SINGLE : matchedVariantIds.length === 1 ? LISTING_TYPES.SINGLE : LISTING_TYPES.UNKNOWN;
  return {
    listing_type: listingType,
    reason: matchedVariantIds.length === 1 ? "single_variant_detected" : matchedVariantIds.length > 1 ? "multiple_variants_detected" : "variant_not_detected",
    confidence: matchedVariantIds.length === 1 ? 0.86 : matchedVariantIds.length > 1 ? 0.82 : 0.2,
    details: {
      scope_series_id: parentSeries.id,
      matched_variant_ids: matchedVariantIds,
      suppressed_overlap_variant_ids: suppressedVariantIds,
      matched_keywords: [],
    },
  };
}

export function findVariantNameOccurrences(title, variantName) {
  const matchTitle = normalizeMatchText(title);
  const matchVariant = normalizeMatchText(variantName);
  const term = matchVariant.compact;
  if (term.length < 2) return [];

  const occurrences = [];
  let start = matchTitle.compact.indexOf(term);
  while (start >= 0) {
    const end = start + term.length;
    const rawStart = matchTitle.rawIndexes[start];
    const rawEnd = matchTitle.rawEnds[end - 1];
    const before = rawStart > 0 ? matchTitle.source[rawStart - 1] : "";
    const after = rawEnd < matchTitle.source.length ? matchTitle.source[rawEnd] : "";
    if (isVariantBoundary(before) && isVariantBoundary(after)) {
      occurrences.push({ term, start, end });
    }
    start = matchTitle.compact.indexOf(term, start + 1);
  }
  return occurrences;
}

export function normalizeMatchText(value) {
  const source = String(value ?? "").normalize("NFKC").toLowerCase().slice(0, MAX_MATCH_TEXT_LENGTH);
  let compact = "";
  const rawIndexes = [];
  const rawEnds = [];
  for (let rawIndex = 0; rawIndex < source.length;) {
    const character = String.fromCodePoint(source.codePointAt(rawIndex));
    const characterLength = character.length;
    const compactCharacter = MATCH_IGNORABLE_SEPARATOR.test(character)
      ? ""
      : MATCH_HARD_SEPARATOR.test(character)
        ? MATCH_BOUNDARY_SENTINEL
        : character;
    if (compactCharacter) {
      compact += compactCharacter;
      for (let offset = 0; offset < compactCharacter.length; offset += 1) {
        rawIndexes.push(rawIndex);
        rawEnds.push(rawIndex + characterLength);
      }
    }
    rawIndex += characterLength;
  }
  return { source, compact, rawIndexes, rawEnds };
}

function isVariantBoundary(character) {
  return !character || !MATCH_WORD_CHARACTER.test(character);
}

export function summarizeCandidateAssessments(assessments = []) {
  return {
    accepted_listings: assessments.filter((entry) => entry.accepted).length,
    ambiguous_listings: assessments.filter((entry) => !entry.accepted).length,
  };
}

export function requiresPlannerMarketSafety(record = {}) {
  const provider = String(record.raw?.provider || "").trim().toLowerCase();
  if (provider === "rakuten_ichiba" || provider === "yahoo_shopping") return true;
  return Boolean(record.raw?.query || record.raw?.keyword);
}

export function applyMarketCandidateSafety({ records = [], queryPlan = [], catalog = {} } = {}) {
  const preparedCatalog = prepareMarketSafetyCatalog(catalog);
  const queryByText = new Map(queryPlan.map((query) => [normalizeQuery(query.query), query]));
  const assessments = [];
  const variantsWithResults = new Set();
  let skippedApprovedFeedRecords = 0;
  const transformedRecords = records.map((record) => {
    if (!requiresPlannerMarketSafety(record)) {
      skippedApprovedFeedRecords += 1;
      return record;
    }
    const query = resolveRecordQuery(record, queryByText);
    const assessment = query
      ? assessMarketCandidate(record, query, preparedCatalog)
      : review("query_context_missing", null, { queryContextPresent: false });
    if (query) variantsWithResults.add(query.variant_id);
    assessments.push(assessment);
    return attachSafetyAssessment(record, assessment);
  });

  return {
    records: transformedRecords,
    assessments,
    summary: {
      ...summarizeCandidateAssessments(assessments),
      safety_assessed_records: assessments.length,
      safety_skipped_approved_feed_records: skippedApprovedFeedRecords,
      variants_with_results: variantsWithResults.size,
    },
  };
}

export function applyMarketPersistenceSafety(row = {}, raw = {}) {
  const assessed = raw.market_safety_assessed === true || raw.raw?.market_safety_assessed === true;
  const safety = raw.market_safety ?? raw.raw?.market_safety;
  if (!assessed || !safety) return row;

  if (safety.accepted === true && safety.review_required === false) {
    return {
      ...row,
      variant_id: safety.variant_id || null,
      matched_variant_id: safety.variant_id || null,
      series_id: safety.series_id || null,
      listing_type: safety.listing_type || row.listing_type,
      market_review_type: toMarketReviewType(safety.listing_type),
      classification_reason: safety.reason || "market_safety_accepted",
      classification_confidence: clampConfidence(safety.confidence, 0.8),
      classification_details: mergeSafetyDetails(row.classification_details, safety),
      confidence: clampConfidence(safety.confidence, 0.8),
      review_required: false,
    };
  }

  return {
    ...row,
    variant_id: null,
    matched_variant_id: null,
    series_id: null,
    listing_type: safety.listing_type || row.listing_type || LISTING_TYPES.UNKNOWN,
    market_review_type: "unknown",
    classification_reason: safety.reason || "market_safety_rejected",
    classification_confidence: Math.min(clampConfidence(safety.confidence, 0), 0.49),
    classification_details: mergeSafetyDetails(row.classification_details, safety),
    confidence: Math.min(clampConfidence(safety.confidence, 0), 0.49),
    review_required: true,
  };
}

export function summarizeFetchedMarketCandidates({ records = [], rawCount = 0, queryPlan = [], feedResults = [], catalog = {}, safetyResult } = {}) {
  const safety = safetyResult ?? applyMarketCandidateSafety({ records, queryPlan, catalog });
  return {
    requests_attempted: feedResults.length,
    requests_succeeded: feedResults.filter((entry) => entry.ok).length,
    requests_retried: feedResults.filter((entry) => Number(entry.attempt_count) >= 2).length,
    retry_attempts_total: feedResults.reduce((sum, entry) => sum + Math.max(0, Number(entry.retry_count) || 0), 0),
    transient_failures_recovered: feedResults.filter((entry) => entry.recovered_after_retry === true).length,
    requests_timed_out: feedResults.filter((entry) => entry.timed_out === true).length,
    requests_rate_limited: feedResults.filter((entry) => entry.rate_limited === true || Number(entry.status) === 429).length,
    requests_permanently_failed: feedResults.filter((entry) => entry.ok === false && Number(entry.attempt_count) > 0).length,
    requests_failed: feedResults.filter((entry) => !entry.ok).length,
    source_results: summarizeSources(feedResults),
    ...safety.summary,
    duplicate_listings: Math.max(0, Number(rawCount || 0) - records.length),
  };
}

function resolveRecordQuery(record, queryByText) {
  const rawQuery = record.raw?.query;
  const queryText = typeof rawQuery === "string" ? rawQuery : rawQuery?.query || record.raw?.keyword;
  return queryByText.get(normalizeQuery(queryText));
}

function attachSafetyAssessment(record, assessment) {
  const marketSafety = {
    accepted: assessment.accepted,
    review_required: assessment.reviewRequired,
    reason: assessment.reason,
    variant_id: assessment.variantId,
    series_id: assessment.seriesId,
    listing_type: assessment.listingType,
    confidence: assessment.confidence,
    matched_variant_ids: [...new Set(assessment.classification?.details?.matched_variant_ids ?? [])],
    checks: {
      variant_evidence_present: assessment.auditChecks?.variantEvidencePresent === true,
      parent_series_evidence_present: assessment.auditChecks?.parentSeriesEvidencePresent === true,
      set_signal_detected: assessment.auditChecks?.setSignalDetected === true,
      multiple_variant_candidates: assessment.auditChecks?.multipleVariantCandidates === true,
      explicit_variant_conflict: assessment.auditChecks?.explicitVariantConflict === true,
      explicit_label_present: assessment.auditChecks?.explicitLabelPresent === true,
      explicit_label_target_match: assessment.auditChecks?.explicitLabelTargetMatch === true,
      explicit_label_other_variant_match: assessment.auditChecks?.explicitLabelOtherVariantMatch === true,
      explicit_label_unresolved: assessment.auditChecks?.explicitLabelUnresolved === true,
      parent_series_edition_conflict: assessment.auditChecks?.parentSeriesEditionConflict === true,
      query_context_present: assessment.auditChecks?.queryContextPresent === true,
    },
  };
  return {
    ...record,
    market_safety_assessed: true,
    market_safety: marketSafety,
    raw: {
      ...(record.raw ?? {}),
      market_safety_assessed: true,
      market_safety: marketSafety,
    },
  };
}

function mergeSafetyDetails(details, safety) {
  return {
    ...(details ?? {}),
    market_safety: {
      accepted: safety.accepted === true,
      review_required: safety.review_required !== false,
      reason: safety.reason || "market_safety_rejected",
      variant_id: safety.variant_id || null,
      series_id: safety.series_id || null,
      listing_type: safety.listing_type || LISTING_TYPES.UNKNOWN,
      confidence: clampConfidence(safety.confidence, 0),
    },
  };
}

function toMarketReviewType(listingType) {
  if (listingType === LISTING_TYPES.RARE_SINGLE || listingType === LISTING_TYPES.SECRET_SINGLE) return "rare_or_secret";
  return listingType === LISTING_TYPES.SINGLE ? "single" : "unknown";
}

function clampConfidence(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : fallback;
}

function review(reason, classification = null, auditChecks = {}) {
  return {
    accepted: false,
    reviewRequired: true,
    reason,
    variantId: null,
    seriesId: null,
    listingType: classification?.listing_type || LISTING_TYPES.UNKNOWN,
    confidence: Math.min(classification?.confidence ?? 0, 0.49),
    classification,
    auditChecks,
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
