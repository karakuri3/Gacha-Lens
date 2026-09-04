import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../worker/index.js", import.meta.url), "utf8");

const DISCOVERY_ROOTS = ["/series", "/categories", "/brands", "/franchises"];

test("Cloudflare discovery cache is a bounded no-query public HTML policy", () => {
  assert.match(source, /marker: "discovery-document-1800-v1"/);
  assert.match(source, /cacheControl: "public, max-age=1800, stale-while-revalidate=60"/);

  for (const route of DISCOVERY_ROOTS) {
    assert.match(source, new RegExp(`"${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  }

  assert.ok(source.includes('return /^\\/(?:categories|brands|franchises)\\/[^/]+$/.test(pathname);'));
  assert.match(source, /url\.searchParams\.size === 0/);
  assert.match(source, /accept\.includes\("text\/html"\)/);
});

test("Cloudflare public cache excludes authenticated, cookie, internal, and query variants", () => {
  assert.match(source, /request\.headers\.has\("authorization"\)/);
  assert.match(source, /request\.headers\.has\("cookie"\)/);
  assert.match(source, /isNextInternalRequest\(request\)/);
  assert.match(source, /url\.searchParams\.size === 0/);

  const discoveryBlock = source.slice(
    source.indexOf("// Discovery indexes"),
    source.indexOf("// Other shared public document pages")
  );
  assert.match(discoveryBlock, /url\.searchParams\.size === 0/);
  assert.match(discoveryBlock, /isDiscoveryDocumentPath\(url\.pathname\)/);
});

test("series detail and sitemap cache contracts remain unchanged", () => {
  assert.match(source, /marker: "series-detail-1800-v1"/);
  assert.match(source, /marker: "public-sitemap-86400-v1"/);
  assert.match(source, /PUBLIC_SITEMAP_PATHS/);
  assert.match(source, /url\.hostname\.endsWith\(PREVIEW_HOST_SUFFIX\)/);
  assert.match(source, /url\.searchParams\.has\("cacheproof"\)/);
});
