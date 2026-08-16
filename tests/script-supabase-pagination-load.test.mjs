import assert from "node:assert/strict";
import test from "node:test";

import { loadOfficialCatalog } from "../scripts/load-official-catalog.mjs";
import {
  SUPABASE_READ_RELIABILITY_CONTRACT,
  fetchRows,
} from "../scripts/supabase-rest.mjs";

const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-service-role-key";

test.after(() => {
  if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
  if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
});

test("23,677 script rows are complete, unique, ordered, and sequential", async () => {
  const fake = fakeSupabase({ variants: 23_677 });
  const rows = await fetchRows("variants", {
    params: { order: "id.asc" },
    fetchImpl: fake.fetchImpl,
  });
  assertComplete(rows, "variants", 23_677);
  assert.equal(fake.calls.length, 24);
  assert.equal(fake.maximumActive(), 1);
  assert.equal(fake.calls[0].prefer, "count=exact");
  assert.equal(fake.calls.slice(1).every((call) => call.prefer === undefined), true);
});

test("10,214 script rows use eleven deterministic sequential requests", async () => {
  const fake = fakeSupabase({ series: 10_214 });
  const rows = await fetchRows("series", {
    params: { order: "id.asc" },
    fetchImpl: fake.fetchImpl,
  });
  assertComplete(rows, "series", 10_214);
  assert.equal(fake.calls.length, 11);
  assert.equal(fake.maximumActive(), 1);
});

test("loadOfficialCatalog completes series before variants with combined concurrency one", async () => {
  const fake = fakeSupabase({ series: 10_214, variants: 23_677 });
  const loaded = await loadOfficialCatalog([], {
    fetchRowsImpl: (table, options) => fetchRows(table, { ...options, fetchImpl: fake.fetchImpl }),
  });
  assert.equal(loaded.series.length, 10_214);
  assert.equal(loaded.variants.length, 23_677);
  assert.equal(fake.calls.length, 35);
  assert.equal(fake.maximumActive(), 1);
  assert.equal(fake.calls.slice(0, 11).every((call) => call.table === "series"), true);
  assert.equal(fake.calls.slice(11).every((call) => call.table === "variants"), true);
  assert.equal(fake.calls.every((call) => call.order === "id.asc"), true);
});

test("100,001 rows retain constant script request concurrency", async () => {
  const fake = fakeSupabase({ variants: 100_001 });
  const rows = await fetchRows("variants", {
    params: { order: "id.asc" },
    fetchImpl: fake.fetchImpl,
  });
  assert.equal(rows.length, 100_001);
  assert.equal(fake.calls.length, 101);
  assert.equal(fake.maximumActive(), 1);
});

for (const [total, requests] of [[999, 1], [1_000, 1], [1_001, 2]]) {
  test(`${total} script rows use exactly ${requests} request(s)`, async () => {
    const fake = fakeSupabase({ variants: total });
    const rows = await fetchRows("variants", {
      params: { order: "id.asc" },
      fetchImpl: fake.fetchImpl,
    });
    assert.equal(rows.length, total);
    assert.equal(fake.calls.length, requests);
    assert.equal(fake.maximumActive(), 1);
  });
}

test("a middle-page HTTP 522 retries within the fixed contract and then continues", async () => {
  const fake = fakeSupabase({ variants: 2_001 }, { transient522At: 1_000, transient522Count: 2 });
  const delays = [];
  const rows = await fetchRows("variants", {
    params: { order: "id.asc" },
    fetchImpl: fake.fetchImpl,
    sleepImpl: async (delay) => delays.push(delay),
  });
  assert.equal(rows.length, 2_001);
  assert.equal(fake.calls.length, 5);
  assert.equal(fake.maximumActive(), 1);
  assert.deepEqual(delays, [...SUPABASE_READ_RELIABILITY_CONTRACT.backoff_ms]);
});

test("an exhausted middle-page HTTP 522 fails with no later page request", async () => {
  const fake = fakeSupabase({ variants: 3_001 }, { transient522At: 1_000, transient522Count: 3 });
  await assert.rejects(fetchRows("variants", {
    params: { order: "id.asc" },
    fetchImpl: fake.fetchImpl,
    sleepImpl: async () => {},
  }), (error) => error.diagnostic.category === "http_522"
    && error.diagnostic.attempt_count === 3);
  assert.deepEqual(fake.calls.map((call) => call.offset), [0, 1_000, 1_000, 1_000]);
});

test("a middle-page permanent HTTP 403 fails immediately without response leakage", async () => {
  const fake = fakeSupabase({ variants: 2_001 }, { permanent403At: 1_000 });
  await assert.rejects(fetchRows("variants", {
    params: { order: "id.asc" },
    fetchImpl: fake.fetchImpl,
    sleepImpl: async () => assert.fail("permanent 4xx must not sleep"),
  }), (error) => {
    assert.equal(error.diagnostic.category, "http_4xx");
    assert.equal(error.diagnostic.status_code, 403);
    assert.equal(error.diagnostic.attempt_count, 1);
    assert.doesNotMatch(JSON.stringify(error), /service-role|authorization|example\.supabase/);
    return true;
  });
  assert.deepEqual(fake.calls.map((call) => call.offset), [0, 1_000]);
});

test("a short intermediate page fails closed without scheduling later pages", async () => {
  const fake = fakeSupabase({ variants: 3_000 }, { shortAt: 1_000, shortLength: 500 });
  await assert.rejects(fetchRows("variants", {
    params: { order: "id.asc" },
    fetchImpl: fake.fetchImpl,
  }), (error) => error.diagnostic.category === "invalid_response");
  assert.deepEqual(fake.calls.map((call) => call.offset), [0, 1_000]);
});

test("a duplicate ID across page boundaries fails closed instead of deduplicating silently", async () => {
  const fake = fakeSupabase({ variants: 2_000 }, { duplicateAt: 1_000 });
  await assert.rejects(fetchRows("variants", {
    params: { order: "id.asc" },
    fetchImpl: fake.fetchImpl,
  }), (error) => error.diagnostic.category === "invalid_response");
  assert.deepEqual(fake.calls.map((call) => call.offset), [0, 1_000]);
});

test("script page reads enforce the five-second maximum timeout and three attempts", async () => {
  let attempts = 0;
  const delays = [];
  await assert.rejects(fetchRows("variants", {
    params: { order: "id.asc" },
    timeoutMs: 2,
    fetchImpl: async (_url, options) => {
      attempts += 1;
      return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }));
    },
    sleepImpl: async (delay) => delays.push(delay),
  }), (error) => error.diagnostic.category === "timeout"
    && error.diagnostic.attempt_count === 3);
  assert.equal(SUPABASE_READ_RELIABILITY_CONTRACT.timeout_ms, 5_000);
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [250, 500]);
});

function assertComplete(rows, table, total) {
  assert.equal(rows.length, total);
  assert.equal(new Set(rows.map((row) => row.id)).size, total);
  assert.deepEqual(rows.map((row) => row.position), Array.from({ length: total }, (_, index) => index));
  assert.equal(rows[0].id, `${table}-000000`);
  assert.equal(rows.at(-1).id, `${table}-${String(total - 1).padStart(6, "0")}`);
}

function fakeSupabase(totals, behavior = {}) {
  const calls = [];
  const attemptsByPage = new Map();
  let active = 0;
  let maximum = 0;
  return {
    calls,
    maximumActive: () => maximum,
    async fetchImpl(rawUrl, options = {}) {
      const url = new URL(rawUrl);
      const table = url.pathname.split("/").at(-1);
      const total = totals[table] ?? 0;
      const offset = Number(url.searchParams.get("offset") || 0);
      const limit = Number(url.searchParams.get("limit") || 1_000);
      const pageKey = `${table}:${offset}`;
      const attempt = (attemptsByPage.get(pageKey) ?? 0) + 1;
      attemptsByPage.set(pageKey, attempt);
      calls.push({
        table,
        offset,
        limit,
        attempt,
        order: url.searchParams.get("order"),
        prefer: options.headers?.Prefer,
      });
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;

      if (offset === behavior.permanent403At) return response(403, { private: "service-role" });
      if (offset === behavior.transient522At && attempt <= behavior.transient522Count) return response(522);

      const normalLength = Math.max(0, Math.min(total - offset, limit));
      const length = offset === behavior.shortAt ? behavior.shortLength : normalLength;
      const rows = Array.from({ length }, (_, index) => {
        const position = offset + index;
        const row = table === "series"
          ? { id: `${table}-${String(position).padStart(6, "0")}`, slug: `series-${position}`, name: `Series ${position}`, position }
          : { id: `${table}-${String(position).padStart(6, "0")}`, slug: `variant-${position}`, series_id: "series-000000", name: `Variant ${position}`, position };
        if (offset === behavior.duplicateAt && index === 0) {
          row.id = `${table}-${String(offset - 1).padStart(6, "0")}`;
        }
        return row;
      });
      return response(200, rows, offset === 0 ? { "content-range": total ? `0-${Math.max(0, rows.length - 1)}/${total}` : "*/0" } : {});
    },
  };
}

function response(status, body = [], headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    async json() { return body; },
  };
}
