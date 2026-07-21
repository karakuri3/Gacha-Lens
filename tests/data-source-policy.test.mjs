import assert from "node:assert/strict";
import test from "node:test";
import {
  DATA_SOURCE_CODES,
  DataSourceError,
  resolveDataSource,
  runDataSourceOperation,
} from "../lib/data/data-source-policy.js";

test("production defaults to Supabase when configuration exists", () => {
  assert.equal(resolveDataSource({ nodeEnv: "production", hasSupabaseConfig: true }), "supabase");
});

test("production rejects explicit sample mode", () => {
  assert.throws(
    () => resolveDataSource({ nodeEnv: "production", configuredSource: "sample", hasSupabaseConfig: true }),
    (error) => error instanceof DataSourceError && error.code === DATA_SOURCE_CODES.CONFIG
  );
});

test("invalid source values fail instead of falling back", () => {
  assert.throws(
    () => resolveDataSource({ nodeEnv: "development", configuredSource: "file", hasSupabaseConfig: true }),
    (error) => error instanceof DataSourceError && error.code === DATA_SOURCE_CODES.CONFIG
  );
});

test("development sample mode must be explicit", () => {
  assert.equal(
    resolveDataSource({ nodeEnv: "development", configuredSource: "sample", hasSupabaseConfig: false }),
    "sample"
  );
  assert.throws(
    () => resolveDataSource({ nodeEnv: "development", hasSupabaseConfig: false }),
    (error) => error instanceof DataSourceError && error.code === DATA_SOURCE_CODES.CONFIG
  );
});

test("query failures become sanitized typed errors", async () => {
  const secret = "service-role-secret-must-not-leak";
  await assert.rejects(
    runDataSourceOperation("catalog", async () => {
      throw new Error(`request failed with ${secret}`);
    }),
    (error) => {
      assert.equal(error.code, DATA_SOURCE_CODES.QUERY);
      assert.equal(error.message.includes(secret), false);
      return true;
    }
  );
});

test("valid empty results stay empty and do not trigger fallback data", async () => {
  const result = await runDataSourceOperation("catalog", async () => []);
  assert.deepEqual(result, []);
});
