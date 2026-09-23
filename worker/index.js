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
    const url = new URL(request.url);
    if (
      url.hostname.endsWith(PREVIEW_HOST_SUFFIX) &&
      url.pathname === "/__diag/async-verified-kv"
    ) {
      return handleAsyncVerifiedKvDiagnostic(request, env, ctx);
    }

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

async function handleAsyncVerifiedKvDiagnostic(request, env, ctx) {
  const url = new URL(request.url);
  const target = url.searchParams.get("target") === "ranking" ? "ranking" : "category";
  const kv = env?.VINEXT_KV_CACHE;
  if (!kv || typeof kv.get !== "function" || typeof kv.put !== "function") {
    return Response.json(
      { error: "VINEXT_KV_CACHE unavailable", target },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  const cacheKey = [
    "gacha-diag-async-verified-html-v1",
    url.hostname,
    target,
  ].join(":");

  const cachedBody = await kv.get(cacheKey);
  if (url.searchParams.get("mode") === "status") {
    return Response.json(
      {
        target,
        cached: typeof cachedBody === "string" && cachedBody.length > 0,
        verified: typeof cachedBody === "string" && cachedBody.length > 0,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  if (typeof cachedBody === "string" && cachedBody.length > 0) {
    return new Response(cachedBody, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
        "X-Gacha-Diag-Async-KV": "HIT",
        "X-Gacha-Diag-Verified": "1",
      },
    });
  }

  const targetPath = target === "ranking"
    ? "/ranking?diag_async_verified_kv=1"
    : "/categories/%E3%82%AC%E3%82%B7%E3%83%A3%E3%83%9D%E3%83%B3?diag_async_verified_kv=1";

  const targetRequest = new Request(new URL(targetPath, request.url), {
    method: "GET",
    headers: {
      accept: "text/html",
      "user-agent": request.headers.get("user-agent") || "gacha-async-kv-diagnostic",
    },
  });

  const response = await handler.fetch(targetRequest, env, ctx);
  const candidate = response.clone();
  ctx.waitUntil(storeVerifiedHtmlInKv(kv, cacheKey, candidate));

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("X-Gacha-Diag-Async-KV", "MISS");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function storeVerifiedHtmlInKv(kv, cacheKey, response) {
  if (response.status !== 200) return;
  if (response.headers.has("set-cookie")) return;

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("text/html")) return;

  const body = await response.text();
  if (!body) return;
  if (NON_CACHEABLE_HTML_MARKERS.some((marker) => body.includes(marker))) return;

  await kv.put(cacheKey, body, { expirationTtl: 300 });
}
