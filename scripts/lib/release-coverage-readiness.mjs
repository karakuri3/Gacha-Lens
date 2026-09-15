const MONTH_RE = /^20\d{2}-(0[1-9]|1[0-2])$/;

export const OFFICIAL_RELEASE_COVERAGE_CAPABILITIES = Object.freeze([
  Object.freeze({
    id: "f0_gashapon_auto",
    provider: "bandai_gashapon",
    lane: "official_bounded_auto",
    planning_bucket: "current_lane",
    discovery_scope: "current_month",
    current_month_discovery_supported: true,
    future_month_discovery_support: "none",
    future_months_guaranteed: 0,
    list_discovery_capability: "supported",
    detail_capability: "supported_bounded",
    formal_lineup_capability: "supported_when_detail_parser_yields_formal_record",
    refresh_behavior: "daily_current_month_when_authorized",
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
    current_month_discovery_supported: true,
    future_month_discovery_support: "not_guaranteed",
    future_months_guaranteed: null,
    list_discovery_capability: "supported",
    detail_capability: "supported_bounded",
    formal_lineup_capability: "supported_when_detail_parser_yields_formal_record",
    refresh_behavior: "daily_latest_release_ordered_page_when_authorized",
    detail_limit_per_run: 2,
    shared_series_write_cap_per_run: 4,
    scheduled_frequency: "daily",
    production_activation_required: true,
  }),
  Object.freeze({
    id: "broad_gashapon_collector",
    provider: "bandai_gashapon",
    lane: "collect_official_data",
    planning_bucket: "future_discovery_expansion",
    discovery_scope: "schedule_month_range",
    current_month_discovery_supported: true,
    future_month_discovery_support: "supported_bounded_range",
    future_months_guaranteed: 6,
    list_discovery_capability: "supported",
    detail_capability: "supported_bounded",
    formal_lineup_capability: "supported_when_detail_parser_yields_formal_record",
    refresh_behavior: "manual_or_future_expansion_only_when_authorized",
    detail_limit_per_run: 60,
    shared_series_write_cap_per_run: null,
    scheduled_frequency: null,
    production_activation_required: true,
  }),
  Object.freeze({
    id: "broad_takaratomy_collector",
    provider: "takaratomy_arts",
    lane: "collect_official_data",
    planning_bucket: "future_discovery_expansion",
    discovery_scope: "latest_plus_rotating_pages",
    current_month_discovery_supported: true,
    future_month_discovery_support: "not_calendar_guaranteed",
    future_months_guaranteed: null,
    list_discovery_capability: "supported",
    detail_capability: "supported_bounded",
    formal_lineup_capability: "supported_when_detail_parser_yields_formal_record",
    refresh_behavior: "manual_or_future_expansion_rotating_pages_when_authorized",
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
    current_month_discovery_supported: true,
    future_month_discovery_support: "not_guaranteed",
    future_months_guaranteed: null,
    list_discovery_capability: "supported_diagnostic",
    detail_capability: "supported_diagnostic",
    formal_lineup_capability: "supported_when_validated",
    refresh_behavior: "diagnostic_or_separate_daily_lane_when_authorized",
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
    current_month_discovery_supported: true,
    future_month_discovery_support: "not_guaranteed",
    future_months_guaranteed: null,
    list_discovery_capability: "supported_diagnostic",
    detail_capability: "supported_diagnostic",
    formal_lineup_capability: "conditional_safe_link",
    refresh_behavior: "diagnostic_or_bounded_canary_only_when_authorized",
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
  const planningMonth = normalizePlanningMonth(input.planning_month);
  const months = normalizeMonths(input.months, planningMonth);

  const monthReports = months.map((month) => buildMonthReport(month, {
    dailySeriesCap,
    freshnessSloDays,
  }));

  const currentLaneMissing = sum(monthReports, "current_lane_missing");
  const futureDiscoveryMissing = sum(monthReports, "future_discovery_missing");
  const separateLaneMissing = sum(monthReports, "separate_lane_missing");
  const unsupportedMissing = sum(monthReports, "unsupported_source_missing");
  const totalKnownGap = currentLaneMissing + futureDiscoveryMissing + separateLaneMissing + unsupportedMissing;
  const totalReference = sum(monthReports, "reference_count");
  const totalCatalog = sum(monthReports, "catalog_count");
  const daysToCurrentLaneCatchup = currentLaneMissing === 0 ? 0 : Math.ceil(currentLaneMissing / dailySeriesCap);
  const worstCoverage = monthReports.reduce((worst, month) => {
    if (month.coverage_ratio == null) return worst;
    return worst == null ? month.coverage_ratio : Math.min(worst, month.coverage_ratio);
  }, null);
  const unclassifiedShortfall = sum(monthReports, "unclassified_shortfall");

  return {
    schema_version: 3,
    source_scope: "offline_sanitized_counts_only",
    database_writes: 0,
    provider_requests: 0,
    assumptions: {
      planning_month: planningMonth,
      current_lane_daily_series_cap: dailySeriesCap,
      freshness_slo_days: freshnessSloDays,
      reference_count_semantics: "sanitized comparison benchmark, not an authoritative market total",
      future_discovery_semantics: "supported-source future-month gaps require a separately reviewed discovery expansion and are never divided by the current F0 cap",
      separate_lane_semantics: "supported by a distinct reviewed lane; never divide by the current F0 cap",
      parser_health_evidence: "fresh read-only parser health is required separately before any activation decision",
    },
    release_coverage_slo: {
      unclassified_shortfall_allowed: 0,
      current_lane_catchup_days_max: freshnessSloDays,
      future_month_systematic_discovery_gap_allowed: 0,
      blocking_parser_health_findings_allowed: 0,
      parser_health_evidence_required_before_activation: true,
    },
    source_capabilities: buildOfficialReleaseCoverageCapabilityMatrix(),
    months: monthReports,
    totals: {
      catalog_count: totalCatalog,
      reference_count: totalReference,
      known_gap: totalKnownGap,
      current_lane_missing: currentLaneMissing,
      future_discovery_missing: futureDiscoveryMissing,
      separate_lane_missing: separateLaneMissing,
      unsupported_source_missing: unsupportedMissing,
      unclassified_shortfall: unclassifiedShortfall,
      days_to_current_lane_catchup_at_current_cap: daysToCurrentLaneCatchup,
      worst_coverage_ratio: round(worstCoverage),
    },
    workstreams: buildWorkstreams({
      currentLaneMissing,
      futureDiscoveryMissing,
      separateLaneMissing,
      unsupportedMissing,
      unclassifiedShortfall,
    }),
    verdict: readinessVerdict({
      monthReports,
      currentLaneMissing,
      futureDiscoveryMissing,
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
    month.horizon,
    month.catalog_count,
    month.reference_count,
    formatPercent(month.coverage_ratio),
    month.current_lane_missing,
    month.future_discovery_missing,
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
    "| Month | Horizon | Catalog | Reference | Coverage | Current-lane missing | Future-discovery missing | Separate-lane missing | Unsupported missing | Current-lane catch-up days | Current lane closes full gap | Meets SLO |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :---: | :---: |",
    ...rows.map((row) => `| ${row.join(" | ")} |`),
    "",
    `- Worst benchmark coverage: **${formatPercent(report.totals.worst_coverage_ratio)}**`,
    `- Known gap: **${report.totals.known_gap}**`,
    `- Current-lane missing: **${report.totals.current_lane_missing}**`,
    `- Future-discovery missing: **${report.totals.future_discovery_missing}**`,
    `- Separate-lane missing: **${report.totals.separate_lane_missing}**`,
    `- Unsupported-source missing: **${report.totals.unsupported_source_missing}**`,
    `- Unclassified shortfall: **${report.totals.unclassified_shortfall}**`,
    `- Current-lane catch-up at current cap: **${report.totals.days_to_current_lane_catchup_at_current_cap} day(s)**`,
    `- Workstreams: **${report.workstreams.join(", ") || "none"}**`,
    "- Provider requests: **0**",
    "- Database writes: **0**",
    "",
  ].join("\n");
}

function buildMonthReport(month, { dailySeriesCap, freshnessSloDays }) {
  if (month.horizon === "future" && month.current_lane_missing > 0) {
    throw new Error(`month ${month.month} future coverage cannot be assigned to current_lane_missing`);
  }
  if (month.horizon !== "future" && month.future_discovery_missing > 0) {
    throw new Error(`month ${month.month} future_discovery_missing requires a future month`);
  }

  const totalShortfall = Math.max(0, month.reference_count - month.catalog_count);
  const knownGap = month.current_lane_missing + month.future_discovery_missing
    + month.separate_lane_missing + month.unsupported_source_missing;
  if (knownGap > totalShortfall) {
    throw new Error(`month ${month.month} known gap exceeds reference shortfall`);
  }

  const catchupDays = month.current_lane_missing === 0
    ? 0
    : Math.ceil(month.current_lane_missing / dailySeriesCap);
  const unclassifiedShortfall = totalShortfall - knownGap;
  const currentLaneCanCloseFullGap = month.horizon === "current"
    && month.future_discovery_missing === 0
    && month.separate_lane_missing === 0
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
  futureDiscoveryMissing,
  separateLaneMissing,
  unsupportedMissing,
  daysToCurrentLaneCatchup,
  freshnessSloDays,
}) {
  if (monthReports.every((month) => month.reference_shortfall === 0)) return "COVERAGE_READY";
  if (unsupportedMissing > 0 || monthReports.some((month) => month.unclassified_shortfall > 0)) {
    return "COVERAGE_ARCHITECTURE_EXPANSION_REQUIRED";
  }
  if (futureDiscoveryMissing > 0) return "FUTURE_DISCOVERY_EXPANSION_REQUIRED";
  if (separateLaneMissing > 0) return "SEPARATE_LANE_ACTION_REQUIRED";
  if (currentLaneMissing > 0 && daysToCurrentLaneCatchup > freshnessSloDays) {
    return "CURRENT_LANE_THROUGHPUT_INSUFFICIENT";
  }
  return "CURRENT_LANE_CATCHUP_FEASIBLE";
}

function buildWorkstreams({
  currentLaneMissing,
  futureDiscoveryMissing,
  separateLaneMissing,
  unsupportedMissing,
  unclassifiedShortfall,
}) {
  return [
    currentLaneMissing > 0 ? "SUPPORTED_SOURCE_FRESHNESS_REPAIR" : null,
    futureDiscoveryMissing > 0 ? "FUTURE_MONTH_DISCOVERY_EXPANSION" : null,
    separateLaneMissing > 0 ? "SEPARATE_REVIEWED_SOURCE_LANE" : null,
    unsupportedMissing > 0 || unclassifiedShortfall > 0 ? "ADDITIONAL_OFFICIAL_SOURCE_ONBOARDING" : null,
  ].filter(Boolean);
}

function normalizePlanningMonth(value) {
  const month = String(value ?? "").trim();
  if (!MONTH_RE.test(month)) throw new Error("planning_month must be explicit YYYY-MM");
  return month;
}

function normalizeMonths(value, planningMonth) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 24) {
    throw new Error("months must contain between 1 and 24 entries");
  }
  const seen = new Set();
  return value.map((entry) => {
    const month = String(entry?.month ?? "").trim();
    if (!MONTH_RE.test(month) || seen.has(month)) throw new Error("month keys must be unique YYYY-MM values");
    if (month < planningMonth) throw new Error(`month ${month} precedes planning_month; current/future coverage only`);
    seen.add(month);
    return {
      month,
      horizon: month === planningMonth ? "current" : "future",
      catalog_count: nonNegativeInteger(entry.catalog_count, `${month}.catalog_count`),
      reference_count: nonNegativeInteger(entry.reference_count, `${month}.reference_count`),
      current_lane_missing: nonNegativeInteger(entry.current_lane_missing ?? 0, `${month}.current_lane_missing`),
      future_discovery_missing: nonNegativeInteger(entry.future_discovery_missing ?? 0, `${month}.future_discovery_missing`),
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
