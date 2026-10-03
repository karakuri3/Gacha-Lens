import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { buildPublicWorker } from "../scripts/build-public-worker.mjs";
import { waitForAppExactSha } from "../scripts/cloudflare-public-build-gate.mjs";
import {
  classifyPhaseA2Route,
  PUBLIC_BOOTSTRAP_OWNED_PATHS,
} from "../workers/public/src/route-contract.js";

const SHA = "1234567890abcdef1234567890abcdef12345678";
const OTHER_SHA = "abcdef1234567890abcdef1234567890abcdef12";
const root = process.cwd();

async function builtWorker(sourceSha = SHA) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "gacha-public-worker-"));
  const outputPath = path.join(temp, "index.js");
  buildPublicWorker({ sourceSha, outputPath });
  const loaded = await import(`${pathToFileURL(outputPath).href}?t=${Date.now()}-${Math.random()}`);
  return { worker: loaded.default, temp };
}

function appBinding({ sourceSha = SHA, reviewStatus = 200, reviewBody = "Review access" } = {}) {
  const calls = [];
  return {
    calls,
    binding: {
      async fetch(request) {
        const url = new URL(request.url);
        calls.push({
          pathname: url.pathname,
          method: request.method,
          authorization: request.headers.get("authorization"),
          cookie: request.headers.get("cookie"),
          accept: request.headers.get("accept"),
        });
        if (url.pathname === "/api/runtime-diagnostics/release-source") {
          return new Response(JSON.stringify({ source_sha: sourceSha }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.pathname === "/review") {
          return new Response(reviewBody, {
            status: reviewStatus,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }
        return new Response("not found", { status: 404 });
      },
    },
  };
}

test("public bootstrap owns only fixed diagnostics and rejects arbitrary proxy paths", async () => {
  const { worker, temp } = await builtWorker();
  try {
    const app = appBinding();
    const response = await worker.fetch(new Request("https://public.example/anything?url=https://evil.example"), { APP: app.binding });
    assert.equal(response.status, 404);
    assert.deepEqual(app.calls, []);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("release-source exposes only exact public SHA and no secret material", async () => {
  const { worker, temp } = await builtWorker();
  try {
    const response = await worker.fetch(new Request("https://public.example/api/runtime-diagnostics/release-source"), {});
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    const body = await response.json();
    assert.deepEqual(body, { plane: "public", source_sha: SHA });
    assert.equal(JSON.stringify(body).includes("SUPABASE"), false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("delegation diagnostic proves exact SHA and one fixed representative app route", async () => {
  const { worker, temp } = await builtWorker();
  try {
    const app = appBinding();
    const response = await worker.fetch(new Request("https://public.example/api/runtime-diagnostics/app-delegation", {
      headers: {
        authorization: "Bearer must-not-forward",
        cookie: "review_session=must-not-forward",
        "x-arbitrary": "must-not-forward",
      },
    }), { APP: app.binding });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.public_source_sha, SHA);
    assert.equal(body.app_source_sha, SHA);
    assert.deepEqual(body.representative, { path: "/review", status: 200, marker: true });
    assert.deepEqual(app.calls.map((call) => call.pathname), [
      "/api/runtime-diagnostics/release-source",
      "/review",
    ]);
    for (const call of app.calls) {
      assert.equal(call.method, "GET");
      assert.equal(call.authorization, null);
      assert.equal(call.cookie, null);
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("mixed public/app SHAs fail closed before representative delegation", async () => {
  const { worker, temp } = await builtWorker();
  try {
    const app = appBinding({ sourceSha: OTHER_SHA });
    const response = await worker.fetch(new Request("https://public.example/api/runtime-diagnostics/app-delegation"), { APP: app.binding });
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.error, "mixed_source_sha");
    assert.equal(body.public_source_sha, SHA);
    assert.equal(body.app_source_sha, OTHER_SHA);
    assert.deepEqual(app.calls.map((call) => call.pathname), ["/api/runtime-diagnostics/release-source"]);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("write methods are rejected before any Service Binding call", async () => {
  const { worker, temp } = await builtWorker();
  try {
    const app = appBinding();
    const response = await worker.fetch(new Request("https://public.example/api/runtime-diagnostics/app-delegation", { method: "POST" }), { APP: app.binding });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET, HEAD");
    assert.deepEqual(app.calls, []);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("route ownership matrix preserves A6 front-door delegation and fail-closed boundaries", () => {
  for (const route of PUBLIC_BOOTSTRAP_OWNED_PATHS) assert.equal(classifyPhaseA2Route(route), "public-owned");
  assert.equal(classifyPhaseA2Route("/review"), "conditional");
  assert.equal(classifyPhaseA2Route("/review/login"), "app-owned");
  assert.equal(classifyPhaseA2Route("/api/review/community-reports/1"), "app-owned");
  assert.equal(classifyPhaseA2Route("/"), "app-owned");
  assert.equal(classifyPhaseA2Route("/series"), "app-owned");
  assert.equal(classifyPhaseA2Route("/series/example"), "app-owned");
  assert.equal(classifyPhaseA2Route("/schedule"), "app-owned");
  assert.equal(classifyPhaseA2Route("/sitemap.xml"), "planned-public");
  assert.equal(classifyPhaseA2Route("/variant-sitemap/1"), "planned-public");
  assert.equal(classifyPhaseA2Route("/api/arbitrary-proxy"), "explicitly-rejected");
});

test("public Worker source is dependency-free from vinext React Next and Supabase clients", () => {
  const source = fs.readFileSync(path.join(root, "workers/public/src/index.js"), "utf8");
  for (const forbidden of [
    "vinext",
    "react",
    "next/",
    "@supabase/supabase-js",
    "SUPABASE_SERVICE_ROLE_KEY",
    "select=*",
  ]) {
    assert.equal(source.includes(forbidden), false, `forbidden public bootstrap dependency/token: ${forbidden}`);
  }
});

test("public Wrangler config binds only to existing gacha-lens App Worker and declares no custom domain yet", () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, "workers/public/wrangler.jsonc"), "utf8"));
  assert.equal(config.name, "gacha-lens-public");
  assert.equal(config.services?.length, 1);
  assert.deepEqual(config.services[0], { binding: "APP", service: "gacha-lens" });
  assert.equal("routes" in config, false);
  assert.equal("route" in config, false);
  assert.equal("custom_domains" in config, false);
});


test("Public production build gate skips non-main previews", async () => {
  let calls = 0;
  const result = await waitForAppExactSha({
    targetSha: SHA,
    branch: "fix/430-phase-a2-bootstrap",
    fetchImpl: async () => {
      calls += 1;
      throw new Error("must not fetch");
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
  assert.equal(calls, 0);
});

test("Public production build gate waits for exact App SHA and then passes", async () => {
  const observed = [OTHER_SHA, SHA];
  let calls = 0;
  const result = await waitForAppExactSha({
    targetSha: SHA,
    branch: "main",
    attempts: 2,
    delayMs: 0,
    sleep: async () => {},
    fetchImpl: async () => {
      const sourceSha = observed[calls++];
      return new Response(JSON.stringify({ source_sha: sourceSha }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, "app_exact_sha_ready");
  assert.equal(result.attempt, 2);
});

test("Public production build gate fails closed when App never reaches target SHA", async () => {
  await assert.rejects(
    waitForAppExactSha({
      targetSha: SHA,
      branch: "main",
      attempts: 2,
      delayMs: 0,
      sleep: async () => {},
      fetchImpl: async () => new Response(JSON.stringify({ source_sha: OTHER_SHA }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    }),
    /app_exact_sha_not_ready/,
  );
});
