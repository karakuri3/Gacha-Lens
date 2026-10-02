import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSameOriginAssets,
  parseSitemapLocs,
  pathFromPublishedUrl,
} from "../scripts/cloudflare-a6-acceptance.mjs";

test("A6 sitemap parser decodes canonical locs without changing URL classes", () => {
  const locs = parseSitemapLocs(`
    <urlset>
      <url><loc>https://gachalens.com/series/group/parent-one</loc></url>
      <url><loc>https://gachalens.com/schedule?month=2026-10&amp;page=2</loc></url>
    </urlset>
  `);
  assert.deepEqual(locs, [
    "https://gachalens.com/series/group/parent-one",
    "https://gachalens.com/schedule?month=2026-10&page=2",
  ]);
  assert.equal(pathFromPublishedUrl(locs[1]), "/schedule?month=2026-10&page=2");
  assert.throws(() => pathFromPublishedUrl("https://example.com/series/x"), /escaped canonical origin/);
});

test("A6 asset parser keeps only same-origin delegated assets", () => {
  const assets = parseSameOriginAssets(`
    <link rel="stylesheet" href="/_next/static/css/app.css">
    <script src="/_next/static/chunks/app.js"></script>
    <img src="/brand/gacha-lens-logo.png">
    <link rel="manifest" href="/manifest.webmanifest">
    <img src="https://cdn.example.com/external.png">
  `);
  assert.deepEqual(assets.sort(), [
    "/_next/static/chunks/app.js",
    "/_next/static/css/app.css",
    "/brand/gacha-lens-logo.png",
    "/manifest.webmanifest",
  ]);
});
