import { LISTING_TYPES, MARKET_REVIEW_TYPES } from "./gacha-schema.js";
import { isPublicVariant } from "./variant-publication.js";

export const MARKET_EVIDENCE_TIERS = Object.freeze({
  SOLD: "sold_market",
  REFERENCE: "reference_market",
  LISTING_GUIDE: "listing_guide",
  INSUFFICIENT: "insufficient",
});

const DAY_MS = 24 * 60 * 60 * 1000;
const VARIANT_LISTING_TYPES = new Set([
  LISTING_TYPES.SINGLE,
  LISTING_TYPES.RARE_SINGLE,
  LISTING_TYPES.SECRET_SINGLE,
]);
const SET_LISTING_TYPES = new Set([
  LISTING_TYPES.COMPLETE_SET,
  LISTING_TYPES.PARTIAL_SET,
  LISTING_TYPES.POPULAR_SET,
]);

export function classifyMarketEvidence({
  subject = {},
  listings = [],
  scope = "variant",
  listingTypes,
  now = new Date(),
} = {}) {
  const isPreRelease = !Boolean(subject.released ?? subject.is_released ?? subject.isReleased);
  const allowedTypes = new Set(listingTypes?.length ? listingTypes : defaultListingTypes(subject, scope));
  const publicSubject = scope === "series" || isPublicVariant(subject);
  const uniqueListings = dedupeMarketListings(Array.isArray(listings) ? listings : []);

  const eligible = publicSubject
    ? uniqueListings.filter((listing) => isEligibleListing(listing, subject, scope, allowedTypes))
    : [];
  const completed = eligible.filter((listing) => listing.status === "sold" && isWithinWindow(listing, now, 90));
  const active = eligible.filter(
    (listing) => activeStatuses(isPreRelease).has(listing.status) && isWithinWindow(listing, now, 30)
  );
  const completedPrices = completed.map((listing) => Number(listing.price));
  const activePrices = active.map((listing) => Number(listing.price));

  let tier = MARKET_EVIDENCE_TIERS.INSUFFICIENT;
  let basis = [];
  let windowDays = null;
  if (!isPreRelease && completed.length >= 5) {
    tier = MARKET_EVIDENCE_TIERS.SOLD;
    basis = completed;
    windowDays = 90;
  } else if (!isPreRelease && completed.length >= 3) {
    tier = MARKET_EVIDENCE_TIERS.REFERENCE;
    basis = completed;
    windowDays = 90;
  } else if (active.length >= 3) {
    tier = MARKET_EVIDENCE_TIERS.LISTING_GUIDE;
    basis = active;
    windowDays = 30;
  }

  const prices = basis.map((listing) => Number(listing.price));
  const prefix = scope === "series" ? "セット" : "";
  const label = evidenceLabel(tier, { isPreRelease, prefix });
  const completedCount = completed.length;
  const activeCount = active.length;

  return {
    tier,
    label,
    scope,
    primaryPrice: tier === MARKET_EVIDENCE_TIERS.INSUFFICIENT ? null : median(prices),
    minimumPrice: tier === MARKET_EVIDENCE_TIERS.INSUFFICIENT ? null : minimum(prices),
    maximumPrice: tier === MARKET_EVIDENCE_TIERS.INSUFFICIENT ? null : maximum(prices),
    medianPrice: tier === MARKET_EVIDENCE_TIERS.INSUFFICIENT ? null : median(prices),
    interquartileRange: completedCount >= 8 && basis === completed
      ? { low: percentile(completedPrices, 0.25), high: percentile(completedPrices, 0.75) }
      : null,
    completedCount,
    activeCount,
    eligibleListingCount: eligible.length,
    lastObservedAt: latestObservedAt(eligible),
    evidenceCount: basis.length,
    windowDays,
    observedCompletedPrices: [...completedPrices],
    observedActivePrices: [...activePrices],
    completedEvidence: completed.map(toEvidencePoint),
    activeEvidence: active.map(toEvidencePoint),
    isPreRelease,
    explanation: evidenceExplanation({ tier, completedCount, activeCount, isPreRelease }),
    eligibleForPriceRanking: !isPreRelease && completedCount >= 3,
  };
}

function latestObservedAt(listings) {
  const latest = listings.reduce((value, listing) => Math.max(value, observedTime(listing)), 0);
  return latest > 0 ? new Date(latest).toISOString() : null;
}

export function dedupeMarketListings(listings = []) {
  const selected = new Map();
  listings.forEach((listing, index) => {
    const key = marketListingKey(listing, index);
    const current = selected.get(key);
    if (!current || observedTime(listing) >= observedTime(current)) selected.set(key, listing);
  });
  return [...selected.values()];
}

export function evidenceLabel(tier, { isPreRelease = false, prefix = "" } = {}) {
  if (tier === MARKET_EVIDENCE_TIERS.SOLD) return `${prefix}成約相場`;
  if (tier === MARKET_EVIDENCE_TIERS.REFERENCE) return `${prefix}参考相場`;
  if (tier === MARKET_EVIDENCE_TIERS.LISTING_GUIDE) {
    return isPreRelease ? "予約・出品価格" : `${prefix}出品価格の目安`;
  }
  return prefix ? `${prefix}価格データ不足` : "データ不足";
}

export function median(values = []) {
  const sorted = values.filter(isPositivePrice).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export function percentile(values = [], ratio) {
  const sorted = values.filter(isPositivePrice).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * ratio;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  if (low === high) return sorted[low];
  return Math.round(sorted[low] + (sorted[high] - sorted[low]) * (position - low));
}

function defaultListingTypes(subject, scope) {
  if (scope === "series") return [...SET_LISTING_TYPES];
  const text = `${subject.variant_type || ""} ${subject.rarity || ""} ${subject.name || ""}`;
  if (/secret|シークレット/i.test(text)) return [LISTING_TYPES.SECRET_SINGLE, LISTING_TYPES.RARE_SINGLE];
  if (/rare|レア|当たり/i.test(text)) return [LISTING_TYPES.RARE_SINGLE, LISTING_TYPES.SECRET_SINGLE];
  return [LISTING_TYPES.SINGLE];
}

function isEligibleListing(listing, subject, scope, allowedTypes) {
  if (!listing || listing.review_required === true || !isPositivePrice(listing.price)) return false;
  if (!allowedTypes.has(listing.listing_type)) return false;
  if (listing.listing_type === LISTING_TYPES.UNKNOWN || listing.market_review_type === MARKET_REVIEW_TYPES.UNKNOWN) return false;
  if (scope === "series") {
    return SET_LISTING_TYPES.has(listing.listing_type) && String(listing.series_id || "") === String(subject.id || subject.series_id || "");
  }
  if (!VARIANT_LISTING_TYPES.has(listing.listing_type)) return false;
  const linkedVariantId = String(listing.matched_variant_id || listing.variant_id || "");
  return linkedVariantId !== "" && linkedVariantId === String(subject.id || subject.variant_id || "");
}

function activeStatuses(isPreRelease) {
  return new Set(isPreRelease ? ["active", "pre_release"] : ["active"]);
}

function isWithinWindow(listing, now, days) {
  const reference = listingDate(listing);
  const nowMs = new Date(now).getTime();
  const time = new Date(reference).getTime();
  if (!Number.isFinite(nowMs) || !Number.isFinite(time)) return false;
  const age = nowMs - time;
  return age >= 0 && age <= days * DAY_MS;
}

function listingDate(listing) {
  if (listing.status === "sold") {
    return listing.sold_at || listing.last_observed_at || listing.updated_at || listing.created_at || "";
  }
  return listing.last_observed_at || listing.listed_at || listing.updated_at || listing.created_at || "";
}

function marketListingKey(listing, index) {
  const raw = listing.raw && typeof listing.raw === "object" ? listing.raw : {};
  const canonical = listing.canonical_listing_id || raw.canonical_listing_id;
  if (canonical) return `canonical:${canonical}`;
  const sourceId = listing.source_listing_id || raw.source_listing_id || raw.listing_id || raw.item_id;
  if (sourceId) return `source:${listing.source || "unknown"}:${sourceId}`;
  const url = normalizeUrl(listing.source_url || listing.url || raw.source_url || raw.url);
  if (url) return `url:${url}`;
  if (listing.id) return `id:${listing.id}`;
  return `row:${index}`;
}

function normalizeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|ref|tracking)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function observedTime(listing) {
  const value = listing.last_observed_at || listing.sold_at || listing.listed_at || listing.updated_at || listing.created_at;
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function toEvidencePoint(listing) {
  return {
    id: listing.id || "",
    price: Number(listing.price),
    observedAt: listingDate(listing),
    status: listing.status,
  };
}

function evidenceExplanation({ tier, completedCount, activeCount, isPreRelease }) {
  if (tier === MARKET_EVIDENCE_TIERS.SOLD) return `直近90日・成約${completedCount}件`;
  if (tier === MARKET_EVIDENCE_TIERS.REFERENCE) return `直近90日・成約${completedCount}件`;
  if (tier === MARKET_EVIDENCE_TIERS.LISTING_GUIDE) {
    return `直近30日・${isPreRelease ? "予約・出品" : "出品"}${activeCount}件（売れた価格ではありません）`;
  }
  if (completedCount > 0) return `確認できた成約価格 ${completedCount}件`;
  if (activeCount > 0) return `確認できた出品価格 ${activeCount}件`;
  return "相場を判断できるだけのデータがまだありません";
}

function isPositivePrice(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function minimum(values) {
  return values.length ? Math.min(...values) : null;
}

function maximum(values) {
  return values.length ? Math.max(...values) : null;
}
