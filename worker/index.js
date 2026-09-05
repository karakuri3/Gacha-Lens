import handler from "vinext/server/fetch-handler";

const PREVIEW_HOST_SUFFIX = ".workers.dev";
const NON_CACHEABLE_HTML_MARKERS = ["商品情報を取得できません"];

const EDGE_CACHE_POLICIES = {
  seriesDetail: {
    cacheControl: "public, max-age=1800, stale-while-revalidate=60",
    cacheTag: "gacha-series-detail",
    marker: "series-detail-1800-v1",
    contentTypes: ["text/html"],
  },
  discoveryIndex: {
    cacheControl: "public, max-age=86400, stale-while-revalidate=300",
    cacheTag: "gacha-discovery-index",
    marker: "discovery-index-86400-v1",
    contentTypes: ["text/html"],
  },
  discoveryDocument: {
    cacheControl: "public, max-age=1800, stale-while-revalidate=60",
    cacheTag: "gacha-discovery-document",
    marker: "discovery-document-1800-v1",
    contentTypes: ["text/html"],
  },
  publicDocument: {
    cacheControl: "public, max-age=120, stale-while-revalidate=30",
    cacheTag: "gacha-public-document",
    marker: "public-document-120-v1",
    contentTypes: ["text/html"],
  },
  publicSitemap: {
    cacheControl: "public, max-age=86400, stale-while-revalidate=300",
    cacheTag: "gacha-public-sitemap",
    marker: "public-sitemap-86400-v1",
    contentTypes: ["application/xml", "text/xml", "text/plain"],
  },
};

const DISCOVERY_INDEX_PATHS = new Set([
  "/categories",
  "/brands",
  "/franchises",
]);

const DISCOVERY_DOCUMENT_PATHS = new Set([
  "/series",
]);

const PUBLIC_DOCUMENT_PATHS = new Set([
  "/",
  "/ranking",
  "/restocks",
  "/stock",
  "/schedule",
  "/guides",
]);

const PUBLIC_SITEMAP_PATHS = new Set([
  "/robots.txt",
  "/sitemap.xml",
  "/series-sitemap.xml",
  "/variant-sitemap.xml",
]);

function isNextInternalRequest(request) {
  return [
    "rsc",
    "next-router-state-tree",
    "next-router-prefetch",
    "next-router-segment-prefetch",
    "next-url",
  ].some((header) => request.headers.has(header));
}

function isPublicCacheCandidate(request) {
  if (request.method !== "GET") return false;
  if (request.headers.has("authorization") || request.headers.has("cookie")) return false;
  return !isNextInternalRequest(request);
}

function isDiscoveryDocumentPath(pathname) {
  if (DISCOVERY_DOCUMENT_PATHS.has(pathname)) return true;
  return /^\/(?:categories|brands|franchises)\/[^/]+$/.test(pathname);
}

function getEdgeCachePolicy(request) {
  if (!isPublicCacheCandidate(request)) return null;

  const url = new URL(request.url);
  const accept = (request.headers.get("accept") ?? "").toLowerCase();

  if (/^\/series\/[^/]+$/.test(url.pathname) && accept.includes("text/html")) {
    if (url.searchParams.size === 0) return EDGE_CACHE_POLICIES.seriesDetail;

    // Allow one cache-busting proof key only on isolated workers.dev previews.
    // Production custom domains remain query-string cache ineligible to avoid
    // cache-key fragmentation and user-controlled cache variants.
    if (
      url.hostname.endsWith(PREVIEW_HOST_SUFFIX) &&
      url.searchParams.size === 1 &&
      url.searchParams.has("cacheproof")
    ) {
      return EDGE_CACHE_POLICIES.seriesDetail;
    }
    return null;
  }

  // Discovery index roots are expensive to rebuild and their taxonomy/counts do
  // not require sub-hour freshness. A daily edge boundary keeps their full-table
  // origin work bounded to roughly the same cadence as the public sitemaps.
  if (
    url.searchParams.size === 0 &&
    accept.includes("text/html") &&
    DISCOVERY_INDEX_PATHS.has(url.pathname)
  ) {
    return EDGE_CACHE_POLICIES.discoveryIndex;
  }

  // The main series listing and first-page facet landings are non-personalized
  // but change more often. Cache only their no-query HTML forms so pagination and
  // search variants cannot create unbounded cache-key cardinality.
  if (
    url.searchParams.size === 0 &&
    accept.includes("text/html") &&
    isDiscoveryDocumentPath(url.pathname)
  ) {
    return EDGE_CACHE_POLICIES.discoveryDocument;
  }

  // Other shared public document pages are cacheable only without query
  // parameters. Search, filter and pagination variants intentionally bypass edge
  // storage so user-controlled cache-key cardinality stays bounded.
  if (
    url.searchParams.size === 0 &&
    accept.includes("text/html") &&
    PUBLIC_DOCUMENT_PATHS.has(url.pathname)
  ) {
    return EDGE_CACHE_POLICIES.publicDocument;
  }

  if (url.searchParams.size === 0 && PUBLIC_SITEMAP_PATHS.has(url.pathname)) {
    return EDGE_CACHE_POLICIES.publicSitemap;
  }

  return null;
}

async function canStoreResponse(response, policy) {
  if (!policy || response.status !== 200) return false;
  if (response.headers.has("set-cookie")) return false;

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!policy.contentTypes.some((expected) => contentType.includes(expected))) return false;

  // Next.js error boundaries can render a branded error document while the outer
  // HTTP response remains 200. Never let that transient document become the
  // shared edge representation for an otherwise healthy public URL.
  if (contentType.includes("text/html")) {
    const body = await response.clone().text();
    if (NON_CACHEABLE_HTML_MARKERS.some((marker) => body.includes(marker))) return false;
  }

  return true;
}

export default {
  async fetch(request, env, ctx) {
    const policy = getEdgeCachePolicy(request);
    const response = await handler.fetch(request, env, ctx);

    if (!(await canStoreResponse(response, policy))) {
      return response;
    }

    const headers = new Headers(response.headers);
    headers.set("Cloudflare-CDN-Cache-Control", policy.cacheControl);
    headers.set("Cache-Tag", policy.cacheTag);
    headers.set("X-Gacha-Edge-Cache-Policy", policy.marker);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
