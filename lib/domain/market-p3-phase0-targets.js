import {
  buildCatalogParentVariantIdentityKey,
  prepareMarketSafetyCatalog,
} from "./market-match-safety.js";

const ALLOWED_LIMITS = new Set([10, 25]);
const CONTROL = /[\u0000-\u001f\u007f]/;
const MAX_ID_LENGTH = 200;
const QUERY_PROFILE = "priority_3_seed_strict";

export function parseApprovedP3TargetVariantIds(value, { limit } = {}) {
  const expected = Number(limit);
  if (!ALLOWED_LIMITS.has(expected)) {
    throw new Error("Approved P3 target limit must be exactly 10 or 25.");
  }

  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("Approved P3 target IDs must be a JSON array.");
    }
  }
  if (!Array.isArray(parsed) || parsed.length !== expected) {
    throw new Error(`Approved P3 target IDs must contain exactly ${expected} variants.`);
  }

  const ids = parsed.map((entry) => String(entry ?? "").normalize("NFKC").trim());
  if (ids.some((id) => !id || id.length > MAX_ID_LENGTH || CONTROL.test(id))) {
    throw new Error("Approved P3 target IDs contain an invalid variant ID.");
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error("Approved P3 target IDs must be unique.");
  }
  return ids;
}

export function bindApprovedP3TargetPlan({
  approvedTargetVariantIds,
  limit,
  plan,
  catalog,
} = {}) {
  const approved = parseApprovedP3TargetVariantIds(approvedTargetVariantIds, { limit });
  const selected = Array.isArray(plan?.selected) ? plan.selected : [];
  const queries = Array.isArray(plan?.queries) ? plan.queries : [];
  if (selected.length !== approved.length || queries.length !== approved.length) {
    throw new Error("Approved P3 target set is no longer fully eligible.");
  }

  const selectedById = uniqueMap(selected, (entry) => entry?.variantId, "selected variants");
  const queriesById = uniqueMap(queries, (entry) => entry?.variant_id, "queries");
  const prepared = prepareMarketSafetyCatalog(catalog ?? {});
  const approvedSet = new Set(approved);

  if (
    selectedById.size !== approvedSet.size
    || queriesById.size !== approvedSet.size
    || [...selectedById.keys()].some((id) => !approvedSet.has(id))
    || [...queriesById.keys()].some((id) => !approvedSet.has(id))
  ) {
    throw new Error("Approved P3 target set changed before provider access.");
  }

  const orderedSelected = [];
  const orderedQueries = [];
  const seriesIds = new Set();

  for (const variantId of approved) {
    const coverage = selectedById.get(variantId);
    const query = queriesById.get(variantId);
    const variant = prepared.variantById?.get(variantId)
      ?? (prepared.variants ?? []).find((entry) => entry?.id === variantId);
    const seriesId = String(coverage?.seriesId ?? variant?.series_id ?? "").trim();
    const parent = prepared.seriesById?.get(seriesId)
      ?? (prepared.series ?? []).find((entry) => entry?.id === seriesId);

    if (
      !coverage
      || !query
      || !variant
      || !parent
      || String(variant.variant_type ?? "").toLowerCase() === "provisional"
      || variant.review_required === true
      || String(variant.source_type ?? "") !== "official_site"
      || String(parent.source_type ?? "") !== "official_site"
      || !String(variant.official_url ?? "").trim()
      || !String(parent.official_url ?? "").trim()
      || coverage.released !== true
      || Number(coverage.priority) !== 3
      || Number(coverage.eligibleListingCount) !== 0
      || coverage.coverageState !== "no_evidence"
      || query.query_profile !== QUERY_PROFILE
      || String(query.variant_id ?? "") !== variantId
      || String(query.series_id ?? "") !== seriesId
      || !seriesId
    ) {
      throw new Error("Approved P3 target failed the current review-safe catalog contract.");
    }

    const identityKey = buildCatalogParentVariantIdentityKey(parent.name, variant.name);
    const identitySeriesIds = prepared.formalParentVariantSeriesIds?.get(identityKey);
    if (
      !identityKey
      || !(identitySeriesIds instanceof Set)
      || identitySeriesIds.size !== 1
      || !identitySeriesIds.has(seriesId)
    ) {
      throw new Error("Approved P3 target parent/variant identity is ambiguous.");
    }
    if (seriesIds.has(seriesId)) {
      throw new Error("Approved P3 target set exceeds one variant per series.");
    }

    seriesIds.add(seriesId);
    orderedSelected.push(coverage);
    orderedQueries.push(query);
  }

  return {
    ...plan,
    selected: orderedSelected,
    queries: orderedQueries,
    summary: {
      ...(plan?.summary ?? {}),
      approved_target_binding: true,
      approved_target_count: approved.length,
      distinct_series_selected: seriesIds.size,
    },
  };
}

function uniqueMap(values, selector, label) {
  const mapped = new Map();
  for (const value of values) {
    const key = String(selector(value) ?? "").trim();
    if (!key || mapped.has(key)) {
      throw new Error(`Approved P3 target plan has invalid ${label}.`);
    }
    mapped.set(key, value);
  }
  return mapped;
}
