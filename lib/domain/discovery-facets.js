import { filterPublicSitemapRows, sitemapParentOf } from "./sitemap-publication.js";

export const DISCOVERY_FACET_MIN_SERIES = 2;

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
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 120);
}

export function discoveryFacetIdentifier(value) {
  const source = Array.isArray(value) ? value[0] : value;
  const raw = String(source ?? "");
  if (!raw || raw.length > 120 || raw !== raw.trim() || /[\u0000-\u001f\u007f]/.test(raw)) return "";
  return raw;
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
  const target = discoveryFacetIdentifier(value);
  if (!target) return null;
  return (Array.isArray(facets) ? facets : []).find(
    (facet) => discoveryFacetIdentifier(facet?.identifier ?? facet?.name) === target,
  ) ?? null;
}

export function decodeDiscoveryFacetParam(value) {
  // Cloudflare/vinext can expose the encoded path segment while Next can expose the
  // decoded value. Decode at most one valid transport layer; publication/DB identity
  // itself remains exact and is never NFKC- or case-normalized here.
  const raw = discoveryFacetIdentifier(value);
  if (!raw || !/%[0-9a-f]{2}/i.test(raw)) return raw;
  try {
    return discoveryFacetIdentifier(decodeURIComponent(raw));
  } catch {
    return "";
  }
}

export function discoveryFacetLookupCandidates(value) {
  const raw = discoveryFacetIdentifier(value);
  if (!raw) return [];
  const candidates = [raw];
  if (!/%[0-9a-f]{2}/i.test(raw)) return candidates;
  try {
    const decoded = discoveryFacetIdentifier(decodeURIComponent(raw));
    if (decoded && decoded !== raw) candidates.push(decoded);
  } catch {
    // Invalid percent escapes remain a literal raw lookup only.
  }
  return candidates;
}

export function discoveryFacetHref(type, name) {
  const base = type === "brand" ? "/brands" : type === "franchise" ? "/franchises" : type === "category" ? "/categories" : "";
  const identifier = discoveryFacetIdentifier(name);
  return base && identifier ? `${base}/${encodeURIComponent(identifier)}` : base || "/series";
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
    const name = discoveryFacetIdentifier(parent?.[field]);
    if (!name || !isMeaningfulDiscoveryFacetName(name)) continue;
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

function toPublicFacet({ name, series_count, variant_count }) {
  return { name, series_count, variant_count };
}
