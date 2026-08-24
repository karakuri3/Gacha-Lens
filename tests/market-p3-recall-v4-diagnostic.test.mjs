import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  buildPriorityThreeSeedQueriesForVariant,
  buildPriorityThreeSeedRecallV3QueriesForVariant,
  buildPriorityThreeSeedRecallV4QueriesForVariant,
  normalizeRecallV4SeriesAlias,
} from "../lib/fetchers/market-seed-query-planner.js";
import { buildRecallV4Comparison, buildRecallV4Decision } from "../lib/domain/market-p3-recall-v4-diagnostic.js";

const root = process.cwd();
const workflow = fs.readFileSync(path.join(root, ".github/workflows/gacha-market-p3-recall-v4-diagnostic.yml"), "utf8");
const auto = fs.readFileSync(path.join(root, ".github/workflows/gacha-market-p3-bounded-seed-v2-auto.yml"), "utf8");
const variant = { id: "v", name: "ミルキィローズ", variant_type: "regular" };

test("V4 retains V2 exact root and uses at most three parent-anchored attempts", () => {
  const series = { id: "s", name: "プリキュアオールスターズ カプセルラバーマスコット Name Collection!２" };
  const v2 = buildPriorityThreeSeedQueriesForVariant(variant, series)[0];
  const v3 = buildPriorityThreeSeedRecallV3QueriesForVariant(variant, series)[0];
  const v4 = buildPriorityThreeSeedRecallV4QueriesForVariant(variant, series)[0];
  assert.equal(v4.query, v2.query); assert.equal(v4.root_query, v2.query);
  assert.ok(v4.fallback_queries.length <= 2);
  assert.ok([v4.query, ...v4.fallback_queries].every((query) => query.includes("ミルキィローズ") && query.replace("ミルキィローズ", "").trim()));
  assert.equal(v3.query, v2.query);
});

test("V4 compacts only listed presentation noise while retaining product-family anchors", () => {
  assert.equal(normalizeRecallV4SeriesAlias("プリキュアオールスターズ カプセルラバーマスコット Name Collection!２"), "プリキュア カプセルラバーマスコット");
  assert.equal(normalizeRecallV4SeriesAlias("クレヨンしんちゃん フェイスぬいぐるみ2"), "クレヨンしんちゃん フェイスぬいぐるみ");
  assert.equal(normalizeRecallV4SeriesAlias("JAPAN ミニチュアパッケージチャーム"), "ミニチュアパッケージチャーム");
  assert.match(normalizeRecallV4SeriesAlias("ポンデクルール アイカツ！ マルチカラーパウダーVol.2"), /アイカツ.*マルチカラーパウダー/);
  assert.match(normalizeRecallV4SeriesAlias("TVアニメ「黄泉のツガイ」 カプセルラバーマスコット"), /黄泉のツガイ.*カプセルラバーマスコット/);
});

test("V4 comparison separates retrieval wins, acceptance wins, and rejected retrieval", () => {
  const targets = [{ id: "v", name: "variant" }]; const series = [{ name: "series" }];
  const empty = { rakuten_result_count: 0, yahoo_result_count: 0, accepted: false, candidate_count: 0, providers_queried: [], rejected_records: [] };
  const rejectedV4 = { ...empty, yahoo_result_count: 1, rejected_records: [{ reason: "not_single_item", title: "safe", executed_query: "series variant" }] };
  const comparison = buildRecallV4Comparison(targets, series, { v2: { per_variant: [empty] }, v3: { per_variant: [empty] }, v4: { per_variant: [rejectedV4] } });
  assert.equal(comparison[0].v4_added_result, true); assert.equal(comparison[0].v4_newly_accepted, false);
  const acceptedV4 = { ...empty, rakuten_result_count: 1, accepted: true };
  const acceptedComparison = buildRecallV4Comparison(targets, series, { v2: { per_variant: [empty] }, v3: { per_variant: [empty] }, v4: { per_variant: [acceptedV4] } });
  assert.equal(acceptedComparison[0].v4_newly_accepted, true);
});

test("V4 invalidates provider-contaminated comparisons and preserves zero-write decision semantics", () => {
  const metrics = { variants_with_results: 0, accepted_unique_variant_count: 0 };
  const clean = { metrics, request_diagnostics: { aggregate: { requests_rate_limited: 0, requests_timed_out: 0, requests_permanently_failed: 0 } } };
  const contaminated = { ...clean, request_diagnostics: { aggregate: { requests_rate_limited: 1, requests_timed_out: 0, requests_permanently_failed: 0 } } };
  assert.equal(buildRecallV4Decision({ v2: clean, v3: clean, v4: clean }, [], true).provider_errors, false);
  assert.equal(buildRecallV4Decision({ v2: clean, v3: clean, v4: contaminated }, [], true).provider_errors, true);
});

test("V4 workflow is dispatch-only, read-only, and leaves Production Auto unchanged", () => {
  assert.match(workflow, /^on:\s*\r?\n\s+workflow_dispatch:/m); assert.doesNotMatch(workflow, /schedule:|upsertRows|deleteRowsByIds|bounded-seed-v2-auto\.mjs/);
  assert.match(workflow, /YAHOO_SHOPPING_REQUEST_DELAY_MS: "5000"/); assert.match(workflow, /manual-market-audit-guard\.mjs scan/);
  assert.match(auto, /17 \*\/3 \* \* \*/);
});
