import assert from "node:assert/strict";
import test from "node:test";

import { selectMarketCollectionTargets } from "../lib/domain/market-coverage.js";
import {
  buildPriorityThreeSeedQueriesForVariant,
  planPriorityThreeSeedSearchQueries,
  PRIORITY_THREE_SEED_QUERY_PROFILE,
} from "../lib/fetchers/market-seed-query-planner.js";
import {
  fetchRakutenMarketListingsRaw,
  normalizeRakutenKeywordForApi,
} from "../lib/fetchers/rakuten-market-fetcher.js";
import { fetchYahooShoppingListingsRaw } from "../lib/fetchers/yahoo-shopping-fetcher.js";
import { expandMarketQueryAttempts } from "../lib/fetchers/market-query-planner.js";

const series = {
  id: "haikyu-animal",
  name: "ハイキュー!! めじるしアクセサリー アニマルver.1",
  franchise: "ハイキュー!!",
};
const variant = {
  id: "hinata",
  name: "日向 翔陽",
  series_id: series.id,
  variant_type: "normal",
  release_date: "2026-07-01",
};

function priorityThreeRow(index) {
  return {
    variantId: `variant-${index}`,
    variantName: `Variant ${index}`,
    seriesId: `series-${index}`,
    seriesName: `Series ${index}`,
    coverageState: "no_evidence",
    priority: 3,
    priorityReason: "recent_release_without_evidence",
    released: true,
    lastCollectionAttemptAt: null,
  };
}

function catalog(rows) {
  const seriesRows = rows.map((row) => ({ id: row.seriesId, name: row.seriesName }));
  const variants = rows.map((row) => ({
    id: row.variantId,
    name: row.variantName,
    series_id: row.seriesId,
    variant_type: "normal",
    release_date: "2026-07-01",
  }));
  return {
    series: seriesRows,
    variants,
    seriesById: new Map(seriesRows.map((entry) => [entry.id, entry])),
    variantById: new Map(variants.map((entry) => [entry.id, entry])),
  };
}

function response(body) {
  return { ok: true, status: 200, headers: new Headers(), json: async () => body };
}

test("Priority 3 seed queries retain the full parent series and target variant in every attempt", () => {
  const [root] = buildPriorityThreeSeedQueriesForVariant(variant, series);
  const attempts = expandMarketQueryAttempts([root]);
  assert.equal(root.query_profile, PRIORITY_THREE_SEED_QUERY_PROFILE);
  assert.equal(root.query, "ハイキュー!! めじるしアクセサリー アニマルver.1 日向 翔陽 ガチャ");
  assert.equal(root.fallback_queries.includes("ハイキュー!! 日向 翔陽 ガチャ"), false);
  assert.equal(root.fallback_queries.includes("日向 翔陽 ガチャ"), false);
  assert.ok(attempts.length >= 2 && attempts.length <= 3);
  for (const attempt of attempts) {
    assert.match(attempt.query, /めじるしアクセサリー/);
    assert.match(attempt.query, /日向 翔陽/);
  }
});

test("Priority 3 seed planner fixes released priority three selection without changing the general planner", () => {
  const rows = [priorityThreeRow(1), priorityThreeRow(2), {
    ...priorityThreeRow(3), priority: 1,
  }, {
    ...priorityThreeRow(4), released: false,
  }];
  const plan = planPriorityThreeSeedSearchQueries(catalog(rows), rows, {
    priority: 1,
    release: "all",
    limit: 5,
    cooldownHours: 0,
    rotationKey: "seed-run-1",
  });
  assert.equal(plan.summary.priority, 3);
  assert.equal(plan.summary.release, "released");
  assert.equal(plan.summary.query_profile, PRIORITY_THREE_SEED_QUERY_PROFILE);
  assert.deepEqual(plan.selected.map((entry) => entry.variantId).sort(), ["variant-1", "variant-2"]);
});

test("explicit seed rotation keys are deterministic while default selection remains day-based", () => {
  const rows = Array.from({ length: 24 }, (_, index) => priorityThreeRow(index));
  const options = { now: new Date("2026-08-24T00:00:00Z"), priority: 3, release: "released", limit: 5, cooldownHours: 0 };
  const defaultFirst = selectMarketCollectionTargets(rows, options).selected.map((entry) => entry.variantId);
  const defaultAgain = selectMarketCollectionTargets(rows, options).selected.map((entry) => entry.variantId);
  const first = selectMarketCollectionTargets(rows, { ...options, rotationKey: "priority-3-seed:100" }).selected.map((entry) => entry.variantId);
  const same = selectMarketCollectionTargets(rows, { ...options, rotationKey: "priority-3-seed:100" }).selected.map((entry) => entry.variantId);
  const second = selectMarketCollectionTargets(rows, { ...options, rotationKey: "priority-3-seed:101" }).selected.map((entry) => entry.variantId);
  assert.deepEqual(defaultAgain, defaultFirst);
  assert.deepEqual(same, first);
  assert.notDeepEqual(second, first);
});

test("Rakuten joins standalone ASCII tokens without dropping query evidence", async () => {
  assert.equal(normalizeRakutenKeywordForApi("集合 San X ジャンボカードダス"), "集合 SanX ジャンボカードダス");
  assert.equal(normalizeRakutenKeywordForApi("パワーパフ ブロッサム B ガチャ"), "パワーパフ ブロッサムB ガチャ");

  const keywords = [];
  let requestCount = 0;
  const result = await fetchRakutenMarketListingsRaw({
    enabled: true,
    applicationId: "application-id",
    accessKey: "access-key",
    affiliateId: "affiliate-id",
    delayMs: 0,
    queries: [{ query: "集合 San X ジャンボカードダス", variant_id: "v1", series_id: "s1" }],
    fetchImpl: async (url) => {
      keywords.push(new URL(url).searchParams.get("keyword"));
      requestCount += 1;
      return response({ items: [{
        itemCode: "seed-item",
        itemName: "集合 San X ジャンボカードダス",
        itemPrice: 500,
        availability: "1",
        itemUrl: requestCount === 1 ? "https://example.com/item" : "https://affiliate.example/item",
        affiliateUrl: requestCount === 1 ? "" : "https://affiliate.example/item",
      }] });
    },
  });
  assert.deepEqual(keywords, ["集合 SanX ジャンボカードダス", "集合 SanX ジャンボカードダス"]);
  assert.equal(result.feedResults[0].query, "集合 SanX ジャンボカードダス");
  assert.equal(result.records[0].raw.keyword, "集合 SanX ジャンボカードダス");
  assert.equal(result.records[0].raw.executed_query, "集合 SanX ジャンボカードダス");
  assert.equal(result.records[0].raw.query.query, "集合 San X ジャンボカードダス");
});

test("Yahoo receives the original query while Rakuten keyword normalization is provider-local", async () => {
  const queries = [];
  await fetchYahooShoppingListingsRaw({
    enabled: true,
    appId: "app-id",
    delayMs: 0,
    queries: [{ query: "パワーパフ ブロッサム B ガチャ", variant_id: "v1", series_id: "s1" }],
    fetchImpl: async (url) => {
      queries.push(new URL(url).searchParams.get("query"));
      return response({ hits: [] });
    },
  });
  assert.deepEqual(queries, ["パワーパフ ブロッサム B ガチャ"]);
});
