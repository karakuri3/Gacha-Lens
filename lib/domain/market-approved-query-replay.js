import { validateMarketCandidateAudit } from "./market-candidate-audit.js";
import { isPublicVariant } from "./variant-publication.js";
import {
  MARKET_QUERY_STRATEGY_VERSION,
  buildMarketSearchQueriesForVariant,
  isSafeMarketSearchQuery,
} from "../fetchers/market-query-planner.js";

const CANDIDATE_KEY = /^[0-9a-f]{16}$/;
const MAX_CANARY_CANDIDATES = 4;
const MAX_SELECTED_VARIANTS = 5;

export function buildApprovedCanaryQueryPlan(approvedAudit, currentCatalog = {}, candidateKeys = []) {
  const diagnostic = emptyQueryReplayDiagnostic();
  try {
    validateApprovedSelection(approvedAudit);
    const selectedVariants = approvedAudit.selection.selected_variants;
    diagnostic.approved_selected_count = selectedVariants.length;
    const requestedKeys = parseCandidateKeys(candidateKeys);
    validateRequestedCandidateSelection(approvedAudit, requestedKeys, selectedVariants);

    const seriesById = mapById(currentCatalog.seriesById, currentCatalog.series);
    const variantById = mapById(currentCatalog.variantById, currentCatalog.variants);
    const seriesIds = new Set(seriesById.keys());
    const selected = [];
    const queries = [];

    for (const approved of selectedVariants) {
      const variant = variantById.get(requiredText(approved.variant_id));
      const series = seriesById.get(requiredText(approved.series_id));
      if (
        !variant
        || !series
        || !isPublicVariant(variant, { seriesIds })
        || requiredText(variant.series_id) !== requiredText(series.id)
        || !sameIdentity(approved, variant, series)
      ) {
        throw queryReplayError("Approved query target no longer matches the current official catalog.", diagnostic);
      }

      const query = requiredText(approved.query);
      if (
        !normalize(query).includes(normalize(variant.name))
        || !normalize(query).includes(normalize(series.name))
        || !isSafeMarketSearchQuery(query, variant, series)
      ) {
        diagnostic.catalog_identity_match = true;
        throw queryReplayError("Approved market query is no longer safe for the current official catalog.", diagnostic);
      }
      const strategyVersion = Number(approved.query_strategy_version) || 1;
      const replayed = strategyVersion === MARKET_QUERY_STRATEGY_VERSION
        ? buildMarketSearchQueriesForVariant(variant, series)[0]
        : null;
      if (
        strategyVersion > MARKET_QUERY_STRATEGY_VERSION
        || (strategyVersion === MARKET_QUERY_STRATEGY_VERSION && !replayed)
        || (replayed && requiredText(replayed.query) !== query)
      ) {
        diagnostic.catalog_identity_match = true;
        throw queryReplayError("Approved market query strategy cannot be reproduced from the current catalog.", diagnostic);
      }

      selected.push({
        variantId: variant.id,
        variantSlug: variant.slug,
        variantName: variant.name,
        seriesId: series.id,
        seriesSlug: series.slug,
        seriesName: series.name,
        priority: approved.priority,
        priorityReason: approved.priority_reason,
        coverageState: "approved_audit",
      });
      queries.push({
        ...(replayed ?? {}),
        query,
        kind: "variant",
        variant_id: variant.id,
        series_id: series.id,
        release_date: isoDate(variant.release_date || series.release_date),
        priority: approved.priority,
        priority_reason: approved.priority_reason,
        coverage_state: "approved_audit",
      });
    }

    diagnostic.replayed_query_count = queries.length;
    diagnostic.catalog_identity_match = true;
    diagnostic.query_safety_match = true;
    return {
      selected,
      queries,
      summary: {
        selected_variants: selected.length,
        queries_generated: queries.length,
        query_limit: MAX_SELECTED_VARIANTS,
        max_queries_per_variant: 1,
        skipped_unsafe_query: 0,
      },
      queryReplay: { ...diagnostic },
    };
  } catch (error) {
    if (error && typeof error === "object" && !error.canaryQueryReplay) {
      error.canaryQueryReplay = { ...diagnostic };
    }
    throw error;
  }
}

export function sanitizeCanaryQueryReplay(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return {
    source: value.source === "approved_audit" ? "approved_audit" : "approved_audit",
    approved_selected_count: boundedCount(value.approved_selected_count),
    replayed_query_count: boundedCount(value.replayed_query_count),
    catalog_identity_match: value.catalog_identity_match === true,
    query_safety_match: value.query_safety_match === true,
  };
}

function validateApprovedSelection(report) {
  validateMarketCandidateAudit(report);
  if (report.mode !== "dry-run") throw new Error("Approved query replay requires a dry-run audit.");
  if (report.source_scope !== "planner-apis") throw new Error("Approved query replay requires planner-apis.");
  if (report.result?.report_complete !== true) throw new Error("Approved query replay requires a complete audit.");
  if (Number(report.result?.truncated_count) !== 0) throw new Error("Approved query replay rejects truncated audits.");
  if (Object.values(report.database_writes ?? {}).some((value) => Number(value) !== 0)) {
    throw new Error("Approved query replay requires zero database writes.");
  }

  const selected = report.selection?.selected_variants;
  if (
    !Array.isArray(selected)
    || selected.length < 1
    || selected.length > MAX_SELECTED_VARIANTS
    || Number(report.selection?.selected_variant_count) !== selected.length
    || Number(report.selection?.query_count) !== selected.length
  ) {
    throw new Error("Approved query replay selection totals are invalid.");
  }

  const variantIds = new Set();
  const queries = new Set();
  for (const entry of selected) {
    const variantId = requiredText(entry?.variant_id);
    const seriesId = requiredText(entry?.series_id);
    const query = normalize(entry?.query);
    if (
      !variantId
      || !seriesId
      || !requiredText(entry?.variant_slug)
      || !requiredText(entry?.variant_name)
      || !requiredText(entry?.series_slug)
      || !requiredText(entry?.series_name)
      || !query
    ) {
      throw new Error("Approved query replay selection is incomplete.");
    }
    if (variantIds.has(variantId) || queries.has(query)) {
      throw new Error("Approved query replay selection contains duplicates.");
    }
    variantIds.add(variantId);
    queries.add(query);
  }
}

function validateRequestedCandidateSelection(report, candidateKeys, selected) {
  const selectedByVariant = new Map(selected.map((entry) => [requiredText(entry.variant_id), entry]));
  const candidatesByKey = new Map();
  for (const candidate of report.candidates ?? []) {
    const key = requiredText(candidate?.candidate_key);
    if (!CANDIDATE_KEY.test(key) || candidatesByKey.has(key)) {
      throw new Error("Approved query replay candidate keys are invalid.");
    }
    candidatesByKey.set(key, candidate);
  }

  for (const key of candidateKeys) {
    const candidate = candidatesByKey.get(key);
    if (!candidate) throw new Error(`Requested candidate ${key} is absent from the approved audit.`);
    if (
      candidate.assessment?.accepted !== true
      || candidate.assessment?.review_required !== false
      || candidate.assessment?.reason !== "variant_and_parent_evidence_confirmed"
      || Number(candidate.assessment?.confidence) < 0.8
    ) {
      throw new Error(`Requested candidate ${key} is not approved for query replay.`);
    }
    const selectedEntry = selectedByVariant.get(requiredText(candidate.target?.variant_id));
    if (
      !selectedEntry
      || !candidateTargetMatchesSelection(candidate.target, selectedEntry)
      || requiredText(candidate.target?.search_query) !== requiredText(selectedEntry.query)
    ) {
      throw new Error(`Requested candidate ${key} is outside the approved query selection.`);
    }
  }
}

function candidateTargetMatchesSelection(target, selected) {
  return requiredText(target?.variant_id) === requiredText(selected.variant_id)
    && requiredText(target?.variant_slug) === requiredText(selected.variant_slug)
    && requiredText(target?.variant_name) === requiredText(selected.variant_name)
    && requiredText(target?.series_id) === requiredText(selected.series_id)
    && requiredText(target?.series_slug) === requiredText(selected.series_slug)
    && requiredText(target?.series_name) === requiredText(selected.series_name);
}

function parseCandidateKeys(value) {
  const keys = (Array.isArray(value) ? value : String(value ?? "").split(","))
    .map(requiredText)
    .filter(Boolean);
  if (keys.length < 1 || keys.length > MAX_CANARY_CANDIDATES) {
    throw new Error("Approved query replay requires between one and four candidate keys.");
  }
  if (new Set(keys).size !== keys.length || keys.some((key) => !CANDIDATE_KEY.test(key))) {
    throw new Error("Approved query replay candidate keys are invalid.");
  }
  return keys;
}

function sameIdentity(approved, variant, series) {
  return requiredText(approved.variant_id) === requiredText(variant.id)
    && requiredText(approved.variant_slug) === requiredText(variant.slug)
    && requiredText(approved.variant_name) === requiredText(variant.name)
    && requiredText(approved.series_id) === requiredText(series.id)
    && requiredText(approved.series_slug) === requiredText(series.slug)
    && requiredText(approved.series_name) === requiredText(series.name);
}

function queryReplayError(message, diagnostic) {
  const error = new Error(message);
  error.canaryQueryReplay = { ...diagnostic };
  return error;
}

function emptyQueryReplayDiagnostic() {
  return {
    source: "approved_audit",
    approved_selected_count: 0,
    replayed_query_count: 0,
    catalog_identity_match: false,
    query_safety_match: false,
  };
}

function mapById(existing, values = []) {
  return existing instanceof Map ? existing : new Map(values.map((entry) => [entry.id, entry]));
}

function requiredText(value) {
  return String(value ?? "").normalize("NFKC").trim();
}

function normalize(value) {
  return requiredText(value).replace(/\s+/g, " ").toLowerCase();
}

function isoDate(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
}

function boundedCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 0 && count <= MAX_SELECTED_VARIANTS ? count : 0;
}
