import { unstable_cache } from "next/cache";
import { categoryDiscoveryLookupCandidates, findPublicCategoryFacet } from "./domain/category-discovery.js";
import { normalizeDiscoveryFacetIdentifier } from "./domain/discovery-facets.js";
import { effectiveReleaseState } from "./domain/release-state.js";
import { resolveDataSource, runDataSourceOperation } from "./data/data-source-policy.js";
import { getParentSeriesCatalogPage, getPublicDiscoveryFacets } from "./series.js";
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
  const requestedNames = categoryDiscoveryLookupCandidates(name);
  if (!requestedNames.length) return null;
  const pageSize = Math.max(1, Math.min(60, Number(options.pageSize) || 60));
  const requestedPage = Math.max(1, Number(options.page) || 1);

  for (const requestedName of requestedNames) {
    const direct = await readCategoryPage(requestedName, requestedPage, pageSize);
    if (direct.total > 0) return buildResult(direct, requestedName);
  }

  const { categories } = await getPublicDiscoveryFacets();
  const facet = findPublicCategoryFacet(categories, name);
  const filterValue = normalizeDiscoveryFacetIdentifier(facet?.filter_value ?? facet?.name);
  if (!filterValue || requestedNames.includes(filterValue)) return null;
  const fallback = await readCategoryPage(filterValue, requestedPage, pageSize);
  if (fallback.total === 0) return null;
  return buildResult(fallback, filterValue);
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
  const { variants, ...series } = row;
  const variantCount = embeddedVariantCount(variants);
  const released = effectiveReleaseState(series);
  return {
    ...series,
    series_id: series.id,
    series_slug: series.slug,
    series_name: series.name,
    entity_type: "series",
    variant_type: "series",
    variant_count: variantCount,
    lineup_count: variantCount,
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

function embeddedVariantCount(value) {
  if (Array.isArray(value)) {
    if (value.length === 1 && Number.isFinite(Number(value[0]?.count))) return Number(value[0].count);
    return value.length;
  }
  if (value && typeof value === "object" && Number.isFinite(Number(value.count))) return Number(value.count);
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function buildResult(result, canonicalName, filterValue = canonicalName) {
  const canonical = normalizeDiscoveryFacetIdentifier(
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
