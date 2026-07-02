import { LISTING_TYPES } from "./gacha-schema";

export function buildMarketSummary(variant, listings = []) {
  const groups = Object.values(LISTING_TYPES).reduce((acc, type) => {
    acc[type] = summarizeListingType(listings, type);
    return acc;
  }, {});
  const single = coalesceNumber(variant.market?.single, groups[LISTING_TYPES.SINGLE].median_sold);
  const rareSingle = coalesceNumber(variant.market?.rare, groups[LISTING_TYPES.RARE_SINGLE].median_sold);
  const secretSingle = coalesceNumber(variant.market?.secret, groups[LISTING_TYPES.SECRET_SINGLE].median_sold);
  const completeSet = coalesceNumber(variant.market?.complete, groups[LISTING_TYPES.COMPLETE_SET].median_sold);
  const popularSet = coalesceNumber(variant.market?.popularSet, groups[LISTING_TYPES.POPULAR_SET].median_sold);
  const lastObservedAt = latestDate(listings.map((listing) => listing.sold_at || listing.listed_at || listing.updated_at || listing.created_at));
  const listingCount = listings.length;
  const soldCount = listings.filter((listing) => listing.status === "sold").length;
  const activeListingCount = listings.filter((listing) => listing.status === "active").length;

  return {
    single,
    rare_single: rareSingle,
    secret_single: secretSingle,
    complete_set: completeSet,
    partial_set: groups[LISTING_TYPES.PARTIAL_SET].median_sold,
    popular_set: popularSet,
    listing_count: listingCount,
    sold_count: soldCount,
    active_listing_count: activeListingCount,
    pre_release_listing_count: listings.filter((listing) => listing.status === "pre_release").length,
    last_observed_at: lastObservedAt,
    price_confidence: priceConfidence({ listingCount, soldCount, activeListingCount, groups, single }),
    sell_through_signal: sellThroughSignal({ soldCount, activeListingCount }),
    type_stats: groups,
    recent_sold_price: latestPrice(listings.filter((listing) => listing.status === "sold")),
    lowest_active_price: minPrice(listings.filter((listing) => listing.status === "active")),
  };
}

export function buildListingGroups(summary) {
  return [
    { type: LISTING_TYPES.SINGLE, label: "単品相場", value: summary.single },
    { type: LISTING_TYPES.RARE_SINGLE, label: "レア単品", value: summary.rare_single },
    { type: LISTING_TYPES.SECRET_SINGLE, label: "シークレット", value: summary.secret_single },
    { type: LISTING_TYPES.COMPLETE_SET, label: "コンプセット", value: summary.complete_set },
    { type: LISTING_TYPES.PARTIAL_SET, label: "一部セット", value: summary.partial_set },
    { type: LISTING_TYPES.POPULAR_SET, label: "人気キャラセット", value: summary.popular_set },
  ];
}

function summarizeListingType(listings, listingType) {
  const scoped = listings.filter((listing) => listing.listing_type === listingType);
  const sold = scoped.filter((listing) => listing.status === "sold");
  const active = scoped.filter((listing) => listing.status === "active");
  return {
    type: listingType,
    listing_count: scoped.length,
    sold_count: sold.length,
    active_listing_count: active.length,
    median_sold: median(sold.map((listing) => listing.price)),
    average_sold: average(sold.map((listing) => listing.price)),
    recent_sold_price: latestPrice(sold),
    lowest_active_price: minPrice(active),
    last_observed_at: latestDate(scoped.map((listing) => listing.sold_at || listing.listed_at || listing.updated_at || listing.created_at)),
    confidence: typeConfidence(scoped.length, sold.length),
  };
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function average(values) {
  const filtered = values.filter(Number.isFinite);
  if (!filtered.length) return null;
  return Math.round(filtered.reduce((sum, value) => sum + value, 0) / filtered.length);
}

function minPrice(listings) {
  const values = listings.map((listing) => listing.price).filter(Number.isFinite);
  return values.length ? Math.min(...values) : null;
}

function latestPrice(listings) {
  const latest = [...listings]
    .filter((listing) => Number.isFinite(listing.price))
    .sort((a, b) => new Date(b.sold_at || b.listed_at || 0) - new Date(a.sold_at || a.listed_at || 0))[0];
  return latest?.price ?? null;
}

function latestDate(values) {
  const dates = values
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a);
  return dates.length ? new Date(dates[0]).toISOString() : "";
}

function priceConfidence({ listingCount, soldCount, activeListingCount, groups, single }) {
  if (!Number.isFinite(single)) return { score: 0, label: "データ不足", reason: "sold_single_missing" };
  const singleStats = groups[LISTING_TYPES.SINGLE] ?? {};
  const raw = Math.min(100, soldCount * 18 + activeListingCount * 5 + listingCount * 3 + (singleStats.confidence ?? 0) * 0.35);
  const score = Math.round(raw);
  if (score >= 75) return { score, label: "高", reason: "sold_and_active_enough" };
  if (score >= 45) return { score, label: "中", reason: "limited_but_usable" };
  return { score, label: "低", reason: "few_comps" };
}

function typeConfidence(listingCount, soldCount) {
  return Math.min(100, Math.round(soldCount * 24 + listingCount * 8));
}

function sellThroughSignal({ soldCount, activeListingCount }) {
  const denominator = soldCount + activeListingCount;
  const rate = denominator ? soldCount / denominator : 0;
  if (soldCount >= 3 && rate >= 0.55) return { score: 90, label: "売れ行きあり", rate };
  if (soldCount >= 1 && rate >= 0.35) return { score: 65, label: "動きあり", rate };
  if (activeListingCount >= 3 && soldCount === 0) return { score: 30, label: "出品多め", rate };
  return { score: 0, label: "データ不足", rate };
}

function coalesceNumber(...values) {
  return values.find(Number.isFinite) ?? null;
}
