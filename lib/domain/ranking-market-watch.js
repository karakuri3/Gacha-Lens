import { LISTING_TYPES } from "./gacha-schema.js";
import { dedupeMarketListings } from "./market-evidence.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_WINDOW_DAYS = 30;
const VARIANT_TYPES = new Set([
  LISTING_TYPES.SINGLE,
  LISTING_TYPES.RARE_SINGLE,
  LISTING_TYPES.SECRET_SINGLE,
]);

export function buildActiveListingWatch(items = [], { scope = "variant", now = new Date() } = {}) {
  return items
    .map((item) => buildActiveListingWatchEntry(item, { scope, now }))
    .filter(Boolean)
    .sort((a, b) => {
      const recency = new Date(b.observedAt || 0).getTime() - new Date(a.observedAt || 0).getTime();
      if (recency !== 0) return recency;
      if (b.listingCount !== a.listingCount) return b.listingCount - a.listingCount;
      return String(a.item?.name || "").localeCompare(String(b.item?.name || ""), "ja");
    });
}

export function buildActiveListingWatchEntry(item = {}, { scope = "variant", now = new Date() } = {}) {
  const listings = dedupeMarketListings(Array.isArray(item.market_listings) ? item.market_listings : [])
    .filter((listing) => isEligibleActiveListing(listing, item, scope, now));
  if (!listings.length) return null;

  const prices = listings.map((listing) => Number(listing.price)).sort((a, b) => a - b);
  const observedAt = listings
    .map((listing) => listingObservedAt(listing))
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || "";
  const providers = new Set(listings.map((listing) => String(listing.source || "").trim()).filter(Boolean));

  return {
    item,
    listingCount: listings.length,
    providerCount: providers.size,
    minimumPrice: prices[0],
    maximumPrice: prices[prices.length - 1],
    observedAt,
    windowDays: ACTIVE_WINDOW_DAYS,
  };
}

export function formatAskingPrice(entry = {}) {
  if (!Number.isFinite(entry.minimumPrice) || !Number.isFinite(entry.maximumPrice)) return "データ不足";
  const low = formatYen(entry.minimumPrice);
  const high = formatYen(entry.maximumPrice);
  return entry.listingCount > 1 && entry.minimumPrice !== entry.maximumPrice ? `${low}〜${high}` : low;
}

function isEligibleActiveListing(listing, item, scope, now) {
  if (!listing || listing.status !== "active" || listing.review_required === true) return false;
  if (!isPositivePrice(listing.price) || !isWithinWindow(listingObservedAt(listing), now, ACTIVE_WINDOW_DAYS)) return false;

  if (scope === "series") {
    return listing.listing_type === LISTING_TYPES.COMPLETE_SET
      && String(listing.series_id || "") === String(item.id || item.series_id || "");
  }

  if (!VARIANT_TYPES.has(listing.listing_type) || !variantTypeMatchesSubject(listing.listing_type, item)) return false;
  const linkedVariantId = String(listing.matched_variant_id || listing.variant_id || "");
  return linkedVariantId !== "" && linkedVariantId === String(item.id || item.variant_id || "");
}

function variantTypeMatchesSubject(listingType, item) {
  const text = `${item.variant_type || ""} ${item.rarity || ""} ${item.name || ""}`;
  if (/secret|シークレット/i.test(text)) {
    return listingType === LISTING_TYPES.SECRET_SINGLE || listingType === LISTING_TYPES.RARE_SINGLE;
  }
  if (/rare|レア|当たり/i.test(text)) {
    return listingType === LISTING_TYPES.RARE_SINGLE || listingType === LISTING_TYPES.SECRET_SINGLE;
  }
  return listingType === LISTING_TYPES.SINGLE;
}

function listingObservedAt(listing) {
  return listing.last_observed_at || listing.listed_at || listing.updated_at || listing.created_at || "";
}

function isWithinWindow(value, now, days) {
  const nowMs = new Date(now).getTime();
  const time = new Date(value || "").getTime();
  if (!Number.isFinite(nowMs) || !Number.isFinite(time)) return false;
  const age = nowMs - time;
  return age >= 0 && age <= days * DAY_MS;
}

function isPositivePrice(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function formatYen(value) {
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}
