import "server-only";
import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import {
  getRelatedSeries as getRelatedSeriesUncached,
  getSeriesBySlug as getSeriesBySlugUncached,
} from "./series.js";

export * from "./series.js";

const PUBLIC_DETAIL_CACHE_SECONDS = 1800;

export async function getSeriesBySlug(slug) {
  const normalizedSlug = normalizeSlugValue(slug);
  const cacheIdentity = hashCacheIdentity(["variant", normalizedSlug]);
  const loadCachedVariantDetail = unstable_cache(
    async () => {
      logCacheOrigin("variant", cacheIdentity);
      return getSeriesBySlugUncached(normalizedSlug);
    },
    ["gacha-public-variant-detail-v1", cacheIdentity],
    { revalidate: PUBLIC_DETAIL_CACHE_SECONDS, tags: ["gacha-public-variant"] }
  );
  return loadCachedVariantDetail();
}

export async function getRelatedSeries(slug, limit = 4) {
  const normalizedSlug = normalizeSlugValue(slug);
  const cacheIdentity = hashCacheIdentity(["related", normalizedSlug, String(limit)]);
  const loadCachedRelatedSeries = unstable_cache(
    async () => {
      logCacheOrigin("related", cacheIdentity);
      return getRelatedSeriesUncached(normalizedSlug, limit);
    },
    ["gacha-public-related-detail-v1", cacheIdentity],
    { revalidate: PUBLIC_DETAIL_CACHE_SECONDS, tags: ["gacha-public-related"] }
  );
  return loadCachedRelatedSeries();
}

function logCacheOrigin(operation, cacheIdentity) {
  console.info(`[p0-public-detail-cache-origin] ${operation} ${cacheIdentity.slice(0, 12)}`);
}

function hashCacheIdentity(parts) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function normalizeSlugValue(value) {
  const text = String(value || "").trim();
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
