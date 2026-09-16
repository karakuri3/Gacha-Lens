import { findPublicCategoryFacet, isMeaningfulCategoryFacetName } from "./domain/category-discovery.js";
import { normalizeDiscoveryFacetName } from "./domain/discovery-facets.js";
import { getParentSeriesCatalogPage, getParentSeriesCategoryCatalog } from "./series.js";

export async function getTargetedPublicCategorySeriesPage(name, options = {}) {
  const requestedName = normalizeDiscoveryFacetName(name);
  if (!isMeaningfulCategoryFacetName(requestedName)) return null;

  const pageSize = Math.max(1, Math.min(60, Number(options.pageSize) || 60));
  const requestedPage = Math.max(1, Number(options.page) || 1);

  const direct = await readCategoryPage(requestedName, requestedPage, pageSize);
  if (direct.total > 0) return buildResult(direct, requestedName);

  // Preserve the existing raw-value contract for the rare case where the public URL is
  // normalized but the stored category contains whitespace/full-width differences.
  // Normal categories never pay this broad fallback cost.
  const facet = findPublicCategoryFacet(await getParentSeriesCategoryCatalog(), requestedName);
  if (!facet?.filter_value || facet.filter_value === requestedName) return null;
  const fallback = await readCategoryPage(facet.filter_value, requestedPage, pageSize);
  if (fallback.total === 0) return null;
  return buildResult(fallback, facet.name, facet.filter_value);
}

function readCategoryPage(category, page, pageSize) {
  return getParentSeriesCatalogPage({ category, page, pageSize, sort: "newest" });
}

function buildResult(result, canonicalName, filterValue = canonicalName) {
  const canonical = normalizeDiscoveryFacetName(
    result.items.find((item) => item.category)?.category ?? canonicalName,
  );
  return {
    ...result,
    totalPages: Math.max(1, Math.ceil(result.total / result.pageSize)),
    facet: {
      name: canonical,
      filter_value: filterValue,
      series_count: result.total,
      variant_count: result.items.reduce((count, item) => count + Number(item.variant_count || 0), 0),
    },
  };
}
