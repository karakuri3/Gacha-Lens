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
  "all",
  "all categories",
  "category",
  "categories",
  "すべて",
  "全て",
  "全カテゴリ",
  "カテゴリ",
  "カテゴリー",
  "ガチャ",
  "ガシャポン",
  "カプセルトイ",
  "その他",
  "なし",
  "不明",
  "未分類",
  "未登録",
]);

export function normalizeDiscoveryFacetName(value) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 120);
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
  const target = normalizeDiscoveryFacetName(value).toLocaleLowerCase("ja");
  if (!target) return null;
  return (Array.isArray(facets) ? facets : []).find(
    (facet) => normalizeDiscoveryFacetName(facet?.name).toLocaleLowerCase("ja") === target,
  ) ?? null;
}

export function decodeDiscoveryFacetParam(value) {
  const source = Array.isArray(value) ? value[0] : value;
  // App Router has already decoded dynamic route params. Decoding again corrupts literal percent signs.
  return normalizeDiscoveryFacetName(source);
}

export function discoveryFacetHref(type, name) {
  const base = type === "brand" ? "/brands" : type === "franchise" ? "/franchises" : type === "category" ? "/categories" : "";
  const normalized = normalizeDiscoveryFacetName(name);
  return base && normalized ? `${base}/${encodeURIComponent(normalized)}` : base || "/series";
}

export function discoveryFacetPageHref(type, name, page = 1) {
  const base = discoveryFacetHref(type, name);
  const normalizedPage = normalizeDiscoveryFacetPage(page);
  return normalizedPage > 1 ? `${base}?page=${normalizedPage}` : base;
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
    const name = normalizeDiscoveryFacetName(parent?.[field]);
    if (!isMeaningfulDiscoveryFacetName(name)) continue;
    const key = name.toLocaleLowerCase("ja");
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
