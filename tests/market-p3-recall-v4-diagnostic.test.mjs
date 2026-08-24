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
import { buildRecallV4Comparison, buildRecallV4Decision, buildRecallV4VariantArm, runRecallV4ArmsSequentially } from "../lib/domain/market-p3-recall-v4-diagnostic.js";

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

test("V4 comparison separates listing-level retrieval wins, acceptance wins, and rejected retrieval", () => {
  const targets = [{ id: "v", name: "variant" }]; const series = [{ name: "series" }];
  const empty = { rakuten_result_count: 0, yahoo_result_count: 0, accepted: false, candidate_count: 0, providers_queried: [], candidate_evidence: [] };
  const rejectedV4 = { ...empty, yahoo_result_count: 1, candidate_evidence: [{ candidate_key: "v4", provider: "yahoo_shopping", accepted: false, safety_reason: "not_single_item", title: "safe", status: "active", listing_type: "set", confidence: 0.4, executed_query: "series variant", target_variant_id: "v" }] };
  const comparison = buildRecallV4Comparison(targets, series, { v2: { per_variant: [empty] }, v3: { per_variant: [empty] }, v4: { per_variant: [rejectedV4] } });
  assert.equal(comparison[0].v4_added_result, true); assert.equal(comparison[0].v4_newly_accepted, false);
  assert.equal(comparison[0].v4_only_rejected_records.length, 1);
  const acceptedV4 = { ...empty, rakuten_result_count: 1, accepted: true };
  const acceptedComparison = buildRecallV4Comparison(targets, series, { v2: { per_variant: [empty] }, v3: { per_variant: [empty] }, v4: { per_variant: [acceptedV4] } });
  assert.equal(acceptedComparison[0].v4_newly_accepted, true);
});

test("V4-only evidence is a stable candidate difference with correct fields and provider attribution", () => {
  const query = { variant_id: "v", series_id: "s", query: "series variant", fallback_queries: [] };
  const candidate = { candidate_key: "only-v4", source: { provider: "rakuten_ichiba", listing_id: "item-1" }, listing: { title: "candidate title", status: "active", listing_type: "single" }, target: { variant_id: "v" }, assessment: { accepted: true, reason: "variant_and_parent_evidence_confirmed", confidence: 0.9 } };
  const record = { id: "ignored", source: "rakuten", raw: { provider: "rakuten_ichiba", itemCode: "item-1", executed_query: "series variant", query: { variant_id: "v", query: "series variant" } } };
  const v4 = buildRecallV4VariantArm(query, [record], [candidate], { queries: [{ provider: "rakuten_ichiba", query: "series variant" }] });
  const v3 = { ...v4, candidate_evidence: [] };
  const result = buildRecallV4Comparison([{ id: "v", name: "variant" }], [{ name: "series" }], { v2: { per_variant: [{ ...v3, rakuten_result_count: 0 }] }, v3: { per_variant: [v3] }, v4: { per_variant: [v4] } })[0];
  assert.equal(result.v4_only_records.length, 1); assert.deepEqual(result.v4_provider_responsible, ["rakuten_ichiba"]);
  assert.deepEqual(result.v4_only_accepted_records[0], { candidate_key: "only-v4", listing_key: "rakuten_ichiba:item-1", provider: "rakuten_ichiba", executed_query: "series variant", title: "candidate title", status: "active", listing_type: "single", confidence: 0.9, accepted: true, safety_reason: "variant_and_parent_evidence_confirmed", target_variant_id: "v" });
});

test("same V3 listing is excluded while the new V4 listing alone remains attributable", () => {
  const base = { rakuten_result_count: 0, yahoo_result_count: 0, accepted: false, candidate_count: 0, providers_queried: ["rakuten_ichiba", "yahoo_shopping"] };
  const same = { candidate_key: "same-listing", provider: "rakuten_ichiba", accepted: false, safety_reason: "not_single_item" };
  const fresh = { candidate_key: "new-v4-listing", provider: "yahoo_shopping", accepted: false, safety_reason: "target_variant_not_confirmed" };
  const row = buildRecallV4Comparison([{ id: "v", name: "variant" }], [{ name: "series" }], { v2: { per_variant: [base] }, v3: { per_variant: [{ ...base, candidate_evidence: [same] }] }, v4: { per_variant: [{ ...base, candidate_evidence: [same, fresh] }] } })[0];
  assert.deepEqual(row.v4_only_records.map((record) => record.candidate_key), ["new-v4-listing"]);
  assert.deepEqual(row.v4_provider_responsible, ["yahoo_shopping"]);
});

test("V4 invalidates provider-contaminated comparisons and preserves zero-write decision semantics", () => {
  const metrics = { variants_with_results: 0, accepted_unique_variant_count: 0 };
  const clean = { metrics, request_diagnostics: { aggregate: { requests_rate_limited: 0, requests_timed_out: 0, requests_permanently_failed: 0 } } };
  const contaminated = { ...clean, request_diagnostics: { aggregate: { requests_rate_limited: 1, requests_timed_out: 0, requests_permanently_failed: 0 } } };
  assert.equal(buildRecallV4Decision({ v2: clean, v3: clean, v4: clean }, [], true).provider_errors, false);
  assert.equal(buildRecallV4Decision({ v2: clean, v3: clean, v4: contaminated }, [], true).provider_errors, true);
  for (const field of ["requests_timed_out", "requests_permanently_failed"]) {
    const failed = { ...clean, request_diagnostics: { aggregate: { requests_rate_limited: 0, requests_timed_out: 0, requests_permanently_failed: 0, [field]: 1 } } };
    assert.equal(buildRecallV4Decision({ v2: clean, v3: clean, v4: failed }, [], true).provider_errors, true);
  }
});

test("V4 arms execute strictly sequentially", async () => {
  let active = 0; let maximum = 0; const order = [];
  await runRecallV4ArmsSequentially([["v2"], ["v3"], ["v4"]], async (name) => {
    active += 1; maximum = Math.max(maximum, active); order.push(`start:${name}`);
    await Promise.resolve(); order.push(`finish:${name}`); active -= 1;
    return { name };
  });
  assert.equal(maximum, 1); assert.deepEqual(order, ["start:v2", "finish:v2", "start:v3", "finish:v3", "start:v4", "finish:v4"]);
});

test("blocked sequential execution preserves completed and failing arms without starting V4", async () => {
  const results = {}; const started = [];
  await assert.rejects(() => runRecallV4ArmsSequentially([["v2"], ["v3"], ["v4"]], async (name) => {
    started.push(name);
    return { name, request_diagnostics: { aggregate: { requests_rate_limited: name === "v3" ? 1 : 0, requests_timed_out: 0, requests_permanently_failed: 0 }, providers: { yahoo_shopping: { requests_rate_limited: name === "v3" ? 1 : 0, requests_timed_out: 0, requests_permanently_failed: 0 } } } };
  }, results), (error) => error.diagnostic_failure.arm === "v3" && error.diagnostic_failure.failure_categories.includes("rate_limited"));
  assert.deepEqual(started, ["v2", "v3"]); assert.deepEqual(Object.keys(results), ["v2", "v3"]);
});

test("decision aggregates sanitized safety_reason and keeps wins variant-level", () => {
  const metrics = { variants_with_results: 1, accepted_unique_variant_count: 0 };
  const arm = { metrics, request_diagnostics: { aggregate: { requests_rate_limited: 0, requests_timed_out: 0, requests_permanently_failed: 0 } } };
  const comparison = [{ v4_added_result: true, v4_newly_accepted: false, v4_only_records: [{ candidate_key: "one" }, { candidate_key: "two" }], v4_only_accepted_records: [], v4_only_rejected_records: [{ safety_reason: "not_single_item" }, { safety_reason: "not_single_item" }] }];
  const decision = buildRecallV4Decision({ v2: arm, v3: arm, v4: arm }, comparison, true);
  assert.equal(decision.v4_retrieval_win_count, 1); assert.equal(decision.v4_only_record_count, 2); assert.equal(decision.top_v4_rejection_reasons.not_single_item, 2);
});

test("V4 workflow is dispatch-only, read-only, and leaves Production Auto unchanged", () => {
  assert.match(workflow, /^on:\s*\r?\n\s+workflow_dispatch:/m); assert.doesNotMatch(workflow, /schedule:|upsertRows|deleteRowsByIds|bounded-seed-v2-auto\.mjs/);
  assert.match(workflow, /YAHOO_SHOPPING_REQUEST_DELAY_MS: "5000"/); assert.match(workflow, /manual-market-audit-guard\.mjs scan/);
  assert.match(workflow, /group: gacha-market-bounded-v2/); assert.match(workflow, /cancel-in-progress: false/);
  assert.match(auto, /17 \*\/3 \* \* \*/);
});
