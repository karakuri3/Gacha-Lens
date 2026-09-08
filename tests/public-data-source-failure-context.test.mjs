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

test("marking outside a tracked request is a no-op", async () => {
  markPublicDataSourceFailure();
  const result = await runWithPublicDataSourceFailureTracking(async () => "healthy-response");
  assert.deepEqual(result, { response: "healthy-response", failed: false });
});
