import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildPublicWorker } from "../scripts/build-public-worker.mjs";
import { classifyPublicRoute } from "../workers/public/src/route-contract.js";

const SHA = "1234567890abcdef1234567890abcdef12345678";
const OTHER_SHA = "abcdef1234567890abcdef1234567890abcdef12";

async function worker() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "gacha-a3-public-"));
  const outputPath = path.join(temp, "index.js");
  buildPublicWorker({ sourceSha: SHA, outputPath });
  const loaded = await import(`${pathToFileURL(outputPath).href}?${Date.now()}-${Math.random()}`);
  return { worker: loaded.default, temp };
}

function binding() {
  const calls = [];
  const series = [{ id:"s1", slug:"parent-1", name:"親シリーズ", brand:"Brand", category:"figure", release_date:"2026-10-01", source_type:"official_site" }];
  const variants = [{ id:"v1", slug:"variant-1", series_id:"s1", name:"バリエーション1", rarity:"normal", release_date:"2026-10-01" }];
  return {
    calls,
    binding: {
      async fetch(request) {
        const url = new URL(request.url);
        const expectedSha = request.headers.get("x-gacha-expected-app-source-sha");
        calls.push({ path:url.pathname, search:url.search, method:request.method, cookie:request.headers.get("cookie"), expectedSha });
        const stamp = (response) => {
          const headers = new Headers(response.headers);
          headers.set("x-gacha-app-source-sha", SHA);
          return new Response(response.body, { status:response.status, statusText:response.statusText, headers });
        };
        if (expectedSha && expectedSha !== SHA) {
          return stamp(Response.json({ error:"mixed_source_sha", app_source_sha:SHA }, { status:409 }));
        }
        return stamp(await (async () => {
        if (url.pathname === "/api/runtime-diagnostics/release-source") {
          return Response.json({ source_sha: SHA });
        }
        if (url.pathname === "/review") return new Response("Review access", { headers:{ "content-type":"text/html" } });
        if (url.pathname === "/__public-data/v1/series") return Response.json(series);
        if (url.pathname === "/__public-data/v1/schedule") return Response.json(series);
        if (url.pathname === "/__public-data/v1/series-detail") return Response.json({ series:series[0], variants });
        if (url.pathname === "/__public-data/v1/variant-detail") return Response.json({ series:series[0], variant:variants[0] });
        if (url.pathname === "/__public-data/v1/sitemap-series") return Response.json([{ slug:"parent-1", updated_at:"2026-10-01T00:00:00Z" }]);
        if (url.pathname === "/__public-data/v1/schedule-months") return Response.json([{ id:"s1", release_date:"2026-10-01", release_month:"2026-10" }]);
        if (url.pathname === "/__public-data/v1/sitemap-variants") {
          const offset = Number(url.searchParams.get("offset") || 0);
          return Response.json(offset === 0 ? [{ slug:"variant-1", updated_at:"2026-10-01T00:00:00Z" }] : []);
        }
        return new Response("not found", { status:404 });
        })());
      },
    },
  };
}

test("A6 ownership keeps only sitemap/robots documents Public and delegates consumer UX", () => {
  for (const route of ["/robots.txt","/sitemap.xml","/series-sitemap.xml","/variant-sitemap.xml","/variant-sitemap/1"]) {
    assert.equal(classifyPublicRoute(route), "public-document", route);
  }
  for (const route of ["/","/series","/schedule","/series/variant-1","/series/group/parent-1","/privacy","/terms","/review","/review/login","/api/community-reports","/api/review/community-reports/1"]) {
    assert.equal(classifyPublicRoute(route), "app-owned", route);
  }
  assert.equal(classifyPublicRoute("/arbitrary"), "explicitly-rejected");
  assert.equal(classifyPublicRoute("/api/arbitrary"), "explicitly-rejected");
});

test("consumer documents preserve full App UX through explicit exact-SHA delegation", async () => {
  const built = await worker();
  try {
    const app = binding();
    for (const route of ["/","/series","/series?q=test","/schedule?month=2026-10","/series/variant-1","/series/group/parent-1","/privacy","/terms"]) {
      const before = app.calls.length;
      const response = await built.worker.fetch(new Request(`https://preview.example${route}`), { APP:app.binding });
      assert.equal(response.status, 404, route);
      assert.equal(response.headers.get("x-gacha-public-plane"), "phase-a3");
      const calls = app.calls.slice(before);
      assert.equal(calls.length, 1, route);
      assert.equal(calls[0].path, new URL(route, "https://preview.example").pathname);
      assert.equal(calls[0].search, new URL(route, "https://preview.example").search);
      assert.equal(calls[0].expectedSha, SHA);
      assert.equal(calls.some((call) => call.path.startsWith("/__public-data/v1/")), false);
    }
  } finally {
    fs.rmSync(built.temp, { recursive:true, force:true });
  }
});

test("A8 read-only delegation maps an older mixed-SHA App to 409 without trusting its unstamped response", async () => {
  const built = await worker();
  try {
    const calls = [];
    const legacy = {
      async fetch(request) {
        const url = new URL(request.url);
        calls.push(url.pathname);
        if (url.pathname === "/api/runtime-diagnostics/release-source") {
          return Response.json({ source_sha: OTHER_SHA });
        }
        return new Response("legacy app response", { status:200, headers:{ "content-type":"text/html" } });
      },
    };

    const response = await built.worker.fetch(new Request("https://preview.example/series"), { APP:legacy });
    assert.equal(response.status, 409);
    assert.match(await response.text(), /mixed_source_sha/);
    assert.deepEqual(calls, ["/series", "/api/runtime-diagnostics/release-source"]);
  } finally {
    fs.rmSync(built.temp, { recursive:true, force:true });
  }
});

test("A8 mutation delegation checks legacy App identity before route work", async () => {
  const built = await worker();
  try {
    const calls = [];
    const legacy = {
      async fetch(request) {
        const url = new URL(request.url);
        calls.push(url.pathname);
        if (url.pathname === "/api/runtime-diagnostics/release-source") {
          return Response.json({ source_sha: OTHER_SHA });
        }
        return new Response("must not execute", { status:200 });
      },
    };

    const response = await built.worker.fetch(new Request("https://preview.example/api/community-reports", {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body:"{}",
    }), { APP:legacy });
    assert.equal(response.status, 409);
    assert.match(await response.text(), /mixed_source_sha/);
    assert.deepEqual(calls, ["/api/runtime-diagnostics/release-source"]);
  } finally {
    fs.rmSync(built.temp, { recursive:true, force:true });
  }
});

test("robots and sitemap documents preserve canonical production origin", async () => {
  const built = await worker();
  try {
    const app = binding();
    const robots = await built.worker.fetch(new Request("https://preview.example/robots.txt"), { APP:app.binding });
    const robotsText = await robots.text();
    assert.match(robotsText, /Disallow: \/api\//);
    assert.match(robotsText, /Disallow: \/review\//);
    assert.match(robotsText, /Disallow: \/supabase-series/);
    assert.match(robotsText, /Sitemap: https:\/\/gachalens\.com\/sitemap\.xml/);
    assert.match(robotsText, /Sitemap: https:\/\/gachalens\.com\/series-sitemap\.xml/);
    assert.match(robotsText, /Sitemap: https:\/\/gachalens\.com\/variant-sitemap\.xml/);
    assert.match(robotsText, /Host: https:\/\/gachalens\.com\//);

    const root = await built.worker.fetch(new Request("https://preview.example/sitemap.xml"), { APP:app.binding });
    const rootText = await root.text();
    assert.match(rootText, /<urlset/);
    assert.match(rootText, /https:\/\/gachalens\.com\/ranking/);
    assert.match(rootText, /https:\/\/gachalens\.com\/schedule\?month=2026-10/);
    assert.doesNotMatch(rootText, /<sitemapindex/);

    const series = await built.worker.fetch(new Request("https://preview.example/series-sitemap.xml"), { APP:app.binding });
    assert.match(await series.text(), /https:\/\/gachalens\.com\/series\/group\/parent-1/);

    const variants = await built.worker.fetch(new Request("https://preview.example/variant-sitemap/1"), { APP:app.binding });
    assert.match(await variants.text(), /https:\/\/gachalens\.com\/series\/variant-1/);
  } finally {
    fs.rmSync(built.temp, { recursive:true, force:true });
  }
});

test("app-owned routes keep credentials and require exact App SHA before delegation", async () => {
  const built = await worker();
  try {
    const app = binding();
    const response = await built.worker.fetch(new Request("https://preview.example/review", {
      headers:{ cookie:"review_session=ok" },
    }), { APP:app.binding });
    assert.equal(response.status, 200);
    assert.deepEqual(app.calls.map((call) => call.path), ["/review"]);
    assert.equal(app.calls[0].cookie, "review_session=ok");
    assert.equal(app.calls[0].expectedSha, SHA);
  } finally {
    fs.rmSync(built.temp, { recursive:true, force:true });
  }
});

test("public renderer source has no Next vinext React or Supabase client dependency", () => {
  const text = fs.readFileSync(new URL("../workers/public/src/document-renderer.js", import.meta.url), "utf8");
  for (const token of ["vinext", "next/", "react", "@supabase/supabase-js", "SUPABASE_SERVICE_ROLE_KEY"]) {
    assert.equal(text.includes(token), false, token);
  }
});

test("series queries and canonical series share the same explicit App owner", async () => {
  const built = await worker();
  try {
    const app = binding();
    const response = await built.worker.fetch(new Request("https://preview.example/series?q=test", {
      headers:{ cookie:"catalog_session=ok" },
    }), { APP:app.binding });
    assert.equal(response.status, 404);
    assert.deepEqual(app.calls.map((call) => call.path), ["/series"]);
    assert.equal(app.calls[0].search, "?q=test");
    assert.equal(app.calls[0].cookie, "catalog_session=ok");
    assert.equal(app.calls[0].expectedSha, SHA);
  } finally {
    fs.rmSync(built.temp, { recursive:true, force:true });
  }
});

test("schedule query contract is delegated intact to App instead of reimplemented as bare HTML", async () => {
  const built = await worker();
  try {
    const app = binding();
    const response = await built.worker.fetch(new Request("https://preview.example/schedule?month=2026-10&page=2"), { APP:app.binding });
    assert.equal(response.status, 404);
    assert.deepEqual(app.calls.map((call) => call.path), ["/schedule"]);
    assert.equal(app.calls[0].search, "?month=2026-10&page=2");
    assert.equal(app.calls[0].expectedSha, SHA);
    assert.equal(app.calls.some((call) => call.path === "/__public-data/v1/schedule"), false);
  } finally {
    fs.rmSync(built.temp, { recursive:true, force:true });
  }
});