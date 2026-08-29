import { LISTING_TYPES } from "./gacha-schema.js";
import { getRakutenAffiliateDestination } from "./rakuten-affiliate-link.js";
import { getYahooAffiliateDestination } from "./yahoo-affiliate-link.js";

const DIRECT_LISTING_TYPES = new Set([
  LISTING_TYPES.SINGLE,
  LISTING_TYPES.RARE_SINGLE,
  LISTING_TYPES.SECRET_SINGLE,
]);

const SOURCE_CONFIG = Object.freeze({
  rakuten: { provider: "rakuten", label: "楽天市場", host: isRakutenItemHost },
  rakuten_ichiba: { provider: "rakuten", label: "楽天市場", host: isRakutenItemHost },
  yahoo: { provider: "yahoo", label: "Yahoo!ショッピング", host: isYahooShoppingHost },
  yahoo_shopping: { provider: "yahoo", label: "Yahoo!ショッピング", host: isYahooShoppingHost },
});

export function buildObservedListingLinks(item = {}, options = {}) {
  const variantId = clean(item.variant_id || item.id, 220);
  const limit = clampLimit(options.limit);
  const seen = new Set();
  const offers = [];

  for (const listing of Array.isArray(item.market_listings) ? item.market_listings : []) {
    const offer = buildObservedListingLink(listing, { variantId });
    if (!offer || seen.has(offer.identity)) continue;
    seen.add(offer.identity);
    offers.push(offer);
  }

  return offers.sort(compareObservedListings).slice(0, limit);
}

export function buildObservedListingLink(listing = {}, { variantId = "" } = {}) {
  if (!isEligibleObservedListing(listing, variantId)) return null;

  const sourceKey = clean(listing.source, 64).toLowerCase();
  const config = SOURCE_CONFIG[sourceKey];
  if (!config) return null;

  const publicUrl = parsePublicMarketplaceUrl(listing.source_url, config.host);
  if (!publicUrl) return null;

  const affiliate = resolveAffiliateDestination(listing, config.provider);
  const href = affiliate?.href || publicUrl.toString();
  const identity = canonicalIdentity(publicUrl);
  const price = Number(listing.price);
  const storefront = resolveStorefrontLabel(listing);

  return {
    key: clean(listing.id, 240) || identity,
    identity,
    id: config.provider,
    provider: config.provider,
    marketplaceLabel: config.label,
    storefrontLabel: storefront,
    price,
    href,
    isAffiliate: Boolean(affiliate),
    listingId: clean(listing.id, 240) || null,
    observedAt: observedTimeValue(listing),
  };
}

export function isEligibleObservedListing(listing = {}, variantId = "") {
  const listingVariantId = clean(listing.variant_id, 220);
  const expectedVariantId = clean(variantId, 220);
  const price = Number(listing.price);
  return Boolean(
    listingVariantId
    && (!expectedVariantId || listingVariantId === expectedVariantId)
    && listing.review_required !== true
    && String(listing.status || "").toLowerCase() === "active"
    && DIRECT_LISTING_TYPES.has(String(listing.listing_type || ""))
    && Number.isFinite(price)
    && price > 0
  );
}

function resolveAffiliateDestination(listing, provider) {
  const item = { market_listings: [listing] };
  if (provider === "rakuten") return getRakutenAffiliateDestination(item);
  if (provider === "yahoo") return getYahooAffiliateDestination(item);
  return null;
}

function resolveStorefrontLabel(listing = {}) {
  const raw = listingPayload(listing);
  return clean(
    raw.storefront_name
      || raw.storefrontName
      || raw.shopName
      || raw.seller?.name
      || raw.sellerName
      || raw.storefront_id
      || raw.storefrontId
      || raw.shopCode
      || raw.seller?.sellerId
      || raw.sellerId,
    100,
  ) || null;
}

function listingPayload(listing = {}) {
  const raw = listing.raw;
  if (!raw || typeof raw !== "object") return {};
  if (raw.raw && typeof raw.raw === "object") return { ...raw.raw, ...raw };
  return raw;
}

function parsePublicMarketplaceUrl(value, hostCheck) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.username || url.password || !hostCheck(url.hostname.toLowerCase())) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function isRakutenItemHost(hostname) {
  return hostname === "item.rakuten.co.jp";
}

function isYahooShoppingHost(hostname) {
  return hostname === "shopping.yahoo.co.jp" || hostname.endsWith(".shopping.yahoo.co.jp");
}

function canonicalIdentity(url) {
  const normalized = new URL(url);
  normalized.hash = "";
  if (normalized.pathname !== "/") normalized.pathname = normalized.pathname.replace(/\/+$/u, "");
  return normalized.toString();
}

function compareObservedListings(left, right) {
  const priceDelta = left.price - right.price;
  if (priceDelta) return priceDelta;
  const timeDelta = right.observedAt - left.observedAt;
  if (timeDelta) return timeDelta;
  return left.key.localeCompare(right.key);
}

function observedTimeValue(listing = {}) {
  for (const value of [listing.last_observed_at, listing.updated_at, listing.listed_at, listing.created_at]) {
    const parsed = Date.parse(value || "");
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function clampLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 5;
  return Math.max(1, Math.min(8, Math.trunc(parsed)));
}

function clean(value, maxLength) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
