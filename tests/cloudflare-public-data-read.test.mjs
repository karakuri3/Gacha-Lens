import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { buildPublicWorker } from "../scripts/build-public-worker.mjs";
import { classifyPhaseA2Route } from "../workers/public/src/route-contract.js";

const SHA = "1234567890abcdef1234567890abcdef12345678";
const PATH = "/api/runtime-diagnostics/public-variant-read";
const FIXED_SLUG = "tarts-y901096-ディズニー-マリー";

async function builtWorker() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "gacha-public-data-read-"));
  const outputPath = path.join(temp, "index.js");
  buildPublicWorker({ sourceSha: SHA, outputPath });
  const loaded = await import(`${pathToFileURL(outputPath).href}?t=${Date.now()}-${Math.random()}`);
  return { worker: loaded.default, temp };
}

function representativeRow() {
  return {
    id: "variant-1",
    slug: FIXED_SLUG,
    series_id: "series-1",
    name: "ディズニー マリー",
    variant_type: "normal",
    rarity: "ノーマル",
    role: "character",
    image: "https://example.invalid/marie.jpg",
    released: true,
    price: 300,
    brand: "タカラトミーアーツ",
    release_month: "2026-09",
    release_week: null,
    release_date: "2026-09-01",
    official_url: "https://example.invalid/official",
    review_required: false,
    parent: {
      id: "series-1",
      slug: "series-1",
      name: "ディズニー",
      franchise: "ディズニー",
      brand: "タカラトミーアーツ",
      category: "ガチャ",
      release_month: "2026-09",
      release_week: null,
      release_date: "2026-09-01",
      price: 300,
      image_url: "https://example.invalid/series.jpg",
      official_url: "https://example.invalid/official",
      is_released: true,
    },
  };
}

test("route contract owns only the fixed public variant-read diagnostic", () => {
  assert.equal(classifyPhaseA2Route(PATH), "public-owned");
  assert.equal(classifyPhaseA2Route(`${PATH}/anything`), "explicitly-rejected");
});

test("fixed public variant read fails closed without the service-role secret and makes no subrequest", async () => {
  const { worker, temp } = await builtWorker();
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("must not fetch");
  };
  try {
    const response = await worker.fetch(new Request(`https://public.example${PATH}`), {});
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("x-gacha-plane"), "public");
    assert.equal(response.headers.get("x-gacha-route"), "public-variant-read-fixed-v1");
    assert.equal(response.headers.get("x-gacha-external-subrequests"), "0");
    assert.equal(calls, 0);
    const body = await response.json();
    assert.equal(body.error, "public_data_secret_unavailable");
    assert.equal(body.source_sha, SHA);
  } finally {
    globalThis.fetch = previousFetch;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("fixed public variant read ignores caller query and forwards only the server secret to the exact Supabase origin", async () => {
  const { worker, temp } = await builtWorker();
  const previousFetch = globalThis.fetch;
  const secret = "test-only-service-role-secret";
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const headers = new Headers(init.headers);
    calls.push({ url, init, headers });
    return new Response(JSON.stringify([representativeRow()]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const response = await worker.fetch(new Request(
      `https://public.example${PATH}?slug=evil&select=*&url=https://evil.example`,
      {
        headers: {
          authorization: "Bearer caller-token-must-not-forward",
          cookie: "private=session",
        },
      }
    ), { SUPABASE_SERVICE_ROLE_KEY: secret });

    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    const call = calls[0];
    assert.equal(call.url.origin, "https://vxbrnvfhmzcxehuuzzum.supabase.co");
    assert.equal(call.url.pathname, "/rest/v1/variants");
    assert.equal(call.url.searchParams.get("slug"), `eq.${FIXED_SLUG}`);
    assert.equal(call.url.searchParams.get("limit"), "1");
    assert.equal(call.url.searchParams.get("or"), "(variant_type.is.null,variant_type.neq.provisional)");
    assert.match(call.url.searchParams.get("select") || "", /^id,slug,series_id,name,/);
    assert.match(call.url.searchParams.get("select") || "", /parent:series!inner\(/);
    assert.equal((call.url.searchParams.get("select") || "").includes("*"), false);
    assert.equal(call.url.href.includes("evil.example"), false);
    assert.equal(call.url.href.includes("slug=evil"), false);
    assert.equal(call.headers.get("authorization"), `Bearer ${secret}`);
    assert.equal(call.headers.get("apikey"), secret);
    assert.equal(call.headers.get("cookie"), null);
    assert.equal(call.headers.get("user-agent"), "GachaLens-PublicWorker-DataRead");
    assert.equal(call.init.method, "GET");
    assert.equal(call.init.redirect, "error");

    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    assert.equal(response.headers.get("x-gacha-plane"), "public");
    assert.equal(response.headers.get("x-gacha-route"), "public-variant-read-fixed-v1");
    assert.equal(response.headers.get("x-gacha-external-subrequests"), "1");

    const raw = await response.text();
    assert.equal(raw.includes(secret), false);
    assert.equal(raw.includes("caller-token-must-not-forward"), false);
    const body = JSON.parse(raw);
    assert.equal(body.ok, true);
    assert.equal(body.source_sha, SHA);
    assert.deepEqual(body.representative, {
      id: "variant-1",
      slug: FIXED_SLUG,
      name: "ディズニー マリー",
      series_id: "series-1",
      parent: {
        id: "series-1",
        slug: "series-1",
        name: "ディズニー",
      },
    });
  } finally {
    globalThis.fetch = previousFetch;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("fixed public variant read sanitizes upstream HTTP failures", async () => {
  const { worker, temp } = await builtWorker();
  const previousFetch = globalThis.fetch;
  const secret = "test-only-service-role-secret";
  globalThis.fetch = async () => new Response("upstream-secret-detail", { status: 403 });
  try {
    const response = await worker.fetch(new Request(`https://public.example${PATH}`), {
      SUPABASE_SERVICE_ROLE_KEY: secret,
    });
    assert.equal(response.status, 502);
    const raw = await response.text();
    assert.equal(raw.includes(secret), false);
    assert.equal(raw.includes("upstream-secret-detail"), false);
    const body = JSON.parse(raw);
    assert.equal(body.error, "public_data_upstream_http_failure");
    assert.equal(body.upstream_status, 403);
  } finally {
    globalThis.fetch = previousFetch;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("fixed public variant read rejects non-GET methods before any Supabase request", async () => {
  const { worker, temp } = await builtWorker();
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("[]", { status: 200 });
  };
  try {
    const response = await worker.fetch(new Request(`https://public.example${PATH}`, {
      method: "POST",
      body: "x=1",
    }), { SUPABASE_SERVICE_ROLE_KEY: "test-only-service-role-secret" });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET, HEAD");
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = previousFetch;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
