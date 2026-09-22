import { WorkerEntrypoint } from "cloudflare:workers";
import handler from "vinext/server/fetch-handler";

const PREVIEW_HOST_SUFFIX = ".workers.dev";
const NON_CACHEABLE_HTML_MARKERS = ["商品情報を取得できません"];
const PREVIEW_ASYNC_CACHE_PARAM = "asynccacheproof";
const INTERNAL_CACHE_MODE_HEADER = "x-gacha-validated-cache-mode";

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

function isPublicSitemapPath(pathname) {
  return PUBLIC_SITEMAP_PATHS.has(pathname) || /^\/variant-sitemap\/[1-9]\d*$/.test(pathname);
}

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

function isSeriesDetailCachePath(pathname) {
  return /^\/series\/(?:[^/]+|group\/[^/]+)$/.test(pathname);
}

function getEdgeCachePolicy(request) {
  if (!isPublicCacheCandidate(request)) return null;

  const url = new URL(request.url);
  const accept = (request.headers.get("accept") ?? "").toLowerCase();

  if (isSeriesDetailCachePath(url.pathname) && accept.includes("text/html")) {
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

  if (url.searchParams.size === 0 && isPublicSitemapPath(url.pathname)) {
    return EDGE_CACHE_POLICIES.publicSitemap;
  }

  return null;
}

function getPreviewAsyncCachePolicy(request) {
  if (!isPublicCacheCandidate(request)) return null;

  const url = new URL(request.url);
  const accept = (request.headers.get("accept") ?? "").toLowerCase();
  if (!url.hostname.endsWith(PREVIEW_HOST_SUFFIX)) return null;
  if (!accept.includes("text/html")) return null;
  if (url.searchParams.size !== 1 || !url.searchParams.has(PREVIEW_ASYNC_CACHE_PARAM)) return null;
  if (!/^\/categories\/[^/]+$/.test(url.pathname)) return null;
  return EDGE_CACHE_POLICIES.discoveryDocument;
}

function responseMatchesPolicyHeaders(response, policy) {
  if (!policy || response.status !== 200) return false;
  if (response.headers.has("set-cookie")) return false;

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  return policy.contentTypes.some((expected) => contentType.includes(expected));
}

function withEdgeCacheHeaders(response, policy, extraHeaders = {}) {
  const headers = new Headers(response.headers);
  headers.set("Cloudflare-CDN-Cache-Control", policy.cacheControl);
  headers.set("Cache-Tag", policy.cacheTag);
  headers.set("X-Gacha-Edge-Cache-Policy", policy.marker);
  for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function previewInternalRequest(request, mode) {
  const headers = new Headers(request.headers);
  headers.set(INTERNAL_CACHE_MODE_HEADER, mode);
  return new Request(request.url, {
    method: "GET",
    headers,
  });
}

function previewPublicRequest(request) {
  const headers = new Headers(request.headers);
  headers.delete(INTERNAL_CACHE_MODE_HEADER);
  return new Request(request.url, {
    method: "GET",
    headers,
  });
}

async function fillValidatedPreviewCache(request, ctx) {
  const fill = await ctx.exports.ValidatedPreviewCache.fetch(previewInternalRequest(request, "fill"));
  await fill.arrayBuffer();
}

async function handlePreviewAsyncCache(request, env, ctx, policy) {
  if (!ctx.exports?.ValidatedPreviewCache) {
    const response = await handler.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set("Cloudflare-CDN-Cache-Control", "no-store");
    headers.set("X-Gacha-Async-Cache", "ctx-exports-unavailable");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const lookup = await ctx.exports.ValidatedPreviewCache.fetch(previewInternalRequest(request, "lookup"));
  if (lookup.status === 200 && lookup.headers.get("x-gacha-validated-cache") === "stored") {
    const headers = new Headers(lookup.headers);
    headers.set("X-Gacha-Async-Cache", "validated-hit");
    return new Response(lookup.body, {
      status: lookup.status,
      statusText: lookup.statusText,
      headers,
    });
  }

  const response = await handler.fetch(request, env, ctx);
  if (responseMatchesPolicyHeaders(response, policy)) {
    ctx.waitUntil(fillValidatedPreviewCache(request, ctx));
  }

  const headers = new Headers(response.headers);
  headers.set("Cloudflare-CDN-Cache-Control", "no-store");
  headers.delete("Cache-Tag");
  headers.delete("X-Gacha-Edge-Cache-Policy");
  headers.set("X-Gacha-Async-Cache", "miss-deferred");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export class ValidatedPreviewCache extends WorkerEntrypoint {
  async fetch(request) {
    const policy = getPreviewAsyncCachePolicy(request);
    if (!policy) {
      return new Response(null, {
        status: 204,
        headers: {
          "Cache-Control": "no-store",
          "X-Gacha-Validated-Cache": "ineligible",
        },
      });
    }

    if (request.headers.get(INTERNAL_CACHE_MODE_HEADER) !== "fill") {
      return new Response(null, {
        status: 204,
        headers: {
          "Cache-Control": "no-store",
          "X-Gacha-Validated-Cache": "miss",
        },
      });
    }

    const response = await handler.fetch(previewPublicRequest(request), this.env, this.ctx);
    if (!(await canStoreResponse(response, policy))) {
      return new Response(null, {
        status: 204,
        headers: {
          "Cache-Control": "no-store",
          "X-Gacha-Validated-Cache": "rejected",
        },
      });
    }

    return withEdgeCacheHeaders(response, policy, {
      "X-Gacha-Validated-Cache": "stored",
    });
  }
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
    const previewAsyncPolicy = getPreviewAsyncCachePolicy(request);
    if (previewAsyncPolicy) {
      return handlePreviewAsyncCache(request, env, ctx, previewAsyncPolicy);
    }

    const policy = getEdgeCachePolicy(request);
    const response = await handler.fetch(request, env, ctx);

    if (!(await canStoreResponse(response, policy))) {
      return response;
    }

    return withEdgeCacheHeaders(response, policy);
  },
};