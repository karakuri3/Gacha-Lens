import {
  DISCOVERY_FACET_MIN_SERIES,
  isMeaningfulDiscoveryFacetName,
  normalizeDiscoveryFacetName,
  normalizeDiscoveryFacetPage,
} from "./discovery-facets.js";
import { filterPublicSitemapRows, sitemapParentOf } from "./sitemap-publication.js";

const CATEGORY_GENERIC_FACET_NAMES = new Set([
  "all",
  "all categories",
  "category",
  "categories",
  "\u3059\u3079\u3066",
  "\u5168\u3066",
  "\u5168\u30ab\u30c6\u30b4\u30ea",
  "\u30ab\u30c6\u30b4\u30ea",
  "\u30ab\u30c6\u30b4\u30ea\u30fc",
  "\u30ac\u30c1\u30e3",
  "\u30ac\u30b7\u30e3\u30dd\u30f3",
  "\u30ab\u30d7\u30bb\u30eb\u30c8\u30a4",
]);

export function collectPublicCategoryFacets(rows = [], options = {}) {
  const minSeries = Math.max(DISCOVERY_FACET_MIN_SERIES, Number(options.minSeries) || DISCOVERY_FACET_MIN_SERIES);
  const groups = new Map();

  for (const row of filterPublicSitemapRows(rows)) {
    const parent = sitemapParentOf(row);
    const rawCategory = String(parent?.category ?? "");
    const category = normalizeDiscoveryFacetName(rawCategory);
    const seriesId = String(parent?.id || "").trim();
    const variantId = String(row?.id || "").trim();
    if (!seriesId || !variantId || !isMeaningfulCategoryFacetName(category)) continue;

    const key = category.toLocaleLowerCase("ja");
    const group = groups.get(key) ?? { name: category, rawValues: new Set(), seriesIds: new Set(), variantIds: new Set() };
    group.rawValues.add(rawCategory);
    group.seriesIds.add(seriesId);
    group.variantIds.add(variantId);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      name: group.name,
      filter_value: [...group.rawValues][0],
      series_count: group.seriesIds.size,
      variant_count: group.variantIds.size,
    }))
    .filter((facet) => facet.series_count >= minSeries && groups.get(facet.name.toLocaleLowerCase("ja"))?.rawValues.size === 1)
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export function isMeaningfulCategoryFacetName(value) {
  const normalized = normalizeDiscoveryFacetName(value);
  return Boolean(
    normalized
    && isMeaningfulDiscoveryFacetName(normalized)
    && !CATEGORY_GENERIC_FACET_NAMES.has(normalized.toLocaleLowerCase("ja")),
  );
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
