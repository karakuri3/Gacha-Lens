import { selectMarketCollectionTargets } from "../domain/market-coverage.js";
import { MARKET_MAX_QUERY_ATTEMPTS_PER_ROOT } from "./market-request-budget.js";

export const PRIORITY_ONE_DISTINCT_EVIDENCE_QUERY_PROFILE = "priority_1_distinct_exact_diagnostic";

export function planPriorityOneDistinctEvidenceQueries(catalog = {}, coverageRows = [], options = {}) {
  const eligibleRows = coverageRows.filter((row) => {
    const variant = catalog.variantById?.get(row?.variantId)
      ?? (catalog.variants ?? []).find((entry) => entry.id === row?.variantId);
    const parentSeries = catalog.seriesById?.get(row?.seriesId)
      ?? (catalog.series ?? []).find((entry) => entry.id === row?.seriesId);
    return (
    Number(row?.priority) === 1
    && row?.released === true
    && Number(row?.activeCount) === 2
    && Number(row?.eligibleListingCount) === 2
    && String(row?.variantType || "").toLowerCase() !== "provisional"
    && variant
    && parentSeries
    && String(variant.variant_type || "").toLowerCase() !== "provisional"
    );
  });
  const selection = selectMarketCollectionTargets(eligibleRows, {
    ...options,
    priority: 1,
    release: "released",
    maxVariantsPerSeries: 1,
  });
  const selected = [];
  const queries = [];

  for (const coverage of selection.selected) {
    const variant = catalog.variantById?.get(coverage.variantId)
      ?? (catalog.variants ?? []).find((entry) => entry.id === coverage.variantId);
    const parentSeries = catalog.seriesById?.get(coverage.seriesId)
      ?? (catalog.series ?? []).find((entry) => entry.id === coverage.seriesId);
    const plan = buildPriorityOneDistinctEvidenceQueriesForVariant(variant, parentSeries);
    if (!plan.length) continue;
    selected.push(coverage);
    queries.push({
      ...plan[0],
      priority: 1,
      released: coverage.released === true,
      variant_type: variant.variant_type,
      priority_reason: coverage.priorityReason,
      coverage_state: coverage.coverageState,
    });
  }

  return {
    selected,
    queries,
    summary: {
      ...selection.summary,
      selected_variants: selected.length,
      queries_generated: queries.length,
      query_profile: PRIORITY_ONE_DISTINCT_EVIDENCE_QUERY_PROFILE,
      eligible_priority_one_two_listing_variants: eligibleRows.length,
      skipped_unsafe_query: selection.selected.length - selected.length,
    },
  };
}

export function buildPriorityOneDistinctEvidenceQueriesForVariant(variant, parentSeries) {
  if (!variant || !parentSeries || String(variant.variant_type || "").toLowerCase() === "provisional") return [];
  const seriesName = cleanText(parentSeries.name);
  const variantName = cleanText(variant.name);
  if (!seriesName || !variantName) return [];

  const normalizedSeries = normalizeSearchTerm(seriesName);
  const normalizedVariant = normalizeSearchTerm(variantName);
  if (!normalizedSeries || !normalizedVariant) return [];
  const attempts = dedupe([
    `${seriesName} ${variantName} ガチャ`,
    `${seriesName} ${variantName}`,
    `${normalizedSeries} ${normalizedVariant}`,
  ]).slice(0, MARKET_MAX_QUERY_ATTEMPTS_PER_ROOT);
  if (!attempts.length) return [];

  return [{
    query: attempts[0],
    fallback_queries: attempts.slice(1),
    query_strategy_version: 2,
    query_profile: PRIORITY_ONE_DISTINCT_EVIDENCE_QUERY_PROFILE,
    kind: "variant",
    variant_id: variant.id,
    series_id: parentSeries.id,
    release_date: isoDate(variant.release_date || parentSeries.release_date),
  }];
}

function dedupe(values) {
  return [...new Map(values.map((value) => [normalizeQuery(value), cleanText(value)]).filter(([key]) => key)).values()];
}

function cleanText(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function normalizeQuery(value) {
  return cleanText(value).toLowerCase();
}

function normalizeSearchTerm(value) {
  return cleanText(value)
    .replace(/[\[\]【】「」『』()（）〈〉《》]/g, " ")
    .replace(/[・･·\-‐‑‒–—―−_/／,:：;；!?！？.。]/g, " ")
    .replace(/ガシャポン/gi, "ガチャ")
    .replace(/\s+/g, " ")
    .trim();
}

function isoDate(value) {
  const date = new Date(value ?? NaN);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
}
