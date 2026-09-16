import { unstable_cache } from "next/cache";
import { categoryDiscoveryLookupCandidates, findPublicCategoryFacet } from "./domain/category-discovery.js";
import { normalizeDiscoveryFacetName } from "./domain/discovery-facets.js";
import { effectiveReleaseState } from "./domain/release-state.js";
import { resolveDataSource, runDataSourceOperation } from "./data/data-source-policy.js";
import { getParentSeriesCatalogPage, getParentSeriesCategoryCatalog } from "./series.js";
import {
  hasServiceRoleSupabaseConfig,
  serviceRoleSupabase,
} from "./supabase/service-role-client.js";

const SERIES_SELECT = "id,slug,name,franchise,brand,category,release_month,release_week,release_date,price,image_url,official_url,is_released,source_type,created_at,updated_at";
const PUBLIC_VARIANT_RELATION = "variants!inner(id,variant_type,series_id,slug,name)";
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

  // Edge-safe non-ASCII routes can arrive as raw, once-decoded, or fully decoded
  // values depending on the runtime boundary. Exhaust the cheap exact reads first;
  // never pay the broad raw-value fallback for an intermediate percent-encoded form.
  for (const requestedName of requestedNames) {
    const direct = await readCategoryPage(requestedName, requestedPage, pageSize);
    if (direct.total > 0) return buildResult(direct, requestedName);
  }

  // Preserve the existing raw-value contract for the rare case where the public URL is
  // normalized but the stored category contains whitespace/full-width differences.
  // Load the broad catalog at most once and keep the candidate order raw-first so literal
  // percent category names retain priority over decoded interpretations.
  const catalog = await getParentSeriesCategoryCatalog();
  for (const requestedName of requestedNames) {
    const facet = findPublicCategoryFacet(catalog, requestedName);
    if (!facet?.filter_value || facet.filter_value === requestedName) continue;
    const fallback = await readCategoryPage(facet.filter_value, requestedPage, pageSize);
    if (fallback.total > 0) return buildResult(fallback, facet.name, facet.filter_value);
  }
  return null;
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
  const page = Math.max(1, Number(options.page) || 1);
  let query = serviceRoleSupabase
    .from("series")
    .select(`${SERIES_SELECT},${PUBLIC_VARIANT_RELATION}`, { count: "exact" })
    .eq("category", category);
  query = query
    .or("variant_type.is.null,variant_type.neq.provisional", { referencedTable: "variants" })
    .not("variants.series_id", "is", null)
    .not("variants.slug", "is", null)
    .neq("variants.slug", "")
    .not("variants.name", "is", null)
    .neq("variants.name", "");
  const result = await query
    .order("release_date", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (result.error) throw new Error(`Supabase public category series summary fetch failed: ${result.error.message}`);

  const total = result.count ?? 0;
  if (total === 0) return { items: [], total: 0, page, pageSize, totalPages: 1 };
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (page > totalPages) return fetchSupabaseCategorySeriesSummaryPage(category, { page: totalPages, pageSize });

  return {
    items: (result.data ?? []).map(toCategorySeriesSummary),
    total,
    page,
    pageSize,
    totalPages,
  };
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
