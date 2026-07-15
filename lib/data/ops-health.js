import { buildImportIssueBreakdown, buildMarketListingBreakdown, buildXIntentBreakdown } from "./import-review";

const FRESHNESS_LIMITS = {
  market: { warning: 1000 * 60 * 60 * 24 * 2, critical: 1000 * 60 * 60 * 24 * 7 },
  x: { warning: 1000 * 60 * 60 * 24, critical: 1000 * 60 * 60 * 24 * 3 },
  stock: { warning: 1000 * 60 * 60 * 24 * 2, critical: 1000 * 60 * 60 * 24 * 7 },
};

const RUN_FRESHNESS_LIMITS = {
  official: { warning: 1000 * 60 * 60 * 2, critical: 1000 * 60 * 60 * 6 },
  market: { warning: 1000 * 60 * 60 * 2, critical: 1000 * 60 * 60 * 6 },
  x: { warning: 1000 * 60 * 60 * 26, critical: 1000 * 60 * 60 * 72 },
  stock: { warning: 1000 * 60 * 60 * 2, critical: 1000 * 60 * 60 * 6 },
};

export function buildOpsHealthReport(dataModel = {}, nowInput = new Date()) {
  const now = new Date(nowInput);
  const series = dataModel.series ?? [];
  const variants = dataModel.variants ?? [];
  const marketListings = dataModel.marketListings ?? [];
  const xReactions = dataModel.xReactions ?? [];
  const restockEvents = dataModel.restockEvents ?? [];
  const stockReports = dataModel.stockReports ?? [];
  const importIssues = dataModel.importIssues ?? [];
  const ingestionRuns = dataModel.ingestionRuns ?? [];
  const catalogCounts = dataModel.catalogCounts ?? {};
  const unresolvedIssues = importIssues.filter((issue) => !issue.resolved);
  const xEnabled = String(process.env.X_FETCH_ENABLED || "false").toLowerCase() === "true";

  const released = variants.filter((variant) => Boolean(variant.is_released ?? variant.released));
  const upcoming = variants.filter((variant) => !Boolean(variant.is_released ?? variant.released));
  const signalVariantIds = new Set([
    ...marketListings.map((row) => row.variant_id),
    ...restockEvents.map((row) => row.variant_id),
    ...stockReports.map((row) => row.variant_id),
  ].filter(Boolean));
  const circulating = released.filter((variant) => signalVariantIds.has(variant.id));
  const exactCounts = {
    series: catalogCounts.series ?? series.length,
    variants: catalogCounts.all ?? variants.length,
    released: catalogCounts.released ?? released.length,
    upcoming: catalogCounts.upcoming ?? upcoming.length,
  };
  const linkedMarketListings = marketListings.filter((listing) => listing.variant_id);
  const linkedXReactions = xReactions.filter((reaction) => reaction.variant_id);
  const linkedRestockEvents = restockEvents.filter((event) => event.variant_id);
  const linkedStockReports = stockReports.filter((report) => report.variant_id);
  const latest = {
    official: latestDate([...series, ...variants].map((row) => row.updated_at || row.created_at || row.release_date)),
    market: latestDate(marketListings.map((row) => row.sold_at || row.listed_at || row.updated_at || row.created_at)),
    x: latestDate(xReactions.map((row) => row.posted_at || row.updated_at || row.created_at)),
    stock: latestDate([...restockEvents, ...stockReports].map((row) => row.reported_at || row.updated_at || row.created_at)),
  };

  const pipelines = [
    officialPipeline({ counts: exactCounts, run: latestRun(ingestionRuns, "official"), now }),
    marketPipeline({ marketListings, linkedMarketListings, latestAt: latest.market, now, run: latestRun(ingestionRuns, "market") }),
    xPipeline({ xReactions, linkedXReactions, latestAt: latest.x, now, xEnabled, run: latestRun(ingestionRuns, "x") }),
    stockPipeline({ restockEvents, stockReports, linkedRestockEvents, linkedStockReports, latestAt: latest.stock, now, run: latestRun(ingestionRuns, "stock") }),
    reviewPipeline({ unresolvedIssues }),
  ];
  const risks = buildRisks(pipelines);
  const readinessScore = calculateReadinessScore({
    variantsCount: exactCounts.variants,
    marketListings,
    linkedMarketListings,
    xReactions,
    linkedXReactions,
    restockEvents,
    stockReports,
    linkedRestockEvents,
    linkedStockReports,
    unresolvedIssues,
    xEnabled,
  });

  return {
    generatedAt: now.toISOString(),
    status: risks.some((risk) => risk.level === "critical") ? "critical" : risks.some((risk) => risk.level === "warning") ? "warning" : "ok",
    readinessScore,
    records: {
      series: exactCounts.series,
      variants: exactCounts.variants,
      released: exactCounts.released,
      upcoming: exactCounts.upcoming,
      circulating: circulating.length,
      marketListings: marketListings.length,
      xReactions: xReactions.length,
      restockEvents: restockEvents.length,
      stockReports: stockReports.length,
      importIssues: importIssues.length,
      unresolvedIssues: unresolvedIssues.length,
      ingestionRuns: ingestionRuns.length,
    },
    coverage: {
      marketLinkedRatio: ratio(linkedMarketListings.length, marketListings.length),
      xLinkedRatio: ratio(linkedXReactions.length, xReactions.length),
      restockLinkedRatio: ratio(linkedRestockEvents.length, restockEvents.length),
      stockLinkedRatio: ratio(linkedStockReports.length, stockReports.length),
      circulatingRatio: ratio(circulating.length, exactCounts.released),
    },
    freshness: {
      official: freshness(latest.official, now),
      market: freshness(latest.market, now),
      x: freshness(latest.x, now),
      stock: freshness(latest.stock, now),
    },
    breakdowns: {
      importIssues: buildImportIssueBreakdown(importIssues),
      marketListings: buildMarketListingBreakdown(marketListings),
      xIntents: buildXIntentBreakdown(xReactions),
    },
    pipelines,
    ingestionRuns: ingestionRuns.slice(0, 20),
    risks,
  };
}

function officialPipeline({ counts, run, now }) {
  const status = worseStatus(counts.variants ? "ok" : "critical", runHealth(run, now, RUN_FRESHNESS_LIMITS.official));
  return {
    key: "official",
    label: "Official master",
    status,
    summary: counts.variants ? "series / variants are available" : "official master is empty",
    metrics: [
      metric("series", counts.series),
      metric("variants", counts.variants),
      metric("released", counts.released),
      metric("upcoming", counts.upcoming),
      runMetric(run),
    ],
  };
}

function marketPipeline({ marketListings, linkedMarketListings, latestAt, now, run }) {
  const linkedRatio = ratio(linkedMarketListings.length, marketListings.length);
  const freshnessStatus = freshnessLevel(latestAt, now, FRESHNESS_LIMITS.market);
  return {
    key: "market",
    label: "Market listings",
    status: worseStatus(marketListings.length === 0 ? "warning" : worseStatus(linkedRatio < 0.5 ? "warning" : "ok", freshnessStatus), runHealth(run, now, RUN_FRESHNESS_LIMITS.market)),
    summary: marketListings.length ? "market summaries can be calculated" : "market data is not connected yet",
    latestObservedAt: latestAt || "",
    metrics: [
      metric("rows", marketListings.length),
      metric("linked", linkedMarketListings.length),
      metric("linked ratio", percent(linkedRatio)),
      runMetric(run),
    ],
  };
}

function xPipeline({ xReactions, linkedXReactions, latestAt, now, xEnabled, run }) {
  const linkedRatio = ratio(linkedXReactions.length, xReactions.length);
  const freshnessStatus = freshnessLevel(latestAt, now, FRESHNESS_LIMITS.x);
  if (!xEnabled && xReactions.length === 0) {
    return {
      key: "x",
      label: "X reactions (optional)",
      status: "ok",
      summary: "X API is disabled; free-operation mode does not require it",
      latestObservedAt: "",
      metrics: [metric("mode", "optional / disabled"), metric("rows", 0), runMetric(run)],
    };
  }
  return {
    key: "x",
    label: "X reactions",
    status: worseStatus(xReactions.length === 0 ? "warning" : worseStatus(linkedRatio < 0.5 ? "warning" : "ok", freshnessStatus), runHealth(run, now, RUN_FRESHNESS_LIMITS.x)),
    summary: xReactions.length ? "forecast score can use X reactions" : "X signal is not connected yet",
    latestObservedAt: latestAt || "",
    metrics: [
      metric("rows", xReactions.length),
      metric("linked", linkedXReactions.length),
      metric("linked ratio", percent(linkedRatio)),
      runMetric(run),
    ],
  };
}

function stockPipeline({ restockEvents, stockReports, linkedRestockEvents, linkedStockReports, latestAt, now, run }) {
  const total = restockEvents.length + stockReports.length;
  const linked = linkedRestockEvents.length + linkedStockReports.length;
  const linkedRatio = ratio(linked, total);
  const freshnessStatus = freshnessLevel(latestAt, now, FRESHNESS_LIMITS.stock);
  return {
    key: "stock",
    label: "Stock / restock",
    status: worseStatus(total === 0 ? "warning" : worseStatus(linkedRatio < 0.5 ? "warning" : "ok", freshnessStatus), runHealth(run, now, RUN_FRESHNESS_LIMITS.stock)),
    summary: total ? "availability summaries can be calculated" : "stock signal is not connected yet",
    latestObservedAt: latestAt || "",
    metrics: [
      metric("restock", restockEvents.length),
      metric("stock", stockReports.length),
      metric("linked", linked),
      metric("linked ratio", percent(linkedRatio)),
      runMetric(run),
    ],
  };
}

function reviewPipeline({ unresolvedIssues }) {
  const high = unresolvedIssues.filter((issue) => issue.issue_type === "missing_variants" || issue.table_name === "variants").length;
  const unknownVariant = unresolvedIssues.filter((issue) => issue.issue_type === "unknown_variant").length;
  return {
    key: "review",
    label: "Review queue",
    status: high > 0 ? "critical" : unknownVariant > 20 ? "warning" : "ok",
    summary: unresolvedIssues.length ? "human review is required before trusting all records" : "no open review issues",
    metrics: [
      metric("open", unresolvedIssues.length),
      metric("unknown variant", unknownVariant),
      metric("high", high),
    ],
  };
}

function buildRisks(pipelines) {
  return pipelines
    .filter((pipeline) => pipeline.status !== "ok")
    .map((pipeline) => ({
      key: pipeline.key,
      level: pipeline.status,
      label: pipeline.label,
      message: pipeline.summary,
    }));
}

function calculateReadinessScore({
  variantsCount,
  marketListings,
  linkedMarketListings,
  xReactions,
  linkedXReactions,
  restockEvents,
  stockReports,
  linkedRestockEvents,
  linkedStockReports,
  unresolvedIssues,
  xEnabled,
}) {
  const stockTotal = restockEvents.length + stockReports.length;
  const stockLinked = linkedRestockEvents.length + linkedStockReports.length;
  const score =
    (variantsCount ? 30 : 0) +
    Math.round(25 * ratio(linkedMarketListings.length, marketListings.length || 1)) +
    (xEnabled ? Math.round(15 * ratio(linkedXReactions.length, xReactions.length || 1)) : 15) +
    Math.round(15 * ratio(stockLinked, stockTotal || 1)) +
    Math.max(0, 15 - Math.min(15, unresolvedIssues.length * 0.35));

  return Math.max(0, Math.min(100, Math.round(score)));
}

function freshness(value, now) {
  if (!value) return { latestAt: "", ageHours: null, label: "no data" };
  const ageMs = now.getTime() - new Date(value).getTime();
  const ageHours = Number.isFinite(ageMs) ? Math.max(0, Math.round((ageMs / (1000 * 60 * 60)) * 10) / 10) : null;
  return {
    latestAt: value,
    ageHours,
    label: ageHours == null ? "unknown" : ageHours < 24 ? `${ageHours}h ago` : `${Math.round(ageHours / 24)}d ago`,
  };
}

function freshnessLevel(value, now, limits) {
  if (!value) return "warning";
  const ageMs = now.getTime() - new Date(value).getTime();
  if (!Number.isFinite(ageMs)) return "warning";
  if (ageMs >= limits.critical) return "critical";
  if (ageMs >= limits.warning) return "warning";
  return "ok";
}

function latestDate(values = []) {
  const dates = values
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a);
  return dates.length ? new Date(dates[0]).toISOString() : "";
}

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

function metric(label, value) {
  return { label, value };
}

function worseStatus(left, right) {
  const score = { ok: 0, warning: 1, critical: 2 };
  return score[right] > score[left] ? right : left;
}

function latestRun(runs, task) {
  return runs
    .filter((run) => run.task === task)
    .sort((left, right) => new Date(right.started_at) - new Date(left.started_at))[0] ?? null;
}

function runMetric(run) {
  if (!run) return metric("last run", "not recorded");
  const finished = run.finished_at || run.started_at;
  return metric("last run", `${run.status} / ${freshness(finished, new Date()).label}`);
}

function runHealth(run, now, limits) {
  if (!run) return "warning";
  if (run.status === "failed") return "critical";
  if (run.status === "running") return "ok";
  return freshnessLevel(run.finished_at || run.started_at, now, limits);
}
