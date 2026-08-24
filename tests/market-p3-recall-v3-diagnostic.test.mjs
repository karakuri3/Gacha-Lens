import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildPriorityThreeSeedQueriesForVariant, buildPriorityThreeSeedRecallV3QueriesForVariant, normalizeRecallSeriesAlias, normalizeRecallVariantAlias, PRIORITY_THREE_SEED_RECALL_V3_QUERY_PROFILE } from "../lib/fetchers/market-seed-query-planner.js";
import { buildRecallV3Comparison, buildRecallV3VariantArm, normalizeDiagnosticProvider } from "../lib/domain/market-p3-recall-v3-diagnostic.js";

const root = process.cwd();
const workflow = fs.readFileSync(path.join(root, ".github/workflows/gacha-market-p3-recall-v3-diagnostic.yml"), "utf8");
const oldAuto = fs.readFileSync(path.join(root, ".github/workflows/gacha-market-p3-bounded-seed-v2-auto.yml"), "utf8");
const manual = fs.readFileSync(path.join(root, ".github/workflows/gacha-market-p3-bounded-seed-v2.yml"), "utf8");
const genericAuto = fs.readFileSync(path.join(root, ".github/workflows/gacha-market-bounded-auto.yml"), "utf8");
const diagnosticRunner = fs.readFileSync(path.join(root, "scripts/market-p3-recall-v3-diagnostic.mjs"), "utf8");
const series = { id: "series", name: "TVアニメ「黄泉のツガイ」 カプセルラバーマスコット" };
const variant = { id: "variant", name: "アサ", variant_type: "regular" };

test("V3 preserves the strict V2 root and limits each root to three attempts", () => {
  const v2 = buildPriorityThreeSeedQueriesForVariant(variant, series)[0]; const v3 = buildPriorityThreeSeedRecallV3QueriesForVariant(variant, series)[0];
  assert.equal(v3.query, v2.query); assert.equal(v3.root_query, v2.query); assert.equal(v3.query_profile, PRIORITY_THREE_SEED_RECALL_V3_QUERY_PROFILE);
  assert.ok(v3.fallback_queries.length <= 2); assert.ok([v3.query, ...v3.fallback_queries].every((query) => query.includes("アサ") && (query.includes("黄泉") || query === v3.query)));
});

test("V3 aliases remove only presentation text while preserving series and variant anchors", () => {
  assert.match(normalizeRecallSeriesAlias("アニメ「桜蘭高校ホスト部」 カプセルヘアクリップ"), /桜蘭高校ホスト部.*カプセルヘアクリップ/);
  assert.doesNotMatch(normalizeRecallSeriesAlias("TVアニメ「黄泉のツガイ」 カプセルラバーマスコット"), /^TVアニメ/);
  assert.doesNotMatch(normalizeRecallSeriesAlias("【フラットガシャポン】クリアポーチコレクション 仮面ライダー"), /^フラットガシャポン/);
  assert.doesNotMatch(normalizeRecallSeriesAlias("MLB&trade; Capsuleトルソー Players Edition"), /&trade;/i);
  assert.match(normalizeRecallVariantAlias("NPB ~パシフィック・リーグ~"), /NPB.*パシフィック.*リーグ/);
});

test("recall diagnostic is dispatch-only, read-only, and leaves all production workflows isolated", () => {
  assert.match(workflow, /^on:\s*\r?\n\s+workflow_dispatch:/m); assert.doesNotMatch(workflow, /schedule:|upsertRows|deleteRowsByIds|market-p3-bounded-seed-v2-auto\.mjs/);
  assert.match(workflow, /manual-market-audit-guard\.mjs scan/); assert.match(workflow, /steps\.scan\.outcome == 'success'/);
  assert.match(oldAuto, /17 \*\/3 \* \* \*/); assert.match(manual, /APPROVE_P3_BOUNDED_SEED_V2/); assert.match(genericAuto, /AUTOMATIC_MARKET_BOUNDED_AUTO_ENABLED/);
});

test("recall diagnostic builds each arm from sanitized request and retrieval metrics", () => {
  assert.match(diagnosticRunner, /summarizeFetchedMarketCandidates/);
  assert.match(diagnosticRunner, /buildSanitizedMarketRequestDiagnostics/);
  assert.match(diagnosticRunner, /no_result_variants: Math\.max\(0, targets\.length - candidateSummary\.variants_with_results\)/);
  assert.match(diagnosticRunner, /raw_results_returned: request_diagnostics\.aggregate\.results_returned/);
  assert.match(diagnosticRunner, /normalized_records: request_diagnostics\.aggregate\.normalized_records/);
  assert.match(diagnosticRunner, /rejection_reason_counts: audit\.retrieval_effectiveness\.rejection_reason_counts/);
  assert.match(diagnosticRunner, /accepted_unique_variant_count/);
  assert.match(diagnosticRunner, /active_accepted_unique_variant_count/);
});

test("per-variant comparison delegates to the tested deterministic helper", () => {
  assert.match(diagnosticRunner, /buildRecallV3VariantArm\(query, safety\.records, audit\.candidates, request_diagnostics\)/);
  assert.match(diagnosticRunner, /buildRecallV3Comparison\(targets, series, results\)/);
});

test("Markdown renders actual diagnostic arm metrics, per-variant rows, and zero-delta evidence", () => {
  assert.match(diagnosticRunner, /function renderDiagnosticMarkdown\(value\)/);
  assert.match(diagnosticRunner, /## Arm: \$\{arm\.name\}/);
  assert.match(diagnosticRunner, /Raw results \/ normalized records/);
  assert.match(diagnosticRunner, /Requests attempted \/ retried \/ rate-limited \/ timed out/);
  assert.match(diagnosticRunner, /## Arm deltas/);
  assert.match(diagnosticRunner, /## Per-variant comparison/);
  assert.match(diagnosticRunner, /Production counts/);
  assert.doesNotMatch(diagnosticRunner, /renderMarketCandidateAuditMarkdown/);
});

test("normalized record providers count Rakuten and Yahoo per variant", () => {
  const query = { variant_id: "v1", series_id: "s1", query: "series variant", fallback_queries: [] };
  const records = [
    { source: "rakuten", raw: { provider: "rakuten_ichiba", query: { variant_id: "v1", query: "series variant" } } },
    { source: "yahoo", raw: { provider: "yahoo_shopping", query: { variant_id: "v1", query: "series variant" } } },
  ];
  const diagnostics = { queries: [{ provider: "rakuten_ichiba", query: "series variant" }, { provider: "yahoo_shopping", query: "series variant" }] };
  const arm = buildRecallV3VariantArm(query, records, [], diagnostics);
  assert.equal(normalizeDiagnosticProvider(records[0]), "rakuten_ichiba");
  assert.equal(arm.rakuten_result_count, 1); assert.equal(arm.yahoo_result_count, 1);
});

test("baseline provider coverage and result deltas are computed per variant", () => {
  const targets = Array.from({ length: 10 }, (_, index) => ({ id: `v${index}`, name: `variant${index}` }));
  const seriesEntries = targets.map((_, index) => ({ name: `series${index}` }));
  const queries = targets.map((target, index) => ({ variant_id: target.id, series_id: `s${index}`, query: `q${index}`, fallback_queries: [] }));
  const baselineDiagnostics = { queries: queries.flatMap((query, index) => [
    ...(index < 8 ? [{ provider: "rakuten_ichiba", query: query.query }] : []),
    { provider: "yahoo_shopping", query: query.query },
  ]) };
  const baseline = queries.map((query, index) => buildRecallV3VariantArm(query, index === 0 ? [{ source: "rakuten", raw: { query: { variant_id: query.variant_id, query: query.query } } }] : [], [], baselineDiagnostics));
  assert.equal(baseline.filter((entry) => entry.providers_queried.includes("rakuten_ichiba")).length, 8);
  assert.equal(baseline.filter((entry) => entry.providers_queried.includes("yahoo_shopping")).length, 10);
  const noResult = (entry) => ({ ...entry, rakuten_result_count: 0, yahoo_result_count: 0 });
  const full = baseline.map((entry, index) => index === 1 ? { ...noResult(entry), yahoo_result_count: 1 } : noResult(entry));
  const v3 = baseline.map((entry, index) => index === 2 ? { ...noResult(entry), rakuten_result_count: 1 } : noResult(entry));
  const comparison = buildRecallV3Comparison(targets, seriesEntries, { v2_baseline: { per_variant: baseline }, v2_full_provider_coverage: { per_variant: full }, recall_v3: { per_variant: v3 } });
  assert.equal(comparison[0].baseline_has_result, true);
  assert.equal(comparison[1].full_provider_added_result, true);
  assert.equal(comparison[2].recall_v3_added_result, true);
});
