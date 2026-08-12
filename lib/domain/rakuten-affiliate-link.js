import { LISTING_TYPES } from "./gacha-schema.js";

const RAKUTEN_SOURCES = new Set(["rakuten", "rakuten_ichiba"]);
const DIRECT_LISTING_TYPES = new Set([
  LISTING_TYPES.SINGLE,
  LISTING_TYPES.RARE_SINGLE,
  LISTING_TYPES.SECRET_SINGLE,
]);
export const RAKUTEN_ITEM_SEARCH_DOCUMENTATION = "https://webservice.rakuten.co.jp/documentation/ichiba-item-search";

export function selectRakutenAffiliateListing(listings = []) {
  return (Array.isArray(listings) ? listings : [])
    .filter(isSafeRakutenAffiliateListing)
    .sort(compareCurrentListing)[0] ?? null;
}

export function getRakutenAffiliateDestination(item = {}) {
  const listing = selectRakutenAffiliateListing(item.market_listings ?? item.marketListings);
  if (!listing) return null;
  const destination = sanitizeRakutenAffiliateProvenance({
    provider: listing.raw?.provider,
    publicUrl: listing.source_url,
    affiliateUrl: listing.raw?.affiliate_url,
    affiliateUrlSource: listing.raw?.affiliate_url_source,
    sourceDocumentation: listing.raw?.source_documentation,
  });
  return {
    href: destination.url,
    listingId: String(listing.id || ""),
  };
}

export function isSafeRakutenAffiliateListing(listing = {}) {
  if (listing.review_required === true || !listing.variant_id) return false;
  if (!DIRECT_LISTING_TYPES.has(String(listing.listing_type || ""))) return false;
  if (String(listing.status || "").toLowerCase() !== "active") return false;
  if (!RAKUTEN_SOURCES.has(String(listing.source || "").toLowerCase())) return false;
  if (String(listing.raw?.provider || "").toLowerCase() !== "rakuten_ichiba") return false;
  if (!String(listing.raw?.itemCode || listing.raw?.source_listing_id || "").trim()) return false;

  return Boolean(sanitizeRakutenAffiliateProvenance({
    provider: listing.raw?.provider,
    publicUrl: listing.source_url,
    affiliateUrl: listing.raw?.affiliate_url,
    affiliateUrlSource: listing.raw?.affiliate_url_source,
    sourceDocumentation: listing.raw?.source_documentation,
  }));
}

export function sanitizeRakutenAffiliateProvenance({
  provider,
  publicUrl,
  affiliateUrl,
  affiliateUrlSource,
  sourceDocumentation,
} = {}) {
  if (String(provider || "").toLowerCase() !== "rakuten_ichiba") return null;
  if (affiliateUrlSource !== "rakuten_api") return null;
  if (sourceDocumentation !== RAKUTEN_ITEM_SEARCH_DOCUMENTATION) return null;
  const identityUrl = parseOfficialRakutenUrl(publicUrl);
  const destinationUrl = parseOfficialRakutenUrl(affiliateUrl);
  if (!identityUrl || identityUrl.hostname.toLowerCase() !== "item.rakuten.co.jp" || !destinationUrl) return null;
  return {
    url: destinationUrl.toString(),
    source: "rakuten_api",
    documentation: RAKUTEN_ITEM_SEARCH_DOCUMENTATION,
  };
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
