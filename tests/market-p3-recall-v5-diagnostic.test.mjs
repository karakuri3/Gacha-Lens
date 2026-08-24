import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildPriorityThreeSeedQueriesForVariant, buildPriorityThreeSeedRecallV5QueriesForVariant, normalizeRecallV5SeriesAnchor, normalizeRecallV5VariantAlias } from "../lib/fetchers/market-seed-query-planner.js";
import { buildSanitizedMarketCandidateAudit } from "../lib/domain/market-candidate-audit.js";
import { buildSanitizedMarketRequestDiagnostics } from "../lib/domain/market-request-diagnostics.js";
import { buildRecallV5Comparison, buildRecallV5Decision, buildRecallV5PreAuditMetrics, runRecallV5ArmsSequentially } from "../lib/domain/market-p3-recall-v5-diagnostic.js";

const root = process.cwd();
const workflow = fs.readFileSync(path.join(root, ".github/workflows/gacha-market-p3-recall-v5-diagnostic.yml"), "utf8");
const auto = fs.readFileSync(path.join(root, ".github/workflows/gacha-market-p3-bounded-seed-v2-auto.yml"), "utf8");
const variant = { id: "v", name: "ミルキィローズ", variant_type: "regular" };

test("V5 preserves V2 exact root, caps attempts, and retains parent plus variant anchors", () => {
  const series = { id: "s", name: "TVアニメ「黄泉のツガイ」 カプセルラバーマスコット" };
  const v2 = buildPriorityThreeSeedQueriesForVariant(variant, series)[0]; const v5 = buildPriorityThreeSeedRecallV5QueriesForVariant(variant, series)[0];
  assert.equal(v5.query, v2.query); assert.ok(v5.fallback_queries.length <= 2);
  assert.ok([v5.query, ...v5.fallback_queries].every((query) => query.includes("ミルキィローズ") && query.replace("ミルキィローズ", "").trim()));
});

test("V5 anchor-minimal normalization removes only product forms and rejects generic-only anchors", () => {
  assert.equal(normalizeRecallV5SeriesAnchor("TVアニメ「黄泉のツガイ」 カプセルラバーマスコット"), "黄泉のツガイ");
  assert.equal(normalizeRecallV5SeriesAnchor("クレヨンしんちゃん フェイスぬいぐるみ2"), "クレヨンしんちゃん");
  assert.equal(normalizeRecallV5SeriesAnchor("プリキュアオールスターズ カプセルラバーマスコット Name Collection!2"), "プリキュア");
  assert.equal(normalizeRecallV5SeriesAnchor("JAPAN ミニチュアパッケージチャーム"), "");
  assert.equal(normalizeRecallV5SeriesAnchor("MLB™ Capsuleトルソー Players Edition"), "MLB");
  assert.equal(normalizeRecallV5SeriesAnchor("MLB&trade; Capsuleトルソー Players Edition"), "MLB");
  assert.match(normalizeRecallV5SeriesAnchor("ポンデクルール アイカツ！ マルチカラーパウダーVol.2"), /ポンデクルール.*アイカツ/);
  assert.equal(normalizeRecallV5VariantAlias("天の川コズミックワンショルダー（カラー・コズミックブルー）（再録）"), "天の川コズミックワンショルダー コズミックブルー");
});

test("V5 comparison uses candidate-key difference and records only responsible providers", () => {
  const base = { rakuten_result_count: 0, yahoo_result_count: 0, accepted: false, candidate_evidence: [] };
  const same = { candidate_key: "same", provider: "rakuten_ichiba", accepted: false, safety_reason: "not_single_item" };
  const fresh = { candidate_key: "fresh", provider: "yahoo_shopping", accepted: false, safety_reason: "target_variant_not_confirmed" };
  const row = buildRecallV5Comparison([{ id: "v", name: "variant" }], [{ name: "series" }], { v2: { per_variant: [base] }, v4: { per_variant: [{ ...base, candidate_evidence: [same] }] }, v5: { per_variant: [{ ...base, yahoo_result_count: 1, candidate_evidence: [same, fresh] }] } })[0];
  assert.deepEqual(row.v5_only_records.map((entry) => entry.candidate_key), ["fresh"]); assert.deepEqual(row.v5_provider_responsible, ["yahoo_shopping"]); assert.equal(row.v5_candidate_count, 2);
});

test("V5 decision is variant-level and provider contamination invalidates comparison", () => {
  const metrics = { variants_with_results: 1, accepted_unique_variant_count: 0 }; const clean = { metrics, request_diagnostics: { aggregate: { requests_rate_limited: 0, requests_timed_out: 0, requests_permanently_failed: 0 } } };
  const comparison = [{ v5_added_result: true, v5_newly_accepted: false, v5_only_records: [{}, {}], v5_only_accepted_records: [], v5_only_rejected_records: [{ safety_reason: "not_single_item" }, { safety_reason: "not_single_item" }] }];
  const decision = buildRecallV5Decision({ v2: clean, v4: clean, v5: clean }, comparison, true); assert.equal(decision.v5_retrieval_win_count, 1); assert.equal(decision.v5_only_record_count, 2); assert.equal(decision.top_v5_rejection_reasons.not_single_item, 2);
  const blocked = { ...clean, request_diagnostics: { aggregate: { requests_rate_limited: 0, requests_timed_out: 1, requests_permanently_failed: 0 } } }; assert.equal(buildRecallV5Decision({ v2: clean, v4: clean, v5: blocked }, comparison, true).provider_errors, true);
  const truncated = { ...clean, metrics: { ...metrics, report_complete: false, truncated_count: 1 } };
  assert.notEqual(buildRecallV5Decision({ v2: clean, v4: clean, v5: truncated }, comparison, true).decision_label, "V5_PROMOTION_CANDIDATE");
});

test("V5 bounded candidate evidence keeps retrieval effectiveness consistent at and above 200 candidates", () => {
  const exactly = buildV5Audit(200); const overflow = buildV5Audit(201);
  assert.equal(exactly.result.truncated_count, 0); assert.equal(exactly.result.report_complete, true);
  assert.equal(overflow.result.candidate_count, 200); assert.equal(overflow.result.truncated_count, 1); assert.equal(overflow.result.report_complete, false);
  assert.deepEqual(overflow.candidate_evidence, { scope: "bounded", candidate_limit: 200, full_candidate_count: 201, visible_candidate_count: 200, overflow_count: 1 });
  assert.equal(overflow.retrieval_effectiveness.review_required_count, overflow.result.review_count);
  assert.equal(overflow.retrieval_effectiveness.accepted_candidate_count, overflow.result.accepted_count);
  assert.deepEqual(overflow.retrieval_effectiveness.accepted_candidate_keys, overflow.candidates.filter((candidate) => candidate.assessment.accepted).map((candidate) => candidate.candidate_key).sort());
  assert.throws(() => buildV5Audit(201, false, true), /Retrieval effectiveness does not match/);
  assert.equal(buildV5Audit(199).result.report_complete, true);
});

test("V5 pre-audit metrics are sanitized and retain the bounded overflow diagnosis", () => {
  const metrics = buildRecallV5PreAuditMetrics({ candidateSummary: { safety_assessed_records: 201, variants_with_results: 6, no_result_variants: 4, accepted_listings: 7, review_required_count: 194 }, requestDiagnostics: { aggregate: { requests_attempted: 50, requests_succeeded: 50, requests_rate_limited: 0, requests_timed_out: 0, requests_permanently_failed: 0, results_returned: 217, normalized_records: 201 } }, selectedVariantCount: 10 });
  assert.deepEqual(metrics, { selected_variant_count: 10, full_candidate_count: 201, candidate_evidence_limit: 200, candidate_evidence_overflow: 1, variants_with_results: 6, no_result_variant_count: 4, accepted_count: 7, review_required_count: 194, requests_attempted: 50, requests_succeeded: 50, requests_rate_limited: 0, requests_timed_out: 0, requests_permanently_failed: 0, results_returned: 217, normalized_records: 201 });
});

test("V5 arms are sequential and workflow is zero-write dispatch-only isolation", async () => {
  let active = 0; let maximum = 0; const order = [];
  await runRecallV5ArmsSequentially([["v2"], ["v4"], ["v5"]], async (name) => { active += 1; maximum = Math.max(maximum, active); order.push(name); await Promise.resolve(); active -= 1; return { request_diagnostics: { aggregate: { requests_rate_limited: 0, requests_timed_out: 0, requests_permanently_failed: 0 } } }; });
  assert.equal(maximum, 1); assert.deepEqual(order, ["v2", "v4", "v5"]);
  assert.match(workflow, /^on:\s*\r?\n\s+workflow_dispatch:/m); assert.doesNotMatch(workflow, /schedule:|upsertRows|deleteRowsByIds|bounded-seed-v2-auto\.mjs/); assert.match(workflow, /group: gacha-market-bounded-v2/); assert.match(workflow, /YAHOO_SHOPPING_REQUEST_DELAY_MS: "5000"/); assert.match(auto, /17 \*\/3 \* \* \*/);
});

function buildV5Audit(count, bounded = true, allReview = false) {
  const series = { id: "series", slug: "series", name: "Series" };
  const variant = { id: "variant", slug: "variant", name: "Variant", series_id: series.id, variant_type: "regular" };
  const query = { query: "Series Variant", variant_id: variant.id, series_id: series.id };
  const diagnostics = buildSanitizedMarketRequestDiagnostics([{ source: "rakuten_ichiba", query: query.query, request_kind: "discovery", ok: true, attempt_count: 1, retry_count: 0, retried: false, recovered_after_retry: false, failure_category: null, status: 200, timed_out: false, rate_limited: false, duration_ms: 1, results_returned: count, normalized_records: count, records_rejected: 0, rejection_reason_counts: {}, retry_delays_ms: [], attempts: [{ attempt: 1, status: 200, failure_category: null, timed_out: false, rate_limited: false, duration_ms: 1 }] }]);
  const records = Array.from({ length: count }, (_, index) => { const accepted = !allReview && index % 2 === 0; return { id: `record-${index}`, title: `Series Variant ${index}`, price: 100, status: "active", source_url: `https://example.com/${index}`, market_safety_assessed: true, market_safety: { accepted, review_required: !accepted, reason: accepted ? "variant_and_parent_evidence_confirmed" : "review_required", variant_id: variant.id, series_id: series.id, listing_type: "single", confidence: 0.9, matched_variant_ids: [variant.id], checks: { variant_evidence_present: true, parent_series_evidence_present: true, query_context_present: true } }, raw: { provider: "rakuten_ichiba", code: `code-${index}`, query } }; });
  return buildSanitizedMarketCandidateAudit({ records, queryPlan: [query], catalog: { series: [series], variants: [variant], seriesById: new Map([[series.id, series]]), variantById: new Map([[variant.id, variant]]) }, runContext: { mode: "dry-run", source_scope: "planner-apis", bounded_candidate_evidence: bounded }, summary: { safety_assessed_records: count, selected_variants: 1, review_required_count: records.filter((record) => record.market_safety.review_required).length, request_diagnostics: diagnostics, listing_upserts: 0, observations_created: 0, ingestion_runs_written: 0 } });
}
