import { LISTING_TYPES } from "./gacha-schema.js";

const RAKUTEN_SOURCES = new Set(["rakuten", "rakuten_ichiba"]);
const DIRECT_LISTING_TYPES = new Set([
  LISTING_TYPES.SINGLE,
  LISTING_TYPES.RARE_SINGLE,
  LISTING_TYPES.SECRET_SINGLE,
]);
const RAKUTEN_ITEM_SEARCH_DOCUMENTATION = "https://webservice.rakuten.co.jp/documentation/ichiba-item-search";

export function selectRakutenAffiliateListing(listings = []) {
  return (Array.isArray(listings) ? listings : [])
    .filter(isSafeRakutenAffiliateListing)
    .sort(compareCurrentListing)[0] ?? null;
}

export function getRakutenAffiliateDestination(item = {}) {
  const listing = selectRakutenAffiliateListing(item.market_listings ?? item.marketListings);
  if (!listing) return null;
  return {
    href: listing.source_url,
    listingId: String(listing.id || ""),
  };
}

export function isSafeRakutenAffiliateListing(listing = {}) {
  if (listing.review_required === true || !listing.variant_id) return false;
  if (!DIRECT_LISTING_TYPES.has(String(listing.listing_type || ""))) return false;
  if (String(listing.status || "").toLowerCase() !== "active") return false;
  if (!RAKUTEN_SOURCES.has(String(listing.source || "").toLowerCase())) return false;
  if (String(listing.raw?.provider || "").toLowerCase() !== "rakuten_ichiba") return false;
  if (!String(listing.raw?.itemCode || "").trim()) return false;
  if (listing.raw?.source_documentation !== RAKUTEN_ITEM_SEARCH_DOCUMENTATION) return false;
  if (listing.raw?.affiliate_url_source !== "rakuten_api") return false;

  const sourceUrl = parseOfficialRakutenUrl(listing.source_url);
  const affiliateUrl = parseOfficialRakutenUrl(listing.raw?.affiliate_url);
  return Boolean(sourceUrl && affiliateUrl && sourceUrl.toString() === affiliateUrl.toString());
}

function parseOfficialRakutenUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const hostname = url.hostname.toLowerCase();
    if (hostname !== "rakuten.co.jp" && !hostname.endsWith(".rakuten.co.jp")) return null;
    return url;
  } catch {
    return null;
  }
}

function compareCurrentListing(left, right) {
  const timeDelta = observedTime(right) - observedTime(left);
  if (timeDelta) return timeDelta;
  return String(left.id || "").localeCompare(String(right.id || ""));
}

function observedTime(listing) {
  for (const value of [listing.last_observed_at, listing.updated_at, listing.listed_at, listing.created_at]) {
    const parsed = Date.parse(value || "");
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}
