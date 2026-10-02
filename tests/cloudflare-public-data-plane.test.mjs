import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildPublicDataRestHeaders,
  discoverVariantSitemapShards,
  handlePublicDocumentData,
  isLegacyServiceRoleJwt,
} from "../worker/public-document-data.js";

const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_a6_test_only",
};

function legacyServiceRoleJwt() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role: "service_role" })}.signature`;
}

test("current opaque Secret API key uses apikey and is never copied into Bearer", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (request) => {
      calls.push(request);
      return Response.json([]);
    };
    const response = await handlePublicDocumentData(
      new Request("https://gacha-lens.internal/__public-data/v1/series?limit=1"),
      ENV,
    );
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].headers.get("apikey"), ENV.SUPABASE_SERVICE_ROLE_KEY);
    assert.equal(calls[0].headers.get("authorization"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("legacy Bearer compatibility is explicitly gated to a service_role JWT", () => {
  const jwt = legacyServiceRoleJwt();
  assert.equal(isLegacyServiceRoleJwt(jwt), true);
  assert.equal(buildPublicDataRestHeaders(jwt).authorization, `Bearer ${jwt}`);
  assert.equal(isLegacyServiceRoleJwt("sb_secret_not_a_jwt"), false);
  assert.equal(buildPublicDataRestHeaders("sb_secret_not_a_jwt").authorization, undefined);

  const anonPayload = Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url");
  const anonJwt = `eyJhbGciOiJIUzI1NiJ9.${anonPayload}.signature`;
  assert.equal(isLegacyServiceRoleJwt(anonJwt), false);
  assert.equal(buildPublicDataRestHeaders(anonJwt).authorization, undefined);
});

test("variant sitemap shard discovery finds 60 non-empty shards for the accepted 59095-row snapshot without exact count", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (request) => {
      const url = new URL(request.url);
      const offset = Number(url.searchParams.get("offset") || 0);
      calls.push({
        offset,
        prefer: request.headers.get("prefer"),
        range: request.headers.get("range"),
        authorization: request.headers.get("authorization"),
        apikey: request.headers.get("apikey"),
        url: url.toString(),
      });
      return Response.json(offset < 59095 ? [{ slug: `variant-${offset}` }] : []);
    };

    const result = await discoverVariantSitemapShards(ENV);
    assert.deepEqual(result, { pages: 60 });
    assert.ok(calls.length < 20, `expected bounded boundary probes, got ${calls.length}`);
    assert.equal(calls.every((call) => call.prefer === null), true);
    assert.equal(calls.every((call) => call.range === null), true);
    assert.equal(calls.every((call) => call.authorization === null), true);
    assert.equal(calls.every((call) => call.apikey === ENV.SUPABASE_SERVICE_ROLE_KEY), true);
    assert.equal(calls.some((call) => /count=exact/i.test(call.url)), false);
    assert.equal(calls.some((call) => call.offset === 59000), true);
    assert.equal(calls.some((call) => call.offset === 60000), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("internal shard-discovery endpoint returns exact non-empty shard count without count headers", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (request) => {
      const offset = Number(new URL(request.url).searchParams.get("offset") || 0);
      return Response.json(offset < 59095 ? [{ slug: "x" }] : []);
    };
    const response = await handlePublicDocumentData(
      new Request("https://gacha-lens.internal/__public-data/v1/sitemap-variant-shards"),
      ENV,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { pages: 60 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Public data plane source cannot regress to opaque-secret Bearer or global exact-count sitemap discovery", () => {
  const dataSource = fs.readFileSync(new URL("../worker/public-document-data.js", import.meta.url), "utf8");
  const renderer = fs.readFileSync(new URL("../workers/public/src/document-renderer.js", import.meta.url), "utf8");
  assert.doesNotMatch(dataSource, /prefer\s*:\s*["']count=exact["']/i);
  assert.doesNotMatch(dataSource, /authorization:\s*`Bearer \$\{cfg\.key\}`/);
  assert.doesNotMatch(renderer, /\/__public-data\/v1\/counts/);
  assert.match(renderer, /\/__public-data\/v1\/sitemap-variant-shards/);

  const nativeSitemap = fs.readFileSync(new URL("../lib/data/public-sitemap-identifiers.js", import.meta.url), "utf8");
  const series = fs.readFileSync(new URL("../lib/series.js", import.meta.url), "utf8");
  assert.doesNotMatch(nativeSitemap, /count:\s*["']exact["']/);
  assert.doesNotMatch(nativeSitemap, /head:\s*true/);
  assert.match(nativeSitemap, /fetchPublicVariantSitemapShardCount/);
  assert.match(nativeSitemap, /\.range\(from, from\)/);
  assert.match(series, /loadCachedPublicVariantSitemapShardCount/);
  assert.doesNotMatch(series, /public-variant-sitemap-count/);
});
