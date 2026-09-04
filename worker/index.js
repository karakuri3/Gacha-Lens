import handler from "vinext/server/fetch-handler";

const SERIES_EDGE_CACHE_CONTROL = "public, max-age=1800, stale-while-revalidate=60";
const PREVIEW_HOST_SUFFIX = ".workers.dev";

function isNextInternalRequest(request) {
  return [
    "rsc",
    "next-router-state-tree",
    "next-router-prefetch",
    "next-router-segment-prefetch",
    "next-url",
  ].some((header) => request.headers.has(header));
}

function isCacheableSeriesDocumentRequest(request) {
  if (request.method !== "GET") return false;
  if (request.headers.has("authorization") || request.headers.has("cookie")) return false;
  if (isNextInternalRequest(request)) return false;

  const accept = request.headers.get("accept") ?? "";
  if (!accept.toLowerCase().includes("text/html")) return false;

  const url = new URL(request.url);
  if (!/^\/series\/[^/]+$/.test(url.pathname)) return false;

  if (url.searchParams.size === 0) return true;

  // Allow one cache-busting proof key only on isolated workers.dev previews.
  // Production custom domains remain query-string cache ineligible to avoid
  // cache-key fragmentation and user-controlled cache variants.
  return (
    url.hostname.endsWith(PREVIEW_HOST_SUFFIX) &&
    url.searchParams.size === 1 &&
    url.searchParams.has("cacheproof")
  );
}

function canStoreSeriesDocument(response) {
  if (response.status !== 200) return false;
  if (response.headers.has("set-cookie")) return false;

  const contentType = response.headers.get("content-type") ?? "";
  return contentType.toLowerCase().includes("text/html");
}

export default {
  async fetch(request, env, ctx) {
    const cacheableRequest = isCacheableSeriesDocumentRequest(request);
    const response = await handler.fetch(request, env, ctx);

    if (!cacheableRequest || !canStoreSeriesDocument(response)) {
      return response;
    }

    const headers = new Headers(response.headers);
    headers.set("Cloudflare-CDN-Cache-Control", SERIES_EDGE_CACHE_CONTROL);
    headers.set("Cache-Tag", "gacha-series-detail");
    headers.set("X-Gacha-Edge-Cache-Policy", "series-detail-1800-v1");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
