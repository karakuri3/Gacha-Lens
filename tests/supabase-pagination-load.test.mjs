import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  SUPABASE_FULL_TABLE_MAX_CONCURRENCY,
  fetchAllRowsSequential,
} from "../lib/data/supabase-pagination.js";

test("the repository full loader delegates to ordered sequential pagination", () => {
  const source = fs.readFileSync("lib/data/supabase-gacha-repository.js", "utf8");
  const body = source.slice(source.indexOf("async function fetchAllRows("));
  assert.match(body, /fetchAllRowsSequential/);
  assert.match(body, /\.order\("id", \{ ascending: true \}\)/);
  assert.doesNotMatch(body, /Promise\.all|pageRequests/);
});

test("23,677 rows are returned in deterministic order with one in-flight page", async () => {
  const fake = fakePages(23_677);
  const result = await fetchAllRowsSequential(fake.fetchPage);
  assert.equal(result.error, null);
  assert.equal(result.data.length, 23_677);
  assert.equal(new Set(result.data.map((row) => row.id)).size, 23_677);
  assert.deepEqual(result.data.map((row) => row.position), Array.from({ length: 23_677 }, (_, index) => index));
  assert.equal(result.request_count, 24);
  assert.equal(fake.maximumActive(), 1);
  assert.equal(result.max_concurrency, SUPABASE_FULL_TABLE_MAX_CONCURRENCY);
  assert.equal(fake.calls[0].exactCount, true);
  assert.equal(fake.calls.slice(1).every((call) => call.exactCount === false), true);
});

test("100,001 rows keep constant page concurrency", async () => {
  const fake = fakePages(100_001);
  const result = await fetchAllRowsSequential(fake.fetchPage);
  assert.equal(result.error, null);
  assert.equal(result.data.length, 100_001);
  assert.equal(result.request_count, 101);
  assert.equal(fake.maximumActive(), 1);
});

test("a middle-page failure returns no partial success and stops later work", async () => {
  const failure = new Error("page unavailable");
  const fake = fakePages(10_000, { failAt: 3_000, failure });
  const result = await fetchAllRowsSequential(fake.fetchPage);
  assert.equal(result.error, failure);
  assert.deepEqual(result.data, []);
  assert.deepEqual(fake.calls.map((call) => call.from), [0, 1_000, 2_000, 3_000]);
  assert.equal(fake.maximumActive(), 1);
});

for (const [total, expectedRequests] of [[999, 1], [1_000, 1], [1_001, 2]]) {
  test(`${total} rows use exactly ${expectedRequests} page request(s)`, async () => {
    const fake = fakePages(total);
    const result = await fetchAllRowsSequential(fake.fetchPage);
    assert.equal(result.error, null);
    assert.equal(result.data.length, total);
    assert.equal(result.request_count, expectedRequests);
    assert.equal(fake.maximumActive(), 1);
  });
}

function fakePages(total, options = {}) {
  const calls = [];
  let active = 0;
  let maximum = 0;
  return {
    calls,
    maximumActive: () => maximum,
    async fetchPage(request) {
      calls.push({ ...request });
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      if (request.from === options.failAt) return { data: [], error: options.failure };
      const length = Math.max(0, Math.min(total - request.from, request.to - request.from + 1));
      return {
        data: Array.from({ length }, (_, index) => {
          const position = request.from + index;
          return { id: `row-${String(position).padStart(6, "0")}`, position };
        }),
        count: request.exactCount ? total : null,
        error: null,
      };
    },
  };
}
