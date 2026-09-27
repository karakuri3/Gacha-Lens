import { categoryDiscoveryLookupCandidates } from "./domain/category-discovery.js";
import { decodeDiscoveryFacetParam, normalizeDiscoveryFacetPage } from "./domain/discovery-facets.js";
import { getPublicDiscoveryFacets, getPublicDiscoveryFacetSeriesPage } from "./series.js";
import { getTargetedPublicCategorySeriesPage } from "./targeted-category-series-page.js";

export const DISCOVERY_FACET_PAGE_SIZE = 60;

function facetList(type, facets) {
  if (type === "category") return facets.categories ?? [];
  if (type === "brand") return facets.brands ?? [];
  if (type === "franchise") return facets.franchises ?? [];
  return [];
}

export async function getDiscoveryFacetStaticParams(type) {
  const facets = await getPublicDiscoveryFacets();
  return facetList(type, facets).map((facet) => ({ name: facet.name }));
}

export async function getDiscoveryFacetPaginatedStaticParams(type) {
  const facets = await getPublicDiscoveryFacets();
  return facetList(type, facets).flatMap((facet) => {
    const totalPages = Math.max(1, Math.ceil(Number(facet.series_count || 0) / DISCOVERY_FACET_PAGE_SIZE));
    return Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => ({
      name: facet.name,
      page: String(index + 2),
    }));
  });
}

export async function resolveDiscoveryFacetStaticPage(type, rawName, page = 1) {
  const normalizedPage = normalizeDiscoveryFacetPage(page);

  if (type === "category") {
    const names = categoryDiscoveryLookupCandidates(rawName);
    for (const name of names) {
      const result = await getTargetedPublicCategorySeriesPage(name, {
        page: normalizedPage,
        pageSize: DISCOVERY_FACET_PAGE_SIZE,
      });
      if (result) return result;
    }
    return null;
  }

  if (type !== "brand" && type !== "franchise") return null;
  const name = decodeDiscoveryFacetParam(rawName);
  return getPublicDiscoveryFacetSeriesPage(type, name, {
    page: normalizedPage,
    pageSize: DISCOVERY_FACET_PAGE_SIZE,
  });
}
