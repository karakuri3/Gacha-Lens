import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { buildPublicWorker } from "../scripts/build-public-worker.mjs";
import { buildPublicDataHeaders, handlePublicDocumentData } from "../worker/public-document-data.js";
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

async function assertVariantShardClosure(totalVariants, expectedPages) {
  const built = await builtWorker();
  try {
    const app = appBinding({ totalVariants });

    const indexBodies = [];
    for (const pass of ["first", "repeat"]) {
      const response = await built.worker.fetch(new Request("https://preview.example/variant-sitemap.xml"), { APP: app.binding });
      assert.equal(response.status, 200, `${pass} index`);
      const body = await response.text();
      indexBodies.push(body);
      const shardLocs = xmlLocs(body);
      assert.equal(shardLocs.length, expectedPages, `${pass} advertised shard count`);
      assert.equal(new Set(shardLocs).size, shardLocs.length, `${pass} duplicate shard locs`);
      assert.equal(body.includes("public_data_rest_series_401"), false, `${pass} must not contain legacy 401 signature`);
      assert.equal(body.includes("public_data_count_variants_500"), false, `${pass} must not contain legacy count-500 signature`);
    }
    assert.equal(indexBodies[0], indexBodies[1], "first-pass and repeat index must be identical");

    const union = [];
    for (let page = 1; page <= expectedPages; page += 1) {
      const response = await built.worker.fetch(new Request(`https://preview.example/variant-sitemap/${page}`), { APP: app.binding });
      assert.equal(response.status, 200, `shard ${page}`);
      union.push(...xmlLocs(await response.text()));
    }

    const next = await built.worker.fetch(new Request(`https://preview.example/variant-sitemap/${expectedPages + 1}`), { APP: app.binding });
    assert.equal(next.status, 404, "first non-advertised shard must be empty/404");

    assert.equal(union.length, totalVariants, "shard union must cover every eligible variant");
    assert.equal(new Set(union).size, union.length, "duplicate variant URL count must be zero");
    if (totalVariants > 0) {
      assert.equal(union[0], "https://gachalens.com/series/variant-1");
      assert.equal(union.at(-1), `https://gachalens.com/series/variant-${totalVariants}`);
    }

    const dataCalls = app.calls.filter((call) => call.path.startsWith("/__public-data/v1/"));
    assert.equal(dataCalls.some((call) => call.path === "/__public-data/v1/counts"), false, "legacy global counts endpoint must never be called");
    assert.equal(dataCalls.some((call) => /count=exact|count=planned|count=estimated/i.test(call.search)), false, "count semantics must never be smuggled into shard probes");

    return { union, calls: app.calls };
  } finally {
    fs.rmSync(built.temp, { recursive: true, force: true });
  }
}

test("A6 route inventory has an explicit owner and unknown/internal paths stay fail-closed", () => {
  const appOwned = [
    "/", "/series", "/schedule", "/series/group/parent", "/series/variant",
    "/privacy", "/terms", "/disclaimer", "/affiliate-disclosure", "/operator",
    "/ranking", "/ranking/series", "/ranking/upcoming", "/ranking/upcoming/series",
    "/stock", "/restocks", "/favorites",
    "/categories", "/categories/%E3%82%AC%E3%82%B7%E3%83%A3%E3%83%9D%E3%83%B3", "/categories/x/page/2",
    "/brands", "/brands/%E3%83%90%E3%83%B3%E3%83%80%E3%82%A4", "/brands/x/page/2",
    "/franchises", "/franchises/x", "/franchises/x/page/2",
    "/guides", "/guides/market-price", "/trends",
    "/contact",
    "/review", "/review/login", "/review/logout",
    "/api/public-stock", "/api/public-variants", "/api/public-discovery",
    "/api/community-reports", "/api/review/community-reports/1", "/api/import-issues",
    "/api/ops-health", "/api/outbound-clicks", "/api/ingest/all",
    "/_next/static/css/app.css", "/_next/image", "/brand/gacha-lens-logo.png",
    "/brand/gacha-lens-mark.png", "/manifest.webmanifest", "/favicon.ico",
  ];
  for (const route of appOwned) assert.equal(classifyPublicRoute(route), "app-owned", route);

  for (const route of [
    "/robots.txt", "/sitemap.xml", "/series-sitemap.xml", "/variant-sitemap.xml", "/variant-sitemap/1",
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
      "/",
      "/series",
      "/series?q=test&page=2",
      "/schedule?month=2026-10",
      "/series/group/parent",
      "/series/variant",
      "/privacy",
      "/terms",
      "/disclaimer",
      "/affiliate-disclosure",
      "/operator",
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
    for (const route of ["/", "/schedule?month=2026-10", "/variant-sitemap.xml", "/ranking", "/api/public-stock", "/_next/static/css/app.css"]) {
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

test("A6 Secret API key header contract is apikey-only; legacy JWT Bearer is type-gated and failures do not leak credentials", async () => {
  const opaque = "sb_secret_fixture_only";
  const secretHeaders = buildPublicDataHeaders(opaque);
  assert.equal(secretHeaders.apikey, opaque);
  assert.equal("authorization" in secretHeaders, false);

  const jwt = "aaa.bbb.ccc";
  const jwtHeaders = buildPublicDataHeaders(jwt);
  assert.equal(jwtHeaders.apikey, jwt);
  assert.equal(jwtHeaders.authorization, `Bearer ${jwt}`);

  const originalFetch = globalThis.fetch;
  let observedAuthorization = "unset";
  try {
    globalThis.fetch = async (_url, init = {}) => {
      const headers = new Headers(init.headers);
      assert.equal(headers.get("apikey"), opaque);
      observedAuthorization = headers.get("authorization");
      return new Response('{"message":"unauthorized"}', { status: 401, headers: { "content-type": "application/json" } });
    };

    const response = await handlePublicDocumentData(
      new Request("https://gacha-lens.internal/__public-data/v1/series?released=true&limit=12"),
      { NEXT_PUBLIC_SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_SERVICE_ROLE_KEY: opaque },
    );
    assert.equal(response.status, 503);
    assert.equal(observedAuthorization, null);
    const snapshot = await response.text();
    assert.match(snapshot, /public_data_rest_series_401/);
    assert.equal(snapshot.includes(opaque), false, "credential must never appear in error snapshot/artifact");
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test("A6 series sitemap parent namespace is exact", async () => {
  const built = await builtWorker();
  try {
    const app = appBinding();
    const seriesResponse = await built.worker.fetch(new Request("https://preview.example/series-sitemap.xml"), { APP: app.binding });
    assert.equal(seriesResponse.status, 200);
    const seriesLocs = xmlLocs(await seriesResponse.text());
    assert.equal(seriesLocs.length, 2500);
    assert.ok(seriesLocs.every((loc) => /^https:\/\/gachalens\.com\/series\/group\/parent-\d+$/.test(loc)));
    assert.equal(new Set(seriesLocs).size, seriesLocs.length);
  } finally {
    fs.rmSync(built.temp, { recursive: true, force: true });
  }
});

test("A6 variant sitemap current-like 59,095 fixture emits exactly 60 non-empty shards with complete duplicate-free union", async () => {
  const { union } = await assertVariantShardClosure(59095, 60);
  assert.equal(union.length, 59095);
});

test("A6 variant sitemap exact-multiple boundary closes at the last non-empty shard", async () => {
  await assertVariantShardClosure(1000, 1);
});

test("A6 variant sitemap one-over boundary advertises the newly required shard", async () => {
  await assertVariantShardClosure(1001, 2);
});

test("A6 variant sitemap final partial shard is retained without advertising an empty successor", async () => {
  await assertVariantShardClosure(1999, 2);
});

test("A6 variant sitemap zero-variant fixture advertises zero shards and shard 1 is empty", async () => {
  await assertVariantShardClosure(0, 0);
});

test("A6 absurd shard remains fail-closed before any data-plane read", async () => {
  const built = await builtWorker();
  try {
    const app = appBinding();
    const beforeHuge = app.calls.length;
    const hugeOutOfRange = await built.worker.fetch(new Request("https://preview.example/variant-sitemap/5001"), { APP: app.binding });
    assert.equal(hugeOutOfRange.status, 404);
    const hugeCalls = app.calls.slice(beforeHuge);
    assert.deepEqual(hugeCalls.map((call) => call.path), ["/api/runtime-diagnostics/release-source"]);
    assert.equal(hugeCalls.some((call) => call.path.startsWith("/__public-data/")), false);
  } finally {
    fs.rmSync(built.temp, { recursive: true, force: true });
  }
});
