import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOfficialReleaseCoverageCapabilityMatrix,
  buildReleaseCoverageReadinessReport,
  formatReleaseCoverageReadinessMarkdown,
} from "../scripts/lib/release-coverage-readiness.mjs";

test("capability matrix records current and separate source envelopes", () => {
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
      detail: gashaponAuto.detail_limit_per_run,
      seriesCap: gashaponAuto.shared_series_write_cap_per_run,
      bucket: gashaponAuto.planning_bucket,
      activation: gashaponAuto.production_activation_required,
    },
    { scope: "current_month", detail: 2, seriesCap: 4, bucket: "current_lane", activation: true },
  );
  assert.equal(tartsAuto.discovery_scope, "latest_release_ordered_page");
  assert.equal(tartsAuto.detail_limit_per_run, 2);
  assert.equal(gashaponBroad.future_months_guaranteed, 6);
  assert.equal(tartsBroad.pages_per_run, 4);
  assert.equal(kitan.planning_bucket, "separate_lane");
  assert.equal(kitan.diagnostic_detail_limit_per_run, 5);
  assert.equal(qualia.planning_bucket, "separate_lane");
});

test("architecture gap wins when unsupported sources remain", () => {
  const report = buildReleaseCoverageReadinessReport({
    daily_series_cap: 4,
    freshness_slo_days: 7,
    months: [
      { month: "2026-09", catalog_count: 5, reference_count: 293, current_lane_missing: 20, separate_lane_missing: 10, unsupported_source_missing: 258 },
      { month: "2026-10", catalog_count: 2, reference_count: 215, current_lane_missing: 18, separate_lane_missing: 5, unsupported_source_missing: 190 },
    ],
  });

  assert.equal(report.verdict, "COVERAGE_ARCHITECTURE_EXPANSION_REQUIRED");
  assert.equal(report.totals.current_lane_missing, 38);
  assert.equal(report.totals.separate_lane_missing, 15);
  assert.equal(report.totals.unsupported_source_missing, 448);
  assert.equal(report.totals.days_to_current_lane_catchup_at_current_cap, 10);
  assert.equal(report.months[0].coverage_ratio, 0.0171);
  assert.equal(report.months[0].current_lane_can_close_full_gap, false);
  assert.equal(report.provider_requests, 0);
  assert.equal(report.database_writes, 0);
});

test("separate reviewed lanes are not divided by the F0 cap", () => {
  const report = buildReleaseCoverageReadinessReport({
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
    daily_series_cap: 4,
    freshness_slo_days: 3,
    months: [
      { month: "2026-09", catalog_count: 88, reference_count: 100, current_lane_missing: 12 },
    ],
  });

  assert.equal(report.verdict, "CURRENT_LANE_CATCHUP_FEASIBLE");
  assert.equal(report.months[0].days_to_current_lane_catchup_at_current_cap, 3);
  assert.equal(report.months[0].meets_freshness_slo, true);
});

test("current-lane gap fails when throughput misses SLO", () => {
  const report = buildReleaseCoverageReadinessReport({
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
    months: [{ month: "2026-09", catalog_count: 100, reference_count: 100 }],
  });
  assert.equal(report.verdict, "COVERAGE_READY");
  assert.equal(report.totals.known_gap, 0);
});

test("unclassified reference shortfall fails closed as architecture expansion", () => {
  const report = buildReleaseCoverageReadinessReport({
    months: [{ month: "2026-09", catalog_count: 5, reference_count: 10, current_lane_missing: 1, unsupported_source_missing: 1 }],
  });
  assert.equal(report.verdict, "COVERAGE_ARCHITECTURE_EXPANSION_REQUIRED");
  assert.equal(report.months[0].unclassified_shortfall, 3);
});

test("known gap cannot exceed reference shortfall", () => {
  assert.throws(() => buildReleaseCoverageReadinessReport({
    months: [{ month: "2026-09", catalog_count: 9, reference_count: 10, current_lane_missing: 1, separate_lane_missing: 1 }],
  }), /known gap exceeds reference shortfall/);
});

test("markdown keeps safety and lane evidence visible", () => {
  const report = buildReleaseCoverageReadinessReport({
    months: [{ month: "2026-09", catalog_count: 5, reference_count: 10, current_lane_missing: 2, separate_lane_missing: 1, unsupported_source_missing: 2 }],
  });
  const markdown = formatReleaseCoverageReadinessMarkdown(report);
  assert.match(markdown, /COVERAGE_ARCHITECTURE_EXPANSION_REQUIRED/);
  assert.match(markdown, /Current-lane missing: \*\*2\*\*/);
  assert.match(markdown, /Separate-lane missing: \*\*1\*\*/);
  assert.match(markdown, /Provider requests: \*\*0\*\*/);
  assert.match(markdown, /Database writes: \*\*0\*\*/);
});
