import { LISTING_TYPES, MARKET_REVIEW_TYPES } from "./gacha-schema.js";
import { prepareMarketSafetyCatalog } from "./market-match-safety.js";
import { analyzeParentSeriesIdentity } from "./market-title-safety.js";

const ALLOWED_PROVIDERS = new Set(["rakuten_ichiba", "yahoo_shopping"]);

export function assessSeriesCompleteSetCandidate(listing = {}, query = {}, catalog = {}) {
  const prepared = prepareMarketSafetyCatalog(catalog);
  const parent = prepared.seriesById?.get(query.series_id)
    ?? (prepared.series ?? []).find((entry) => String(entry.id) === String(query.series_id));
  const title = text(listing.title || listing.name);
  const provider = normalizeProvider(listing);
  const formalVariants = parent ? (prepared.formalVariantsBySeries.get(parent.id) ?? []) : [];
  const complete = detectCompleteSetSignal(title);

  if (!parent) return reject("target_parent_series_missing");
  if (formalVariants.length < 2) return reject("formal_lineup_unavailable");
  if (!ALLOWED_PROVIDERS.has(provider)) return reject("planner_marketplace_source_required");
  if (!Number.isFinite(Number(listing.price)) || Number(listing.price) <= 0) return reject("price_invalid");
  if (/(?:予約|発売前|発売予定|pre[\s-]?order)/iu.test(title)) return reject("preorder_listing");
  if (hasSingleItemConflict(title)) return reject("complete_set_single_item_conflict");
  if (hasCatalogParentIdentityAmbiguity(parent, prepared.series ?? [])) {
    return reject("parent_series_catalog_identity_ambiguous");
  }

  const parentIdentity = analyzeParentSeriesIdentity({
    title: withoutCompleteSetSignals(title),
    parentSeriesName: parent.name,
    parentSeriesFranchise: parent.franchise,
    siblingSeriesNames: (prepared.formalSeriesByFranchise?.get(normalize(parent.franchise)) ?? [])
      .filter((entry) => entry.id !== parent.id)
      .map((entry) => entry.name),
  });
  if (!parentIdentity.parentSeriesEvidencePresent) return reject("parent_series_evidence_missing", parentIdentity);
  if (parentIdentity.parentSeriesEditionConflict || parentIdentity.parentSeriesSiblingConflict) {
    return reject("parent_series_identity_conflict", parentIdentity);
  }

  if (!complete.strong) return reject("complete_set_signal_missing", parentIdentity, complete);
  if (complete.count !== null && complete.count !== formalVariants.length) {
    return reject("complete_set_lineup_count_conflict", parentIdentity, complete, formalVariants.length);
  }

  return {
    accepted: true,
    reviewRequired: false,
    reason: "series_complete_set_confirmed",
    confidence: complete.count === null ? 0.9 : 0.94,
    listingType: LISTING_TYPES.COMPLETE_SET,
    marketReviewType: MARKET_REVIEW_TYPES.FULL_SET,
    seriesId: parent.id,
    variantId: null,
    matchedVariantId: null,
    provider,
    formalLineupCount: formalVariants.length,
    detectedCompleteCount: complete.count,
    parentIdentity,
  };
}

export function buildSeriesCompleteSetPreview(listing = {}, assessment = {}, catalog = {}) {
  if (!assessment.accepted || assessment.listingType !== LISTING_TYPES.COMPLETE_SET) return null;
  const parent = catalog.seriesById?.get(assessment.seriesId) ?? (catalog.series ?? []).find((entry) => entry.id === assessment.seriesId);
  return {
    series_id: assessment.seriesId,
    series_name: text(parent?.name),
    listing_type: LISTING_TYPES.COMPLETE_SET,
    market_review_type: MARKET_REVIEW_TYPES.FULL_SET,
    variant_id: null,
    matched_variant_id: null,
    source: assessment.provider,
    price: Number(listing.price),
    status: safeStatus(listing.status),
    title: text(listing.title || listing.name).slice(0, 500),
    source_url: safePublicUrl(listing.source_url || listing.url),
    confidence: assessment.confidence,
    reason: assessment.reason,
    formal_lineup_count: assessment.formalLineupCount,
    detected_complete_count: assessment.detectedCompleteCount,
  };
}

export function evaluateSeriesCompleteSetCandidates({ records = [], queryPlan = [], catalog = {} } = {}) {
  const queryByText = new Map(queryPlan.flatMap((query) => [query.query, ...(query.fallback_queries ?? [])]
    .map((value) => [normalize(value), query])));
  const evaluated = [];
  for (const record of records) {
    if (record?.market_safety?.reason !== "not_single_item") continue;
    const query = queryByText.get(normalize(record.raw?.query || record.raw?.keyword));
    const assessment = query ? assessSeriesCompleteSetCandidate(record, query, catalog) : reject("query_context_missing");
    evaluated.push({ record, assessment, preview: buildSeriesCompleteSetPreview(record, assessment, catalog) });
  }
  return evaluated;
}

export function summarizeSeriesCompleteSetDiagnostic({ records = [], evaluations = [] } = {}) {
  const accepted = evaluations.filter((entry) => entry.assessment.accepted);
  const reasonCounts = {};
  for (const entry of evaluations.filter((item) => !item.assessment.accepted)) {
    const reason = entry.assessment.reason;
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  }
  return {
    marketplace_raw_candidate_count: records.length,
    existing_single_accepted_count: records.filter((entry) => entry.market_safety?.accepted === true).length,
    existing_not_single_item_count: records.filter((entry) => entry.market_safety?.reason === "not_single_item").length,
    complete_set_classifier_evaluated_count: evaluations.length,
    complete_set_accepted_count: accepted.length,
    unique_series_with_complete_set_evidence: new Set(accepted.map((entry) => entry.assessment.seriesId)).size,
    rejected_count: evaluations.length - accepted.length,
    reject_reason_counts: Object.fromEntries(Object.entries(reasonCounts).sort(([left], [right]) => left.localeCompare(right))),
    accepted_preview: accepted.map((entry) => entry.preview).filter(Boolean),
    database_writes: 0,
  };
}

export function detectCompleteSetSignal(value) {
  const title = text(value).normalize("NFKC").toLowerCase();
  const count = title.match(/全\s*(\d+)\s*種/u)?.[1] ?? null;
  const strong = count !== null
    || /(?:全種\s*(?:セット|コンプリート)?|フルコンプ(?:リート)?|コンプリートセット|complete\s*set|full\s*set)/iu.test(title);
  return { strong, count: count === null ? null : Number(count) };
}

export function hasCatalogParentIdentityAmbiguity(parent = {}, series = []) {
  const parentName = catalogIdentityName(parent.name);
  if (!parentName) return true;
  const ids = new Set(series
    .filter((entry) => catalogIdentityName(entry?.name) === parentName)
    .map((entry) => String(entry.id)));
  return ids.size > 1;
}

export function withoutCompleteSetSignals(value) {
  return text(value)
    .replace(/全\s*\d+\s*種(?:\s*(?:セット|コンプリート|フルコンプ(?:リート)?))*\s*(?:セット)?/giu, " ")
    .replace(/全種\s*(?:セット|コンプリート)?/giu, " ")
    .replace(/(?:フルコンプ(?:リート)?|コンプリート\s*セット|complete\s*set|full\s*set)/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function reject(reason, parentIdentity = null, complete = null, formalLineupCount = null) {
  return { accepted: false, reviewRequired: true, reason, confidence: 0, listingType: LISTING_TYPES.UNKNOWN, marketReviewType: MARKET_REVIEW_TYPES.UNKNOWN, seriesId: null, variantId: null, matchedVariantId: null, parentIdentity, formalLineupCount, detectedCompleteCount: complete?.count ?? null };
}
function normalizeProvider(listing) { const value = String(listing.raw?.provider || listing.source || "").toLowerCase(); return value === "rakuten" ? "rakuten_ichiba" : value === "yahoo" ? "yahoo_shopping" : value; }
function hasSingleItemConflict(value) {
  const title = text(value);
  return /(?:全\s*(?:\d+\s*種|種|種類)\s*(?:のうち|より|から)\s*(?:ランダム\s*)?\d+\s*(?:種|種類|個)|全\s*(?:\d+\s*種|種|種類)\s*ランダム\s*\d+\s*(?:種|種類|個)|(?:単品|バラ売り))/iu.test(title);
}
function catalogIdentityName(value) { return String(value ?? "").normalize("NFKC").toLowerCase().replace(/[\p{Z}\s\p{P}\p{S}]+/gu, ""); }
function safeStatus(value) { const status = String(value || "").toLowerCase(); return ["active", "sold", "pre_release"].includes(status) ? status : "unknown"; }
function safePublicUrl(value) { try { const url = new URL(String(value)); if (url.protocol !== "https:" || url.username || url.password) return ""; url.search = ""; url.hash = ""; return url.toString(); } catch { return ""; } }
function text(value) { return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim(); }
function normalize(value) { return text(value).toLowerCase(); }
