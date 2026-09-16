import { isMeaningfulCategoryFacetName } from "./domain/category-discovery.js";
import { normalizeDiscoveryFacetName } from "./domain/discovery-facets.js";
import { getParentSeriesCatalogPage } from "./series.js";

export async function getTargetedPublicCategorySeriesPage(name, options = {}) {
  const requestedName = normalizeDiscoveryFacetName(name);
  if (!isMeaningfulCategoryFacetName(requestedName)) return null;

  const pageSize = Math.max(1, Math.min(60, Number(options.pageSize) || 60));
  const requestedPage = Math.max(1, Number(options.page) || 1);
  const result = await getParentSeriesCatalogPage({
    category: requestedName,
    page: requestedPage,
    pageSize,
    sort: "newest",
  });
  if (result.total === 0) return null;

  const canonical = normalizeDiscoveryFacetName(
    result.items.find((item) => item.category)?.category ?? requestedName,
  );
  return {
    ...result,
    totalPages: Math.max(1, Math.ceil(result.total / result.pageSize)),
    facet: {
      name: canonical,
      filter_value: canonical,
      series_count: result.total,
      variant_count: result.items.reduce((count, item) => count + Number(item.variant_count || 0), 0),
    },
  };
}
