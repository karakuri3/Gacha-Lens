import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOfficialReleaseCoverageCapabilityMatrix,
  buildReleaseCoverageReadinessReport,
  formatReleaseCoverageReadinessMarkdown,
} from "../lib/domain/release-coverage-readiness.js";

test("capability matrix records current main source envelopes", () => {
  const matrix = buildOfficialReleaseCoverageCapabilityMatrix();
  const gashaponAuto = matrix.find((entry) => entry.id === "f0_gashapon_auto");
  const tartsAuto = matrix.find((entry) => entry.id === "f0_takaratomy_auto");
  const gashaponBroad = matrix.find((entry) => entry.id === "broad_gashapon_collector");
  const tartsBroad = matrix.find((entry) => entry.id === "broad_takaratomy_collector");

  assert.deepEqual(
    {
      scope: gashaponAuto.discovery_scope,
      detail: gashaponAuto.detail_limit_per_run,
      seriesCap: gashaponAuto.shared_series_write_cap_per_run,
      activation: gashaponAuto.production_activation_required,
    },
    { scope: "current_month", detail: 2, seriesCap: 4, activation: true },
  );
  assert.equal(tartsAuto.discovery_scope, "latest_release_ordered_page");
  assert.equal(tartsAuto.detail_limit_per_run, 2);
  assert.equal(gashaponBroad.future_months_guaranteed, 6);
  assert.equal(tartsBroad.pages_per_run, 4);
  assert.ok(matrix.some((entry) => entry.provider === "kitan_club"));
  assert.ok(matrix.some((entry) => entry.provider === "qualia"));
});

test("architecture gap wins when unsupported sources remain", () => {
  const report = buildReleaseCoverageReadinessReport({
    daily_series_cap: 4,
    freshness_slo_days: 7,
    months: [
      { month: "2026-09", catalog_count: 5, reference_count: 293, supported_source_missing: 20, unsupported_source_missing: 268 },
      { month: "2026-10", catalog_count: 2, reference_count: 215, supported_source_missing: 18, unsupported_source_missing: 195 },
    ],
  });

  assert.equal(report.verdict, "COVERAGE_ARCHITECTURE_EXPANSION_REQUIRED");
  assert.equal(report.totals.supported_source_missing, 38);
  assert.equal(report.totals.unsupported_source_missing, 463);
  assert.equal(report.totals.days_to_supported_catchup_at_current_cap, 10);
  assert.equal(report.months[0].coverage_ratio, 0.0171);
  assert.equal(report.months[0].current_lane_can_close_full_gap, false);
  assert.equal(report.provider_requests, 0);
  assert.equal(report.database_writes, 0);
});

test("supported-source gap can be feasible inside the SLO", () => {
  const report = buildReleaseCoverageReadinessReport({
    daily_series_cap: 4,
    freshness_slo_days: 3,
    months: [
      { month: "2026-09", catalog_count: 88, reference_count: 100, supported_source_missing: 12, unsupported_source_missing: 0 },
    ],
  });

  assert.equal(report.verdict, "SUPPORTED_SOURCE_CATCHUP_FEASIBLE");
  assert.equal(report.months[0].days_to_supported_catchup_at_current_cap, 3);
  assert.equal(report.months[0].meets_freshness_slo, true);
});

test("supported-source gap fails when current throughput misses SLO", () => {
  const report = buildReleaseCoverageReadinessReport({
    daily_series_cap: 4,
    freshness_slo_days: 3,
    months: [
      { month: "2026-09", catalog_count: 80, reference_count: 100, supported_source_missing: 20, unsupported_source_missing: 0 },
    ],
  });

  assert.equal(report.verdict, "SUPPORTED_SOURCE_THROUGHPUT_INSUFFICIENT");
  assert.equal(report.totals.days_to_supported_catchup_at_current_cap, 5);
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
    months: [{ month: "2026-09", catalog_count: 5, reference_count: 10, supported_source_missing: 1, unsupported_source_missing: 1 }],
  });
  assert.equal(report.verdict, "COVERAGE_ARCHITECTURE_EXPANSION_REQUIRED");
  assert.equal(report.months[0].unclassified_shortfall, 3);
});

test("known gap cannot exceed reference shortfall", () => {
  assert.throws(() => buildReleaseCoverageReadinessReport({
    months: [{ month: "2026-09", catalog_count: 9, reference_count: 10, supported_source_missing: 1, unsupported_source_missing: 1 }],
  }), /known gap exceeds reference shortfall/);
});

test("markdown keeps safety and coverage evidence visible", () => {
  const report = buildReleaseCoverageReadinessReport({
    months: [{ month: "2026-09", catalog_count: 5, reference_count: 10, supported_source_missing: 2, unsupported_source_missing: 3 }],
  });
  const markdown = formatReleaseCoverageReadinessMarkdown(report);
  assert.match(markdown, /COVERAGE_ARCHITECTURE_EXPANSION_REQUIRED/);
  assert.match(markdown, /Provider requests: \*\*0\*\*/);
  assert.match(markdown, /Database writes: \*\*0\*\*/);
});
