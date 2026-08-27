import { buildMarketCandidateKey } from "./market-candidate-key.js";

const CONTROL = /[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
const RAKUTEN_SHOP_CODE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const RAKUTEN_ITEM_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PROVIDER_STOREFRONT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PERSISTED_SOURCES = new Map([
  ["rakuten_ichiba", new Set(["rakuten_item_search_shop_code", "rakuten_item_code_shop_code_legacy"])],
  ["yahoo_shopping", new Set(["yahoo_shopping_item_search_storefront_id", "yahoo_shopping_seller_id_legacy"])],
]);

// This is intentionally provider-scoped. It never asserts cross-provider merchant equivalence.
export function buildMarketplaceStorefrontEvidenceByCandidateKey(records = []) {
  const entries = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    const candidateKey = buildMarketCandidateKey(record);
    if (!candidateKey || entries.has(candidateKey)) continue;
    entries.set(candidateKey, resolveMarketplaceStorefrontEvidence(record));
  }
  return entries;
}

export function resolveMarketplaceStorefrontEvidence(record = {}) {
  const raw = object(record.raw);
  const provider = normalizeProvider(raw.provider ?? record.source?.provider ?? record.source);
  if (provider === "rakuten_ichiba") {
    const shopCode = normalizedRakutenShopCode(raw.shopCode);
    if (text(raw.shopCode, 120)) {
      return storefront({
        provider,
        id: shopCode,
        name: text(raw.shopName, 180),
        source: "rakuten_item_search_shop_code",
      });
    }
    const legacyShopCode = recoverRakutenLegacyShopCode(raw);
    if (legacyShopCode) {
      return storefront({
        provider,
        id: legacyShopCode,
        name: "",
        source: "rakuten_item_code_shop_code_legacy",
      });
    }
    const persisted = resolvePersistedStorefrontProvenance(raw, provider);
    if (persisted) return persisted;
    return unknown(provider);
  }
  if (provider === "yahoo_shopping") {
    const seller = object(raw.seller);
    const sellerId = normalizedProviderStorefrontId(seller.sellerId ?? seller.seller_id ?? raw.sellerId ?? raw.seller_id);
    if (sellerId) {
      return storefront({
        provider,
        id: sellerId,
        name: text(seller.name ?? seller.sellerName ?? seller.seller_name, 180),
        source: seller.sellerId || seller.seller_id ? "yahoo_shopping_item_search_storefront_id" : "yahoo_shopping_seller_id_legacy",
      });
    }
    const persisted = resolvePersistedStorefrontProvenance(raw, provider);
    if (persisted) return persisted;
    return unknown(provider);
  }
  return unknown(provider);
}

// The returned allowlist is ready for a future persistence caller but is not persisted by this diagnostic.
export function buildSanitizedMarketplaceStorefrontProvenance(record = {}) {
  const identity = resolveMarketplaceStorefrontEvidence(record);
  if (!identity.storefront_id) return {};
  return {
    storefront_id: identity.storefront_id,
    storefront_name: identity.storefront_name,
    storefront_identity_source: identity.storefront_identity_source,
  };
}

export function recoverRakutenLegacyShopCode(value = {}) {
  const raw = object(value);
  const sourceListingId = text(raw.source_listing_id, 300);
  const itemCode = text(raw.itemCode, 300);
  const candidates = [sourceListingId, itemCode].filter(Boolean);
  if (!candidates.length) return null;
  const parsed = candidates.map(parseRakutenItemCode);
  if (parsed.some((entry) => !entry) || new Set(parsed).size !== 1) return null;
  return parsed[0];
}

function parseRakutenItemCode(value) {
  const match = /^([a-z0-9][a-z0-9-]{0,63}):([A-Za-z0-9][A-Za-z0-9._-]{0,127})$/.exec(text(value, 300));
  return match && RAKUTEN_SHOP_CODE.test(match[1]) && RAKUTEN_ITEM_ID.test(match[2]) ? match[1] : null;
}

function resolvePersistedStorefrontProvenance(raw, provider) {
  const source = text(raw.storefront_identity_source, 120);
  const id = provider === "rakuten_ichiba" ? normalizedRakutenShopCode(raw.storefront_id) : normalizedProviderStorefrontId(raw.storefront_id);
  if (!id || !PERSISTED_SOURCES.get(provider)?.has(source)) return null;
  return storefront({ provider, id, name: text(raw.storefront_name, 180), source });
}

function normalizedRakutenShopCode(value) {
  const code = text(value, 120).toLowerCase();
  return RAKUTEN_SHOP_CODE.test(code) ? code : null;
}

function normalizedProviderStorefrontId(value) {
  const id = text(value, 120);
  return PROVIDER_STOREFRONT_ID.test(id) ? id : null;
}

export function storefrontIdentityKey(value = {}) {
  const provider = normalizeProvider(value.provider);
  const id = text(value.storefront_id, 120);
  return provider && id ? `${provider}:${id}` : null;
}

export function compareIndependentStorefrontEvidence(candidate = {}, existing = []) {
  const candidateKey = storefrontIdentityKey(candidate);
  if (!candidateKey || !Array.isArray(existing) || !existing.length) return "unknown";
  const existingKeys = existing.map(storefrontIdentityKey);
  if (existingKeys.some((key) => !key)) return "unknown";
  return existingKeys.includes(candidateKey) ? false : true;
}

function storefront({ provider, id, name, source }) {
  if (!provider || !id) return unknown(provider);
  return {
    provider,
    storefront_id: id,
    storefront_name: name || null,
    storefront_identity_source: source,
    merchant_identity: null,
    merchant_identity_status: "unknown",
  };
}

function unknown(provider) {
  return {
    provider: normalizeProvider(provider) || null,
    storefront_id: null,
    storefront_name: null,
    storefront_identity_source: null,
    merchant_identity: null,
    merchant_identity_status: "unknown",
  };
}

function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function text(value, limit) { return String(value ?? "").normalize("NFKC").replace(CONTROL, "").replace(/\s+/g, " ").trim().slice(0, limit); }
function normalizeProvider(value) {
  const provider = text(value, 64).toLowerCase();
  if (["rakuten", "rakuten_ichiba"].includes(provider)) return "rakuten_ichiba";
  if (["yahoo", "yahoo_shopping"].includes(provider)) return "yahoo_shopping";
  return provider;
}
