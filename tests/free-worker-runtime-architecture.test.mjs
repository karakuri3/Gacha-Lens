import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rootPackage = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const toolchainPackage = JSON.parse(readFileSync(new URL("../.github/vinext-toolchain/package.json", import.meta.url), "utf8"));
const workerSource = readFileSync(new URL("../worker/index.js", import.meta.url), "utf8");
const runtimeSmoke = readFileSync(new URL("../.github/workflows/cloudflare-runtime-smoke.yml", import.meta.url), "utf8");
const viteConfig = readFileSync(new URL("../vite.config.mjs", import.meta.url), "utf8");

test("Free Worker runtime pins released vinext cold-path improvements", () => {
  assert.equal(rootPackage.devDependencies.vinext, "1.0.0-beta.12");
  assert.equal(rootPackage.devDependencies["@vinext/cloudflare"], "1.0.0-beta.10");
  assert.equal(toolchainPackage.dependencies.vinext, "1.0.0-beta.12");
  assert.equal(toolchainPackage.dependencies["@vinext/cloudflare"], "1.0.0-beta.10");
  assert.equal(toolchainPackage.overrides.undici, "7.29.1");
});

test("Cloudflare Vite config stays runtime-only without unsupported full prerender", () => {
  assert.match(viteConfig, /vinext\(\)/);
  assert.match(viteConfig, /cloudflare\(/);
  assert.doesNotMatch(viteConfig, /prerender/);
  assert.doesNotMatch(viteConfig, /staticAssetsAdapter/);
});

test("bounded public cache lookup happens before vinext rendering", () => {
  const lookup = workerSource.indexOf("await workerCache.match(workerCacheKey)");
  const render = workerSource.indexOf("await handler.fetch(request, env, ctx)");
  assert.ok(lookup >= 0, "Worker cache lookup must exist");
  assert.ok(render > lookup, "vinext render must occur only after a Worker cache miss");
  assert.match(workerSource, /__gacha_release/);
  assert.match(workerSource, /X-Gacha-Worker-Cache/);
  assert.match(workerSource, /ctx\.waitUntil\(workerCache\.put/);
});

test("runtime smoke cannot mask transient public failures with retries", () => {
  assert.match(runtimeSmoke, /#430 forbids retry masking/);
  assert.match(runtimeSmoke, /HTTP 200 \(single attempt\)/);
  assert.doesNotMatch(runtimeSmoke, /seq 1 6/);
  assert.doesNotMatch(runtimeSmoke, /retrying after/);
});
