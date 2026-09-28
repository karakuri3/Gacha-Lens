import { filterPublicSitemapRows, sitemapParentOf } from "./sitemap-publication.js";

export const DISCOVERY_FACET_MIN_SERIES = 2;
export const DISCOVERY_FACET_IDENTIFIER_MAX_LENGTH = 120;
export const DISCOVERY_FACET_ROUTE_INPUT_MAX_LENGTH = DISCOVERY_FACET_IDENTIFIER_MAX_LENGTH * 20;

const EXCLUDED_FACET_NAMES = new Set([
  "",
  "-",
  "--",
  "n/a",
  "na",
  "null",
  "undefined",
  "unknown",
  "その他",
  "なし",
  "不明",
  "未分類",
  "未登録",
]);

export function normalizeDiscoveryFacetName(value) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, DISCOVERY_FACET_IDENTIFIER_MAX_LENGTH);
}

export function normalizeDiscoveryFacetIdentifier(value) {
  const source = Array.isArray(value) ? value[0] : value;
  return String(source ?? "").slice(0, DISCOVERY_FACET_ROUTE_INPUT_MAX_LENGTH);
}

export function isValidDiscoveryFacetIdentifier(value) {
  const identifier = normalizeDiscoveryFacetIdentifier(value);
  return Boolean(
    identifier
    && identifier.length <= DISCOVERY_FACET_IDENTIFIER_MAX_LENGTH
    && !/[\u0000-\u001f\u007f]/.test(identifier)
    && isMeaningfulDiscoveryFacetName(identifier)
  );
}

export function isValidDiscoveryFacetRouteInput(value) {
  const routeValue = normalizeDiscoveryFacetIdentifier(value);
  return Boolean(routeValue && routeValue.length <= DISCOVERY_FACET_ROUTE_INPUT_MAX_LENGTH && !/[\u0000-\u001f\u007f]/.test(routeValue));
}

export function isMeaningfulDiscoveryFacetName(value) {
  const normalized = normalizeDiscoveryFacetName(value);
  return Boolean(normalized && !EXCLUDED_FACET_NAMES.has(normalized.toLocaleLowerCase("ja")));
}

export function collectPublicDiscoveryFacets(rows = [], options = {}) {
  const catalogs = collectPublicDiscoveryFacetCatalogs(rows, options);
  return {
    franchises: catalogs.franchises.map(toPublicFacet),
    brands: catalogs.brands.map(toPublicFacet),
  };
}

export function collectPublicDiscoveryFacetCatalogs(rows = [], options = {}) {
  const minSeries = Math.max(DISCOVERY_FACET_MIN_SERIES, Number(options.minSeries) || DISCOVERY_FACET_MIN_SERIES);
  const publicRows = filterPublicSitemapRows(rows);
  return {
    franchises: aggregateFacetCatalog(publicRows, "franchise", minSeries),
    brands: aggregateFacetCatalog(publicRows, "brand", minSeries),
  };
}

export function findPublicDiscoveryFacet(facets = [], value) {
  const source = normalizeDiscoveryFacetIdentifier(value);
  if (!source) return null;
  const list = Array.isArray(facets) ? facets : [];
  const exact = list.find((facet) => normalizeDiscoveryFacetIdentifier(facet?.name) === source);
  if (exact) return exact;
  const target = normalizeDiscoveryFacetName(source).toLocaleLowerCase("ja");
  if (!target) return null;
  const matches = list.filter((facet) => normalizeDiscoveryFacetName(facet?.name).toLocaleLowerCase("ja") === target);
  return matches.length === 1 ? matches[0] : null;
}

export function decodeDiscoveryFacetParam(value) {
  return normalizeDiscoveryFacetIdentifier(value);
}

export function discoveryFacetLookupCandidates(value) {
  const routeValue = normalizeDiscoveryFacetIdentifier(value);
  if (!isValidDiscoveryFacetRouteInput(routeValue)) return [];
  const candidates = [];
  const add = (candidate) => {
    const identifier = normalizeDiscoveryFacetIdentifier(candidate);
    if (isValidDiscoveryFacetIdentifier(identifier) && !candidates.includes(identifier)) candidates.push(identifier);
  };
  add(routeValue);
  if (/%[0-9a-f]{2}/i.test(routeValue)) {
    try {
      add(decodeURIComponent(routeValue));
    } catch {
      // Malformed escapes may still be literal exact identifiers.
    }
  }
  return candidates;
}

export function discoveryFacetHref(type, name) {
  const base = type === "brand" ? "/brands" : type === "franchise" ? "/franchises" : type === "category" ? "/categories" : "";
  const identifier = normalizeDiscoveryFacetIdentifier(name);
  return base && isValidDiscoveryFacetIdentifier(identifier) ? `${base}/${encodeURIComponent(identifier)}` : base || "/series";
}

export function discoveryFacetPageHref(type, name, page = 1) {
  const base = discoveryFacetHref(type, name);
  const normalizedPage = normalizeDiscoveryFacetPage(page);
  return normalizedPage > 1 ? `${base}/page/${normalizedPage}` : base;
}

export function getLegacyDiscoveryFacetPageRedirectPath(url) {
  const candidate = url instanceof URL ? new URL(url.toString()) : new URL(String(url), "https://gachalens.com");
  if (!/^\/(?:brands|franchises)\/[^/]+$/.test(candidate.pathname) || !candidate.searchParams.has("page")) return null;

  const page = normalizeDiscoveryFacetPage(candidate.searchParams.get("page"));
  candidate.pathname = page > 1 ? `${candidate.pathname}/page/${page}` : candidate.pathname;
  candidate.searchParams.delete("page");
  return `${candidate.pathname}${candidate.search}`;
}

export function normalizeDiscoveryFacetPage(value) {
  const source = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(String(source || ""), 10);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function paginatePublicDiscoveryFacetSeries(parentSeries = [], options = {}) {
  const pageSize = Math.max(1, Math.min(60, Number(options.pageSize) || 60));
  const items = Array.isArray(parentSeries) ? parentSeries : [];
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(normalizeDiscoveryFacetPage(options.page), totalPages);
  const from = (page - 1) * pageSize;
  return { items: items.slice(from, from + pageSize), total, page, pageSize, totalPages };
}

function aggregateFacetCatalog(rows, field, minSeries) {
  const groups = new Map();
  for (const row of rows) {
    const parent = sitemapParentOf(row);
    const parentId = String(parent?.id || "").trim();
    const parentSlug = String(parent?.slug || "").trim();
    if (!parentId || !parentSlug) continue;
    const name = normalizeDiscoveryFacetIdentifier(parent?.[field]);
    if (!isValidDiscoveryFacetIdentifier(name)) continue;
    const key = name;
    const group = groups.get(key) ?? { name, parentSeries: new Map(), variantIds: new Set() };
    group.parentSeries.set(parentId, { id: parentId, slug: parentSlug });
    group.variantIds.add(String(row.id || `${row.series_id}:${row.slug}`));
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      name: group.name,
      series_count: group.parentSeries.size,
      variant_count: group.variantIds.size,
      parent_series: [...group.parentSeries.values()].sort((a, b) => a.slug.localeCompare(b.slug, "ja") || a.id.localeCompare(b.id)),
    }))
    .filter((facet) => facet.series_count >= minSeries)
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export function discoveryFacetVariantCount(value) {
  if (Array.isArray(value)) {
    if (value.length === 1 && Number.isFinite(Number(value[0]?.count))) return Number(value[0].count);
    return value.length;
  }
  if (value && typeof value === "object" && Number.isFinite(Number(value.count))) return Number(value.count);
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export function collectPublicParentDiscoveryFacets(rows = [], options = {}) {
  const minSeries = Math.max(DISCOVERY_FACET_MIN_SERIES, Number(options.minSeries) || DISCOVERY_FACET_MIN_SERIES);
  return {
    franchises: collectPublicParentFacet(rows, "franchise", minSeries),
    brands: collectPublicParentFacet(rows, "brand", minSeries),
  };
}

function collectPublicParentFacet(rows, field, minSeries) {
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const seriesId = String(row?.id || "").trim();
    const seriesSlug = String(row?.slug || "").trim();
    const name = normalizeDiscoveryFacetIdentifier(row?.[field]);
    const variantCount = discoveryFacetVariantCount(row?.variants);
    if (!seriesId || !seriesSlug || !isValidDiscoveryFacetIdentifier(name) || variantCount <= 0) continue;
    const group = groups.get(name) ?? { name, seriesCounts: new Map() };
    group.seriesCounts.set(seriesId, variantCount);
    groups.set(name, group);
  }
  return [...groups.values()]
    .map((group) => ({
      name: group.name,
      series_count: group.seriesCounts.size,
      variant_count: [...group.seriesCounts.values()].reduce((sum, count) => sum + count, 0),
    }))
    .filter((facet) => facet.series_count >= minSeries)
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

function toPublicFacet({ name, series_count, variant_count }) {
  return { name, series_count, variant_count };
}
