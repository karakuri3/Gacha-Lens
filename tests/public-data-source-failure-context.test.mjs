import test from "node:test";
import assert from "node:assert/strict";
import {
  markPublicDataSourceFailure,
  runWithPublicDataSourceFailureTracking,
} from "../lib/data/public-data-source-failure-context.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("data-source failure state is request-scoped and does not leak across concurrent work", async () => {
  const [failed, healthy] = await Promise.all([
    runWithPublicDataSourceFailureTracking(async () => {
      await delay(5);
      markPublicDataSourceFailure();
      await delay(5);
      return "failed-response";
    }),
    runWithPublicDataSourceFailureTracking(async () => {
      await delay(8);
      return "healthy-response";
    }),
  ]);

  assert.deepEqual(failed, { response: "failed-response", failed: true });
  assert.deepEqual(healthy, { response: "healthy-response", failed: false });
});

test("stream work drained inside the tracked callback can mark a late failure", async () => {
  const tracked = await runWithPublicDataSourceFailureTracking(async () => {
    const stream = new ReadableStream({
      start(controller) {
        queueMicrotask(() => {
          markPublicDataSourceFailure();
          controller.enqueue(new TextEncoder().encode("streamed-html"));
          controller.close();
        });
      },
    });
    const response = new Response(stream, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    await response.clone().text();
    return response;
  });

  assert.equal(tracked.failed, true);
  assert.equal(tracked.response.status, 200);
  assert.equal(await tracked.response.text(), "streamed-html");
});

test("marking outside a tracked request is a no-op", async () => {
  markPublicDataSourceFailure();
  const result = await runWithPublicDataSourceFailureTracking(async () => "healthy-response");
  assert.deepEqual(result, { response: "healthy-response", failed: false });
});
