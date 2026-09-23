import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const worker = fs.readFileSync("worker/index.js", "utf8");
const smoke = fs.readFileSync(".github/workflows/cloudflare-runtime-smoke.yml", "utf8");

test("runtime boundary diagnostics are restricted to workers.dev Preview hosts", () => {
  assert.match(worker, /url\.hostname\.endsWith\(PREVIEW_HOST_SUFFIX\)/);
  assert.match(worker, /X-Gacha-Diag-Worker-Reached/);
  assert.match(worker, /X-Gacha-Diag-Handler-Ms/);
});

test("runtime smoke records the handler boundary without weakening retries", () => {
  assert.match(smoke, /x-gacha-diag-worker-reached/i);
  assert.match(smoke, /x-gacha-diag-handler-ms/i);
  assert.match(smoke, /for attempt in 1 2 3/);
  assert.match(smoke, /000\|429\|500\|502\|503\|504/);
  assert.match(smoke, /Runtime boundary response headers:/);
});
