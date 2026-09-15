import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOfficialReleaseCoverageCapabilityMatrix,
  buildReleaseCoverageReadinessReport,
  formatReleaseCoverageReadinessMarkdown,
} from "../scripts/lib/release-coverage-readiness.mjs";

test("capability matrix records discovery, detail, lineup, refresh, and activation envelopes", () => {
  const matrix = buildOfficialReleaseCoverageCapabilityMatrix();
  const gashaponAuto = matrix.find((entry) => entry.id === "f0_gashapon_auto");
  const tartsAuto = matrix.find((entry) => entry.id === "f0_takaratomy_auto");
  const gashaponBroad = matrix.find((entry) => entry.id === "broad_gashapon_collector");
  const tartsBroad = matrix.find((entry) => entry.id === "broad_takaratomy_collector");
  const kitan = matrix.find((entry) => entry.id === "kitan_separate_lane");
  const qualia = matrix.find((entry) => entry.id === "qualia_separate_lane");

  assert.deepEqual(
    {
      scope: gashaponAuto.discovery_scope,
      current: gashaponAuto.current_month_discovery_supported,
      future: gashaponAuto.future_month_discovery_support,
      detail: gashaponAuto.detail_limit_per_run,
      seriesCap: gashaponAuto.shared_series_write_cap_per_run,
      bucket: gashaponAuto.planning_bucket,
      list: gashaponAuto.list_discovery_capability,
      lineup: gashaponAuto.formal_lineup_capability,
      refresh: gashaponAuto.refresh_behavior,
      activation: gashaponAuto.production_activation_required,
    },
    {
      scope: "current_month",
      current: true,
      future: "none",
      detail: 2,
      seriesCap: 4,
      bucket: "current_lane",
      list: "supported",
      lineup: "supported_when_detail_parser_yields_formal_record",
      refresh: "daily_current_month_when_authorized",
      activation: true,
    },
  );
  assert.equal(tartsAuto.discovery_scope, "latest_release_ordered_page");
  assert.equal(tartsAuto.future_month_discovery_support, "not_guaranteed");
  assert.equal(tartsAuto.detail_limit_per_run, 2);
  assert.equal(gashaponBroad.future_months_guaranteed, 6);
  assert.equal(gashaponBroad.planning_bucket, "future_discovery_expansion");
  assert.equal(tartsBroad.pages_per_run, 4);
  assert.equal(tartsBroad.future_month_discovery_support, "not_calendar_guaranteed");
  assert.equal(kitan.planning_bucket, "separate_lane");
  assert.equal(kitan.diagnostic_detail_limit_per_run, 5);
  assert.equal(kitan.formal_lineup_capability, "supported_when_validated");
  assert.equal(qualia.planning_bucket, "separate_lane");
  assert.equal(qualia.formal_lineup_capability, "conditional_safe_link");
});

test("architecture gap wins while future discovery is tracked separately from the F0 cap", () => {
  const report = buildReleaseCoverageReadinessReport({
    planning_month: "2026-09",
    daily_series_cap: 4,
    freshness_slo_days: 7,
    months: [
      { month: "2026-09", catalog_count: 5, reference_count: 293, current_lane_missing: 20, separate_lane_missing: 10, unsupported_source_missing: 258 },
      { month: "2026-10", catalog_count: 2, reference_count: 215, future_discovery_missing: 18, separate_lane_missing: 5, unsupported_source_missing: 190 },
    ],
  });

  assert.equal(report.schema_version, 3);
  assert.equal(report.verdict, "COVERAGE_ARCHITECTURE_EXPANSION_REQUIRED");
  assert.equal(report.totals.current_lane_missing, 20);
  assert.equal(report.totals.future_discovery_missing, 18);
  assert.equal(report.totals.separate_lane_missing, 15);
  assert.equal(report.totals.unsupported_source_missing, 448);
  assert.equal(report.totals.days_to_current_lane_catchup_at_current_cap, 5);
  assert.equal(report.months[0].coverage_ratio, 0.0171);
  assert.equal(report.months[1].horizon, "future");
  assert.equal(report.months[1].days_to_current_lane_catchup_at_current_cap, 0);
  assert.equal(report.months[1].current_lane_can_close_full_gap, false);
  assert.deepEqual(report.workstreams, [
    "SUPPORTED_SOURCE_FRESHNESS_REPAIR",
    "FUTURE_MONTH_DISCOVERY_EXPANSION",
    "SEPARATE_REVIEWED_SOURCE_LANE",
    "ADDITIONAL_OFFICIAL_SOURCE_ONBOARDING",
  ]);
  assert.equal(report.provider_requests, 0);
  assert.equal(report.database_writes, 0);
});

test("future supported-source gap requires future discovery expansion", () => {
  const report = buildReleaseCoverageReadinessReport({
    planning_month: "2026-09",
    months: [
      { month: "2026-09", catalog_count: 100, reference_count: 100 },
      { month: "2026-10", catalog_count: 90, reference_count: 100, future_discovery_missing: 10 },
    ],
  });

  assert.equal(report.verdict, "FUTURE_DISCOVERY_EXPANSION_REQUIRED");
  assert.equal(report.totals.days_to_current_lane_catchup_at_current_cap, 0);
  assert.deepEqual(report.workstreams, ["FUTURE_MONTH_DISCOVERY_EXPANSION"]);
});

test("future month cannot be mislabeled as current-lane catch-up", () => {
  assert.throws(() => buildReleaseCoverageReadinessReport({
    planning_month: "2026-09",
    months: [
      { month: "2026-10", catalog_count: 90, reference_count: 100, current_lane_missing: 10 },
    ],
  }), /future coverage cannot be assigned to current_lane_missing/);
});

test("future discovery bucket cannot be used for current or historical month", () => {
  assert.throws(() => buildReleaseCoverageReadinessReport({
    planning_month: "2026-09",
    months: [
      { month: "2026-09", catalog_count: 90, reference_count: 100, future_discovery_missing: 10 },
    ],
  }), /future_discovery_missing requires a future month/);
});

test("separate reviewed lanes are not divided by the F0 cap", () => {
  const report = buildReleaseCoverageReadinessReport({
    planning_month: "2026-09",
    daily_series_cap: 4,
    freshness_slo_days: 7,
    months: [
      { month: "2026-09", catalog_count: 90, reference_count: 100, current_lane_missing: 0, separate_lane_missing: 10, unsupported_source_missing: 0 },
    ],
  });

  assert.equal(report.verdict, "SEPARATE_LANE_ACTION_REQUIRED");
  assert.equal(report.totals.days_to_current_lane_catchup_at_current_cap, 0);
  assert.equal(report.months[0].current_lane_can_close_full_gap, false);
  assert.equal(report.months[0].meets_freshness_slo, false);
});

test("current-lane gap can be feasible inside the SLO", () => {
  const report = buildReleaseCoverageReadinessReport({
    planning_month: "2026-09",
    daily_series_cap: 4,
    freshness_slo_days: 3,
    months: [
      { month: "2026-09", catalog_count: 88, reference_count: 100, current_lane_missing: 12 },
    ],
  });

  assert.equal(report.verdict, "CURRENT_LANE_CATCHUP_FEASIBLE");
  assert.equal(report.months[0].days_to_current_lane_catchup_at_current_cap, 3);
  assert.equal(report.months[0].meets_freshness_slo, true);
  assert.equal(report.release_coverage_slo.current_lane_catchup_days_max, 3);
  assert.equal(report.release_coverage_slo.parser_health_evidence_required_before_activation, true);
});

test("current-lane gap fails when throughput misses SLO", () => {
  const report = buildReleaseCoverageReadinessReport({
    planning_month: "2026-09",
    daily_series_cap: 4,
    freshness_slo_days: 3,
    months: [
      { month: "2026-09", catalog_count: 80, reference_count: 100, current_lane_missing: 20 },
    ],
  });

  assert.equal(report.verdict, "CURRENT_LANE_THROUGHPUT_INSUFFICIENT");
  assert.equal(report.totals.days_to_current_lane_catchup_at_current_cap, 5);
});

test("complete coverage is ready", () => {
  const report = buildReleaseCoverageReadinessReport({
    planning_month: "2026-09",
    months: [{ month: "2026-09", catalog_count: 100, reference_count: 100 }],
  });
  assert.equal(report.verdict, "COVERAGE_READY");
  assert.equal(report.totals.known_gap, 0);
  assert.deepEqual(report.workstreams, []);
});

test("unclassified reference shortfall fails closed as architecture expansion", () => {
  const report = buildReleaseCoverageReadinessReport({
    planning_month: "2026-09",
    months: [{ month: "2026-09", catalog_count: 5, reference_count: 10, current_lane_missing: 1, unsupported_source_missing: 1 }],
  });
  assert.equal(report.verdict, "COVERAGE_ARCHITECTURE_EXPANSION_REQUIRED");
  assert.equal(report.months[0].unclassified_shortfall, 3);
  assert.equal(report.totals.unclassified_shortfall, 3);
  assert.ok(report.workstreams.includes("ADDITIONAL_OFFICIAL_SOURCE_ONBOARDING"));
});

test("known gap cannot exceed reference shortfall", () => {
  assert.throws(() => buildReleaseCoverageReadinessReport({
    planning_month: "2026-09",
    months: [{ month: "2026-09", catalog_count: 9, reference_count: 10, current_lane_missing: 1, separate_lane_missing: 1 }],
  }), /known gap exceeds reference shortfall/);
});

test("planning month defaults deterministically to the earliest supplied month", () => {
  const report = buildReleaseCoverageReadinessReport({
    months: [
      { month: "2026-10", catalog_count: 10, reference_count: 10 },
      { month: "2026-09", catalog_count: 10, reference_count: 10 },
    ],
  });
  assert.equal(report.assumptions.planning_month, "2026-09");
  assert.equal(report.months[0].horizon, "current");
  assert.equal(report.months[1].horizon, "future");
});

test("markdown keeps coverage, safety, and workstream evidence visible", () => {
  const report = buildReleaseCoverageReadinessReport({
    planning_month: "2026-09",
    months: [
      { month: "2026-09", catalog_count: 5, reference_count: 10, current_lane_missing: 2, separate_lane_missing: 1, unsupported_source_missing: 2 },
      { month: "2026-10", catalog_count: 8, reference_count: 10, future_discovery_missing: 2 },
    ],
  });
  const markdown = formatReleaseCoverageReadinessMarkdown(report);
  assert.match(markdown, /COVERAGE_ARCHITECTURE_EXPANSION_REQUIRED/);
  assert.match(markdown, /\| 2026-09 \| current \| 5 \| 10 \| 50\.0% \|/);
  assert.match(markdown, /Current-lane missing: \*\*2\*\*/);
  assert.match(markdown, /Future-discovery missing: \*\*2\*\*/);
  assert.match(markdown, /Separate-lane missing: \*\*1\*\*/);
  assert.match(markdown, /FUTURE_MONTH_DISCOVERY_EXPANSION/);
  assert.match(markdown, /Provider requests: \*\*0\*\*/);
  assert.match(markdown, /Database writes: \*\*0\*\*/);
});
