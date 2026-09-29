import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../worker/index.js", import.meta.url), "utf8");
const variantDetailSource = readFileSync(new URL("../app/series/[slug]/page.js", import.meta.url), "utf8");
const parentSeriesDetailSource = readFileSync(new URL("../app/series/group/[slug]/page.js", import.meta.url), "utf8");

const RELEASE_SENSITIVE_DISCOVERY_INDEXES = ["/categories", "/brands", "/franchises"];

test("release-sensitive discovery indexes use a bounded five minute public HTML policy", () => {
  assert.match(source, /marker: "discovery-index-300-v2"/);
  assert.match(source, /cacheTag: "gacha-discovery-index"/);
  assert.match(source, /cacheControl: "public, max-age=300, stale-while-revalidate=60"/);

  for (const route of RELEASE_SENSITIVE_DISCOVERY_INDEXES) {
    assert.match(source, new RegExp(`"${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  }

  assert.match(source, /DISCOVERY_INDEX_PATHS\.has\(url\.pathname\)/);
  assert.match(source, /url\.searchParams\.size === 0/);
  assert.match(source, /accept\.includes\("text\/html"\)/);
});

test("series index and first-page facet landings use the five minute release-state policy", () => {
  assert.match(source, /marker: "discovery-document-300-v2"/);
  assert.match(source, /cacheControl: "public, max-age=300, stale-while-revalidate=60"/);
  assert.match(source, /DISCOVERY_DOCUMENT_PATHS = new Set\(\[\s*"\/series"/);
  assert.match(source, /brands\|franchises/);
  assert.ok(source.includes('return /^\\/(?:brands|franchises)\\/[^/]+(?:\\/page\\/[1-9]\\d*)?$/.test(pathname)'));
  assert.match(source, /categories/);
  assert.ok(source.includes('|| /^\\/categories\\/[^/]+(?:\\/page\\/[1-9]\\d*)?$/.test(pathname);'));
  assert.match(source, /isDiscoveryDocumentPath\(url\.pathname\)/);
});

test("Cloudflare public cache excludes authenticated, cookie, internal, and query variants", () => {
  assert.match(source, /request\.headers\.has\("authorization"\)/);
  assert.match(source, /request\.headers\.has\("cookie"\)/);
  assert.match(source, /isNextInternalRequest\(request\)/);

  const discoveryBlock = source.slice(
    source.indexOf("// Discovery index roots"),
    source.indexOf("// Other shared public document pages")
  );
  assert.match(discoveryBlock, /url\.searchParams\.size === 0/);
  assert.match(discoveryBlock, /DISCOVERY_INDEX_PATHS\.has\(url\.pathname\)/);
  assert.match(discoveryBlock, /isDiscoveryDocumentPath\(url\.pathname\)/);
});

test("schedule archives cache only the canonical bounded month/page contract", () => {
  assert.match(source, /function isScheduleArchiveCacheUrl\(url\)/);
  assert.match(source, /url\.pathname !== "\/schedule"/);
  assert.match(source, /getAll\("month"\)\.length !== 1/);
  assert.match(source, /getAll\("page"\)\.length > 1/);
  assert.match(source, /key === "month" \|\| key === "page"/);
  assert.match(source, /pageNumber >= 2 && pageNumber <= 1000/);
  assert.match(source, /isScheduleArchiveCacheUrl\(url\)/);
});

test("known Next.js error documents cannot become shared edge cache entries", () => {
  assert.match(source, /NON_CACHEABLE_HTML_MARKERS = \["商品情報を取得できません"\]/);
  assert.match(source, /response\.clone\(\)\.text\(\)/);
  assert.match(source, /NON_CACHEABLE_HTML_MARKERS\.some\(\(marker\) => body\.includes\(marker\)\)/);
  assert.match(source, /await canStoreResponse\(response, policy\)/);
});

test("variant and parent-series details share the bounded five minute release-state cache policy", () => {
  assert.match(variantDetailSource, /export const dynamic = "force-dynamic"/);
  assert.match(variantDetailSource, /export const revalidate = 0/);
  assert.match(parentSeriesDetailSource, /export const dynamic = "force-dynamic"/);
  assert.match(parentSeriesDetailSource, /export const revalidate = 0/);
  assert.match(parentSeriesDetailSource, /getParentSeriesBySlug/);

  assert.match(source, /function isSeriesDetailCachePath\(pathname\)/);
  assert.ok(source.includes('return /^\\/series\\/(?:[^/]+|group\\/[^/]+)$/.test(pathname);'));
  assert.match(source, /isSeriesDetailCachePath\(url\.pathname\)/);
  assert.match(source, /marker: "series-detail-300-v2"/);
  assert.match(source, /cacheControl: "public, max-age=300, stale-while-revalidate=60"/);

  const helper = source.slice(
    source.indexOf("function isSeriesDetailCachePath"),
    source.indexOf("function getEdgeCachePolicy")
  );
  assert.match(helper, /\^\\\/series/);
  assert.match(helper, /group\\\/\[\^\/\]\+/);
  assert.match(helper, /\$\/\.test\(pathname\)/);
  assert.doesNotMatch(helper, /\.\*/);
});

test("series detail cache keeps production query variants ineligible and cacheproof preview-only", () => {
  const detailBlock = source.slice(
    source.indexOf("if (isSeriesDetailCachePath(url.pathname)"),
    source.indexOf("// Discovery index roots")
  );
  assert.match(detailBlock, /url\.searchParams\.size === 0/);
  assert.match(detailBlock, /url\.hostname\.endsWith\(PREVIEW_HOST_SUFFIX\)/);
  assert.match(detailBlock, /url\.searchParams\.size === 1/);
  assert.match(detailBlock, /url\.searchParams\.has\("cacheproof"\)/);
  assert.match(detailBlock, /return null/);
});

test("series detail release-state cache and sitemap cache contracts remain bounded", () => {
  assert.match(source, /marker: "series-detail-300-v2"/);
  assert.match(source, /marker: "public-sitemap-86400-v1"/);
  assert.match(source, /PUBLIC_SITEMAP_PATHS/);
  assert.match(source, /function isPublicSitemapPath\(pathname\)/);
  assert.match(source, /variant-sitemap\\\/\[1-9\]/);
  assert.match(source, /isPublicSitemapPath\(url\.pathname\)/);
  assert.match(source, /url\.hostname\.endsWith\(PREVIEW_HOST_SUFFIX\)/);
  assert.match(source, /url\.searchParams\.has\("cacheproof"\)/);
});

test("bounded public Worker cache short-circuits vinext and is release-versioned", () => {
  assert.match(source, /globalThis\.caches\?\.default/);
  assert.match(source, /url\.searchParams\.set\("__gacha_release", RELEASE_SOURCE_SHA\)/);
  assert.match(source, /const cached = await workerCache\.match\(workerCacheKey\)/);
  assert.match(source, /if \(cached\) return restoreWorkerCacheResponse\(cached\)/);
  assert.match(source, /const response = await handler\.fetch\(request, env, ctx\)/);

  const hitIndex = source.indexOf("const cached = await workerCache.match(workerCacheKey)");
  const handlerIndex = source.indexOf("const response = await handler.fetch(request, env, ctx)");
  assert.ok(hitIndex >= 0 && handlerIndex > hitIndex, "Worker cache lookup must happen before vinext render");
});

test("Worker cache keeps auth, cookies, RSC and unversioned requests fail-closed", () => {
  assert.match(source, /request\.headers\.has\("authorization"\)/);
  assert.match(source, /request\.headers\.has\("cookie"\)/);
  assert.match(source, /isNextInternalRequest\(request\)/);
  assert.match(source, /if \(!policy \|\| !RELEASE_SOURCE_SHA_RE\.test\(RELEASE_SOURCE_SHA\)\) return null/);
});

test("Worker cache storage is asynchronous, bounded and preserves origin browser cache semantics", () => {
  assert.match(source, /ctx\.waitUntil\(workerCache\.put\(workerCacheKey, storageResponse\)\)/);
  assert.match(source, /headers\.set\("Cache-Control", policy\.cacheControl\)/);
  assert.match(source, /WORKER_CACHE_ORIGIN_CONTROL_HEADER/);
  assert.match(source, /headers\.set\(WORKER_CACHE_STATUS_HEADER, "HIT"\)/);
  assert.match(source, /headers\.set\(WORKER_CACHE_STATUS_HEADER, workerCacheKey \? "MISS" : "BYPASS"\)/);
});
