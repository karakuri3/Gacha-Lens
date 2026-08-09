import {
  DISCOVERY_FACET_MIN_SERIES,
  isMeaningfulDiscoveryFacetName,
  normalizeDiscoveryFacetName,
  normalizeDiscoveryFacetPage,
} from "./discovery-facets.js";
import { filterPublicSitemapRows, sitemapParentOf } from "./sitemap-publication.js";

export function collectPublicCategoryFacets(rows = [], options = {}) {
  const minSeries = Math.max(DISCOVERY_FACET_MIN_SERIES, Number(options.minSeries) || DISCOVERY_FACET_MIN_SERIES);
  const groups = new Map();

  for (const row of filterPublicSitemapRows(rows)) {
    const parent = sitemapParentOf(row);
    const category = normalizeDiscoveryFacetName(parent?.category);
    const seriesId = String(parent?.id || "").trim();
    const variantId = String(row?.id || "").trim();
    if (!seriesId || !variantId || !isMeaningfulDiscoveryFacetName(category)) continue;

    const key = category.toLocaleLowerCase("ja");
    const group = groups.get(key) ?? { name: category, seriesIds: new Set(), variantIds: new Set() };
    group.seriesIds.add(seriesId);
    group.variantIds.add(variantId);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      name: group.name,
      series_count: group.seriesIds.size,
      variant_count: group.variantIds.size,
    }))
    .filter((facet) => facet.series_count >= minSeries)
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export function findPublicCategoryFacet(facets = [], value) {
  const target = normalizeDiscoveryFacetName(Array.isArray(value) ? value[0] : value).toLocaleLowerCase("ja");
  if (!target) return null;
  return (Array.isArray(facets) ? facets : []).find(
    (facet) => normalizeDiscoveryFacetName(facet?.name).toLocaleLowerCase("ja") === target,
  ) ?? null;
}

export function decodeCategoryDiscoveryParam(value) {
  // App Router has already decoded dynamic route params. Decoding again corrupts literal percent signs.
  return normalizeDiscoveryFacetName(Array.isArray(value) ? value[0] : value);
}

export function categoryDiscoveryHref(name) {
  const normalized = normalizeDiscoveryFacetName(name);
  return normalized ? `/categories/${encodeURIComponent(normalized)}` : "/categories";
}

export function categoryDiscoveryPageHref(name, page = 1) {
  const base = categoryDiscoveryHref(name);
  const normalizedPage = normalizeDiscoveryFacetPage(page);
  return normalizedPage > 1 ? `${base}?page=${normalizedPage}` : base;
}

export function paginatePublicCategoryVariants(variants = [], options = {}) {
  const pageSize = Math.max(1, Math.min(60, Number(options.pageSize) || 60));
  const items = Array.isArray(variants) ? variants : [];
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(normalizeDiscoveryFacetPage(options.page), totalPages);
  const from = (page - 1) * pageSize;
  return { items: items.slice(from, from + pageSize), total, page, pageSize, totalPages };
}
