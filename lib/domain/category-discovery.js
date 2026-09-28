import {
  discoveryFacetLookupCandidates,
  discoveryFacetVariantCount,
  isMeaningfulDiscoveryFacetName,
  isValidDiscoveryFacetIdentifier,
  normalizeDiscoveryFacetIdentifier,
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
]);

export const CATEGORY_DISCOVERY_FACET_MIN_SERIES = 2;

export function collectPublicCategoryFacets(rows = [], options = {}) {
  const minSeries = Math.max(CATEGORY_DISCOVERY_FACET_MIN_SERIES, Number(options.minSeries) || CATEGORY_DISCOVERY_FACET_MIN_SERIES);
  const groups = new Map();

  for (const row of filterPublicSitemapRows(rows)) {
    const parent = sitemapParentOf(row);
    const rawCategory = normalizeDiscoveryFacetIdentifier(parent?.category);
    const seriesId = String(parent?.id || "").trim();
    const variantId = String(row?.id || "").trim();
    if (!seriesId || !variantId || !isValidDiscoveryFacetIdentifier(rawCategory) || !isMeaningfulCategoryFacetName(rawCategory)) continue;

    const key = rawCategory;
    const group = groups.get(key) ?? { name: rawCategory, seriesIds: new Set(), variantIds: new Set() };
    group.seriesIds.add(seriesId);
    group.variantIds.add(variantId);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      name: group.name,
      filter_value: group.name,
      series_count: group.seriesIds.size,
      variant_count: group.variantIds.size,
    }))
    .filter((facet) => facet.series_count >= minSeries)
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

export function categoryDiscoveryLookupCandidates(value) {
  return discoveryFacetLookupCandidates(Array.isArray(value) ? value[0] : value)
    .filter(isMeaningfulCategoryFacetName);
}

export function findPublicCategoryFacet(facets = [], value) {
  const source = normalizeDiscoveryFacetIdentifier(value);
  if (!source) return null;
  const list = Array.isArray(facets) ? facets : [];
  const exact = list.find((facet) => normalizeDiscoveryFacetIdentifier(facet?.filter_value ?? facet?.name) === source);
  if (exact) return exact;
  const target = normalizeDiscoveryFacetName(source).toLocaleLowerCase("ja");
  if (!target) return null;
  const matches = list.filter((facet) => normalizeDiscoveryFacetName(facet?.name).toLocaleLowerCase("ja") === target);
  return matches.length === 1 ? matches[0] : null;
}

export function decodeCategoryDiscoveryParam(value) {
  return normalizeDiscoveryFacetIdentifier(value);
}

export function categoryDiscoveryHref(name) {
  const identifier = normalizeDiscoveryFacetIdentifier(name);
  return isValidDiscoveryFacetIdentifier(identifier) ? `/categories/${encodeURIComponent(identifier)}` : "/categories";
}

export function categoryDiscoveryPageHref(name, page = 1) {
  const base = categoryDiscoveryHref(name);
  const normalizedPage = normalizeDiscoveryFacetPage(page);
  return normalizedPage > 1 ? `${base}/page/${normalizedPage}` : base;
}

export function getLegacyCategoryDiscoveryPageRedirectPath(url) {
  const candidate = url instanceof URL ? new URL(url.toString()) : new URL(String(url), "https://gachalens.com");
  if (!/^\/categories\/[^/]+$/.test(candidate.pathname) || !candidate.searchParams.has("page")) return null;

  const page = normalizeDiscoveryFacetPage(candidate.searchParams.get("page"));
  candidate.pathname = page > 1 ? `${candidate.pathname}/page/${page}` : candidate.pathname;
  candidate.searchParams.delete("page");
  return `${candidate.pathname}${candidate.search}`;
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

export function collectPublicParentCategoryFacets(rows = [], options = {}) {
  const minSeries = Math.max(CATEGORY_DISCOVERY_FACET_MIN_SERIES, Number(options.minSeries) || CATEGORY_DISCOVERY_FACET_MIN_SERIES);
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const seriesId = String(row?.id || "").trim();
    const seriesSlug = String(row?.slug || "").trim();
    const name = normalizeDiscoveryFacetIdentifier(row?.category);
    const variantCount = discoveryFacetVariantCount(row?.variants);
    if (!seriesId || !seriesSlug || !isValidDiscoveryFacetIdentifier(name) || !isMeaningfulCategoryFacetName(name) || variantCount <= 0) continue;
    const group = groups.get(name) ?? { name, seriesCounts: new Map(), image_url: "", upcoming_count: 0 };
    group.seriesCounts.set(seriesId, variantCount);
    if (!group.image_url && row?.image_url) group.image_url = row.image_url;
    if (row?.is_released === false) group.upcoming_count += 1;
    groups.set(name, group);
  }
  return [...groups.values()]
    .map((group) => ({
      name: group.name,
      filter_value: group.name,
      series_count: group.seriesCounts.size,
      variant_count: [...group.seriesCounts.values()].reduce((sum, count) => sum + count, 0),
      image_url: group.image_url,
      upcoming_count: group.upcoming_count,
    }))
    .filter((facet) => facet.series_count >= minSeries)
    .sort((a, b) => b.series_count - a.series_count || a.name.localeCompare(b.name, "ja"));
}
