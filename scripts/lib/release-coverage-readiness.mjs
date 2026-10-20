const MONTH_RE = /^20\d{2}-(0[1-9]|1[0-2])$/;
const CURRENT_LANE_DAILY_SERIES_CAP = 4;
const CURRENT_LANE_RUNS_PER_DAY = 1;
const CURRENT_LANE_PROVIDER_DAILY_CAPS = Object.freeze({
  bandai_gashapon: 2,
  takaratomy_arts: 2,
});
const CURRENT_LANE_PROVIDERS = Object.freeze(Object.keys(CURRENT_LANE_PROVIDER_DAILY_CAPS));

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
  const countUnit = normalizeCountUnit(input.count_unit);
  const dailySeriesCap = normalizeCurrentLaneDailySeriesCap(input.daily_series_cap);
  const freshnessSloDays = positiveInteger(input.freshness_slo_days ?? 7, "freshness_slo_days");
  const currentLaneRunsPerDay = normalizeCurrentLaneRunsPerDay(input.current_lane_runs_per_day);
  const currentLaneEnabled = normalizeBoolean(input.current_lane_enabled ?? true, "current_lane_enabled");
  const parserHealth = normalizeParserHealth(input.parser_health);
  const unsupportedSourceUniverseKnown = normalizeBoolean(
    input.unsupported_source_universe_known ?? false,
    "unsupported_source_universe_known",
  );
  const planningMonth = normalizePlanningMonth(input.planning_month);
  const months = normalizeMonths(input.months, planningMonth);

  const monthReports = months.map((month) => buildMonthReport(month, {
    dailySeriesCap,
    freshnessSloDays,
    currentLaneRunsPerDay,
    unsupportedSourceUniverseKnown,
  }));

  const currentLaneMissing = sum(monthReports, "current_lane_missing");
  const futureDiscoveryMissing = sum(monthReports, "future_discovery_missing");
  const separateLaneMissing = sum(monthReports, "separate_lane_missing");
  const unsupportedMissing = sum(monthReports, "unsupported_source_missing");
  const totalKnownGap = currentLaneMissing + futureDiscoveryMissing + separateLaneMissing + unsupportedMissing;
  const totalReference = sum(monthReports, "reference_count");
  const totalCatalog = sum(monthReports, "catalog_count");
  const runsToCurrentLaneCatchup = Math.max(0, ...monthReports.map((month) => month.runs_to_current_lane_catchup_at_current_cap));
  const daysToCurrentLaneCatchup = Math.max(0, ...monthReports.map((month) => month.days_to_current_lane_catchup_at_current_cap));
  const worstCoverage = monthReports.reduce((worst, month) => {
    if (month.coverage_ratio == null) return worst;
    return worst == null ? month.coverage_ratio : Math.min(worst, month.coverage_ratio);
  }, null);
  const unclassifiedShortfall = sum(monthReports, "unclassified_shortfall");
  const staleSupportedShortfall = currentLaneMissing + futureDiscoveryMissing + separateLaneMissing;
  const totalShortfall = sum(monthReports, "reference_shortfall");
  const aggregateCoverageRatio = totalReference === 0 ? null : round(totalCatalog / totalReference);
  const currentLaneCanMeetRequestedSlo = currentLaneEnabled
    && unsupportedSourceUniverseKnown
    && parserHealth.status === "fresh"
    && parserHealth.blocking_findings === 0
    && futureDiscoveryMissing === 0
    && separateLaneMissing === 0
    && unsupportedMissing === 0
    && unclassifiedShortfall === 0
    && daysToCurrentLaneCatchup <= freshnessSloDays;
  const bottleneckReason = determineCoverageBottleneck({
    currentLaneEnabled,
    unsupportedSourceUniverseKnown,
    parserHealth,
    currentLaneMissing,
    futureDiscoveryMissing,
    separateLaneMissing,
    unsupportedMissing,
    unclassifiedShortfall,
    daysToCurrentLaneCatchup,
    freshnessSloDays,
  });

  return {
    schema_version: 6,
    source_scope: "offline_sanitized_counts_only",
    database_writes: 0,
    provider_requests: 0,
    assumptions: {
      planning_month: planningMonth,
      count_unit: countUnit,
      current_lane_daily_series_cap: dailySeriesCap,
      current_lane_provider_daily_caps: { ...CURRENT_LANE_PROVIDER_DAILY_CAPS },
      current_lane_runs_per_day: currentLaneRunsPerDay,
      current_lane_enabled: currentLaneEnabled,
      unsupported_source_universe_known: unsupportedSourceUniverseKnown,
      freshness_slo_days: freshnessSloDays,
      reference_count_semantics: "sanitized like-for-like series benchmark, not an authoritative market total",
      future_discovery_semantics: "supported-source future-month gaps require a separately reviewed discovery expansion and are never divided by the current F0 cap",
      separate_lane_semantics: "supported by a distinct reviewed lane; never divide by the current F0 cap",
      parser_health_evidence: "fresh read-only parser health is required separately before any activation decision",
      unsupported_source_universe_semantics: "when false, unsupported-source missing is unknown and must never be inferred as zero from observed catalog rows",
    },
    release_coverage_slo: {
      unclassified_shortfall_allowed: 0,
      current_lane_catchup_days_max: freshnessSloDays,
      future_month_systematic_discovery_gap_allowed: 0,
      blocking_parser_health_findings_allowed: 0,
      parser_health_evidence_required_before_activation: true,
      unsupported_source_universe_evidence_required: true,
      current_lane_enabled_required: true,
    },
    parser_health: parserHealth,
    source_capabilities: buildOfficialReleaseCoverageCapabilityMatrix(),
    months: monthReports,
    totals: {
      catalog_count: totalCatalog,
      reference_count: totalReference,
      coverage_ratio: aggregateCoverageRatio,
      shortfall: totalShortfall,
      known_gap: totalKnownGap,
      stale_supported_shortfall: staleSupportedShortfall,
      unsupported_source_shortfall: unsupportedSourceUniverseKnown ? unsupportedMissing : null,
      current_lane_missing: currentLaneMissing,
      future_discovery_missing: futureDiscoveryMissing,
      separate_lane_missing: separateLaneMissing,
      unsupported_source_missing: unsupportedSourceUniverseKnown ? unsupportedMissing : null,
      unsupported_source_universe_known: unsupportedSourceUniverseKnown,
      unclassified_shortfall: unclassifiedShortfall,
      projected_catchup_runs: runsToCurrentLaneCatchup,
      projected_catchup_days: daysToCurrentLaneCatchup,
      effective_projected_catchup_days: currentLaneEnabled ? daysToCurrentLaneCatchup : null,
      runs_to_current_lane_catchup_at_current_cap: runsToCurrentLaneCatchup,
      days_to_current_lane_catchup_at_current_cap: daysToCurrentLaneCatchup,
      current_lane_can_meet_requested_slo: currentLaneCanMeetRequestedSlo,
      bottleneck_reason: bottleneckReason,
      worst_coverage_ratio: round(worstCoverage),
    },
    workstreams: buildWorkstreams({
      currentLaneMissing,
      futureDiscoveryMissing,
      separateLaneMissing,
      unsupportedMissing,
      unsupportedSourceUniverseKnown,
      unclassifiedShortfall,
    }),
    verdict: readinessVerdict({
      monthReports,
      currentLaneMissing,
      futureDiscoveryMissing,
      separateLaneMissing,
      unsupportedMissing,
      unsupportedSourceUniverseKnown,
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
    report.assumptions.unsupported_source_universe_known ? month.unsupported_source_missing : "unknown",
    month.days_to_current_lane_catchup_at_current_cap,
    month.current_lane_can_close_full_gap ? "yes" : "no",
    month.meets_freshness_slo ? "yes" : "no",
  ]);

  return [
    "# Official release coverage readiness",
    "",
    `Verdict: **${report.verdict}**`,
    `Count unit: **${report.assumptions.count_unit}**`,
    "",
    "| Month | Horizon | Catalog | Reference | Coverage | Current-lane missing | Future-discovery missing | Separate-lane missing | Unsupported missing | Current-lane catch-up days | Current lane closes full gap | Meets SLO |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :---: | :---: |",
    ...rows.map((row) => `| ${row.join(" | ")} |`),
    "",
    `- Aggregate benchmark coverage: **${formatPercent(report.totals.coverage_ratio)}**`,
    `- Worst benchmark coverage: **${formatPercent(report.totals.worst_coverage_ratio)}**`,
    `- Shortfall: **${report.totals.shortfall}**`,
    `- Stale-supported shortfall: **${report.totals.stale_supported_shortfall}**`,
    `- Unsupported-source shortfall: **${report.totals.unsupported_source_shortfall == null ? "unknown" : report.totals.unsupported_source_shortfall}**`,
    `- Known gap: **${report.totals.known_gap}**`,
    `- Current-lane missing: **${report.totals.current_lane_missing}**`,
    `- Future-discovery missing: **${report.totals.future_discovery_missing}**`,
    `- Separate-lane missing: **${report.totals.separate_lane_missing}**`,
    `- Unsupported-source missing: **${report.totals.unsupported_source_missing == null ? "unknown" : report.totals.unsupported_source_missing}**`,
    `- Unclassified shortfall: **${report.totals.unclassified_shortfall}**`,
    `- Current-lane catch-up at current cap: **${report.totals.projected_catchup_runs} run(s) / ${report.totals.projected_catchup_days} day(s)**`,
    `- Current lane meets requested SLO: **${report.totals.current_lane_can_meet_requested_slo ? "yes" : "no"}**`,
    `- Bottleneck reason: **${report.totals.bottleneck_reason || "none"}**`,
    `- Parser health: **${report.parser_health.status}** (blocking findings: ${report.parser_health.blocking_findings})`,
    `- Workstreams: **${report.workstreams.join(", ") || "none"}**`,
    "- Provider requests: **0**",
    "- Database writes: **0**",
    "",
  ].join("\n");
}

function buildMonthReport(month, {
  dailySeriesCap,
  freshnessSloDays,
  currentLaneRunsPerDay,
  unsupportedSourceUniverseKnown,
}) {
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

  const catchupRuns = currentLaneCatchupRuns({
    totalMissing: month.current_lane_missing,
    byProvider: month.current_lane_missing_by_provider,
    dailySeriesCap,
  });
  const catchupDays = Math.ceil(catchupRuns / currentLaneRunsPerDay);
  const unclassifiedShortfall = totalShortfall - knownGap;
  const currentLaneCanCloseFullGap = unsupportedSourceUniverseKnown
    && month.horizon === "current"
    && month.future_discovery_missing === 0
    && month.separate_lane_missing === 0
    && month.unsupported_source_missing === 0
    && unclassifiedShortfall === 0;

  return {
    ...month,
    coverage_ratio: month.reference_count === 0 ? null : round(month.catalog_count / month.reference_count),
    shortfall: totalShortfall,
    reference_shortfall: totalShortfall,
    stale_supported_shortfall: month.current_lane_missing + month.future_discovery_missing + month.separate_lane_missing,
    unsupported_source_shortfall: month.unsupported_source_missing,
    known_gap: knownGap,
    unclassified_shortfall: unclassifiedShortfall,
    runs_to_current_lane_catchup_at_current_cap: catchupRuns,
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
  unsupportedSourceUniverseKnown,
  daysToCurrentLaneCatchup,
  freshnessSloDays,
}) {
  if (!unsupportedSourceUniverseKnown) return "PROVIDER_UNIVERSE_EVIDENCE_REQUIRED";
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
  unsupportedSourceUniverseKnown,
  unclassifiedShortfall,
}) {
  return [
    !unsupportedSourceUniverseKnown ? "PROVIDER_UNIVERSE_DISCOVERY_REQUIRED" : null,
    currentLaneMissing > 0 ? "SUPPORTED_SOURCE_FRESHNESS_REPAIR" : null,
    futureDiscoveryMissing > 0 ? "FUTURE_MONTH_DISCOVERY_EXPANSION" : null,
    separateLaneMissing > 0 ? "SEPARATE_REVIEWED_SOURCE_LANE" : null,
    unsupportedMissing > 0 || unclassifiedShortfall > 0 ? "ADDITIONAL_OFFICIAL_SOURCE_ONBOARDING" : null,
  ].filter(Boolean);
}

function normalizeCountUnit(value) {
  if (String(value ?? "").trim() !== "series") {
    throw new Error("count_unit must be explicit series; normalize comparison evidence before planning");
  }
  return "series";
}

function normalizeCurrentLaneDailySeriesCap(value) {
  if (value == null) return CURRENT_LANE_DAILY_SERIES_CAP;
  const number = positiveInteger(value, "daily_series_cap");
  if (number !== CURRENT_LANE_DAILY_SERIES_CAP) {
    throw new Error(`daily_series_cap must match current reviewed cap ${CURRENT_LANE_DAILY_SERIES_CAP}`);
  }
  return number;
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
    const currentLaneMissing = nonNegativeInteger(entry.current_lane_missing ?? 0, `${month}.current_lane_missing`);
    return {
      month,
      horizon: month === planningMonth ? "current" : "future",
      catalog_count: nonNegativeInteger(entry.catalog_count, `${month}.catalog_count`),
      reference_count: nonNegativeInteger(entry.reference_count, `${month}.reference_count`),
      current_lane_missing: currentLaneMissing,
      current_lane_missing_by_provider: normalizeCurrentLaneProviderGap(
        entry.current_lane_missing_by_provider,
        currentLaneMissing,
        month,
      ),
      future_discovery_missing: nonNegativeInteger(entry.future_discovery_missing ?? 0, `${month}.future_discovery_missing`),
      separate_lane_missing: nonNegativeInteger(entry.separate_lane_missing ?? 0, `${month}.separate_lane_missing`),
      unsupported_source_missing: nonNegativeInteger(entry.unsupported_source_missing ?? 0, `${month}.unsupported_source_missing`),
    };
  }).sort((left, right) => left.month.localeCompare(right.month));
}

function normalizeCurrentLaneProviderGap(value, total, month) {
  if (value == null) {
    if (total === 0) return Object.fromEntries(CURRENT_LANE_PROVIDERS.map((provider) => [provider, 0]));
    throw new Error(`${month}.current_lane_missing_by_provider is required when current_lane_missing is non-zero`);
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${month}.current_lane_missing_by_provider must be an object`);
  }
  const unknown = Object.keys(value).filter((provider) => !CURRENT_LANE_PROVIDERS.includes(provider));
  if (unknown.length) throw new Error(`${month}.current_lane_missing_by_provider has unsupported provider ${unknown[0]}`);
  const normalized = Object.fromEntries(CURRENT_LANE_PROVIDERS.map((provider) => [
    provider,
    nonNegativeInteger(value[provider] ?? 0, `${month}.current_lane_missing_by_provider.${provider}`),
  ]));
  if (Object.values(normalized).reduce((sum, count) => sum + count, 0) !== total) {
    throw new Error(`${month}.current_lane_missing_by_provider must sum to current_lane_missing`);
  }
  return normalized;
}

function currentLaneCatchupRuns({ totalMissing, byProvider, dailySeriesCap }) {
  if (totalMissing === 0) return 0;
  return Math.max(
    Math.ceil(totalMissing / dailySeriesCap),
    ...CURRENT_LANE_PROVIDERS.map((provider) => Math.ceil(byProvider[provider] / CURRENT_LANE_PROVIDER_DAILY_CAPS[provider])),
  );
}

function normalizeCurrentLaneRunsPerDay(value) {
  if (value == null) return CURRENT_LANE_RUNS_PER_DAY;
  const number = positiveInteger(value, "current_lane_runs_per_day");
  if (number !== CURRENT_LANE_RUNS_PER_DAY) {
    throw new Error(`current_lane_runs_per_day must match current reviewed frequency ${CURRENT_LANE_RUNS_PER_DAY}`);
  }
  return number;
}

function normalizeBoolean(value, label) {
  if (value !== true && value !== false) throw new Error(`${label} must be boolean`);
  return value;
}

function normalizeParserHealth(value) {
  if (value == null) return { status: "missing", blocking_findings: 0 };
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("parser_health must be an object");
  const status = String(value.status ?? "").trim();
  if (!["fresh", "stale", "missing"].includes(status)) {
    throw new Error("parser_health.status must be fresh, stale, or missing");
  }
  return {
    status,
    blocking_findings: nonNegativeInteger(value.blocking_findings ?? 0, "parser_health.blocking_findings"),
  };
}

function determineCoverageBottleneck({
  currentLaneEnabled,
  unsupportedSourceUniverseKnown,
  parserHealth,
  currentLaneMissing,
  futureDiscoveryMissing,
  separateLaneMissing,
  unsupportedMissing,
  unclassifiedShortfall,
  daysToCurrentLaneCatchup,
  freshnessSloDays,
}) {
  if (!unsupportedSourceUniverseKnown) return "unsupported_source_universe_unknown";
  if (unsupportedMissing > 0 || unclassifiedShortfall > 0) return "unsupported_source_or_unclassified_shortfall";
  if (futureDiscoveryMissing > 0) return "future_discovery_not_covered_by_current_lane";
  if (separateLaneMissing > 0) return "separate_source_lane_required";
  if (!currentLaneEnabled) return "current_lane_disabled";
  if (parserHealth.status !== "fresh") return "parser_health_evidence_not_fresh";
  if (parserHealth.blocking_findings > 0) return "parser_health_blocking_findings";
  if (currentLaneMissing > 0 && daysToCurrentLaneCatchup > freshnessSloDays) return "current_lane_throughput";
  return null;
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
