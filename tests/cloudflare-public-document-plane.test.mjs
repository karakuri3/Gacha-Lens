import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildPublicWorker } from "../scripts/build-public-worker.mjs";
import { classifyPublicRoute } from "../workers/public/src/route-contract.js";

const SHA = "1234567890abcdef1234567890abcdef12345678";

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
        calls.push({ path:url.pathname, search:url.search, method:request.method, cookie:request.headers.get("cookie") });
        if (url.pathname === "/api/runtime-diagnostics/release-source") {
          return Response.json({ source_sha: SHA });
        }
        if (url.pathname === "/review") return new Response("Review access", { headers:{ "content-type":"text/html" } });
        if (url.pathname === "/__public-data/v1/series") return Response.json(series);
        if (url.pathname === "/__public-data/v1/schedule") return Response.json(series);
        if (url.pathname === "/__public-data/v1/series-detail") return Response.json({ series:series[0], variants });
        if (url.pathname === "/__public-data/v1/variant-detail") return Response.json({ series:series[0], variant:variants[0] });
        if (url.pathname === "/__public-data/v1/sitemap-series") return Response.json([{ slug:"parent-1", updated_at:"2026-10-01T00:00:00Z" }]);
        if (url.pathname === "/__public-data/v1/sitemap-variants") return Response.json([{ slug:"variant-1", updated_at:"2026-10-01T00:00:00Z" }]);
        if (url.pathname === "/__public-data/v1/counts") return Response.json({ series:1, variants:1 });
        return new Response("not found", { status:404 });
      },
    },
  };
}

test("A3 ownership is explicit and unknown paths remain fail-closed", () => {
  for (const route of ["/","/series","/schedule","/robots.txt","/sitemap.xml","/series-sitemap.xml","/variant-sitemap.xml","/variant-sitemap/1","/series/variant-1","/series/group/parent-1"]) {
    assert.equal(classifyPublicRoute(route), "public-document", route);
  }
  for (const route of ["/review","/review/login","/api/community-reports","/api/review/community-reports/1"]) {
    assert.equal(classifyPublicRoute(route), "app-owned", route);
  }
  assert.equal(classifyPublicRoute("/arbitrary"), "explicitly-rejected");
  assert.equal(classifyPublicRoute("/api/arbitrary"), "explicitly-rejected");
});

test("public documents render in Public Worker and never proxy same document path to App", async () => {
  const built = await worker();
  try {
    const app = binding();
    for (const route of ["/","/series","/schedule","/series/variant-1","/series/group/parent-1"]) {
      const before = app.calls.length;
      const response = await built.worker.fetch(new Request(`https://preview.example${route}`), { APP:app.binding });
      assert.equal(response.status, 200, route);
      assert.match(response.headers.get("content-type") || "", /text\/html/);
      assert.equal(response.headers.get("x-gacha-public-plane"), "phase-a3");
      const body = await response.text();
      assert.match(body, /<link rel="canonical"/);
      const calls = app.calls.slice(before);
      assert.ok(calls.length >= 1);
      assert.ok(calls.every((call) => call.path.startsWith("/__public-data/v1/")), JSON.stringify(calls));
      assert.ok(calls.every((call) => call.path !== route));
    }
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
    assert.match(robotsText, /Sitemap: https:\/\/gachalens\.com\/sitemap\.xml/);

    const root = await built.worker.fetch(new Request("https://preview.example/sitemap.xml"), { APP:app.binding });
    assert.match(await root.text(), /https:\/\/gachalens\.com\/series-sitemap\.xml/);

    const series = await built.worker.fetch(new Request("https://preview.example/series-sitemap.xml"), { APP:app.binding });
    assert.match(await series.text(), /https:\/\/gachalens\.com\/series\/parent-1/);

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
    assert.deepEqual(app.calls.map((call) => call.path), ["/api/runtime-diagnostics/release-source","/review"]);
    assert.equal(app.calls[1].cookie, "review_session=ok");
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
