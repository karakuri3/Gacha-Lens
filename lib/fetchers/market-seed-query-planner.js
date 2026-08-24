import { selectMarketCollectionTargets } from "../domain/market-coverage.js";
import { MARKET_MAX_QUERY_ATTEMPTS_PER_ROOT } from "./market-request-budget.js";

export const PRIORITY_THREE_SEED_QUERY_PROFILE = "priority_3_seed_strict";
export const PRIORITY_THREE_SEED_RECALL_V3_QUERY_PROFILE = "priority_3_seed_recall_v3_diagnostic";

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

export function planPriorityThreeSeedRecallV3SearchQueries(catalog = {}, coverageRows = [], options = {}) {
  const selection = selectMarketCollectionTargets(coverageRows, { ...options, priority: 3, release: "released" });
  const selected = [];
  const queries = [];
  for (const coverage of selection.selected) {
    const variant = catalog.variantById?.get(coverage.variantId) ?? (catalog.variants ?? []).find((entry) => entry.id === coverage.variantId);
    const series = catalog.seriesById?.get(coverage.seriesId) ?? (catalog.series ?? []).find((entry) => entry.id === coverage.seriesId);
    const planned = buildPriorityThreeSeedRecallV3QueriesForVariant(variant, series);
    if (!planned.length) continue;
    selected.push(coverage);
    queries.push({ ...planned[0], priority: 3, priority_reason: coverage.priorityReason, coverage_state: coverage.coverageState });
  }
  return { selected, queries, summary: { ...selection.summary, selected_variants: selected.length, queries_generated: queries.length, query_profile: PRIORITY_THREE_SEED_RECALL_V3_QUERY_PROFILE, skipped_unsafe_query: selection.selected.length - selected.length } };
}

export function buildPriorityThreeSeedRecallV3QueriesForVariant(variant, parentSeries) {
  if (!variant || !parentSeries || String(variant.variant_type || "").toLowerCase() === "provisional") return [];
  const seriesName = cleanText(parentSeries.name);
  const variantName = cleanText(variant.name);
  if (!seriesName || !variantName) return [];
  const root = `${seriesName} ${variantName} ガチャ`;
  const aliasSeries = normalizeRecallSeriesAlias(seriesName);
  const aliasVariant = normalizeRecallVariantAlias(variantName);
  if (!aliasSeries || !aliasVariant) return [];
  const attempts = dedupeBy([root, `${seriesName} ${variantName}`, `${aliasSeries} ${aliasVariant}`].map(cleanText).filter(Boolean), normalizeQuery).slice(0, MARKET_MAX_QUERY_ATTEMPTS_PER_ROOT);
  if (!attempts.length) return [];
  return [{ query: attempts[0], root_query: root, fallback_queries: attempts.slice(1), query_strategy_version: 3, query_profile: PRIORITY_THREE_SEED_RECALL_V3_QUERY_PROFILE, kind: "variant", variant_id: variant.id, series_id: parentSeries.id, release_date: isoDate(variant.release_date || parentSeries.release_date) }];
}

export function normalizeRecallSeriesAlias(value) { return normalizeRecallText(value, true); }
export function normalizeRecallVariantAlias(value) { return normalizeRecallText(value, false); }

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

function normalizeRecallText(value, isSeries) {
  let text = cleanText(value)
    .replace(/&(trade|reg|copy);/gi, " ")
    .replace(/[™®©]/g, " ")
    .replace(/[「」『』【】\[\]()（）〈〉《》'"“”‘’]/g, " ")
    .replace(/[~〜～+＆&]/g, " ")
    .replace(/[・･·\-‐‑‒–—―−_/／,:：;；!?！？.。]/g, " ");
  if (isSeries) text = text.replace(/^\s*(?:【フラットガシャポン】|フラットガシャポン|TVアニメ|アニメ)\s*/i, "");
  return cleanText(text);
}

function dedupeBy(values, selector) {
  return [...new Map(values.map((value) => [selector(value), value])).values()];
}

function isoDate(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
}
