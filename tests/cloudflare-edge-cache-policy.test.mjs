import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../worker/index.js", import.meta.url), "utf8");
const variantDetailSource = readFileSync(new URL("../app/series/[slug]/page.js", import.meta.url), "utf8");

const DAILY_DISCOVERY_INDEXES = ["/categories", "/brands", "/franchises"];

test("expensive discovery indexes use a bounded daily public HTML policy", () => {
  assert.match(source, /marker: "discovery-index-86400-v1"/);
  assert.match(source, /cacheTag: "gacha-discovery-index"/);
  assert.match(source, /cacheControl: "public, max-age=86400, stale-while-revalidate=300"/);

  for (const route of DAILY_DISCOVERY_INDEXES) {
    assert.match(source, new RegExp(`"${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  }

  assert.match(source, /DISCOVERY_INDEX_PATHS\.has\(url\.pathname\)/);
  assert.match(source, /url\.searchParams\.size === 0/);
  assert.match(source, /accept\.includes\("text\/html"\)/);
});

test("series index and first-page facet landings retain the 30 minute bounded policy", () => {
  assert.match(source, /marker: "discovery-document-1800-v1"/);
  assert.match(source, /cacheControl: "public, max-age=1800, stale-while-revalidate=60"/);
  assert.match(source, /DISCOVERY_DOCUMENT_PATHS = new Set\(\[\s*"\/series"/);
  assert.ok(source.includes('return /^\\/(?:categories|brands|franchises)\\/[^/]+$/.test(pathname);'));
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

test("known Next.js error documents cannot become shared edge cache entries", () => {
  assert.match(source, /NON_CACHEABLE_HTML_MARKERS = \["商品情報を取得できません"\]/);
  assert.match(source, /response\.clone\(\)\.text\(\)/);
  assert.match(source, /NON_CACHEABLE_HTML_MARKERS\.some\(\(marker\) => body\.includes\(marker\)\)/);
  assert.match(source, /await canStoreResponse\(response, policy\)/);
});

test("variant detail stays framework-dynamic and delegates shared reuse to Workers Cache", () => {
  assert.match(variantDetailSource, /export const dynamic = "force-dynamic"/);
  assert.match(variantDetailSource, /export const revalidate = 0/);
  assert.doesNotMatch(variantDetailSource, /export const dynamic = "force-static"/);
  assert.match(source, /marker: "series-detail-1800-v1"/);
  assert.match(source, /cacheControl: "public, max-age=1800, stale-while-revalidate=60"/);
});

test("series detail and sitemap cache contracts remain unchanged", () => {
  assert.match(source, /marker: "series-detail-1800-v1"/);
  assert.match(source, /marker: "public-sitemap-86400-v1"/);
  assert.match(source, /PUBLIC_SITEMAP_PATHS/);
  assert.match(source, /url\.hostname\.endsWith\(PREVIEW_HOST_SUFFIX\)/);
  assert.match(source, /url\.searchParams\.has\("cacheproof"\)/);
});
