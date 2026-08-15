import { selectMarketCollectionTargets } from "../domain/market-coverage.js";
import { isPublicVariant } from "../domain/variant-publication.js";
import { MARKET_MAX_QUERY_ATTEMPTS_PER_ROOT } from "./market-request-budget.js";

const DEFAULT_QUERY_LIMIT = 24;
const DEFAULT_QUERY_LENGTH = 80;
export const MARKET_QUERY_STRATEGY_VERSION = 2;
export const MAX_MARKET_QUERY_ATTEMPTS_PER_VARIANT = MARKET_MAX_QUERY_ATTEMPTS_PER_ROOT;

export function planMarketSearchQueries(catalog = {}, coverageRows = [], options = {}) {
  const selection = selectMarketCollectionTargets(coverageRows, options);
  const queryLimit = clampInteger(options.queryLimit ?? process.env.MARKET_QUERY_LIMIT_PER_RUN ?? DEFAULT_QUERY_LIMIT, 1, 100);
  const perVariant = clampInteger(options.maxQueriesPerVariant ?? 1, 1, 2);
  const queries = [];
  const selected = [];

  for (const coverage of selection.selected) {
    const variant = catalog.variantById?.get(coverage.variantId)
      ?? (catalog.variants ?? []).find((entry) => entry.id === coverage.variantId);
    const parentSeries = catalog.seriesById?.get(coverage.seriesId)
      ?? (catalog.series ?? []).find((entry) => entry.id === coverage.seriesId);
    const variantQueries = buildMarketSearchQueriesForVariant(variant, parentSeries, options).slice(0, perVariant);
    if (!variantQueries.length) continue;
    selected.push(coverage);
    for (const entry of variantQueries) {
      if (queries.length >= queryLimit) break;
      queries.push({
        ...entry,
        priority: coverage.priority,
        priority_reason: coverage.priorityReason,
        coverage_state: coverage.coverageState,
      });
    }
    if (queries.length >= queryLimit) break;
  }

  return {
    selected: dedupeBy(selected, (entry) => entry.variantId),
    queries: dedupeBy(queries, (entry) => normalizeQuery(entry.query)).slice(0, queryLimit),
    summary: {
      ...selection.summary,
      selected_variants: selected.length,
      queries_generated: Math.min(queryLimit, queries.length),
      query_limit: queryLimit,
      max_queries_per_variant: perVariant,
      skipped_unsafe_query: selection.selected.length - selected.length,
    },
  };
}

export function buildMarketSearchQueries(catalog = {}, options = {}) {
  if (Array.isArray(options.coverageRows)) {
    return planMarketSearchQueries(catalog, options.coverageRows, options).queries;
  }

  const seriesById = catalog.seriesById instanceof Map
    ? catalog.seriesById
    : new Map((catalog.series ?? []).map((entry) => [entry.id, entry]));
  const variants = (catalog.variants ?? []).filter((variant) =>
    isPublicVariant(variant, { seriesIds: new Set(seriesById.keys()) })
  );
  const now = validDate(options.now) ?? new Date();
  const cursor = rotationCursor(now, variants.length);
  const limit = clampInteger(options.limit ?? process.env.MARKET_QUERY_LIMIT_PER_RUN ?? DEFAULT_QUERY_LIMIT, 1, 100);
  const queries = [];

  for (let index = 0; index < variants.length && queries.length < limit; index += 1) {
    const variant = variants[(cursor + index) % variants.length];
    queries.push(...buildMarketSearchQueriesForVariant(variant, seriesById.get(variant.series_id), options).slice(0, 1));
  }
  return dedupeBy(queries, (entry) => normalizeQuery(entry.query)).slice(0, limit);
}

export function buildMarketSearchQueriesForVariant(variant, parentSeries, options = {}) {
  if (!variant || !parentSeries || String(variant.variant_type || "").toLowerCase() === "provisional") return [];
  const variantName = cleanText(variant.name);
  const seriesName = cleanText(parentSeries.name);
  const franchise = cleanText(parentSeries.franchise);
  const parentEvidence = seriesName.length >= 2 ? seriesName : franchise.length >= 2 ? franchise : "";
  if (!variantName || !parentEvidence) return [];

  const maxLength = clampInteger(options.maxQueryLength ?? DEFAULT_QUERY_LENGTH, 20, 120);
  const suffix = variant.released === false ? "予約 ガチャ" : "ガチャ";
  const normalizedSeries = normalizeSearchTerm(parentEvidence);
  const normalizedVariant = normalizeSearchTerm(variantName);
  const variantFocused = isInformativeVariantTerm(normalizedVariant)
    ? `${normalizedVariant} ガチャ`
    : `${normalizedVariant} ${normalizedSeries} ガチャ`;
  const candidates = dedupeBy([
    `${parentEvidence} ${variantName} ${suffix}`,
    franchise && normalizeQuery(franchise) !== normalizeQuery(parentEvidence)
      ? `${franchise} ${normalizedVariant} ${suffix}`
      : `${normalizedSeries} ${normalizedVariant} ${suffix}`,
    variantFocused,
    `${normalizedVariant} ${normalizedSeries} ガチャ`,
  ]
    .map((query) => boundedQuery(query, maxLength))
    .filter(Boolean), normalizeQuery)
    .slice(0, MAX_MARKET_QUERY_ATTEMPTS_PER_VARIANT);
  if (!candidates.length) return [];

  return [{
    query: candidates[0],
    fallback_queries: candidates.slice(1),
    query_strategy_version: MARKET_QUERY_STRATEGY_VERSION,
    kind: "variant",
    variant_id: variant.id,
    series_id: parentSeries.id,
    release_date: isoDate(variant.release_date || parentSeries.release_date),
  }];
}

export function expandMarketQueryAttempts(queries = [], options = {}) {
  const maxAttempts = clampInteger(
    options.maxAttemptsPerVariant ?? MAX_MARKET_QUERY_ATTEMPTS_PER_VARIANT,
    1,
    MAX_MARKET_QUERY_ATTEMPTS_PER_VARIANT,
  );
  return queries.flatMap((root, rootIndex) => {
    const rootQuery = cleanText(root?.query);
    if (!rootQuery) return [];
    const attempts = dedupeBy([
      rootQuery,
      ...(Array.isArray(root.fallback_queries) ? root.fallback_queries : []),
    ].map((query) => cleanText(query)).filter(Boolean), normalizeQuery).slice(0, maxAttempts);
    return attempts.map((query, attemptIndex) => ({
      ...root,
      query,
      root_query: rootQuery,
      root_query_index: rootIndex,
      query_attempt_index: attemptIndex,
      fallback_queries: undefined,
    }));
  });
}

export function countMarketQueryAttempts(queries = []) {
  return expandMarketQueryAttempts(queries).length;
}

export function isSafeMarketSearchQuery(query, variant, parentSeries) {
  const normalized = normalizeQuery(query);
  const variantTerm = normalizeQuery(variant?.name);
  const parentTerms = [parentSeries?.name, parentSeries?.franchise].map(normalizeQuery).filter((term) => term.length >= 2);
  if (!normalized || !variantTerm || !parentTerms.length) return false;
  return normalized.includes(variantTerm) && parentTerms.some((term) => normalized.includes(term));
}

function boundedQuery(value, maxLength) {
  const query = cleanText(value);
  if (!query) return "";
  return query.length <= maxLength ? query : query.slice(0, maxLength).trim();
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

function isInformativeVariantTerm(value) {
  const compact = normalizeQuery(value).replace(/\s+/g, "");
  return compact.length >= 3 && !/^(?:[a-z]|\d+|赤|青|白|黒|緑|黄|紫|桃|橙|金|銀)$/i.test(compact);
}

function rotationCursor(now, length) {
  if (!length) return 0;
  const intervalMinutes = Math.max(30, Number(process.env.MARKET_QUERY_CURSOR_MINUTES) || 30);
  return Math.abs(Math.floor(now.getTime() / (intervalMinutes * 60 * 1000))) % length;
}

function isoDate(value) {
  const date = validDate(value);
  return date ? date.toISOString().slice(0, 10) : "";
}

function validDate(value) {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function dedupeBy(values, selector) {
  return [...new Map(values.map((value) => [selector(value), value])).values()];
}

function clampInteger(value, min, max) {
  return Math.min(max, Math.max(min, Math.trunc(Number(value) || min)));
}
