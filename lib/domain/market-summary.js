import { LISTING_TYPES } from "./gacha-schema";

export function buildMarketSummary(variant, listings = []) {
  return {
    single: variant.market?.single ?? medianByType(listings, LISTING_TYPES.SINGLE),
    rare_single: variant.market?.rare ?? medianByType(listings, LISTING_TYPES.RARE_SINGLE),
    secret_single: variant.market?.secret ?? medianByType(listings, LISTING_TYPES.SECRET_SINGLE),
    complete_set: variant.market?.complete ?? medianByType(listings, LISTING_TYPES.COMPLETE_SET),
    partial_set: medianByType(listings, LISTING_TYPES.PARTIAL_SET),
    popular_set: variant.market?.popularSet ?? medianByType(listings, LISTING_TYPES.POPULAR_SET),
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

function medianByType(listings, listingType) {
  return median(
    listings
      .filter((listing) => listing.listing_type === listingType && listing.status === "sold")
      .map((listing) => listing.price)
  );
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}
