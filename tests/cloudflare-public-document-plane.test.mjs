import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { buildPublicWorker } from "../scripts/build-public-worker.mjs";
import { handlePublicDocumentData } from "../worker/public-document-data.js";

const SHA = "1234567890abcdef1234567890abcdef12345678";
const OTHER_SHA = "abcdef1234567890abcdef1234567890abcdef12";

async function builtWorker() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "gacha-public-docs-"));
  const outputPath = path.join(temp, "index.js");
  buildPublicWorker({ sourceSha: SHA, outputPath });
  const loaded = await import(`${pathToFileURL(outputPath).href}?t=${Date.now()}-${Math.random()}`);
  return { worker: loaded.default, temp };
}

function dataPayload(kind, url) {
  if (kind === "home") return {
    released: [{ slug: "variant-one", name: "公開商品", released: true, price: 400, parent: { slug: "series-one", name: "公開シリーズ" } }],
    upcoming: [{ slug: "series-two", name: "発売予定シリーズ", release_date: "2026-11-01", price: 500 }],
  };
  if (kind === "series") return { scope: url.searchParams.get("scope") === "variant" ? "variant" : "series", page: 1, pageSize: 60, total: 1, items: [{ slug: "series-one", name: "公開シリーズ", price: 400 }] };
  if (kind === "schedule") return { month: url.searchParams.get("month"), months: ["2026-10", "2026-11"], page: 1, pageSize: 60, total: 1, items: [{ slug: "series-one", name: "公開シリーズ", release_date: "2026-10-10" }] };
  if (kind === "variant-detail") return { item: { slug: "variant-one", name: "公開商品", price: 400, parent: { slug: "series-one", name: "公開シリーズ" } }, siblings: [] };
  if (kind === "series-detail") return { item: { slug: "series-one", name: "公開シリーズ", price: 400 }, variants: [] };
  if (kind === "root-sitemap") return { paths: ["/", "/series"] };
  if (kind === "series-sitemap") return { entries: [{ slug: "series-one", updated_at: "2026-10-01" }] };
  if (kind === "variant-sitemap-index") return { shards: 1, total: 1, shard_size: 1000 };
  if (kind === "variant-sitemap-shard") return { entries: [{ slug: "variant-one", updated_at: "2026-10-01" }], shards: 1, total: 1 };
  return null;
}

function appDataBinding(sourceSha = SHA) {
  const calls = [];
  return {
    calls,
    binding: {
      async fetch(request) {
        const url = new URL(request.url);
        calls.push({ url: url.toString(), pathname: url.pathname, headers: Object.fromEntries(request.headers.entries()) });
        if (url.pathname === "/.gacha-internal/public-document-data/v1") {
          const kind = url.searchParams.get("kind");
          return Response.json({ ok: true, source_sha: sourceSha, payload: dataPayload(kind, url), subrequests: 1 });
        }
        if (url.pathname === "/api/runtime-diagnostics/release-source") return Response.json({ source_sha: sourceSha });
        if (url.pathname === "/review") return new Response("Review access");
        return new Response("not found", { status: 404 });
      },
    },
  };
}

test("planned public documents render on Public Worker and never proxy original App route", async () => {
  const { worker, temp } = await builtWorker();
  try {
    const app = appDataBinding();
    const cases = [
      ["/", "いま注目のガチャがすぐ分かる"],
      ["/series", "ガチャ一覧"],
      ["/schedule?month=2026-10", "2026年10月のガチャ発売予定"],
      ["/series/variant-one", "公開商品"],
      ["/series/group/series-one", "公開シリーズ"],
      ["/sitemap.xml", "<urlset"],
      ["/series-sitemap.xml", "/series/group/series-one"],
      ["/variant-sitemap.xml", "<sitemapindex"],
      ["/variant-sitemap/1", "/series/variant-one"],
    ];
    for (const [requestPath, marker] of cases) {
      const response = await worker.fetch(new Request(`https://public.example${requestPath}`, { headers: { authorization: "Bearer must-not-forward", cookie: "private=must-not-forward" } }), { APP: app.binding });
      assert.equal(response.status, 200, requestPath);
      assert.equal(response.headers.get("x-gacha-plane"), "public", requestPath);
      assert.match(await response.text(), new RegExp(marker), requestPath);
    }
    assert.ok(app.calls.every((call) => call.pathname === "/.gacha-internal/public-document-data/v1"));
    assert.ok(app.calls.every((call) => !call.headers.authorization && !call.headers.cookie));
    assert.ok(app.calls.every((call) => call.headers["x-gacha-public-source-sha"] === SHA));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("robots is Public-owned, stable, and makes zero App calls", async () => {
  const { worker, temp } = await builtWorker();
  try {
    const app = appDataBinding();
    const response = await worker.fetch(new Request("https://public.example/robots.txt"), { APP: app.binding });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /Disallow: \/api\//);
    assert.match(text, /Sitemap: https:\/\/gachalens\.com\/sitemap\.xml/);
    assert.deepEqual(app.calls, []);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("document data SHA mismatch fails closed before rendering", async () => {
  const { worker, temp } = await builtWorker();
  try {
    const app = appDataBinding(OTHER_SHA);
    const response = await worker.fetch(new Request("https://public.example/series"), { APP: app.binding });
    assert.equal(response.status, 409);
    assert.equal(response.headers.get("x-gacha-route"), "series-index-fail-closed");
    assert.match(await response.text(), /バージョンが一致していません/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("immutable Public Preview derives only the same-prefix App Preview data origin", async () => {
  const { worker, temp } = await builtWorker();
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (request) => {
      const url = new URL(request.url);
      calls.push(url.toString());
      return Response.json({ ok: true, source_sha: SHA, payload: dataPayload(url.searchParams.get("kind"), url), subrequests: 1 });
    };
    const response = await worker.fetch(new Request("https://12345678-gacha-lens-public.senpingxingzuo.workers.dev/series"), { APP: { fetch() { throw new Error("Preview must not bind Production App"); } } });
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /^https:\/\/12345678-gacha-lens\.senpingxingzuo\.workers\.dev\/\.gacha-internal\/public-document-data\/v1\?kind=series$/);
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("App raw public-data bridge is hidden, GET-only, and requires exact Public source identity", async () => {
  let calls = 0;
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { calls += 1; throw new Error("must not reach origin"); };
    const hidden = await handlePublicDocumentData(new Request("https://gacha-lens.internal/.gacha-internal/public-document-data/v1?kind=home"), { SUPABASE_SERVICE_ROLE_KEY: "x".repeat(40) }, { sourceSha: SHA });
    assert.equal(hidden.status, 404);
    assert.equal(calls, 0);

    const write = await handlePublicDocumentData(new Request("https://gacha-lens.internal/.gacha-internal/public-document-data/v1?kind=home", { method: "POST", headers: { "x-gacha-public-source-sha": SHA } }), { SUPABASE_SERVICE_ROLE_KEY: "x".repeat(40) }, { sourceSha: SHA });
    assert.equal(write.status, 405);
    assert.equal(calls, 0);

    const missingSecret = await handlePublicDocumentData(new Request("https://gacha-lens.internal/.gacha-internal/public-document-data/v1?kind=home", { headers: { "x-gacha-public-source-sha": SHA } }), {}, { sourceSha: SHA });
    assert.equal(missingSecret.status, 503);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("App raw detail read uses Worker-held credential, bounded projections, and public variant filter", async () => {
  const originalFetch = globalThis.fetch;
  const observed = [];
  try {
    globalThis.fetch = async (request) => {
      const url = new URL(request.url);
      observed.push({ url, authorization: request.headers.get("authorization"), apikey: request.headers.get("apikey"), range: request.headers.get("range") });
      if (observed.length === 1) {
        return new Response(JSON.stringify([{ id: "v1", slug: "variant-one", series_id: "s1", name: "公開商品", parent: { id: "s1", slug: "series-one", name: "公開シリーズ" } }]), { status: 200, headers: { "content-type": "application/json", "content-range": "0-0/1" } });
      }
      return new Response(JSON.stringify([{ id: "v1", slug: "variant-one", series_id: "s1", name: "公開商品" }]), { status: 200, headers: { "content-type": "application/json", "content-range": "0-0/1" } });
    };
    const secret = "service-role-runtime-only-value-1234567890";
    const response = await handlePublicDocumentData(new Request("https://gacha-lens.internal/.gacha-internal/public-document-data/v1?kind=variant-detail&slug=variant-one", { headers: { "x-gacha-public-source-sha": SHA, authorization: "Bearer caller-must-not-flow", cookie: "private=must-not-flow" } }), { SUPABASE_SERVICE_ROLE_KEY: secret }, { sourceSha: SHA });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.source_sha, SHA);
    assert.equal(body.payload.item.slug, "variant-one");
    assert.equal(observed.length, 2);
    for (const call of observed) {
      assert.equal(call.authorization, `Bearer ${secret}`);
      assert.equal(call.apikey, secret);
      assert.match(call.url.pathname, /\/rest\/v1\/variants$/);
      assert.doesNotMatch(call.url.search, /select=%2A|caller-must-not-flow|private%3Dmust-not-flow/);
      assert.match(decodeURIComponent(call.url.search), /variant_type\.is\.null,variant_type\.neq\.provisional/);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("App entrypoint keeps vinext behind the raw public-data bridge", () => {
  const source = fs.readFileSync("worker/index.js", "utf8");
  assert.doesNotMatch(source, /^import handler from "vinext\/server\/fetch-handler";/m);
  assert.match(source, /import\("vinext\/server\/fetch-handler"\)/);
  assert.match(source, /handlePublicDocumentData\(request, env, \{ sourceSha: RELEASE_SOURCE_SHA \}\)/);
  assert.ok(source.indexOf("handlePublicDocumentData(request, env") < source.indexOf("await getAppHandler()"));
});

test("Public document renderer remains dependency-free and cannot access the service-role secret", () => {
  const source = fs.readFileSync("workers/public/src/index.js", "utf8");
  for (const forbidden of ["vinext", "react", "next/", "@supabase/supabase-js", "SUPABASE_SERVICE_ROLE_KEY"]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.match(source, /\.gacha-internal\/public-document-data\/v1/);
  assert.doesNotMatch(source, /env\.APP\.fetch\(request\)|env\?\.APP\?\.fetch\?\.\(request\)/);
});
