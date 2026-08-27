import { LISTING_TYPES, MARKET_REVIEW_TYPES } from "./gacha-schema.js";
import { sanitizeMarketPublicUrl } from "./market-candidate-key.js";

const PROVIDERS = Object.freeze({
  yahoo_shopping: { source: "yahoo_shopping", label: "Yahoo!ショッピング", hosts: new Set(["store.shopping.yahoo.co.jp"]) },
  rakuten_ichiba: { source: "rakuten", label: "楽天市場", hosts: new Set(["item.rakuten.co.jp"]) },
});

export function buildSeriesCompleteSetReference({ series = {}, listings = [] } = {}) {
  const candidates = (Array.isArray(listings) ? listings : [])
    .map((listing) => normalizeCompleteSetReference(listing, series))
    .filter(Boolean)
    .sort(compareReference);
  return candidates[0] ?? null;
}

export function normalizeCompleteSetReference(listing = {}, series = {}) {
  const seriesId = text(series.id || series.series_id);
  if (!seriesId
    || text(listing.series_id) !== seriesId
    || listing.listing_type !== LISTING_TYPES.COMPLETE_SET
    || listing.market_review_type !== MARKET_REVIEW_TYPES.FULL_SET
    || listing.variant_id != null
    || listing.matched_variant_id != null
    || listing.status !== "active"
    || listing.review_required === true
    || listing.classification_reason !== "series_complete_set_confirmed"
    || !Number.isFinite(Number(listing.classification_confidence))
    || Number(listing.classification_confidence) < 0.8
    || !Number.isFinite(Number(listing.price))
    || Number(listing.price) <= 0) return null;

  const provider = resolveProvider(listing);
  const sourceUrl = safeMarketplaceUrl(listing.source_url, provider);
  if (!provider || !sourceUrl) return null;
  const lineupCount = series.lineup_verification_status === "verified" && Number(series.verified_variant_count) >= 2
    ? Number(series.verified_variant_count)
    : null;
  return {
    listing_id: text(listing.id),
    series_id: seriesId,
    price: Number(listing.price),
    provider: provider.key,
    provider_label: provider.label,
    source_url: sourceUrl,
    observed_at: newestDate(listing),
    lineup_count: lineupCount,
    lineup_label: lineupCount ? `全${lineupCount}種セット` : "コンプリートセット",
    note: "現在確認できた出品1件の価格です。売れた価格や相場の中央値ではありません。",
  };
}

export function safeSeriesCompleteSetReferenceUrl(value, providerKey) {
  return safeMarketplaceUrl(value, PROVIDERS[providerKey]);
}

function resolveProvider(listing) {
  const rawProvider = text(listing.raw?.provider).toLowerCase();
  const source = text(listing.source).toLowerCase();
  if ((rawProvider === "yahoo_shopping" || source === "yahoo_shopping") && source === PROVIDERS.yahoo_shopping.source) return { key: "yahoo_shopping", ...PROVIDERS.yahoo_shopping };
  if ((rawProvider === "rakuten_ichiba" || source === "rakuten") && source === PROVIDERS.rakuten_ichiba.source) return { key: "rakuten_ichiba", ...PROVIDERS.rakuten_ichiba };
  return null;
}

function safeMarketplaceUrl(value, provider) {
  if (!provider) return null;
  const sanitized = sanitizeMarketPublicUrl(value);
  if (!sanitized) return null;
  try {
    const url = new URL(sanitized);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !provider.hosts.has(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function compareReference(left, right) {
  return new Date(right.observed_at).getTime() - new Date(left.observed_at).getTime()
    || left.listing_id.localeCompare(right.listing_id, "en")
    || left.source_url.localeCompare(right.source_url, "en");
}

function newestDate(listing) {
  for (const value of [listing.last_observed_at, listing.listed_at, listing.updated_at, listing.created_at]) {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return date.toISOString();
  }
  return "1970-01-01T00:00:00.000Z";
}

function text(value) { return String(value ?? "").trim(); }
