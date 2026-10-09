import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  buildPriorityThreeSeedQueriesForVariant,
  buildPriorityThreeSeedRecallV4QueriesForVariant,
  buildPriorityThreeSeedRecallV5QueriesForVariant,
  normalizeRecallV5SeriesAnchor,
  normalizeRecallV5VariantAlias,
} from "../lib/fetchers/market-seed-query-planner.js";
import { buildSanitizedMarketCandidateAudit } from "../lib/domain/market-candidate-audit.js";
import { buildSanitizedMarketRequestDiagnostics } from "../lib/domain/market-request-diagnostics.js";
import {
  P3_RECALL_V5_DIAGNOSTIC_CONFIRMATION,
  P3_RECALL_V5_DIAGNOSTIC_LIMIT,
  assertRecallV5DiagnosticQueryPlan,
  buildRecallV5Comparison,
  buildRecallV5Decision,
  buildRecallV5PreAuditMetrics,
  runRecallV5ArmsSequentially,
  sanitizeRecallDiagnosticQueryPlan,
  validateP3RecallV5DiagnosticInvocation,
} from "../lib/domain/market-p3-recall-v5-diagnostic.js";

const root = process.cwd();
const workflow = fs.readFileSync(
  path.join(root, ".github/workflows/gacha-market-p3-recall-v5-diagnostic.yml"),
  "utf8",
);
const script = fs.readFileSync(
  path.join(root, "scripts/market-p3-recall-v5-diagnostic.mjs"),
  "utf8",
);
const auto = fs.readFileSync(
  path.join(root, ".github/workflows/gacha-market-p3-bounded-seed-v2-auto.yml"),
  "utf8",
);
const variant = { id: "v", name: "ミルキィローズ", variant_type: "regular" };

test("V5 preserves V2 exact root, caps attempts, and retains parent plus variant anchors", () => {
  const series = { id: "s", name: "TVアニメ「黄泉のツガイ」 カプセルラバーマスコット" };
  const v2 = buildPriorityThreeSeedQueriesForVariant(variant, series)[0];
  const v5 = buildPriorityThreeSeedRecallV5QueriesForVariant(variant, series)[0];
  assert.equal(v5.query, v2.query);
  assert.ok(v5.fallback_queries.length <= 2);
  assert.ok(
    [v5.query, ...v5.fallback_queries].every(
      (query) => query.includes("ミルキィローズ") && query.replace("ミルキィローズ", "").trim(),
    ),
  );
});

test("V5 anchor-minimal normalization removes only product forms and rejects generic-only anchors", () => {
  assert.equal(
    normalizeRecallV5SeriesAnchor("TVアニメ「黄泉のツガイ」 カプセルラバーマスコット"),
    "黄泉のツガイ",
  );
  assert.equal(
    normalizeRecallV5SeriesAnchor("クレヨンしんちゃん フェイスぬいぐるみ2"),
    "クレヨンしんちゃん",
  );
  assert.equal(
    normalizeRecallV5SeriesAnchor("プリキュアオールスターズ カプセルラバーマスコット Name Collection!2"),
    "プリキュア",
  );
  assert.equal(normalizeRecallV5SeriesAnchor("JAPAN ミニチュアパッケージチャーム"), "");
  assert.equal(normalizeRecallV5SeriesAnchor("MLB™ Capsuleトルソー Players Edition"), "MLB");
  assert.equal(normalizeRecallV5SeriesAnchor("MLB&trade; Capsuleトルソー Players Edition"), "MLB");
  assert.match(
    normalizeRecallV5SeriesAnchor("ポンデクルール アイカツ！ マルチカラーパウダーVol.2"),
    /ポンデクルール.*アイカツ/,
  );
  assert.equal(
    normalizeRecallV5VariantAlias("天の川コズミックワンショルダー（カラー・コズミックブルー）（再録）"),
    "天の川コズミックワンショルダー コズミックブルー",
  );
});

test("recall diagnostic invocation is dispatch-only and exact-main bound", () => {
  const sha = "a".repeat(40);
  assert.equal(P3_RECALL_V5_DIAGNOSTIC_CONFIRMATION, "APPROVE_P3_RECALL_V5_DIAGNOSTIC");
  assert.equal(P3_RECALL_V5_DIAGNOSTIC_LIMIT, 10);
  assert.equal(validateP3RecallV5DiagnosticInvocation({
    event_name: "workflow_dispatch",
    ref: "refs/heads/main",
    confirmation: P3_RECALL_V5_DIAGNOSTIC_CONFIRMATION,
    expected_main_sha: sha,
    head_sha: sha,
    origin_main_sha: sha,
  }), true);
  for (const override of [
    { event_name: "schedule" },
    { ref: "refs/heads/feature" },
    { confirmation: "APPROVE_P3_BOUNDED_SEED_V2" },
    { expected_main_sha: "b".repeat(40) },
    { origin_main_sha: "b".repeat(40) },
  ]) {
    assert.throws(() => validateP3RecallV5DiagnosticInvocation({
      event_name: "workflow_dispatch",
      ref: "refs/heads/main",
      confirmation: P3_RECALL_V5_DIAGNOSTIC_CONFIRMATION,
      expected_main_sha: sha,
      head_sha: sha,
      origin_main_sha: sha,
      ...override,
    }));
  }
});

test("V2, V4, and V5 exact-ten plans preserve roots, anchors, order, and attempt budget", () => {
  const fixture = recallPlanFixture();
  for (const [name, queries] of [
    ["v2", fixture.v2],
    ["v4", fixture.v4],
    ["v5", fixture.v5],
  ]) {
    assert.equal(assertRecallV5DiagnosticQueryPlan({
      name,
      queries,
      targets: fixture.targets,
      series: fixture.series,
      v2Queries: fixture.v2,
    }), true);
    assert.deepEqual(
      queries.map((query) => query.variant_id),
      fixture.targets.map((entry) => entry.id),
    );
  }

  const rootDrift = structuredClone(fixture.v4);
  rootDrift[0].query = "different root";
  assert.throws(
    () => assertRecallV5DiagnosticQueryPlan({
      name: "v4",
      queries: rootDrift,
      targets: fixture.targets,
      series: fixture.series,
      v2Queries: fixture.v2,
    }),
    /preserve the V2 exact root/,
  );

  const generic = recallPlanFixture();
  generic.targets[0] = { id: "variant-1", name: "A", variant_type: "regular" };
  generic.series[0] = { id: "series-1", name: "JAPAN ミニチュアパッケージチャーム" };
  generic.v2[0] = buildPriorityThreeSeedQueriesForVariant(generic.targets[0], generic.series[0])[0];
  generic.v5[0] = buildPriorityThreeSeedRecallV5QueriesForVariant(generic.targets[0], generic.series[0])[0];
  const genericCatalog = catalogFor(generic.targets, generic.series);
  const genericSanitized = sanitizeRecallDiagnosticQueryPlan({
    name: "v5",
    queries: generic.v5,
    targets: generic.targets,
    series: generic.series,
    catalog: genericCatalog,
  });
  assert.equal(genericSanitized.queries[0].fallback_queries.length, 0);
  assert.equal(genericSanitized.rejected_fallbacks[0].reason, "generic_anchor");
  assert.equal(assertRecallV5DiagnosticQueryPlan({
    name: "v5",
    queries: genericSanitized.queries,
    targets: generic.targets,
    series: generic.series,
    v2Queries: generic.v2,
  }), true);

  const overBudget = structuredClone(fixture.v5);
  overBudget[0].fallback_queries.push(
    "Series Identity 1 Variant Identity 1 extra-one",
    "Series Identity 1 Variant Identity 1 extra-two",
  );
  assert.throws(
    () => assertRecallV5DiagnosticQueryPlan({
      name: "v5",
      queries: overBudget,
      targets: fixture.targets,
      series: fixture.series,
      v2Queries: fixture.v2,
    }),
    /attempts exceed/,
  );
});

test("V5 diagnostic removes an obvious cross-series catalog collision but keeps the exact root and safe compact fallback", () => {
  const fixture = recallPlanFixture();
  fixture.targets[0] = {
    id: "gashapon-4570118181848000-キュアアルカナ",
    name: "キュアアルカナ",
    variant_type: "regular",
  };
  fixture.series[0] = {
    id: "gashapon-4570118181848000",
    name: "名探偵プリキュア！ カプセルラバーマスコット２",
  };
  fixture.v2[0] = buildPriorityThreeSeedQueriesForVariant(fixture.targets[0], fixture.series[0])[0];
  fixture.v5[0] = buildPriorityThreeSeedRecallV5QueriesForVariant(fixture.targets[0], fixture.series[0])[0];

  const collisionSeries = {
    id: "gashapon-4570118181824000",
    name: "名探偵プリキュア！ 名探偵スイング2",
  };
  const collisionVariant = {
    id: "gashapon-4570118181824000-キュアアルカナ",
    name: "キュアアルカナ",
    series_id: collisionSeries.id,
    variant_type: "regular",
  };
  const catalog = catalogFor(fixture.targets, fixture.series, {
    extraSeries: [collisionSeries],
    extraVariants: [collisionVariant],
  });
  const sanitized = sanitizeRecallDiagnosticQueryPlan({
    name: "v5",
    queries: fixture.v5,
    targets: fixture.targets,
    series: fixture.series,
    catalog,
  });

  assert.equal(sanitized.queries[0].query, fixture.v2[0].query);
  assert.equal(sanitized.queries[0].fallback_queries.length, 1);
  assert.equal(sanitized.rejected_fallbacks.length, 1);
  assert.equal(sanitized.rejected_fallbacks[0].reason, "catalog_identity_collision");
  assert.deepEqual(
    sanitized.rejected_fallbacks[0].collision_variant_ids,
    [collisionVariant.id],
  );
  assert.equal(assertRecallV5DiagnosticQueryPlan({
    name: "v5",
    queries: sanitized.queries,
    targets: fixture.targets,
    series: fixture.series,
    v2Queries: fixture.v2,
  }), true);
});

test("V5 comparison reports per-arm result counts, outcomes, responsible providers, and query classes", () => {
  const base = {
    root_query: "Series Variant ガチャ",
    fallback_queries: ["Series Variant"],
    executed_query: "",
    rakuten_result_count: 0,
    yahoo_result_count: 0,
    accepted: false,
    review: false,
    safety_reasons: [],
    candidate_evidence: [],
  };
  const same = {
    candidate_key: "same",
    provider: "rakuten_ichiba",
    accepted: false,
    safety_reason: "not_single_item",
  };
  const fresh = {
    candidate_key: "fresh",
    provider: "yahoo_shopping",
    accepted: false,
    safety_reason: "target_variant_not_confirmed",
  };
  const row = buildRecallV5Comparison(
    [{ id: "v", name: "variant" }],
    [{ name: "series" }],
    {
      v2: { per_variant: [base] },
      v4: {
        per_variant: [{
          ...base,
          rakuten_result_count: 1,
          review: true,
          executed_query: "Series Variant",
          candidate_evidence: [same],
        }],
      },
      v5: {
        per_variant: [{
          ...base,
          rakuten_result_count: 1,
          yahoo_result_count: 1,
          review: true,
          executed_query: "Series Variant",
          candidate_evidence: [same, fresh],
        }],
      },
    },
  )[0];
  assert.equal(row.v2_result_count, 0);
  assert.equal(row.v4_result_count, 1);
  assert.equal(row.v5_result_count, 2);
  assert.equal(row.v4_added_result, true);
  assert.equal(row.v5_added_result, false);
  assert.equal(row.v4_outcome, "review");
  assert.equal(row.v5_outcome, "review");
  assert.equal(row.v4_executed_query_class, "fallback_1");
  assert.equal(row.v5_executed_query_class, "fallback_1");
  assert.deepEqual(row.v4_provider_responsible, ["rakuten_ichiba"]);
  assert.deepEqual(row.v5_only_records.map((entry) => entry.candidate_key), ["fresh"]);
  assert.deepEqual(row.v5_provider_responsible, ["yahoo_shopping"]);
});

test("V5 decision is variant-level and provider contamination invalidates comparison", () => {
  const metrics = {
    variants_with_results: 1,
    accepted_unique_variant_count: 0,
    report_complete: true,
    truncated_count: 0,
  };
  const clean = {
    metrics,
    request_diagnostics: {
      aggregate: {
        requests_rate_limited: 0,
        requests_timed_out: 0,
        requests_permanently_failed: 0,
      },
    },
  };
  const comparison = [{
    v5_added_result: true,
    v5_newly_accepted: false,
    v5_only_records: [{}, {}],
    v5_only_accepted_records: [],
    v5_only_rejected_records: [
      { safety_reason: "not_single_item" },
      { safety_reason: "not_single_item" },
    ],
  }];
  const decision = buildRecallV5Decision({ v2: clean, v4: clean, v5: clean }, comparison, true);
  assert.equal(decision.v5_retrieval_win_count, 1);
  assert.equal(decision.v5_only_record_count, 2);
  assert.equal(decision.top_v5_rejection_reasons.not_single_item, 2);
  const blocked = {
    ...clean,
    request_diagnostics: {
      aggregate: {
        requests_rate_limited: 0,
        requests_timed_out: 1,
        requests_permanently_failed: 0,
      },
    },
  };
  assert.equal(
    buildRecallV5Decision({ v2: clean, v4: clean, v5: blocked }, comparison, true).provider_errors,
    true,
  );
  const truncated = {
    ...clean,
    metrics: { ...metrics, report_complete: false, truncated_count: 1 },
  };
  assert.notEqual(
    buildRecallV5Decision({ v2: clean, v4: clean, v5: truncated }, comparison, true).decision_label,
    "V5_PROMOTION_CANDIDATE",
  );
});

test("V5 promotion ignores a new acceptance attributed only to the shared V2 root", () => {
  const { decision, comparison } = promotionDecisionCase({ executedQuery: "Shared Root" });
  assert.equal(comparison[0].v5_newly_accepted, true);
  assert.equal(comparison[0].v5_strategy_attributed_accepted, false);
  assert.equal(comparison[0].v5_shared_query_accepted_records.length, 1);
  assert.equal(decision.accepted_unique_delta_v5_vs_v4, 1);
  assert.equal(decision.v5_strategy_attributed_accepted_variant_count, 0);
  assert.equal(decision.v5_shared_query_new_accepted_variant_count, 1);
  assert.equal(decision.v5_attribution_complete, true);
  assert.notEqual(decision.decision_label, "V5_PROMOTION_CANDIDATE");
});

test("V5 promotion ignores a new acceptance attributed to a fallback shared with V4", () => {
  const { decision, comparison } = promotionDecisionCase({ executedQuery: "Shared Fallback" });
  assert.equal(comparison[0].v5_strategy_attributed_accepted, false);
  assert.equal(comparison[0].v5_shared_query_accepted_records.length, 1);
  assert.equal(decision.v5_strategy_attributed_accepted_variant_count, 0);
  assert.equal(decision.v5_shared_query_new_accepted_variant_count, 1);
  assert.notEqual(decision.decision_label, "V5_PROMOTION_CANDIDATE");
});

test("V5-only safe fallback acceptance is strategy-attributed and can become a promotion candidate", () => {
  const { decision, comparison } = promotionDecisionCase({ executedQuery: "V5 Only Fallback" });
  assert.equal(comparison[0].v5_strategy_attributed_accepted, true);
  assert.equal(comparison[0].v5_strategy_attributed_accepted_records.length, 1);
  assert.equal(comparison[0].v5_shared_query_accepted_records.length, 0);
  assert.equal(comparison[0].v5_attribution_complete, true);
  assert.equal(decision.v5_strategy_attributed_accepted_variant_count, 1);
  assert.deepEqual(decision.v5_strategy_attributed_target_ids, ["variant-1"]);
  assert.equal(decision.v5_shared_query_new_accepted_variant_count, 0);
  assert.equal(decision.v5_attribution_complete, true);
  assert.equal(decision.decision_label, "V5_PROMOTION_CANDIDATE");
});

test("V5-only accepted evidence cannot promote when provider, completeness, truncation, or zero-delta gates fail", () => {
  for (const options of [
    { providerContaminated: true },
    { reportComplete: false },
    { truncatedCount: 1 },
    { zeroDelta: false },
  ]) {
    const { decision } = promotionDecisionCase({
      executedQuery: "V5 Only Fallback",
      ...options,
    });
    assert.equal(decision.v5_strategy_attributed_accepted_variant_count, 1);
    assert.notEqual(decision.decision_label, "V5_PROMOTION_CANDIDATE");
  }
});

test("V5 bounded candidate evidence keeps retrieval effectiveness consistent at and above 200 candidates", () => {
  const exactly = buildV5Audit(200);
  const overflow = buildV5Audit(201);
  assert.equal(exactly.result.truncated_count, 0);
  assert.equal(exactly.result.report_complete, true);
  assert.equal(overflow.result.candidate_count, 200);
  assert.equal(overflow.result.truncated_count, 1);
  assert.equal(overflow.result.report_complete, false);
  assert.deepEqual(overflow.candidate_evidence, {
    scope: "bounded",
    candidate_limit: 200,
    full_candidate_count: 201,
    visible_candidate_count: 200,
    overflow_count: 1,
  });
  assert.equal(overflow.retrieval_effectiveness.review_required_count, overflow.result.review_count);
  assert.equal(overflow.retrieval_effectiveness.accepted_candidate_count, overflow.result.accepted_count);
  assert.deepEqual(
    overflow.retrieval_effectiveness.accepted_candidate_keys,
    overflow.candidates
      .filter((candidate) => candidate.assessment.accepted)
      .map((candidate) => candidate.candidate_key)
      .sort(),
  );
  assert.throws(() => buildV5Audit(201, false, true), /Retrieval effectiveness does not match/);
  assert.equal(buildV5Audit(199).result.report_complete, true);
});

test("V5 pre-audit metrics are sanitized and retain the bounded overflow diagnosis", () => {
  const metrics = buildRecallV5PreAuditMetrics({
    candidateSummary: {
      safety_assessed_records: 201,
      variants_with_results: 6,
      no_result_variants: 4,
      accepted_listings: 7,
      review_required_count: 194,
    },
    requestDiagnostics: {
      aggregate: {
        requests_attempted: 50,
        requests_succeeded: 50,
        requests_rate_limited: 0,
        requests_timed_out: 0,
        requests_permanently_failed: 0,
        results_returned: 217,
        normalized_records: 201,
      },
    },
    selectedVariantCount: 10,
  });
  assert.deepEqual(metrics, {
    selected_variant_count: 10,
    full_candidate_count: 201,
    candidate_evidence_limit: 200,
    candidate_evidence_overflow: 1,
    variants_with_results: 6,
    no_result_variant_count: 4,
    accepted_count: 7,
    review_required_count: 194,
    requests_attempted: 50,
    requests_succeeded: 50,
    requests_rate_limited: 0,
    requests_timed_out: 0,
    requests_permanently_failed: 0,
    results_returned: 217,
    normalized_records: 201,
  });
});

test("workflow exposes only exact-main, exact-target, and diagnostic confirmation approval inputs", () => {
  const inputs = workflow.match(/inputs:([\s\S]*?)\r?\n\r?\npermissions:/)?.[1] ?? "";
  assert.match(inputs, /expected_main_sha/);
  assert.match(inputs, /approved_target_variant_ids_json/);
  assert.match(inputs, /confirmation/);
  assert.doesNotMatch(inputs, /^\s+limit:/m);
  assert.match(workflow, /APPROVE_P3_RECALL_V5_DIAGNOSTIC/);
  assert.match(workflow, /ref:\s*\$\{\{ inputs\.expected_main_sha \}\}/);
  assert.match(workflow, /test "\$GITHUB_SHA" = "\$EXPECTED_MAIN_SHA"/);
  assert.match(workflow, /git rev-parse origin\/main/);
  assert.match(workflow, /P3_RECALL_V5_DIAGNOSTIC_APPROVED_TARGET_VARIANT_IDS_JSON/);
});

test("exact-main and exact-target gates run before provider access and diagnostic stays zero-write", () => {
  assert.ok(
    script.indexOf("validateP3RecallV5DiagnosticInvocation({")
      < script.indexOf("const catalog = await loadOfficialCatalog()"),
  );
  assert.ok(
    script.indexOf("exactPlan = bindApprovedP3TargetPlan({")
      < script.indexOf("await fetchMarketListingsRaw({"),
  );
  assert.ok(
    script.indexOf("assertRecallV5DiagnosticQueryPlan({")
      < script.indexOf("await fetchMarketListingsRaw({"),
  );
  assert.doesNotMatch(script, /\b(upsertRows|deleteRowsByIds|persistP3BoundedSeedV2)\b/);
  for (const table of [
    "market_listings",
    "market_listing_observations",
    "import_issues",
    "ingestion_runs",
    "series",
    "variants",
    "stock_reports",
    "restock_events",
  ]) {
    assert.match(script, new RegExp(`"${table}"`));
  }
  assert.match(script, /database_writes:\s*0/);
  assert.match(script, /zero_delta_verified/);
});

test("sanitized artifact exposes reviewed retrieval-effectiveness fields without raw API payloads", () => {
  for (const field of [
    "selected_exact_variant_ids",
    "query_count",
    "query_attempt_count",
    "provider_request_count",
    "raw_result_count",
    "normalized_record_count",
    "zero_result_query_count",
    "variants_with_results",
    "accepted_unique_variants",
    "review_count",
    "rejection_reasons",
    "provider_errors",
    "candidate_keys",
    "v2_result_count",
    "v4_result_count",
    "v5_result_count",
    "v4_added_result",
    "v5_added_result",
    "v5_executed_query_class",
    "fallback_safety_rejections",
    "v5_strategy_attributed_accepted_variant_count",
    "v5_strategy_attributed_target_ids",
    "v5_shared_query_new_accepted_variant_count",
    "v5_attribution_complete",
  ]) {
    assert.match(script + workflow + fs.readFileSync(
      path.join(root, "lib/domain/market-p3-recall-v5-diagnostic.js"),
      "utf8",
    ), new RegExp(field));
  }
  assert.doesNotMatch(script, /JSON\.stringify\(fetched|raw_api_response|seller_private/);
});

test("V5 arms are sequential and workflow preserves request isolation", async () => {
  let active = 0;
  let maximum = 0;
  const order = [];
  await runRecallV5ArmsSequentially(
    [["v2"], ["v4"], ["v5"]],
    async (name) => {
      active += 1;
      maximum = Math.max(maximum, active);
      order.push(name);
      await Promise.resolve();
      active -= 1;
      return {
        request_diagnostics: {
          aggregate: {
            requests_rate_limited: 0,
            requests_timed_out: 0,
            requests_permanently_failed: 0,
          },
        },
      };
    },
  );
  assert.equal(maximum, 1);
  assert.deepEqual(order, ["v2", "v4", "v5"]);
  assert.match(workflow, /^on:\s*\r?\n\s+workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /schedule:|upsertRows|deleteRowsByIds|bounded-seed-v2-auto\.mjs/);
  assert.match(workflow, /group: gacha-market-bounded-v2/);
  assert.match(workflow, /YAHOO_SHOPPING_REQUEST_DELAY_MS: "5000"/);
  assert.match(script, /sourceScope:\s*MARKET_SOURCE_SCOPES\.PLANNER_APIS/);
  assert.match(script, /rakuten:\s*\{ queryLimit: 10 \}/);
  assert.match(script, /yahoo:\s*\{ queryLimit: 10 \}/);
  const autoTriggers = auto.slice(auto.indexOf("on:"), auto.indexOf("\npermissions:"));
  assert.match(autoTriggers, /workflow_dispatch:/);
  assert.doesNotMatch(autoTriggers, /\bschedule:/);
});

function recallPlanFixture() {
  const targets = Array.from({ length: 10 }, (_, index) => ({
    id: `variant-${index + 1}`,
    name: `Variant Identity ${index + 1}`,
    variant_type: "regular",
  }));
  const series = Array.from({ length: 10 }, (_, index) => ({
    id: `series-${index + 1}`,
    name: `Series Identity ${index + 1} カプセルチャーム`,
  }));
  const plan = (builder) => targets.map((entry, index) => builder(entry, series[index])[0]);
  return {
    targets,
    series,
    v2: plan(buildPriorityThreeSeedQueriesForVariant),
    v4: plan(buildPriorityThreeSeedRecallV4QueriesForVariant),
    v5: plan(buildPriorityThreeSeedRecallV5QueriesForVariant),
  };
}

function catalogFor(targets, series, { extraSeries = [], extraVariants = [] } = {}) {
  const catalogSeries = [
    ...series.map((entry) => ({ ...entry })),
    ...extraSeries.map((entry) => ({ ...entry })),
  ];
  const catalogVariants = [
    ...targets.map((entry, index) => ({ ...entry, series_id: series[index].id })),
    ...extraVariants.map((entry) => ({ ...entry })),
  ];
  return {
    series: catalogSeries,
    variants: catalogVariants,
    seriesById: new Map(catalogSeries.map((entry) => [entry.id, entry])),
    variantById: new Map(catalogVariants.map((entry) => [entry.id, entry])),
  };
}

function promotionDecisionCase({
  executedQuery,
  providerContaminated = false,
  reportComplete = true,
  truncatedCount = 0,
  zeroDelta = true,
} = {}) {
  const cleanDiagnostics = {
    aggregate: {
      requests_rate_limited: 0,
      requests_timed_out: 0,
      requests_permanently_failed: 0,
    },
  };
  const v5Diagnostics = {
    aggregate: {
      ...cleanDiagnostics.aggregate,
      requests_timed_out: providerContaminated ? 1 : 0,
    },
  };
  const metric = ({
    variantsWithResults,
    acceptedUniqueVariants,
    complete = true,
    truncated = 0,
  }) => ({
    variants_with_results: variantsWithResults,
    accepted_unique_variant_count: acceptedUniqueVariants,
    report_complete: complete,
    truncated_count: truncated,
  });
  const baseVariantArm = {
    variant_id: "variant-1",
    series_id: "series-1",
    root_query: "Shared Root",
    fallback_queries: [],
    rakuten_result_count: 0,
    yahoo_result_count: 0,
    accepted: false,
    review: false,
    safety_reasons: [],
    candidate_evidence: [],
    executed_query: "",
  };
  const acceptedEvidence = {
    candidate_key: "accepted-1",
    provider: "yahoo_shopping",
    executed_query: executedQuery,
    accepted: true,
    safety_reason: "variant_and_parent_evidence_confirmed",
    target_variant_id: "variant-1",
  };
  const arms = {
    v2: {
      metrics: metric({ variantsWithResults: 0, acceptedUniqueVariants: 0 }),
      request_diagnostics: cleanDiagnostics,
      per_variant: [{ ...baseVariantArm }],
    },
    v4: {
      metrics: metric({ variantsWithResults: 0, acceptedUniqueVariants: 0 }),
      request_diagnostics: cleanDiagnostics,
      per_variant: [{
        ...baseVariantArm,
        fallback_queries: ["Shared Fallback"],
      }],
    },
    v5: {
      metrics: metric({
        variantsWithResults: 1,
        acceptedUniqueVariants: 1,
        complete: reportComplete,
        truncated: truncatedCount,
      }),
      request_diagnostics: v5Diagnostics,
      per_variant: [{
        ...baseVariantArm,
        fallback_queries: ["Shared Fallback", "V5 Only Fallback"],
        yahoo_result_count: 1,
        accepted: true,
        candidate_evidence: [acceptedEvidence],
        executed_query: executedQuery,
      }],
    },
  };
  const comparison = buildRecallV5Comparison(
    [{ id: "variant-1", name: "Variant 1" }],
    [{ id: "series-1", name: "Series 1" }],
    arms,
  );
  return {
    arms,
    comparison,
    decision: buildRecallV5Decision(arms, comparison, zeroDelta),
  };
}

function buildV5Audit(count, bounded = true, allReview = false) {
  const series = { id: "series", slug: "series", name: "Series" };
  const variant = {
    id: "variant",
    slug: "variant",
    name: "Variant",
    series_id: series.id,
    variant_type: "regular",
  };
  const query = { query: "Series Variant", variant_id: variant.id, series_id: series.id };
  const diagnostics = buildSanitizedMarketRequestDiagnostics([{
    source: "rakuten_ichiba",
    query: query.query,
    request_kind: "discovery",
    ok: true,
    attempt_count: 1,
    retry_count: 0,
    retried: false,
    recovered_after_retry: false,
    failure_category: null,
    status: 200,
    timed_out: false,
    rate_limited: false,
    duration_ms: 1,
    results_returned: count,
    normalized_records: count,
    records_rejected: 0,
    rejection_reason_counts: {},
    retry_delays_ms: [],
    attempts: [{
      attempt: 1,
      status: 200,
      failure_category: null,
      timed_out: false,
      rate_limited: false,
      duration_ms: 1,
    }],
  }]);
  const records = Array.from({ length: count }, (_, index) => {
    const accepted = !allReview && index % 2 === 0;
    return {
      id: `record-${index}`,
      title: `Series Variant ${index}`,
      price: 100,
      status: "active",
      source_url: `https://example.com/${index}`,
      market_safety_assessed: true,
      market_safety: {
        accepted,
        review_required: !accepted,
        reason: accepted ? "variant_and_parent_evidence_confirmed" : "review_required",
        variant_id: variant.id,
        series_id: series.id,
        listing_type: "single",
        confidence: 0.9,
        matched_variant_ids: [variant.id],
        checks: {
          variant_evidence_present: true,
          parent_series_evidence_present: true,
          query_context_present: true,
        },
      },
      raw: {
        provider: "rakuten_ichiba",
        code: `code-${index}`,
        query,
      },
    };
  });
  return buildSanitizedMarketCandidateAudit({
    records,
    queryPlan: [query],
    catalog: {
      series: [series],
      variants: [variant],
      seriesById: new Map([[series.id, series]]),
      variantById: new Map([[variant.id, variant]]),
    },
    runContext: {
      mode: "dry-run",
      source_scope: "planner-apis",
      bounded_candidate_evidence: bounded,
    },
    summary: {
      safety_assessed_records: count,
      selected_variants: 1,
      review_required_count: records.filter((record) => record.market_safety.review_required).length,
      request_diagnostics: diagnostics,
      listing_upserts: 0,
      observations_created: 0,
      ingestion_runs_written: 0,
    },
  });
}
