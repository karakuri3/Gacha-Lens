import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { buildPublicWorker } from "../scripts/build-public-worker.mjs";
import {
  APP_OWNED_EXACT_PATHS,
  APP_OWNED_PREFIXES,
  classifyPublicRoute,
  PUBLIC_DIAGNOSTIC_PATHS,
} from "../workers/public/src/route-contract.js";

const SHA = "1234567890abcdef1234567890abcdef12345678";
const OTHER_SHA = "abcdef1234567890abcdef1234567890abcdef12";

async function builtWorker() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "gacha-a6-public-"));
  const outputPath = path.join(temp, "index.js");
  buildPublicWorker({ sourceSha: SHA, outputPath });
  const loaded = await import(`${pathToFileURL(outputPath).href}?${Date.now()}-${Math.random()}`);
  return { worker: loaded.default, temp };
}

function binding({ sourceSha = SHA, omitSourceHeader = false } = {}) {
  const calls = [];
  return {
    calls,
    binding: {
      async fetch(request) {
        const url = new URL(request.url);
        calls.push({
          path: url.pathname,
          search: url.search,
          method: request.method,
          cookie: request.headers.get("cookie"),
          body: request.method === "POST" ? await request.clone().text() : "",
        });

        const headers = new Headers({ "content-type": "text/html; charset=utf-8" });
        if (!omitSourceHeader) headers.set("x-gacha-source-sha", sourceSha);

        if (url.pathname === "/api/runtime-diagnostics/release-source") {
          return Response.json({ source_sha: sourceSha }, {
            headers: omitSourceHeader ? {} : { "x-gacha-source-sha": sourceSha },
          });
        }
        if (url.pathname === "/review") return new Response("Review access", { headers });
        if (url.pathname === "/trends") {
          return new Response(null, {
            status: 308,
            headers: {
              location: "https://gacha-lens.internal/ranking",
              ...(omitSourceHeader ? {} : { "x-gacha-source-sha": sourceSha }),
            },
          });
        }
        if (url.pathname === "/api/public-discovery" && !url.searchParams.get("type")) {
          return Response.json({ error: "invalid_request" }, {
            status: 400,
            headers: omitSourceHeader ? {} : { "x-gacha-source-sha": sourceSha },
          });
        }
        if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/brand/")) {
          return new Response("asset", {
            status: 200,
            headers: {
              "content-type": url.pathname.endsWith(".png") ? "image/png" : "application/javascript",
              ...(omitSourceHeader ? {} : { "x-gacha-source-sha": sourceSha }),
            },
          });
        }
        if (url.pathname.startsWith("/api/")) {
          return Response.json({ ok: true }, {
            status: 200,
            headers: omitSourceHeader ? {} : { "x-gacha-source-sha": sourceSha },
          });
        }
        return new Response(`<!doctype html><h1>${url.pathname}</h1>`, { status: 200, headers });
      },
    },
  };
}

function walkFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(target));
    else files.push(target);
  }
  return files;
}

test("A6 route inventory explicitly owns the old App public surface and assets", () => {
  for (const route of PUBLIC_DIAGNOSTIC_PATHS) assert.equal(classifyPublicRoute(route), "public-diagnostic", route);
  for (const route of APP_OWNED_EXACT_PATHS) assert.equal(classifyPublicRoute(route), "app-owned", route);

  const prefixExamples = {
    "/categories/": "/categories/example/page/2",
    "/brands/": "/brands/example/page/2",
    "/franchises/": "/franchises/example/page/2",
    "/guides/": "/guides/forecast-ranking",
    "/api/review/": "/api/review/community-reports/1",
    "/api/ingest/": "/api/ingest/official",
    "/_next/": "/_next/static/chunks/app.js",
    "/brand/": "/brand/gacha-lens-logo.png",
  };
  for (const prefix of APP_OWNED_PREFIXES) {
    assert.equal(classifyPublicRoute(prefixExamples[prefix]), "app-owned", prefix);
  }

  for (const rejected of [
    "/__public-data/v1/series",
    "/__public-data/v1/counts",
    "/supabase-series",
    "/api/arbitrary",
    "/unknown",
  ]) {
    assert.equal(classifyPublicRoute(rejected), "explicitly-rejected", rejected);
  }
});

test("A6 acceptance contract exhausts every App page and route handler source", () => {
  const appRoot = path.join(process.cwd(), "app");
  const pageFiles = walkFiles(appRoot)
    .filter((file) => /[/\\]page\.js$/.test(file))
    .map((file) => path.relative(process.cwd(), file).replaceAll("\\", "/"))
    .sort();

  assert.deepEqual(pageFiles, [
    "app/affiliate-disclosure/page.js",
    "app/brands/[name]/page.js",
    "app/brands/[name]/page/[page]/page.js",
    "app/brands/page.js",
    "app/categories/[name]/page.js",
    "app/categories/[name]/page/[page]/page.js",
    "app/categories/page.js",
    "app/contact/page.js",
    "app/disclaimer/page.js",
    "app/favorites/page.js",
    "app/franchises/[name]/page.js",
    "app/franchises/[name]/page/[page]/page.js",
    "app/franchises/page.js",
    "app/guides/[slug]/page.js",
    "app/guides/page.js",
    "app/operator/page.js",
    "app/page.js",
    "app/privacy/page.js",
    "app/ranking/page.js",
    "app/ranking/series/page.js",
    "app/ranking/upcoming/page.js",
    "app/ranking/upcoming/series/page.js",
    "app/restocks/page.js",
    "app/review/page.js",
    "app/schedule/page.js",
    "app/series/[slug]/page.js",
    "app/series/group/[slug]/page.js",
    "app/series/page.js",
    "app/stock/page.js",
    "app/supabase-series/page.js",
    "app/terms/page.js",
    "app/trends/page.js",
  ]);

  const routeFiles = walkFiles(appRoot)
    .filter((file) => /[/\\]route\.js$/.test(file))
    .map((file) => path.relative(process.cwd(), file).replaceAll("\\", "/"))
    .sort();

  assert.deepEqual(routeFiles, [
    "app/api/community-reports/route.js",
    "app/api/import-issues/route.js",
    "app/api/ingest/[task]/route.js",
    "app/api/ops-health/route.js",
    "app/api/outbound-clicks/route.js",
    "app/api/public-discovery/route.js",
    "app/api/public-stock/route.js",
    "app/api/public-variants/route.js",
    "app/api/review/community-reports/[id]/route.js",
    "app/api/runtime-diagnostics/variant-detail/route.js",
    "app/review/login/route.js",
    "app/review/logout/route.js",
    "app/series-sitemap.xml/route.js",
    "app/variant-sitemap.xml/route.js",
    "app/variant-sitemap/[page]/route.js",
  ]);

  const publicSamples = [
    "/",
    "/series",
    "/series/variant",
    "/series/group/parent",
    "/schedule",
    "/robots.txt",
    "/sitemap.xml",
    "/series-sitemap.xml",
    "/variant-sitemap.xml",
    "/variant-sitemap/1",
  ];
  for (const route of publicSamples) assert.equal(classifyPublicRoute(route), "public-document", route);

  const appSamples = [
    "/ranking",
    "/stock",
    "/restocks",
    "/favorites",
    "/categories",
    "/categories/name/page/2",
    "/brands/name/page/2",
    "/franchises/name/page/2",
    "/guides/slug",
    "/privacy",
    "/terms",
    "/disclaimer",
    "/affiliate-disclosure",
    "/operator",
    "/contact",
    "/review",
    "/review/login",
    "/review/logout",
    "/api/community-reports",
    "/api/import-issues",
    "/api/ingest/all",
    "/api/ops-health",
    "/api/outbound-clicks",
    "/api/public-discovery",
    "/api/public-stock",
    "/api/public-variants",
    "/api/review/community-reports/1",
    "/api/runtime-diagnostics/variant-detail",
  ];
  for (const route of appSamples) assert.equal(classifyPublicRoute(route), "app-owned", route);
  assert.equal(classifyPublicRoute("/supabase-series"), "explicitly-rejected");
});

test("A6 front door delegates pages, queries, APIs, and static assets with exact SHA proof", async () => {
  const built = await builtWorker();
  try {
    const app = binding();
    const cases = [
      ["GET", "/series?q=test&page=2", null],
      ["GET", "/ranking?tab=upcoming&scope=series", null],
      ["GET", "/categories/%E3%82%AC%E3%82%B7%E3%83%A3%E3%83%9D%E3%83%B3?page=2", null],
      ["GET", "/api/public-stock", null],
      ["GET", "/api/public-variants?ids=a,b", null],
      ["GET", "/manifest.webmanifest", null],
      ["GET", "/_next/static/chunks/app.js", null],
      ["GET", "/brand/gacha-lens-logo.png", null],
      ["POST", "/review/login", "password=x"],
    ];

    for (const [method, route, body] of cases) {
      const headers = { cookie: "session=ok" };
      if (body) headers["content-type"] = "application/x-www-form-urlencoded";
      const response = await built.worker.fetch(new Request(`https://public.example${route}`, {
        method,
        headers,
        body,
      }), { APP: app.binding });
      assert.notEqual(response.status, 409, route);
      assert.notEqual(response.status, 502, route);
      assert.equal(response.headers.get("x-gacha-public-plane"), "a6-front-door", route);
      assert.equal(response.headers.get("x-gacha-app-source-sha"), SHA, route);
    }

    assert.equal(app.calls.some((call) => call.path.startsWith("/__public-data/")), false);
    const post = app.calls.find((call) => call.path === "/review/login");
    assert.equal(post?.method, "POST");
    assert.equal(post?.body, "password=x");
    assert.equal(post?.cookie, "session=ok");
  } finally {
    fs.rmSync(built.temp, { recursive: true, force: true });
  }
});

test("A6 immutable Preview bridge is workers.dev-only, host-restricted, and exact-SHA checked", async () => {
  const built = await builtWorker();
  const originalFetch = globalThis.fetch;
  const externalCalls = [];
  try {
    globalThis.fetch = async (request) => {
      const url = new URL(request.url);
      externalCalls.push({
        url: url.toString(),
        override: request.headers.get("x-gacha-a6-app-preview-origin"),
      });
      if (url.pathname === "/api/runtime-diagnostics/release-source") {
        return Response.json({ source_sha: SHA });
      }
      return new Response("<!doctype html><h1>Preview App</h1>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    };

    const app = binding({ sourceSha: OTHER_SHA });
    const response = await built.worker.fetch(new Request(
      "https://a6-gacha-lens-public.senpingxingzuo.workers.dev/ranking",
      { headers: { "x-gacha-a6-app-preview-origin": "https://exact-gacha-lens.senpingxingzuo.workers.dev" } },
    ), { APP: app.binding });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-gacha-app-source-sha"), SHA);
    assert.equal(response.headers.get("x-gacha-app-transport"), "preview-http");
    assert.equal(externalCalls.length, 2);
    assert.equal(externalCalls[0].url, "https://exact-gacha-lens.senpingxingzuo.workers.dev/api/runtime-diagnostics/release-source");
    assert.equal(externalCalls[1].url, "https://exact-gacha-lens.senpingxingzuo.workers.dev/ranking");
    assert.equal(externalCalls.every((call) => call.override === null), true);
    assert.deepEqual(app.calls, []);

    const invalid = await built.worker.fetch(new Request(
      "https://a6-gacha-lens-public.senpingxingzuo.workers.dev/ranking",
      { headers: { "x-gacha-a6-app-preview-origin": "https://evil.example" } },
    ), { APP: app.binding });
    assert.equal(invalid.status, 409);
    assert.equal((await invalid.json()).error, "mixed_source_sha");
    assert.equal(externalCalls.length, 2);

    const production = binding();
    const productionResponse = await built.worker.fetch(new Request(
      "https://gachalens.com/ranking",
      { headers: { "x-gacha-a6-app-preview-origin": "https://exact-gacha-lens.senpingxingzuo.workers.dev" } },
    ), { APP: production.binding });
    assert.equal(productionResponse.status, 200);
    assert.equal(productionResponse.headers.get("x-gacha-app-transport"), "service-binding");
    assert.equal(externalCalls.length, 2);
    assert.deepEqual(production.calls.map((call) => call.path), [
      "/api/runtime-diagnostics/release-source",
      "/ranking",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(built.temp, { recursive: true, force: true });
  }
});

test("A6 rewrites only internal same-origin redirects back to the incoming public origin", async () => {
  const built = await builtWorker();
  try {
    const app = binding();
    const response = await built.worker.fetch(new Request("https://preview.example/trends"), { APP: app.binding });
    assert.equal(response.status, 308);
    assert.equal(response.headers.get("location"), "https://preview.example/ranking");
  } finally {
    fs.rmSync(built.temp, { recursive: true, force: true });
  }
});

test("mixed App source identity fails closed and delegated response headers are not trusted as identity", async () => {
  const built = await builtWorker();
  try {
    const mixed = binding({ sourceSha: OTHER_SHA });
    const mixedResponse = await built.worker.fetch(new Request("https://public.example/ranking"), { APP: mixed.binding });
    assert.equal(mixedResponse.status, 409);
    assert.equal((await mixedResponse.json()).error, "mixed_source_sha");

    const noResponseHeader = binding({ omitSourceHeader: true });
    const response = await built.worker.fetch(new Request("https://public.example/ranking"), { APP: noResponseHeader.binding });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-gacha-app-source-sha"), SHA);
    assert.deepEqual(noResponseHeader.calls.map((call) => call.path), [
      "/api/runtime-diagnostics/release-source",
      "/ranking",
    ]);
  } finally {
    fs.rmSync(built.temp, { recursive: true, force: true });
  }
});

test("internal public-data endpoints and unknown routes stay fail-closed without touching App", async () => {
  const built = await builtWorker();
  try {
    const app = binding();
    for (const route of ["/__public-data/v1/series", "/__public-data/v1/counts", "/unknown"]) {
      const response = await built.worker.fetch(new Request(`https://public.example${route}`), { APP: app.binding });
      assert.equal(response.status, 404, route);
      assert.equal((await response.json()).error, "route_not_owned_by_public_bootstrap");
    }
    assert.deepEqual(app.calls, []);
  } finally {
    fs.rmSync(built.temp, { recursive: true, force: true });
  }
});

test("public-discovery valid/error statuses are passed through instead of flattened", async () => {
  const built = await builtWorker();
  try {
    const app = binding();
    const invalid = await built.worker.fetch(new Request("https://public.example/api/public-discovery"), { APP: app.binding });
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: "invalid_request" });
  } finally {
    fs.rmSync(built.temp, { recursive: true, force: true });
  }
});

test("retained lightweight renderer uses the canonical parent-series namespace if reused", () => {
  const source = fs.readFileSync(new URL("../workers/public/src/document-renderer.js", import.meta.url), "utf8");
  assert.match(source, /sitemapUrl\(\`\/series\/group\/\$\{encodeURIComponent\(row\.slug\)\}\`/);
  assert.doesNotMatch(source, /sitemapUrl\(\`\/series\/\$\{encodeURIComponent\(row\.slug\)\}\`, row\.updated_at\)\)\);\n    if \(rows\.length < 1000\) break/);
});

test("App worker stamps every response family with immutable release identity", () => {
  const source = fs.readFileSync(new URL("../worker/index.js", import.meta.url), "utf8");
  assert.match(source, /const RELEASE_SOURCE_HEADER = "x-gacha-source-sha"/);
  assert.match(source, /withReleaseSourceIdentity\(publicDocumentData\)/);
  assert.match(source, /withReleaseSourceIdentity\(releaseSourceIdentity\)/);
  assert.match(source, /withReleaseSourceIdentity\(legacyCategoryRedirect\)/);
  assert.match(source, /withReleaseSourceIdentity\(legacyDiscoveryFacetRedirect\)/);
  assert.match(source, /withReleaseSourceIdentity\(legacyRankingRedirect\)/);
  assert.match(source, /return withReleaseSourceIdentity\(response\)/);
});
