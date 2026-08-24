import { selectMarketCollectionTargets } from "../domain/market-coverage.js";
import { MARKET_MAX_QUERY_ATTEMPTS_PER_ROOT } from "./market-request-budget.js";

export const PRIORITY_THREE_SEED_QUERY_PROFILE = "priority_3_seed_strict";

export function planPriorityThreeSeedSearchQueries(catalog = {}, coverageRows = [], options = {}) {
  const selection = selectMarketCollectionTargets(coverageRows, {
    ...options,
    priority: 3,
    release: "released",
  });
  const queries = [];
  const selected = [];

  for (const coverage of selection.selected) {
    const variant = catalog.variantById?.get(coverage.variantId)
      ?? (catalog.variants ?? []).find((entry) => entry.id === coverage.variantId);
    const parentSeries = catalog.seriesById?.get(coverage.seriesId)
      ?? (catalog.series ?? []).find((entry) => entry.id === coverage.seriesId);
    const strictQuery = buildPriorityThreeSeedQueriesForVariant(variant, parentSeries);
    if (!strictQuery.length) continue;
    selected.push(coverage);
    queries.push({
      ...strictQuery[0],
      priority: 3,
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
      query_profile: PRIORITY_THREE_SEED_QUERY_PROFILE,
      skipped_unsafe_query: selection.selected.length - selected.length,
    },
  };
}

export function buildPriorityThreeSeedQueriesForVariant(variant, parentSeries) {
  if (!variant || !parentSeries || String(variant.variant_type || "").toLowerCase() === "provisional") return [];
  const seriesName = cleanText(parentSeries.name);
  const variantName = cleanText(variant.name);
  if (!seriesName || !variantName) return [];

  const normalizedSeries = normalizeSearchTerm(seriesName);
  const normalizedVariant = normalizeSearchTerm(variantName);
  if (!normalizedSeries || !normalizedVariant) return [];

  const candidates = dedupeBy([
    `${seriesName} ${variantName} ガチャ`,
    `${seriesName} ${variantName}`,
    `${normalizedSeries} ${normalizedVariant}`,
  ].map(cleanText).filter(Boolean), normalizeQuery).slice(0, MARKET_MAX_QUERY_ATTEMPTS_PER_ROOT);

  if (!candidates.length) return [];
  return [{
    query: candidates[0],
    fallback_queries: candidates.slice(1),
    query_strategy_version: 2,
    query_profile: PRIORITY_THREE_SEED_QUERY_PROFILE,
    kind: "variant",
    variant_id: variant.id,
    series_id: parentSeries.id,
    release_date: isoDate(variant.release_date || parentSeries.release_date),
  }];
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

function dedupeBy(values, selector) {
  return [...new Map(values.map((value) => [selector(value), value])).values()];
}

function isoDate(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
}
