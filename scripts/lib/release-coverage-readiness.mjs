const MONTH_RE = /^20\d{2}-(0[1-9]|1[0-2])$/;

export const OFFICIAL_RELEASE_COVERAGE_CAPABILITIES = Object.freeze([
  Object.freeze({
    id: "f0_gashapon_auto",
    provider: "bandai_gashapon",
    lane: "official_bounded_auto",
    planning_bucket: "current_lane",
    discovery_scope: "current_month",
    future_months_guaranteed: 0,
    detail_limit_per_run: 2,
    shared_series_write_cap_per_run: 4,
    scheduled_frequency: "daily",
    production_activation_required: true,
  }),
  Object.freeze({
    id: "f0_takaratomy_auto",
    provider: "takaratomy_arts",
    lane: "official_bounded_auto",
    planning_bucket: "current_lane",
    discovery_scope: "latest_release_ordered_page",
    future_months_guaranteed: null,
    detail_limit_per_run: 2,
    shared_series_write_cap_per_run: 4,
    scheduled_frequency: "daily",
    production_activation_required: true,
  }),
  Object.freeze({
    id: "broad_gashapon_collector",
    provider: "bandai_gashapon",
    lane: "collect_official_data",
    planning_bucket: "diagnostic_or_future_expansion",
    discovery_scope: "schedule_month_range",
    future_months_guaranteed: 6,
    detail_limit_per_run: 60,
    shared_series_write_cap_per_run: null,
    scheduled_frequency: null,
    production_activation_required: true,
  }),
  Object.freeze({
    id: "broad_takaratomy_collector",
    provider: "takaratomy_arts",
    lane: "collect_official_data",
    planning_bucket: "diagnostic_or_future_expansion",
    discovery_scope: "latest_plus_rotating_pages",
    future_months_guaranteed: null,
    detail_limit_per_run: 60,
    pages_per_run: 4,
    shared_series_write_cap_per_run: null,
    scheduled_frequency: null,
    production_activation_required: true,
  }),
  Object.freeze({
    id: "kitan_separate_lane",
    provider: "kitan_club",
    lane: "separate_readiness_and_bounded_auto",
    planning_bucket: "separate_lane",
    discovery_scope: "provider_archive",
    future_months_guaranteed: null,
    diagnostic_detail_limit_per_run: 5,
    shared_series_write_cap_per_run: null,
    scheduled_frequency: "separate_daily_when_authorized",
    production_activation_required: true,
  }),
  Object.freeze({
    id: "qualia_separate_lane",
    provider: "qualia",
    lane: "separate_readiness_and_bounded_canary",
    planning_bucket: "separate_lane",
    discovery_scope: "provider_archive_and_lineup_archive",
    future_months_guaranteed: null,
    diagnostic_detail_limit_per_run: 5,
    shared_series_write_cap_per_run: null,
    scheduled_frequency: null,
    production_activation_required: true,
  }),
]);

export function buildOfficialReleaseCoverageCapabilityMatrix() {
  return OFFICIAL_RELEASE_COVERAGE_CAPABILITIES.map((entry) => ({ ...entry }));
}

export function buildReleaseCoverageReadinessReport(input = {}) {
  const dailySeriesCap = positiveInteger(input.daily_series_cap ?? 4, "daily_series_cap");
  const freshnessSloDays = positiveInteger(input.freshness_slo_days ?? 7, "freshness_slo_days");
  const months = normalizeMonths(input.months);

  const monthReports = months.map((month) => buildMonthReport(month, {
    dailySeriesCap,
    freshnessSloDays,
  }));

  const currentLaneMissing = sum(monthReports, "current_lane_missing");
  const separateLaneMissing = sum(monthReports, "separate_lane_missing");
  const unsupportedMissing = sum(monthReports, "unsupported_source_missing");
  const totalKnownGap = currentLaneMissing + separateLaneMissing + unsupportedMissing;
  const totalReference = sum(monthReports, "reference_count");
  const totalCatalog = sum(monthReports, "catalog_count");
  const daysToCurrentLaneCatchup = currentLaneMissing === 0 ? 0 : Math.ceil(currentLaneMissing / dailySeriesCap);
  const worstCoverage = monthReports.reduce((worst, month) => {
    if (month.coverage_ratio == null) return worst;
    return worst == null ? month.coverage_ratio : Math.min(worst, month.coverage_ratio);
  }, null);

  return {
    schema_version: 2,
    source_scope: "offline_sanitized_counts_only",
    database_writes: 0,
    provider_requests: 0,
    assumptions: {
      current_lane_daily_series_cap: dailySeriesCap,
      freshness_slo_days: freshnessSloDays,
      reference_count_semantics: "sanitized comparison benchmark, not an authoritative market total",
      separate_lane_semantics: "supported by a distinct reviewed lane; never divide by the current F0 cap",
    },
    source_capabilities: buildOfficialReleaseCoverageCapabilityMatrix(),
    months: monthReports,
    totals: {
      catalog_count: totalCatalog,
      reference_count: totalReference,
      known_gap: totalKnownGap,
      current_lane_missing: currentLaneMissing,
      separate_lane_missing: separateLaneMissing,
      unsupported_source_missing: unsupportedMissing,
      days_to_current_lane_catchup_at_current_cap: daysToCurrentLaneCatchup,
      worst_coverage_ratio: round(worstCoverage),
    },
    verdict: readinessVerdict({
      monthReports,
      currentLaneMissing,
      separateLaneMissing,
      unsupportedMissing,
      daysToCurrentLaneCatchup,
      freshnessSloDays,
    }),
  };
}

export function formatReleaseCoverageReadinessMarkdown(report) {
  const rows = report.months.map((month) => [
    month.month,
    month.catalog_count,
    month.reference_count,
    formatPercent(month.coverage_ratio),
    month.current_lane_missing,
    month.separate_lane_missing,
    month.unsupported_source_missing,
    month.days_to_current_lane_catchup_at_current_cap,
    month.current_lane_can_close_full_gap ? "yes" : "no",
    month.meets_freshness_slo ? "yes" : "no",
  ]);

  return [
    "# Official release coverage readiness",
    "",
    `Verdict: **${report.verdict}**`,
    "",
    "| Month | Catalog | Reference | Current-lane missing | Separate-lane missing | Unsupported missing | Current-lane catch-up days | Current lane closes full gap | Meets SLO |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | :---: | :---: |",
    ...rows.map((row) => `| ${row[0]} | ${row[1]} | ${row[2]} | ${row[4]} | ${row[5]} | ${row[6]} | ${row[7]} | ${row[8]} | ${row[9]} |`),
    "",
    `- Worst benchmark coverage: **${formatPercent(report.totals.worst_coverage_ratio)}**`,
    `- Known gap: **${report.totals.known_gap}**`,
    `- Current-lane missing: **${report.totals.current_lane_missing}**`,
    `- Separate-lane missing: **${report.totals.separate_lane_missing}**`,
    `- Unsupported-source missing: **${report.totals.unsupported_source_missing}**`,
    `- Current-lane catch-up at current cap: **${report.totals.days_to_current_lane_catchup_at_current_cap} day(s)**`,
    "- Provider requests: **0**",
    "- Database writes: **0**",
    "",
  ].join("\n");
}

function buildMonthReport(month, { dailySeriesCap, freshnessSloDays }) {
  const totalShortfall = Math.max(0, month.reference_count - month.catalog_count);
  const knownGap = month.current_lane_missing + month.separate_lane_missing + month.unsupported_source_missing;
  if (knownGap > totalShortfall) {
    throw new Error(`month ${month.month} known gap exceeds reference shortfall`);
  }

  const catchupDays = month.current_lane_missing === 0
    ? 0
    : Math.ceil(month.current_lane_missing / dailySeriesCap);
  const unclassifiedShortfall = totalShortfall - knownGap;
  const currentLaneCanCloseFullGap = month.separate_lane_missing === 0
    && month.unsupported_source_missing === 0
    && unclassifiedShortfall === 0;

  return {
    ...month,
    coverage_ratio: month.reference_count === 0 ? null : round(month.catalog_count / month.reference_count),
    reference_shortfall: totalShortfall,
    known_gap: knownGap,
    unclassified_shortfall: unclassifiedShortfall,
    days_to_current_lane_catchup_at_current_cap: catchupDays,
    current_lane_can_close_full_gap: currentLaneCanCloseFullGap,
    meets_freshness_slo: currentLaneCanCloseFullGap && catchupDays <= freshnessSloDays,
  };
}

function readinessVerdict({
  monthReports,
  currentLaneMissing,
  separateLaneMissing,
  unsupportedMissing,
  daysToCurrentLaneCatchup,
  freshnessSloDays,
}) {
  if (monthReports.every((month) => month.reference_shortfall === 0)) return "COVERAGE_READY";
  if (unsupportedMissing > 0 || monthReports.some((month) => month.unclassified_shortfall > 0)) {
    return "COVERAGE_ARCHITECTURE_EXPANSION_REQUIRED";
  }
  if (separateLaneMissing > 0) return "SEPARATE_LANE_ACTION_REQUIRED";
  if (currentLaneMissing > 0 && daysToCurrentLaneCatchup > freshnessSloDays) {
    return "CURRENT_LANE_THROUGHPUT_INSUFFICIENT";
  }
  return "CURRENT_LANE_CATCHUP_FEASIBLE";
}

function normalizeMonths(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 24) {
    throw new Error("months must contain between 1 and 24 entries");
  }
  const seen = new Set();
  return value.map((entry) => {
    const month = String(entry?.month ?? "").trim();
    if (!MONTH_RE.test(month) || seen.has(month)) throw new Error("month keys must be unique YYYY-MM values");
    seen.add(month);
    return {
      month,
      catalog_count: nonNegativeInteger(entry.catalog_count, `${month}.catalog_count`),
      reference_count: nonNegativeInteger(entry.reference_count, `${month}.reference_count`),
      current_lane_missing: nonNegativeInteger(entry.current_lane_missing ?? 0, `${month}.current_lane_missing`),
      separate_lane_missing: nonNegativeInteger(entry.separate_lane_missing ?? 0, `${month}.separate_lane_missing`),
      unsupported_source_missing: nonNegativeInteger(entry.unsupported_source_missing ?? 0, `${month}.unsupported_source_missing`),
    };
  }).sort((left, right) => left.month.localeCompare(right.month));
}

function nonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(`${label} must be a non-negative integer`);
  return number;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer`);
  return number;
}

function sum(values, field) {
  return values.reduce((total, value) => total + Number(value[field] ?? 0), 0);
}

function round(value) {
  return value == null ? null : Math.round(value * 10_000) / 10_000;
}

function formatPercent(value) {
  return value == null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}
