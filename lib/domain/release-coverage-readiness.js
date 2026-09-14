const MONTH_RE = /^20\d{2}-(0[1-9]|1[0-2])$/;

export const OFFICIAL_RELEASE_COVERAGE_CAPABILITIES = Object.freeze([
  Object.freeze({
    id: "f0_gashapon_auto",
    provider: "bandai_gashapon",
    lane: "official_bounded_auto",
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
    discovery_scope: "provider_archive",
    future_months_guaranteed: null,
    detail_limit_per_run: 5,
    shared_series_write_cap_per_run: null,
    scheduled_frequency: "separate_daily_when_authorized",
    production_activation_required: true,
  }),
  Object.freeze({
    id: "qualia_separate_lane",
    provider: "qualia",
    lane: "separate_readiness_and_bounded_canary",
    discovery_scope: "provider_archive_and_lineup_archive",
    future_months_guaranteed: null,
    detail_limit_per_run: 5,
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

  const supportedMissing = sum(monthReports, "supported_source_missing");
  const unsupportedMissing = sum(monthReports, "unsupported_source_missing");
  const totalKnownGap = supportedMissing + unsupportedMissing;
  const totalReference = sum(monthReports, "reference_count");
  const totalCatalog = sum(monthReports, "catalog_count");
  const daysToSupportedCatchup = supportedMissing === 0 ? 0 : Math.ceil(supportedMissing / dailySeriesCap);
  const worstCoverage = monthReports.reduce((worst, month) => {
    if (month.coverage_ratio == null) return worst;
    return worst == null ? month.coverage_ratio : Math.min(worst, month.coverage_ratio);
  }, null);

  return {
    schema_version: 1,
    source_scope: "offline_sanitized_counts_only",
    database_writes: 0,
    provider_requests: 0,
    assumptions: {
      daily_series_cap: dailySeriesCap,
      freshness_slo_days: freshnessSloDays,
      reference_count_semantics: "sanitized comparison benchmark, not an authoritative market total",
    },
    source_capabilities: buildOfficialReleaseCoverageCapabilityMatrix(),
    months: monthReports,
    totals: {
      catalog_count: totalCatalog,
      reference_count: totalReference,
      known_gap: totalKnownGap,
      supported_source_missing: supportedMissing,
      unsupported_source_missing: unsupportedMissing,
      days_to_supported_catchup_at_current_cap: daysToSupportedCatchup,
      worst_coverage_ratio: round(worstCoverage),
    },
    verdict: readinessVerdict({
      monthReports,
      supportedMissing,
      unsupportedMissing,
      daysToSupportedCatchup,
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
    month.supported_source_missing,
    month.unsupported_source_missing,
    month.days_to_supported_catchup_at_current_cap,
    month.current_lane_can_close_full_gap ? "yes" : "no",
    month.meets_freshness_slo ? "yes" : "no",
  ]);

  return [
    "# Official release coverage readiness",
    "",
    `Verdict: **${report.verdict}**`,
    "",
    "| Month | Catalog | Reference | Coverage | Supported missing | Unsupported missing | Catch-up days | Current lane closes full gap | Meets SLO |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | :---: | :---: |",
    ...rows.map((row) => `| ${row.join(" | ")} |`),
    "",
    `- Known gap: **${report.totals.known_gap}**`,
    `- Supported-source missing: **${report.totals.supported_source_missing}**`,
    `- Unsupported-source missing: **${report.totals.unsupported_source_missing}**`,
    `- Supported catch-up at current cap: **${report.totals.days_to_supported_catchup_at_current_cap} day(s)**`,
    "- Provider requests: **0**",
    "- Database writes: **0**",
    "",
  ].join("\n");
}

function buildMonthReport(month, { dailySeriesCap, freshnessSloDays }) {
  const totalShortfall = Math.max(0, month.reference_count - month.catalog_count);
  const knownGap = month.supported_source_missing + month.unsupported_source_missing;
  if (knownGap > totalShortfall) {
    throw new Error(`month ${month.month} known gap exceeds reference shortfall`);
  }

  const catchupDays = month.supported_source_missing === 0
    ? 0
    : Math.ceil(month.supported_source_missing / dailySeriesCap);
  const currentLaneCanCloseFullGap = month.unsupported_source_missing === 0;

  return {
    ...month,
    coverage_ratio: month.reference_count === 0 ? null : round(month.catalog_count / month.reference_count),
    reference_shortfall: totalShortfall,
    known_gap: knownGap,
    unclassified_shortfall: totalShortfall - knownGap,
    days_to_supported_catchup_at_current_cap: catchupDays,
    current_lane_can_close_full_gap: currentLaneCanCloseFullGap,
    meets_freshness_slo: currentLaneCanCloseFullGap && catchupDays <= freshnessSloDays,
  };
}

function readinessVerdict({ monthReports, supportedMissing, unsupportedMissing, daysToSupportedCatchup, freshnessSloDays }) {
  if (monthReports.every((month) => month.reference_shortfall === 0)) return "COVERAGE_READY";
  if (unsupportedMissing > 0 || monthReports.some((month) => month.unclassified_shortfall > 0)) {
    return "COVERAGE_ARCHITECTURE_EXPANSION_REQUIRED";
  }
  if (supportedMissing > 0 && daysToSupportedCatchup > freshnessSloDays) {
    return "SUPPORTED_SOURCE_THROUGHPUT_INSUFFICIENT";
  }
  return "SUPPORTED_SOURCE_CATCHUP_FEASIBLE";
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
      supported_source_missing: nonNegativeInteger(entry.supported_source_missing ?? 0, `${month}.supported_source_missing`),
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
