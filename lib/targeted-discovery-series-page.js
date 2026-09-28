import { unstable_cache } from "next/cache";
import {
  discoveryFacetLookupCandidates,
  findPublicDiscoveryFacet,
  isMeaningfulDiscoveryFacetName,
  normalizeDiscoveryFacetIdentifier,
} from "./domain/discovery-facets.js";
import { effectiveReleaseState } from "./domain/release-state.js";
import { resolveDataSource } from "./data/data-source-policy.js";
import { getPublicDiscoveryFacetSeriesPage, getPublicDiscoveryFacets } from "./series.js";
import {
  hasServiceRoleSupabaseConfig,
  serviceRoleSupabase,
} from "./supabase/service-role-client.js";

const SERIES_SELECT = "id,slug,name,franchise,brand,category,release_month,release_week,release_date,price,image_url,is_released";
const PUBLIC_VARIANT_RELATION = "variants!inner(id)";
const CACHE_SECONDS = 300;

const loadCachedFacetPage = unstable_cache(
  (type, value, page, pageSize) => fetchSupabaseFacetSeriesSummaryPage(type, value, { page, pageSize }),
  ["gacha-targeted-discovery-series-summary-v1"],
  { revalidate: CACHE_SECONDS, tags: ["gacha-public-catalog"] },
);

export async function getTargetedPublicDiscoverySeriesPage(type, name, options = {}) {
  const facetType = type === "brand" ? "brand" : type === "franchise" ? "franchise" : "";
  const candidates = discoveryFacetLookupCandidates(name).filter(isMeaningfulDiscoveryFacetName);
  if (!facetType || !candidates.length) return null;

  const pageSize = Math.max(1, Math.min(60, Number(options.pageSize) || 60));
  const requestedPage = Math.max(1, Number(options.page) || 1);
  const source = resolveDataSource({ hasSupabaseConfig: hasServiceRoleSupabaseConfig });

  if (source !== "supabase") {
    return getPublicDiscoveryFacetSeriesPage(facetType, name, { page: requestedPage, pageSize });
  }

  for (const value of candidates) {
    const result = await loadCachedFacetPage(facetType, value, requestedPage, pageSize);
    if (result.total === 0) continue;
    return buildFacetResult(result, facetType, value);
  }

  // Pre-fix normalized URLs get one bounded publication lookup only after exact reads miss.
  const facets = await getPublicDiscoveryFacets();
  const published = findPublicDiscoveryFacet(facetType === "brand" ? facets.brands : facets.franchises, name);
  if (published?.name && !candidates.includes(published.name)) {
    const result = await loadCachedFacetPage(facetType, published.name, requestedPage, pageSize);
    if (result.total > 0) return buildFacetResult(result, facetType, published.name);
  }

  return null;
}

async function fetchSupabaseFacetSeriesSummaryPage(type, value, options = {}) {
  if (!serviceRoleSupabase) throw new Error("Supabase client is required");
  const pageSize = Math.max(1, Math.min(60, Number(options.pageSize) || 60));
  const requestedPage = Math.max(1, Number(options.page) || 1);

  let countQuery = serviceRoleSupabase
    .from("series")
    .select(`id,${PUBLIC_VARIANT_RELATION}`, { count: "exact", head: true })
    .eq(type, value);
  countQuery = applyPublicVariantRelationFilter(countQuery);
  const countResult = await countQuery;
  if (countResult.error) throw new Error(`Supabase public ${type} series count failed: ${countResult.error.message}`);

  const total = countResult.count ?? 0;
  if (total === 0) return emptyResult(requestedPage, pageSize);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);

  let query = serviceRoleSupabase
    .from("series")
    .select(`${SERIES_SELECT},${PUBLIC_VARIANT_RELATION}`)
    .eq(type, value);
  query = applyPublicVariantRelationFilter(query);
  const pageResult = await query
    .order("release_date", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (pageResult.error) throw new Error(`Supabase public ${type} series summary fetch failed: ${pageResult.error.message}`);

  const variantCountResult = await countPublicVariantsForFacet(type, value);
  const items = (pageResult.data ?? []).map(toSeriesSummary);
  return {
    items,
    total,
    variantCount: variantCountResult,
    page,
    pageSize,
    totalPages,
  };
}

async function countPublicVariantsForFacet(type, value) {
  const result = await applyPublicVariantFilter(
    serviceRoleSupabase
      .from("variants")
      .select("id,parent:series!inner(id)", { count: "exact", head: true })
  ).eq(`parent.${type}`, value);
  if (result.error) throw new Error(`Supabase public ${type} variant count failed: ${result.error.message}`);
  return result.count ?? 0;
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

function applyPublicVariantFilter(query) {
  return query
    .or("variant_type.is.null,variant_type.neq.provisional")
    .not("series_id", "is", null)
    .not("slug", "is", null)
    .neq("slug", "")
    .not("name", "is", null)
    .neq("name", "");
}

function embeddedVariantCount(value) {
  if (Array.isArray(value)) {
    if (value.length === 1 && Number.isFinite(Number(value[0]?.count))) return Number(value[0].count);
    return value.length;
  }
  if (value && typeof value === "object" && Number.isFinite(Number(value.count))) return Number(value.count);
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function toSeriesSummary(row = {}) {
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
  };
}

function emptyResult(page, pageSize) {
  return {
    items: [],
    total: 0,
    variantCount: 0,
    page,
    pageSize,
    totalPages: 1,
  };
}

function buildFacetResult(result, facetType, value) {
  const canonical = normalizeDiscoveryFacetIdentifier(result.items[0]?.[facetType] ?? value);
  return {
    ...result,
    facet: {
      name: canonical,
      series_count: result.total,
      variant_count: result.variantCount,
    },
  };
}
