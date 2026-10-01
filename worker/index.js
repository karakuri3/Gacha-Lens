import handler from "vinext/server/fetch-handler";
import { getLegacyCategoryDiscoveryPageRedirectPath } from "../lib/domain/category-discovery.js";
import { getLegacyDiscoveryFacetPageRedirectPath } from "../lib/domain/discovery-facets.js";
import { getLegacyRankingRedirectPath } from "../lib/domain/ranking-routes.js";
import { handlePublicDocumentData } from "./public-document-data.js";

// Phase A3 exact-head Preview verification anchor; no runtime behavior change.
const PREVIEW_HOST_SUFFIX = ".workers.dev";
const RELEASE_SOURCE_SHA = String(process.env.GACHA_RELEASE_SOURCE_SHA ?? "").trim().toLowerCase();
const RELEASE_SOURCE_SHA_RE = /^[0-9a-f]{40}$/;
const RELEASE_SOURCE_PATH = "/api/runtime-diagnostics/release-source";
// Release proof returns only this immutable Git SHA; runtime bindings and secrets are never returned.
// Keeping the marker in the Worker entrypoint makes Preview and custom-domain identity fail closed at runtime.

function getReleaseSourceIdentityResponse(request) {
  const url = new URL(request.url);
  if (url.pathname !== RELEASE_SOURCE_PATH) return null;

  const headers = new Headers({
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "application/json; charset=utf-8",
  });
  if (!["GET", "HEAD"].includes(request.method)) {
    headers.set("Allow", "GET, HEAD");
    return new Response(request.method === "HEAD" ? null : JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers,
    });
  }

  const sourceSha = RELEASE_SOURCE_SHA_RE.test(RELEASE_SOURCE_SHA) ? RELEASE_SOURCE_SHA : null;
  return new Response(request.method === "HEAD" ? null : JSON.stringify({ source_sha: sourceSha }), {
    status: sourceSha ? 200 : 503,
    headers,
  });
}
const NON_CACHEABLE_HTML_MARKERS = ["商品情報を取得できません"];

const EDGE_CACHE_POLICIES = {
  seriesDetail: {
    cacheControl: "public, max-age=300, stale-while-revalidate=60",
    cacheTag: "gacha-series-detail",
    marker: "series-detail-300-v2",
    contentTypes: ["text/html"],
  },
  discoveryIndex: {
    cacheControl: "public, max-age=300, stale-while-revalidate=60",
    cacheTag: "gacha-discovery-index",
    marker: "discovery-index-300-v2",
    contentTypes: ["text/html"],
  },
  discoveryDocument: {
    cacheControl: "public, max-age=300, stale-while-revalidate=60",
    cacheTag: "gacha-discovery-document",
    marker: "discovery-document-300-v2",
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
  "/ranking/series",
  "/ranking/upcoming",
  "/ranking/upcoming/series",
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
  return /^\/(?:brands|franchises)\/[^/]+(?:\/page\/[1-9]\d*)?$/.test(pathname)
    || /^\/categories\/[^/]+(?:\/page\/[1-9]\d*)?$/.test(pathname);
}

function isSeriesDetailCachePath(pathname) {
  return /^\/series\/(?:[^/]+|group\/[^/]+)$/.test(pathname);
}

function isScheduleArchiveCacheUrl(url) {
  if (url.pathname !== "/schedule") return false;
  if (url.searchParams.getAll("month").length !== 1) return false;
  if (url.searchParams.getAll("page").length > 1) return false;
  if (![...url.searchParams.keys()].every((key) => key === "month" || key === "page")) return false;

  const month = url.searchParams.get("month") || "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return false;

  const page = url.searchParams.get("page");
  if (page === null) return true;
  if (!/^[1-9]\d*$/.test(page)) return false;
  const pageNumber = Number(page);
  return pageNumber >= 2 && pageNumber <= 1000;
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

  // Schedule has a deliberately bounded query contract. Only canonical month
  // archives and canonical page=2..1000 variants may enter shared cache; unknown
  // keys, duplicate keys and arbitrary search/filter values remain ineligible.
  if (accept.includes("text/html") && isScheduleArchiveCacheUrl(url)) {
    return EDGE_CACHE_POLICIES.publicDocument;
  }

  // Other shared public document pages are cacheable only without query
  // parameters. Search/filter variants intentionally bypass edge storage so
  // user-controlled cache-key cardinality stays bounded.
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

function getLegacyCategoryDiscoveryPageRedirect(request) {
  if (!["GET", "HEAD"].includes(request.method)) return null;

  const url = new URL(request.url);
  const redirectPath = getLegacyCategoryDiscoveryPageRedirectPath(url);
  if (!redirectPath) return null;

  const target = new URL(redirectPath, url.origin);
  return Response.redirect(target.toString(), 308);
}

function getLegacyDiscoveryFacetPageRedirect(request) {
  if (!["GET", "HEAD"].includes(request.method)) return null;

  const url = new URL(request.url);
  const redirectPath = getLegacyDiscoveryFacetPageRedirectPath(url);
  if (!redirectPath) return null;

  const target = new URL(redirectPath, url.origin);
  return Response.redirect(target.toString(), 308);
}

function getLegacyRankingRedirect(request) {
  if (!["GET", "HEAD"].includes(request.method)) return null;

  const url = new URL(request.url);
  const redirectPath = getLegacyRankingRedirectPath(url);
  if (!redirectPath) return null;

  const target = new URL(redirectPath, url.origin);
  return Response.redirect(target.toString(), 308);
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
    const publicDocumentData = await handlePublicDocumentData(request, env);
    if (publicDocumentData) return publicDocumentData;

    const releaseSourceIdentity = getReleaseSourceIdentityResponse(request);
    if (releaseSourceIdentity) return releaseSourceIdentity;

    const legacyCategoryRedirect = getLegacyCategoryDiscoveryPageRedirect(request);
    if (legacyCategoryRedirect) return legacyCategoryRedirect;

    const legacyDiscoveryFacetRedirect = getLegacyDiscoveryFacetPageRedirect(request);
    if (legacyDiscoveryFacetRedirect) return legacyDiscoveryFacetRedirect;

    const legacyRankingRedirect = getLegacyRankingRedirect(request);
    if (legacyRankingRedirect) return legacyRankingRedirect;

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