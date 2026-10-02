import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { buildPublicWorker } from "../scripts/build-public-worker.mjs";
import { buildPublicDataHeaders } from "../worker/public-document-data.js";
import { classifyPublicRoute } from "../workers/public/src/route-contract.js";

const SHA = "1234567890abcdef1234567890abcdef12345678";
const OTHER_SHA = "abcdef1234567890abcdef1234567890abcdef12";

async function builtWorker() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "gacha-a6-"));
  const outputPath = path.join(temp, "index.js");
  buildPublicWorker({ sourceSha: SHA, outputPath });
  const loaded = await import(`${pathToFileURL(outputPath).href}?${Date.now()}-${Math.random()}`);
  return { worker: loaded.default, temp };
}

function appBinding({ sourceSha = SHA, totalSeries = 2500, totalVariants = 59095 } = {}) {
  const calls = [];
  return {
    calls,
    binding: {
      async fetch(request) {
        const url = new URL(request.url);
        const body = request.method === "GET" || request.method === "HEAD" ? "" : await request.clone().text();
        calls.push({ path: url.pathname, search: url.search, method: request.method, body });

        if (url.pathname === "/api/runtime-diagnostics/release-source") {
          return Response.json({ source_sha: sourceSha });
        }
        if (url.pathname === "/__public-data/v1/sitemap-series") {
          const offset = Number(url.searchParams.get("offset") || 0);
          const limit = Number(url.searchParams.get("limit") || 1000);
          const count = Math.max(0, Math.min(limit, totalSeries - offset));
          return Response.json(Array.from({ length: count }, (_, i) => ({
            slug: `parent-${offset + i + 1}`,
            updated_at: "2026-10-01T00:00:00Z",
          })));
        }
        if (url.pathname === "/__public-data/v1/sitemap-variants") {
          const offset = Number(url.searchParams.get("offset") || 0);
          const limit = Number(url.searchParams.get("limit") || 1000);
          const count = Math.max(0, Math.min(limit, totalVariants - offset));
          return Response.json(Array.from({ length: count }, (_, i) => ({
            slug: `variant-${offset + i + 1}`,
            updated_at: "2026-10-01T00:00:00Z",
          })));
        }
        if (url.pathname === "/__public-data/v1/schedule-months") {
          return Response.json([{ id: "s1", release_date: "2026-10-01", release_month: "2026-10" }]);
        }
        if (url.pathname === "/__public-data/v1/series") return Response.json([]);
        if (url.pathname === "/__public-data/v1/schedule") return Response.json([]);
        if (url.pathname.startsWith("/__public-data/v1/")) return new Response("not found", { status: 404 });

        if (url.pathname === "/api/public-discovery") {
          if (url.searchParams.get("type") === "invalid") return Response.json({ error: "invalid_type" }, { status: 400 });
          if (url.searchParams.get("name") === "missing") return Response.json({ error: "not_found" }, { status: 404 });
          return Response.json({ rows: [] });
        }
        if (url.pathname === "/api/public-stock") return Response.json({ rows: [] });
        if (url.pathname === "/api/public-variants") return Response.json({ rows: [] });
        if (url.pathname === "/manifest.webmanifest") {
          return new Response('{"name":"Gacha Lens"}', { status: 200, headers: { "content-type": "application/manifest+json" } });
        }
        if (url.pathname.startsWith("/_next/static/")) {
          return new Response("asset", { status: 200, headers: { "content-type": "text/css" } });
        }
        if (url.pathname.startsWith("/brand/")) {
          return new Response("png", { status: 200, headers: { "content-type": "image/png" } });
        }
        return new Response("APP_OK", { status: 200, headers: { "content-type": "text/html" } });
      },
    },
  };
}

function xmlLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

test("A6 route inventory has an explicit owner and unknown/internal paths stay fail-closed", () => {
  const appOwned = [
    "/ranking", "/ranking/series", "/ranking/upcoming", "/ranking/upcoming/series",
    "/stock", "/restocks", "/favorites",
    "/categories", "/categories/%E3%82%AC%E3%82%B7%E3%83%A3%E3%83%9D%E3%83%B3", "/categories/x/page/2",
    "/brands", "/brands/%E3%83%90%E3%83%B3%E3%83%80%E3%82%A4", "/brands/x/page/2",
    "/franchises", "/franchises/x", "/franchises/x/page/2",
    "/guides", "/guides/market-price", "/trends",
"/terms", "/disclaimer", "/affiliate-disclosure", "/operator", "/contact",
    "/review", "/review/login", "/review/logout",
    "/api/public-stock", "/api/public-variants", "/api/public-discovery",
    "/api/community-reports", "/api/review/community-reports/1", "/api/import-issues",
    "/api/ops-health", "/api/outbound-clicks", "/api/ingest/all",
    "/_next/static/css/app.css", "/_next/image", "/brand/gacha-lens-logo.png",
    "/brand/gacha-lens-mark.png", "/manifest.webmanifest", "/favicon.ico",
  ];
  for (const route of appOwned) assert.equal(classifyPublicRoute(route), "app-owned", route);

  for (const route of [
    "/", "/series", "/schedule", "/privacy", "/terms", "/disclaimer", "/affiliate-disclosure", "/operator", "/robots.txt", "/sitemap.xml", "/series-sitemap.xml",
    "/variant-sitemap.xml", "/variant-sitemap/1", "/series/group/parent", "/series/variant",
  ]) {
    assert.equal(classifyPublicRoute(route), "public-document", route);
  }

  assert.equal(classifyPublicRoute("/__public-data/v1/series"), "explicitly-rejected");
  assert.equal(classifyPublicRoute("/unknown"), "explicitly-rejected");
  assert.equal(classifyPublicRoute("/api/unknown"), "explicitly-rejected");
});

test("A6 delegation preserves query, pagination, redirects/API status surface and static assets", async () => {
  const built = await builtWorker();
  try {
    const app = appBinding();
    const routes = [
      "/ranking?tab=upcoming&scope=series",
      "/categories/test?page=2",
      "/categories/test/page/2",
      "/brands/test?page=2",
      "/franchises/test/page/3",
      "/guides/market-price?utm_source=a6",
      "/trends",
      "/privacy",
      "/favorites",
    ];
    for (const route of routes) {
      const response = await built.worker.fetch(new Request(`https://preview.example${route}`), { APP: app.binding });
      assert.equal(response.status, 200, route);
    }

    const discoveryBad = await built.worker.fetch(new Request("https://preview.example/api/public-discovery?type=invalid"), { APP: app.binding });
    assert.equal(discoveryBad.status, 400);
    const discoveryMissing = await built.worker.fetch(new Request("https://preview.example/api/public-discovery?type=category&name=missing"), { APP: app.binding });
    assert.equal(discoveryMissing.status, 404);
    assert.equal((await built.worker.fetch(new Request("https://preview.example/api/public-stock"), { APP: app.binding })).status, 200);
    assert.equal((await built.worker.fetch(new Request("https://preview.example/api/public-variants?ids=a"), { APP: app.binding })).status, 200);

    const css = await built.worker.fetch(new Request("https://preview.example/_next/static/css/app.css"), { APP: app.binding });
    assert.equal(css.status, 200);
    assert.match(css.headers.get("content-type") || "", /text\/css/);
    const logo = await built.worker.fetch(new Request("https://preview.example/brand/gacha-lens-logo.png"), { APP: app.binding });
    assert.equal(logo.status, 200);
    assert.match(logo.headers.get("content-type") || "", /image\/png/);
    const manifest = await built.worker.fetch(new Request("https://preview.example/manifest.webmanifest"), { APP: app.binding });
    assert.equal(manifest.status, 200);

    const delegated = app.calls.filter((call) => call.path !== "/api/runtime-diagnostics/release-source");
    assert.ok(delegated.some((call) => call.path === "/ranking" && call.search === "?tab=upcoming&scope=series"));
    assert.ok(delegated.some((call) => call.path === "/categories/test" && call.search === "?page=2"));
  } finally {
    fs.rmSync(built.temp, { recursive: true, force: true });
  }
});

test("A6 mixed SHA fails closed before delegated public routes or assets", async () => {
  const built = await builtWorker();
  try {
    const app = appBinding({ sourceSha: OTHER_SHA });
    for (const route of ["/ranking", "/api/public-stock", "/_next/static/css/app.css"]) {
      const before = app.calls.length;
      const response = await built.worker.fetch(new Request(`https://preview.example${route}`), { APP: app.binding });
      assert.equal(response.status, 409, route);
      const newCalls = app.calls.slice(before);
      assert.deepEqual(newCalls.map((call) => call.path), ["/api/runtime-diagnostics/release-source"]);
    }
  } finally {
    fs.rmSync(built.temp, { recursive: true, force: true });
  }
});

test("A6 current Supabase Secret key is apikey-only while legacy JWT is explicitly type-gated", () => {
  const secret = buildPublicDataHeaders("sb_secret_example");
  assert.equal(secret.apikey, "sb_secret_example");
  assert.equal("authorization" in secret, false);

  const jwt = buildPublicDataHeaders("aaa.bbb.ccc");
  assert.equal(jwt.apikey, "aaa.bbb.ccc");
  assert.equal(jwt.authorization, "Bearer aaa.bbb.ccc");
});

test("A6 public data source removes global exact-count dependency and mirrors production month matching", () => {
  const source = fs.readFileSync(new URL("../worker/public-document-data.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /prefer\s*:\s*["']count=exact["']/i);
  assert.doesNotMatch(source, /PATH_PREFIX}counts/);
  assert.doesNotMatch(source, /authorization:\s*`Bearer \$\{cfg\.key\}`/);
  assert.match(source, /release_date\.gte\.\$\{start\}/);
  assert.match(source, /release_month\.eq\.\$\{monthNumber\}月/);
  assert.match(source, /release_month\.eq\.\$\{month\}/);
  assert.match(source, /MAX_OFFSET = 1_000_000/);
});

test("A6 sitemap closure is exact: parent namespace fixed and 59,095 variants emit 60 complete shards", async () => {
  const built = await builtWorker();
  try {
    const app = appBinding();

    const seriesResponse = await built.worker.fetch(new Request("https://preview.example/series-sitemap.xml"), { APP: app.binding });
    assert.equal(seriesResponse.status, 200);
    const seriesLocs = xmlLocs(await seriesResponse.text());
    assert.equal(seriesLocs.length, 2500);
    assert.ok(seriesLocs.every((loc) => /^https:\/\/gachalens\.com\/series\/group\/parent-\d+$/.test(loc)));
    assert.equal(new Set(seriesLocs).size, seriesLocs.length);

    const indexResponse = await built.worker.fetch(new Request("https://preview.example/variant-sitemap.xml"), { APP: app.binding });
    assert.equal(indexResponse.status, 200);
    const shardLocs = xmlLocs(await indexResponse.text());
    assert.equal(shardLocs.length, 60);
    assert.equal(shardLocs[0], "https://gachalens.com/variant-sitemap/1");
    assert.equal(shardLocs.at(-1), "https://gachalens.com/variant-sitemap/60");

    const allVariantLocs = [];
    for (let page = 1; page <= 60; page += 1) {
      const response = await built.worker.fetch(new Request(`https://preview.example/variant-sitemap/${page}`), { APP: app.binding });
      assert.equal(response.status, 200, `shard ${page}`);
      allVariantLocs.push(...xmlLocs(await response.text()));
    }
    assert.equal(allVariantLocs.length, 59095);
    assert.equal(new Set(allVariantLocs).size, 59095);
    assert.equal(allVariantLocs[0], "https://gachalens.com/series/variant-1");
    assert.equal(allVariantLocs.at(-1), "https://gachalens.com/series/variant-59095");

    const outOfRange = await built.worker.fetch(new Request("https://preview.example/variant-sitemap/61"), { APP: app.binding });
    assert.equal(outOfRange.status, 404);

    const beforeHuge = app.calls.length;
    const hugeOutOfRange = await built.worker.fetch(new Request("https://preview.example/variant-sitemap/5001"), { APP: app.binding });
    assert.equal(hugeOutOfRange.status, 404);
    assert.equal(app.calls.length, beforeHuge, "absurd shard must fail closed before any data-plane read");
  } finally {
    fs.rmSync(built.temp, { recursive: true, force: true });
  }
});
