import handler from "vinext/server/fetch-handler";
import { runWithPublicDataSourceFailureTracking } from "../lib/data/public-data-source-failure-context.js";

const PREVIEW_HOST_SUFFIX = ".workers.dev";
const NON_CACHEABLE_HTML_MARKERS = ["商品情報を取得できません"];
const DEGRADED_RESPONSE_MARKER = "data-source-error-503-v1";
const DEGRADED_RETRY_AFTER_SECONDS = "3600";
const P0_281_PROBE_PATH = "/__gacha_p0_281_handler_probe";

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

    if (
      url.hostname.endsWith(PREVIEW_HOST_SUFFIX) &&
      url.searchParams.size === 1 &&
      url.searchParams.has("cacheproof")
    ) {
      return EDGE_CACHE_POLICIES.seriesDetail;
    }
    return null;
  }

  if (
    url.searchParams.size === 0 &&
    accept.includes("text/html") &&
    DISCOVERY_INDEX_PATHS.has(url.pathname)
  ) {
    return EDGE_CACHE_POLICIES.discoveryIndex;
  }

  if (
    url.searchParams.size === 0 &&
    accept.includes("text/html") &&
    isDiscoveryDocumentPath(url.pathname)
  ) {
    return EDGE_CACHE_POLICIES.discoveryDocument;
  }

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

function isTrackedDataFailureHtmlResponse(request, response) {
  if (request.method !== "GET" || isNextInternalRequest(request)) return false;
  if (response.status !== 200) return false;
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  return contentType.includes("text/html");
}

async function fetchWithTrackedDataFailure(request, env, ctx) {
  return runWithPublicDataSourceFailureTracking(async () => {
    const response = await handler.fetch(request, env, ctx);
    if (isTrackedDataFailureHtmlResponse(request, response)) {
      // vinext/Next may resolve the Response before streamed Server Components
      // finish rendering. Drain one clone while the AsyncLocalStorage context is
      // still active so late DataSourceError construction marks this request.
      await response.clone().text();
    }
    return response;
  });
}

async function inspectDegradedHtmlResponse(request, response) {
  if (request.method !== "GET" || isNextInternalRequest(request)) {
    return { degraded: false, htmlMarkerChecked: false };
  }
  if (response.status !== 200) return { degraded: false, htmlMarkerChecked: false };

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("text/html")) {
    return { degraded: false, htmlMarkerChecked: false };
  }

  const body = await response.clone().text();
  return {
    degraded: NON_CACHEABLE_HTML_MARKERS.some((marker) => body.includes(marker)),
    htmlMarkerChecked: true,
  };
}

function buildDegradedResponse(response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Cloudflare-CDN-Cache-Control", "no-store");
  headers.set("Retry-After", DEGRADED_RETRY_AFTER_SECONDS);
  headers.set("X-Gacha-Degraded", DEGRADED_RESPONSE_MARKER);
  headers.delete("Cache-Tag");
  headers.delete("X-Gacha-Edge-Cache-Policy");

  return new Response(response.body, {
    status: 503,
    statusText: "Service Unavailable",
    headers,
  });
}

async function canStoreResponse(response, policy, { htmlMarkerChecked = false } = {}) {
  if (!policy || response.status !== 200) return false;
  if (response.headers.has("set-cookie")) return false;

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!policy.contentTypes.some((expected) => contentType.includes(expected))) return false;

  if (contentType.includes("text/html") && !htmlMarkerChecked) {
    const body = await response.clone().text();
    if (NON_CACHEABLE_HTML_MARKERS.some((marker) => body.includes(marker))) return false;
  }

  return true;
}

function isP0281ProbeRequest(request) {
  const url = new URL(request.url);
  return request.method === "GET"
    && url.hostname.endsWith(PREVIEW_HOST_SUFFIX)
    && url.pathname === P0_281_PROBE_PATH;
}

async function runP0281HandlerProbe(request, env, ctx) {
  const rootUrl = new URL("/", request.url);
  const probeRequest = new Request(rootUrl, {
    method: "GET",
    headers: {
      accept: "text/html",
      "user-agent": "gacha-lens-p0-281-preview-probe",
    },
  });
  const tracked = await fetchWithTrackedDataFailure(probeRequest, env, ctx);
  const response = tracked.response;
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const body = contentType.includes("text/html") ? await response.clone().text() : "";

  return Response.json({
    probe: "p0-281-handler-v3",
    handler_status: response.status,
    content_type: contentType,
    tracked_data_source_failure: tracked.failed,
    marker_found: NON_CACHEABLE_HTML_MARKERS.some((marker) => body.includes(marker)),
    body_length: body.length,
    vinext_cache: response.headers.get("x-vinext-cache"),
  }, {
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    if (isP0281ProbeRequest(request)) {
      return runP0281HandlerProbe(request, env, ctx);
    }

    const policy = getEdgeCachePolicy(request);
    const tracked = await fetchWithTrackedDataFailure(request, env, ctx);
    const response = tracked.response;

    if (tracked.failed && isTrackedDataFailureHtmlResponse(request, response)) {
      return buildDegradedResponse(response);
    }

    const degradedInspection = await inspectDegradedHtmlResponse(request, response);
    if (degradedInspection.degraded) {
      return buildDegradedResponse(response);
    }

    if (!(await canStoreResponse(response, policy, { htmlMarkerChecked: degradedInspection.htmlMarkerChecked }))) {
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
