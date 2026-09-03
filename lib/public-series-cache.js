import "server-only";
import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import {
  getRelatedSeries as getRelatedSeriesUncached,
  getSeriesBySlug as getSeriesBySlugUncached,
} from "./series.js";

export * from "./series.js";

const PUBLIC_DETAIL_CACHE_SECONDS = 1800;

const loadCachedVariantDetail = unstable_cache(
  async (encodedSlug) => {
    const normalizedSlug = decodeCacheSlug(encodedSlug);
    const cacheIdentity = hashCacheIdentity(["variant", encodedSlug]);
    logCacheOrigin("variant", cacheIdentity);
    return getSeriesBySlugUncached(normalizedSlug);
  },
  ["gacha-public-variant-detail-v2"],
  { revalidate: PUBLIC_DETAIL_CACHE_SECONDS, tags: ["gacha-public-variant-v2"] }
);

const loadCachedRelatedSeries = unstable_cache(
  async (encodedSlug, limit) => {
    const normalizedSlug = decodeCacheSlug(encodedSlug);
    const cacheIdentity = hashCacheIdentity(["related", encodedSlug, String(limit)]);
    logCacheOrigin("related", cacheIdentity);
    return getRelatedSeriesUncached(normalizedSlug, limit);
  },
  ["gacha-public-related-detail-v2"],
  { revalidate: PUBLIC_DETAIL_CACHE_SECONDS, tags: ["gacha-public-related-v2"] }
);

export async function getSeriesBySlug(slug) {
  return loadCachedVariantDetail(encodeCacheSlug(normalizeSlugValue(slug)));
}

export async function getRelatedSeries(slug, limit = 4) {
  return loadCachedRelatedSeries(encodeCacheSlug(normalizeSlugValue(slug)), limit);
}

function logCacheOrigin(operation, cacheIdentity) {
  console.info(`[p0-public-detail-cache-origin] ${operation} ${cacheIdentity.slice(0, 12)}`);
}

function hashCacheIdentity(parts) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function encodeCacheSlug(value) {
  return encodeURIComponent(value);
}

function decodeCacheSlug(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return String(value || "");
  }
}

function normalizeSlugValue(value) {
  const text = String(value || "").trim();
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
