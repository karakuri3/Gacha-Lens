import assert from "node:assert/strict";
import test from "node:test";
import { runMarketRetrievalBenchmark } from "../lib/domain/market-retrieval-benchmark.js";
import { buildApprovedCanaryQueryPlan } from "../lib/domain/market-approved-query-replay.js";
import {
  buildSanitizedMarketCandidateAudit,
  validateMarketCandidateAudit,
} from "../lib/domain/market-candidate-audit.js";
import { applyMarketCandidateSafety, summarizeFetchedMarketCandidates } from "../lib/domain/market-match-safety.js";
import { buildSanitizedMarketRequestDiagnostics } from "../lib/domain/market-request-diagnostics.js";
import {
  MAX_MARKET_QUERY_ATTEMPTS_PER_VARIANT,
  buildMarketSearchQueriesForVariant,
  expandMarketQueryAttempts,
} from "../lib/fetchers/market-query-planner.js";
import { fetchRakutenMarketListingsRaw } from "../lib/fetchers/rakuten-market-fetcher.js";
import { fetchYahooShoppingListingsRaw } from "../lib/fetchers/yahoo-shopping-fetcher.js";

const series = {
  id: "series-starry-animals",
  slug: "starry-animals",
  name: "星空どうぶつマスコット コレクション",
  franchise: "星空どうぶつ",
  release_date: "2026-07-01",
};
const whiteCat = variant("variant-white-cat", "しろねこ 空色");
const blackCat = variant("variant-black-cat", "くろねこ");
const longName = variant("variant-long-name", "夜空を見上げるちいさな白猫 特別カラー");
const variants = [whiteCat, blackCat, longName];
const catalog = {
  series: [series],
  variants,
  seriesById: new Map([[series.id, series]]),
  variantById: new Map(variants.map((entry) => [entry.id, entry])),
};
const query = buildMarketSearchQueriesForVariant(whiteCat, series)[0];
const blackCatQuery = buildMarketSearchQueriesForVariant(blackCat, series)[0];
const longNameQuery = buildMarketSearchQueriesForVariant(longName, series)[0];

test("bounded query strategy emits deterministic primary and fallback searches", () => {
  const first = buildMarketSearchQueriesForVariant(whiteCat, series);
  const second = buildMarketSearchQueriesForVariant(whiteCat, series);
  assert.deepEqual(first, second);
  assert.equal(first.length, 1);
  assert.ok(first[0].fallback_queries.length >= 1);
  assert.ok(expandMarketQueryAttempts(first).length <= MAX_MARKET_QUERY_ATTEMPTS_PER_VARIANT);
  assert.doesNotMatch(expandMarketQueryAttempts(first).map((entry) => entry.query).join("\n"), /単品/);
  assert.match(first[0].fallback_queries.join("\n"), /しろねこ 空色|しろねこ（空色）/);
});

test("query strategy is independent of affiliate configuration", () => {
  const baseline = buildMarketSearchQueriesForVariant(whiteCat, series);
  process.env.RAKUTEN_AFFILIATE_ID = "not-used-by-planner";
  process.env.YAHOO_AFFILIATE_TRACKING_ID = "not-used-by-planner";
  assert.deepEqual(buildMarketSearchQueriesForVariant(whiteCat, series), baseline);
  delete process.env.RAKUTEN_AFFILIATE_ID;
  delete process.env.YAHOO_AFFILIATE_TRACKING_ID;
});

test("real-shaped benchmark exposes accepted, duplicate, set, preorder and ambiguity outcomes", () => {
  const records = [
    record("accepted-full", "ガシャポン 星空どうぶつマスコット コレクション しろねこ 空色 単品"),
    record("accepted-short", "星空どうぶつ しろねこ・空色 ガチャ"),
    record("accepted-brackets", "【ガチャ】星空どうぶつマスコット コレクション［しろねこ 空色］"),
    record("character-only", "しろねこ 空色 ガチャ"),
    record("full-set", "星空どうぶつマスコット コレクション しろねこ 空色 全3種 フルコンプ"),
    record("partial-set", "星空どうぶつマスコット コレクション しろねこ 空色 くろねこ 2種セット"),
    record("preorder", "予約 星空どうぶつマスコット コレクション しろねこ 空色 ガチャ"),
    record("unrelated", "星空どうぶつマスコット コレクション しろねこ 空色 アクリルスタンド"),
    record("ambiguous", "ガチャ 星空どうぶつマスコット コレクション しろねこ 空色 くろねこ"),
    record("invalid-price", "ガチャ 星空どうぶつ しろねこ 空色", { price: 0 }),
    record("identity-missing", "ガチャ 星空どうぶつ しろねこ 空色", { id: "", source_url: "" }),
    record("accepted-full", "ガチャ 星空どうぶつ しろねこ 空色 重複"),
    record("accepted-black-cat", `\u30ac\u30c1\u30e3 ${series.name} ${blackCat.name}`, {
      raw: { provider: "rakuten_ichiba", query: blackCatQuery },
    }),
    record("accepted-long-name", `\u30ac\u30c1\u30e3 ${series.name} ${longName.name}`, {
      raw: { provider: "rakuten_ichiba", query: longNameQuery },
    }),
  ];
  const benchmark = runMarketRetrievalBenchmark({
    records,
    queryPlan: [query, blackCatQuery, longNameQuery],
    catalog,
    apiZeroResultQueries: 1,
  });
  assert.equal(benchmark.variant_count, 3);
  assert.equal(benchmark.query_count, 9);
  assert.equal(benchmark.marketplace_fixture_count, 14);
  assert.equal(benchmark.rejection_reason_counts.accepted, 5);
  assert.equal(benchmark.rejection_reason_counts.listing_type_rejected, 2);
  assert.equal(benchmark.rejection_reason_counts.review_required, 1);
  assert.ok(benchmark.rejection_reason_counts.title_mismatch >= 2);
  assert.equal(benchmark.rejection_reason_counts.variant_match_failed, 1);
  assert.equal(benchmark.rejection_reason_counts.normalization_rejected, 1);
  assert.equal(benchmark.rejection_reason_counts.identity_missing, 1);
  assert.equal(benchmark.rejection_reason_counts.duplicate, 1);
  assert.equal(benchmark.rejection_reason_counts.api_zero_results, 1);
  assert.equal(benchmark.results.find((entry) => entry.fixture_id === "preorder").reason, "preorder_listing");
});

test("long official names retain bounded safe attempts", () => {
  const planned = buildMarketSearchQueriesForVariant(longName, series, { maxQueryLength: 80 })[0];
  assert.ok(planned.query.length <= 80);
  assert.ok(expandMarketQueryAttempts([planned]).every((entry) => entry.query.length <= 80));
});

test("Rakuten fallback discovery records provider result effectiveness without changing root identity", async () => {
  const attempts = expandMarketQueryAttempts([query]);
  const result = await fetchRakutenMarketListingsRaw({
    enabled: true,
    applicationId: "test-app",
    accessKey: "test-key",
    queries: [query],
    delayMs: 0,
    fetchImpl: async (url) => marketResponse(new URL(url).searchParams.get("keyword") === attempts[1].query ? {
      items: [{ itemName: "ガチャ 星空どうぶつマスコット コレクション しろねこ 空色", itemPrice: 880, itemUrl: "https://item.rakuten.co.jp/test/white-cat/", itemCode: "test:white-cat", availability: 1 }],
    } : { items: [] }),
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].raw.query.query, query.query);
  assert.equal(result.records[0].raw.executed_query, attempts[1].query);
  assert.equal(result.feedResults.filter((entry) => entry.request_kind === "discovery").length, attempts.length);
  assert.equal(result.feedResults.reduce((sum, entry) => sum + (entry.results_returned ?? 0), 0), 1);
});

test("Yahoo fallback discovery preserves 1000ms pacing and exposes zero-result queries", async () => {
  let now = 0;
  const starts = [];
  const attempts = expandMarketQueryAttempts([query]);
  const result = await fetchYahooShoppingListingsRaw({
    enabled: true,
    appId: "test-app",
    queries: [query],
    delayMs: 1000,
    clock: () => now,
    sleep: async (ms) => { now += ms; },
    fetchImpl: async (url) => {
      starts.push(now);
      const actual = new URL(url).searchParams.get("query");
      return marketResponse(actual === attempts.at(-1).query ? {
        hits: [{ name: "ガチャ 星空どうぶつマスコット コレクション しろねこ 空色", price: 900, url: "https://store.shopping.yahoo.co.jp/test/white-cat.html", code: "test-white-cat", inStock: true }],
      } : { hits: [] });
    },
  });
  assert.equal(result.records.length, 1);
  assert.ok(starts.slice(1).every((value, index) => value - starts[index] >= 1000));
  const diagnostics = buildSanitizedMarketRequestDiagnostics(result.feedResults);
  assert.equal(diagnostics.providers.yahoo_shopping.queries_executed, attempts.length);
  assert.equal(diagnostics.providers.yahoo_shopping.results_returned, 1);
  assert.equal(diagnostics.providers.yahoo_shopping.zero_result_queries, attempts.length - 1);
});

test("candidate audit reports provider results and downstream safe rejection reasons", () => {
  const fetchedRecords = [
    record("audit-accepted", "ガチャ 星空どうぶつマスコット コレクション しろねこ 空色"),
    record("audit-set", "ガチャ 星空どうぶつマスコット コレクション しろねこ 空色 全3種セット"),
  ];
  const safety = applyMarketCandidateSafety({ records: fetchedRecords, queryPlan: [query], catalog });
  const feedResults = [requestDiagnostic("rakuten_ichiba", 2, 2, 0), requestDiagnostic("yahoo_shopping", 4, 2, 2)];
  const summary = summarizeFetchedMarketCandidates({ records: safety.records, rawCount: 2, queryPlan: [query], feedResults, catalog, safetyResult: safety });
  summary.request_diagnostics = buildSanitizedMarketRequestDiagnostics(feedResults);
  summary.listing_upserts = 0;
  summary.observations_created = 0;
  summary.ingestion_runs_written = 0;
  const report = buildSanitizedMarketCandidateAudit({ records: safety.records, queryPlan: [query], catalog, summary });
  assert.equal(report.retrieval_effectiveness.results_returned_by_provider.rakuten.results_returned, 2);
  assert.equal(report.retrieval_effectiveness.results_returned_by_provider.yahoo.results_returned, 4);
  assert.equal(report.retrieval_effectiveness.accepted_candidate_count, 1);
  assert.equal(report.retrieval_effectiveness.review_required_count, 1);
  assert.equal(report.retrieval_effectiveness.rejection_reason_counts.not_single_item, 1);
  assert.equal(JSON.stringify(report).match(/test-app|test-key|seller|cookie|authorization/gi), null);
  const inconsistent = structuredClone(report);
  inconsistent.retrieval_effectiveness.accepted_candidate_count = 0;
  inconsistent.retrieval_effectiveness.accepted_candidate_keys = [];
  assert.throws(() => validateMarketCandidateAudit(inconsistent), /does not match the candidate audit/);
});

test("fallback execution preserves candidate keys and approved query replay", () => {
  const primaryRecord = record("stable-identity", "ガチャ 星空どうぶつマスコット コレクション しろねこ 空色");
  const fallbackRecord = structuredClone(primaryRecord);
  fallbackRecord.raw.executed_query = query.fallback_queries[0];
  const primarySafety = applyMarketCandidateSafety({ records: [primaryRecord], queryPlan: [query], catalog });
  const fallbackSafety = applyMarketCandidateSafety({ records: [fallbackRecord], queryPlan: [query], catalog });
  const baseSummary = { safety_assessed_records: 1, listing_upserts: 0, observations_created: 0, ingestion_runs_written: 0 };
  const primaryAudit = buildSanitizedMarketCandidateAudit({ records: primarySafety.records, queryPlan: [query], catalog, summary: baseSummary });
  const fallbackAudit = buildSanitizedMarketCandidateAudit({ records: fallbackSafety.records, queryPlan: [query], catalog, summary: baseSummary });
  assert.equal(primaryAudit.candidates[0].candidate_key, fallbackAudit.candidates[0].candidate_key);
  assert.equal(primaryAudit.candidates[0].source.listing_id, fallbackAudit.candidates[0].source.listing_id);
  const replay = buildApprovedCanaryQueryPlan(primaryAudit, catalog, [primaryAudit.candidates[0].candidate_key]);
  assert.deepEqual(replay.queries[0].fallback_queries, query.fallback_queries);
  assert.equal(replay.queries[0].query, query.query);
});

function variant(id, name) {
  return { id, slug: id, name, series_id: series.id, variant_type: "single", released: true, release_date: "2026-07-01" };
}

function record(id, title, overrides = {}) {
  return {
    fixture_id: id,
    id,
    title,
    price: 800,
    status: "active",
    source: "rakuten",
    source_url: `https://item.rakuten.co.jp/test/${id}/`,
    raw: { provider: "rakuten_ichiba", query },
    ...overrides,
  };
}

function marketResponse(body) {
  return { ok: true, status: 200, headers: new Headers(), json: async () => body };
}

function requestDiagnostic(source, resultsReturned, normalizedRecords, recordsRejected) {
  return {
    source,
    query: query.query,
    query_index: source === "rakuten_ichiba" ? 0 : 1,
    request_kind: "discovery",
    ok: true,
    status: 200,
    attempt_count: 1,
    retry_count: 0,
    retried: false,
    recovered_after_retry: false,
    failure_category: null,
    final_status: 200,
    timed_out: false,
    rate_limited: false,
    duration_ms: 10,
    retry_delays_ms: [],
    attempts: [{ attempt: 1, status: 200, failure_category: null, timed_out: false, rate_limited: false, duration_ms: 10, retry_delay_ms: null }],
    results_returned: resultsReturned,
    normalized_records: normalizedRecords,
    records_rejected: recordsRejected,
    rejection_reason_counts: recordsRejected ? { title_mismatch: recordsRejected } : {},
  };
}
