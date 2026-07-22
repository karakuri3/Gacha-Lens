import { buildMarketCoverageRows, summarizeMarketCoverage } from "../lib/domain/market-coverage.js";
import { loadOfficialCatalog } from "./load-official-catalog.mjs";
import { fetchRows } from "./supabase-rest.mjs";

export async function loadMarketCoverageData(options = {}) {
  loadLocalEnv();
  const catalog = options.catalog ?? await loadOfficialCatalog();
  const [listings, ingestionRuns] = await Promise.all([
    fetchRows("market_listings", {
      select: "id,variant_id,matched_variant_id,series_id,listing_type,market_review_type,price,status,source,source_url,listed_at,sold_at,last_observed_at,review_required,created_at,updated_at",
    }),
    fetchRows("ingestion_runs", {
      select: "id,task,status,started_at,finished_at,summary",
      params: { task: "eq.market", order: "started_at.desc", limit: "1000" },
    }),
  ]);
  const now = options.now ?? new Date();
  const coverageRows = buildMarketCoverageRows({ catalog, listings, ingestionRuns, now });
  return { catalog, listings, ingestionRuns, coverageRows, now: new Date(now) };
}

export function buildMarketCoverageReport(data, options = {}) {
  const now = new Date(options.now ?? data.now ?? new Date());
  const summary = summarizeMarketCoverage(data.coverageRows);
  const publicRows = data.coverageRows.filter((row) => row.coverageState !== "not_eligible");
  const recentCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const futureCutoff = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const recentAttempts = publicRows.filter((row) => {
    const time = new Date(row.lastCollectionAttemptAt || 0);
    return Number.isFinite(time.getTime()) && now - time < 24 * 60 * 60 * 1000 && now >= time;
  }).length;

  return {
    generated_at: now.toISOString(),
    ...summary,
    data_insufficient: summary.states.observed_insufficient + summary.states.near_reference + summary.states.near_listing_guide + summary.states.no_evidence,
    attempted_last_24h: recentAttempts,
    released_last_90d_without_evidence: publicRows.filter((row) =>
      row.released
      && row.coverageState === "no_evidence"
      && between(row.releaseDate, recentCutoff, now)
    ).length,
    upcoming_60d_without_evidence: publicRows.filter((row) =>
      !row.released
      && row.eligibleListingCount <= 2
      && between(row.releaseDate, now, futureCutoff)
    ).length,
    source_listing_counts: countBy(data.listings, (listing) => listing.source || "unknown"),
    category_coverage: dimensionCoverage(publicRows, (row) => row.category || "未分類"),
    brand_coverage: dimensionCoverage(publicRows, (row) => row.brand || "不明"),
  };
}

function dimensionCoverage(rows, selector) {
  const groups = new Map();
  for (const row of rows) {
    const key = selector(row);
    if (!groups.has(key)) groups.set(key, { name: key, variants: 0, with_evidence: 0 });
    const group = groups.get(key);
    group.variants += 1;
    if (row.eligibleListingCount > 0) group.with_evidence += 1;
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      coverage_percent: group.variants ? round(group.with_evidence / group.variants * 100, 2) : 0,
    }))
    .sort((a, b) => b.coverage_percent - a.coverage_percent || b.variants - a.variants || a.name.localeCompare(b.name, "ja"));
}

function countBy(rows, selector) {
  return rows.reduce((counts, row) => {
    const key = selector(row);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function between(value, start, end) {
  const date = new Date(value || 0);
  return Number.isFinite(date.getTime()) && date >= start && date <= end;
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function loadLocalEnv() {
  try {
    process.loadEnvFile(".env.local");
  } catch {}
}
