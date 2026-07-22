import { LISTING_TYPES } from "./gacha-schema.js";
import {
  MARKET_EVIDENCE_TIERS,
  classifyMarketEvidence,
  median,
} from "./market-evidence.js";

export function buildMarketSummary(subject, listings = [], options = {}) {
  const scope = options.scope ?? "variant";
  const now = options.now ?? new Date();
  const evidence = classifyMarketEvidence({ subject, listings, scope, now });
  const groups = Object.values(LISTING_TYPES).reduce((result, listingType) => {
    const typeEvidence = classifyMarketEvidence({
      subject,
      listings,
      scope,
      listingTypes: [listingType],
      now,
    });
    result[listingType] = evidenceStats(typeEvidence, listingType);
    return result;
  }, {});

  const preferredType = primarySingleType(subject);
  const preferredEvidence = scope === "variant"
    ? classifyMarketEvidence({ subject, listings, scope, listingTypes: [preferredType], now })
    : null;
  const completeSetEvidence = scope === "series"
    ? classifyMarketEvidence({ subject, listings, scope, listingTypes: [LISTING_TYPES.COMPLETE_SET], now })
    : null;
  const partialSetEvidence = scope === "series"
    ? classifyMarketEvidence({ subject, listings, scope, listingTypes: [LISTING_TYPES.PARTIAL_SET], now })
    : null;
  const popularSetEvidence = scope === "series"
    ? classifyMarketEvidence({ subject, listings, scope, listingTypes: [LISTING_TYPES.POPULAR_SET], now })
    : null;
  const selected = scope === "series" ? completeSetEvidence : preferredEvidence;
  const completedPrices = selected?.observedCompletedPrices ?? [];
  const activePrices = selected?.observedActivePrices ?? [];
  const estimatedResaleRange = completedPrices.length >= 3
    ? {
        low: Math.min(...completedPrices),
        high: Math.max(...completedPrices),
        midpoint: median(completedPrices),
        evidence_count: completedPrices.length,
        sold_count: completedPrices.length,
        active_count: activePrices.length,
        basis: "confirmed_sold",
        confidence: evidenceConfidence(selected),
      }
    : null;

  return {
    evidence,
    single: scope === "variant" ? preferredEvidence.primaryPrice : null,
    rare_single: scope === "variant" ? groups[LISTING_TYPES.RARE_SINGLE].primary_price : null,
    secret_single: scope === "variant" ? groups[LISTING_TYPES.SECRET_SINGLE].primary_price : null,
    complete_set: scope === "series" ? completeSetEvidence.primaryPrice : null,
    partial_set: scope === "series" ? partialSetEvidence.primaryPrice : null,
    popular_set: scope === "series" ? popularSetEvidence.primaryPrice : null,
    buyback_price: null,
    listing_count: evidence.completedCount + evidence.activeCount,
    sold_count: evidence.completedCount,
    active_listing_count: evidence.activeCount,
    pre_release_listing_count: evidence.isPreRelease ? evidence.activeCount : 0,
    all_time_listing_count: Array.isArray(listings) ? listings.length : 0,
    last_observed_at: latestEvidenceDate(evidence),
    price_confidence: evidenceConfidence(evidence),
    sell_through_signal: sellThroughSignal(evidence.completedCount, evidence.activeCount),
    type_stats: groups,
    recent_sold_price: latestEvidencePrice(selected?.completedEvidence),
    lowest_active_price: activePrices.length ? Math.min(...activePrices) : null,
    price_basis: evidence.tier,
    estimated_resale_range: estimatedResaleRange,
    provider_breakdown: [],
  };
}

export function buildListingGroups(summary) {
  return [
    { type: LISTING_TYPES.SINGLE, label: "単品", value: summary.single, evidence: summary.type_stats?.single },
    { type: LISTING_TYPES.RARE_SINGLE, label: "レア単品", value: summary.rare_single, evidence: summary.type_stats?.rare_single },
    { type: LISTING_TYPES.SECRET_SINGLE, label: "シークレット", value: summary.secret_single, evidence: summary.type_stats?.secret_single },
    { type: LISTING_TYPES.COMPLETE_SET, label: "コンプセット", value: summary.complete_set, evidence: summary.type_stats?.complete_set },
    { type: LISTING_TYPES.PARTIAL_SET, label: "一部セット", value: summary.partial_set, evidence: summary.type_stats?.partial_set },
    { type: LISTING_TYPES.POPULAR_SET, label: "人気キャラセット", value: summary.popular_set, evidence: summary.type_stats?.popular_set },
  ];
}

function evidenceStats(evidence, type) {
  return {
    type,
    tier: evidence.tier,
    label: evidence.label,
    primary_price: evidence.primaryPrice,
    listing_count: evidence.completedCount + evidence.activeCount,
    sold_count: evidence.completedCount,
    active_listing_count: evidence.activeCount,
    median_sold: median(evidence.observedCompletedPrices),
    average_sold: average(evidence.observedCompletedPrices),
    median_active: median(evidence.observedActivePrices),
    average_active: average(evidence.observedActivePrices),
    recent_sold_price: latestEvidencePrice(evidence.completedEvidence),
    lowest_active_price: evidence.observedActivePrices.length ? Math.min(...evidence.observedActivePrices) : null,
    last_observed_at: latestEvidenceDate(evidence),
    confidence: evidenceConfidence(evidence).score,
    explanation: evidence.explanation,
    eligible_for_price_ranking: evidence.eligibleForPriceRanking,
  };
}

function primarySingleType(subject) {
  const text = `${subject.variant_type || ""} ${subject.rarity || ""} ${subject.name || ""}`;
  if (/secret|シークレット/i.test(text)) return LISTING_TYPES.SECRET_SINGLE;
  if (/rare|レア|当たり/i.test(text)) return LISTING_TYPES.RARE_SINGLE;
  return LISTING_TYPES.SINGLE;
}

function evidenceConfidence(evidence) {
  if (evidence?.tier === MARKET_EVIDENCE_TIERS.SOLD) return { score: 90, label: "高", reason: "completed_sales_5_plus" };
  if (evidence?.tier === MARKET_EVIDENCE_TIERS.REFERENCE) return { score: 62, label: "参考", reason: "completed_sales_3_to_4" };
  if (evidence?.tier === MARKET_EVIDENCE_TIERS.LISTING_GUIDE) return { score: 35, label: "出品価格", reason: "active_listings_only" };
  return { score: 0, label: "データ不足", reason: "insufficient_evidence" };
}

function sellThroughSignal(soldCount, activeCount) {
  const denominator = soldCount + activeCount;
  const rate = denominator ? soldCount / denominator : 0;
  if (soldCount >= 3 && rate >= 0.55) return { score: 90, label: "売れ行きあり", rate };
  if (soldCount >= 1 && rate >= 0.35) return { score: 65, label: "動きあり", rate };
  if (activeCount >= 3 && soldCount === 0) return { score: 30, label: "出品多め", rate };
  return { score: 0, label: "データ不足", rate };
}

function latestEvidenceDate(evidence) {
  const values = [...(evidence?.completedEvidence ?? []), ...(evidence?.activeEvidence ?? [])]
    .map((entry) => new Date(entry.observedAt).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a);
  return values.length ? new Date(values[0]).toISOString() : "";
}

function latestEvidencePrice(points = []) {
  return [...points]
    .sort((a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime())[0]?.price ?? null;
}

function average(values = []) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}
