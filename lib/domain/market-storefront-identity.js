import { buildMarketCandidateKey } from "./market-candidate-key.js";

const CONTROL = /[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

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
    return storefront({
      provider,
      id: text(raw.shopCode, 120),
      name: text(raw.shopName, 180),
      source: "rakuten_item_search_shop_code",
    });
  }
  if (provider === "yahoo_shopping") {
    const seller = object(raw.seller);
    return storefront({
      provider,
      id: text(seller.sellerId ?? seller.seller_id, 120),
      name: text(seller.name ?? seller.sellerName ?? seller.seller_name, 180),
      source: "yahoo_shopping_item_search_storefront_id",
    });
  }
  return unknown(provider);
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
