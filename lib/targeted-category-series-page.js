import { unstable_cache } from "next/cache";
import { findPublicCategoryFacet, isMeaningfulCategoryFacetName } from "./domain/category-discovery.js";
import { normalizeDiscoveryFacetName } from "./domain/discovery-facets.js";
import { effectiveReleaseState } from "./domain/release-state.js";
import { resolveDataSource, runDataSourceOperation } from "./data/data-source-policy.js";
import { getParentSeriesCatalogPage, getParentSeriesCategoryCatalog } from "./series.js";
import {
  hasServiceRoleSupabaseConfig,
  serviceRoleSupabase,
} from "./supabase/service-role-client.js";

const SERIES_SELECT = "id,slug,name,franchise,brand,category,release_month,release_week,release_date,price,image_url,official_url,is_released,source_type,created_at,updated_at";
const PUBLIC_VARIANT_RELATION = "variants!inner(id)";
const CATEGORY_CACHE_SECONDS = 300;

const loadCachedSupabaseCategoryPage = unstable_cache(
  (category, page, pageSize) => fetchSupabaseCategorySeriesSummaryPage(category, { page, pageSize }),
  ["gacha-targeted-category-series-summary-v1"],
  { revalidate: CATEGORY_CACHE_SECONDS, tags: ["gacha-public-catalog"] },
);

export async function getTargetedPublicCategorySeriesPage(name, options = {}) {
  const requestedName = normalizeDiscoveryFacetName(name);
  if (!isMeaningfulCategoryFacetName(requestedName)) return null;

  const pageSize = Math.max(1, Math.min(60, Number(options.pageSize) || 60));
  const requestedPage = Math.max(1, Number(options.page) || 1);

  const direct = await readCategoryPage(requestedName, requestedPage, pageSize);
  if (direct.total > 0) return buildResult(direct, requestedName);
  if (options.allowRawFallback === false) return null;

  // Preserve the existing raw-value contract for the rare case where the public URL is
  // normalized but the stored category contains whitespace/full-width differences.
  // Normal categories never pay this broad fallback cost.
  const facet = findPublicCategoryFacet(await getParentSeriesCategoryCatalog(), requestedName);
  if (!facet?.filter_value || facet.filter_value === requestedName) return null;
  const fallback = await readCategoryPage(facet.filter_value, requestedPage, pageSize);
  if (fallback.total === 0) return null;
  return buildResult(fallback, facet.name, facet.filter_value);
}

async function readCategoryPage(category, page, pageSize) {
  const source = resolveDataSource({ hasSupabaseConfig: hasServiceRoleSupabaseConfig });
  if (source === "supabase") {
    return runDataSourceOperation(
      "public-category-series-summary",
      () => loadCachedSupabaseCategoryPage(category, page, pageSize),
    );
  }
  return getParentSeriesCatalogPage({ category, page, pageSize, sort: "newest" });
}

async function fetchSupabaseCategorySeriesSummaryPage(category, options = {}) {
  if (!serviceRoleSupabase) throw new Error("Supabase client is required");
  const pageSize = Math.max(1, Math.min(60, Number(options.pageSize) || 60));
  const requestedPage = Math.max(1, Number(options.page) || 1);

  const countResult = await applyPublicVariantRelationFilter(
    serviceRoleSupabase
      .from("series")
      .select(`id,${PUBLIC_VARIANT_RELATION}`, { count: "exact", head: true })
      .eq("category", category)
  );
  if (countResult.error) {
    throw new Error(`Supabase public category series count failed: ${countResult.error.message}`);
  }

  const total = countResult.count ?? 0;
  if (total === 0) return { items: [], total: 0, page: requestedPage, pageSize, totalPages: 1 };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  let query = applyPublicVariantRelationFilter(
    serviceRoleSupabase
      .from("series")
      .select(`${SERIES_SELECT},${PUBLIC_VARIANT_RELATION}`)
      .eq("category", category)
  );
  const result = await query
    .order("release_date", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (result.error) throw new Error(`Supabase public category series summary fetch failed: ${result.error.message}`);

  return {
    items: (result.data ?? []).map(toCategorySeriesSummary),
    total,
    page,
    pageSize,
    totalPages,
  };
}

function applyPublicVariantRelationFilter(query) {
  return query
    .or("variant_type.is.null,variant_type.neq.provisional", { referencedTable: "variants" })
    .not("variants.series_id", "is", null)
    .not("variants.slug", "is", null)
    .neq("variants.slug", "")
    .not("variants.name", "is", null)
    .neq("variants.name", "");
}

function toCategorySeriesSummary(row = {}) {
  const { variants = [], ...series } = row;
  const released = effectiveReleaseState(series);
  return {
    ...series,
    series_id: series.id,
    series_slug: series.slug,
    series_name: series.name,
    entity_type: "series",
    variant_type: "series",
    variant_count: variants.length,
    lineup_count: variants.length,
    imageUrl: series.image_url || "",
    image_scope: "series",
    schedule_month: series.release_month,
    schedule_week: series.release_week,
    releaseDate: series.release_date,
    is_released: released,
    isReleased: released,
    officialUrl: series.official_url,
  };
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
