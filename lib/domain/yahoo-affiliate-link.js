import { LISTING_TYPES } from "./gacha-schema.js";

const YAHOO_SOURCES = new Set(["yahoo", "yahoo_shopping"]);
const DIRECT_LISTING_TYPES = new Set([
  LISTING_TYPES.SINGLE,
  LISTING_TYPES.RARE_SINGLE,
  LISTING_TYPES.SECRET_SINGLE,
]);

export const YAHOO_ITEM_SEARCH_DOCUMENTATION = "https://developer.yahoo.co.jp/webapi/shopping/v3/itemsearch.html";
export const YAHOO_AFFILIATE_DOCUMENTATION = "https://developer.yahoo.co.jp/webapi/shopping/affiliate.html";
export const YAHOO_AFFILIATE_PROVENANCE_CONTRACT = "item_search_v3_valuecommerce_code_join";

export function selectYahooAffiliateListing(listings = []) {
  return (Array.isArray(listings) ? listings : [])
    .filter(isSafeYahooAffiliateListing)
    .sort(compareCurrentListing)[0] ?? null;
}

export function getYahooAffiliateDestination(item = {}) {
  const listing = selectYahooAffiliateListing(item.market_listings ?? item.marketListings);
  if (!listing) return null;
  const payload = marketplacePayload(listing);
  const destination = sanitizeYahooAffiliateProvenance({
    provider: payload.provider,
    listingId: payload.code || payload.source_listing_id,
    publicUrl: listing.source_url,
    affiliateUrl: payload.affiliate_url,
    affiliateUrlSource: payload.affiliate_url_source,
    affiliateUrlContract: payload.affiliate_url_contract,
    sourceDocumentation: payload.affiliate_url_documentation || payload.source_documentation,
  });
  if (!destination) return null;
  return { href: destination.url, listingId: String(listing.id || "") };
}

export function isSafeYahooAffiliateListing(listing = {}) {
  if (listing.review_required === true || !listing.variant_id) return false;
  if (!DIRECT_LISTING_TYPES.has(String(listing.listing_type || ""))) return false;
  if (String(listing.status || "").toLowerCase() !== "active") return false;
  if (!YAHOO_SOURCES.has(String(listing.source || "").toLowerCase())) return false;
  const payload = marketplacePayload(listing);
  if (String(payload.provider || "").toLowerCase() !== "yahoo_shopping") return false;

  const listingId = String(payload.code || payload.source_listing_id || "").trim();
  if (!listingId) return false;
  return Boolean(sanitizeYahooAffiliateProvenance({
    provider: payload.provider,
    listingId,
    publicUrl: listing.source_url,
    affiliateUrl: payload.affiliate_url,
    affiliateUrlSource: payload.affiliate_url_source,
    affiliateUrlContract: payload.affiliate_url_contract,
    sourceDocumentation: payload.affiliate_url_documentation || payload.source_documentation,
  }));
}

export function sanitizeYahooAffiliateProvenance({
  provider,
  listingId,
  publicUrl,
  affiliateUrl,
  affiliateUrlSource,
  affiliateUrlContract,
  sourceDocumentation,
} = {}) {
  if (String(provider || "").toLowerCase() !== "yahoo_shopping") return null;
  if (!String(listingId || "").trim()) return null;
  if (affiliateUrlSource !== "yahoo_api") return null;
  if (affiliateUrlContract !== YAHOO_AFFILIATE_PROVENANCE_CONTRACT) return null;
  if (sourceDocumentation !== YAHOO_AFFILIATE_DOCUMENTATION) return null;

  const identityUrl = parseOfficialYahooShoppingUrl(publicUrl);
  const destinationUrl = parseValueCommerceAffiliateUrl(affiliateUrl);
  if (!identityUrl || !destinationUrl) return null;

  const affiliateTarget = parseOfficialYahooShoppingUrl(destinationUrl.searchParams.get("vc_url"));
  if (!affiliateTarget || canonicalYahooIdentity(affiliateTarget) !== canonicalYahooIdentity(identityUrl)) return null;

  return {
    url: destinationUrl.toString(),
    source: "yahoo_api",
    contract: YAHOO_AFFILIATE_PROVENANCE_CONTRACT,
    documentation: YAHOO_AFFILIATE_DOCUMENTATION,
  };
}

function marketplacePayload(listing = {}) {
  const outer = listing.raw;
  if (!outer || typeof outer !== "object" || Array.isArray(outer)) return {};
  const nested = outer.raw;
  if (!nested || typeof nested !== "object" || Array.isArray(nested)) return outer;
  return { ...outer, ...nested };
}

function parseOfficialYahooShoppingUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const hostname = url.hostname.toLowerCase();
    if (hostname !== "shopping.yahoo.co.jp" && !hostname.endsWith(".shopping.yahoo.co.jp")) return null;
    return url;
  } catch {
    return null;
  }
}

function parseValueCommerceAffiliateUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (url.hostname.toLowerCase() !== "ck.jp.ap.valuecommerce.com") return null;
    if (url.pathname !== "/servlet/referral") return null;
    if (["sid", "pid", "vc_url"].some((key) => url.searchParams.getAll(key).length !== 1 || !url.searchParams.get(key))) return null;
    return url;
  } catch {
    return null;
  }
}

function canonicalYahooIdentity(url) {
  const normalized = new URL(url);
  normalized.search = "";
  normalized.hash = "";
  if (normalized.pathname !== "/") normalized.pathname = normalized.pathname.replace(/\/+$/u, "");
  return normalized.toString();
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
