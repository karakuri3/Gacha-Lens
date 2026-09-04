import "server-only";
import {
  hasServiceRoleSupabaseConfig,
  serviceRoleSupabase,
} from "../supabase/service-role-client";

const SIGNAL_LIMIT = 1000;
const CHUNK_SIZE = 100;
const MARKET_DAYS = 180;
const STOCK_DAYS = 45;

const SERIES_SELECT = "id,slug,name,franchise,brand,category,release_month,release_week,release_date,price,image_url,official_url,is_released,source_type,created_at,updated_at";
const VARIANT_SELECT = "id,slug,series_id,name,variant_type,rarity,role,image,released,price,brand,release_month,release_week,release_date,official_url,axes,signals,tags,source_type,review_required,created_at,updated_at";
const STOCK_SELECT = "id,variant_id,matched_variant_id,series_id,source_type,source_weight,status,status_label,text,region,shop_name,source_url,reported_at,confidence,review_required,created_at,updated_at";

export async function getReleasedStockFeedRecords() {
  if (!hasServiceRoleSupabaseConfig || !serviceRoleSupabase) return null;

  const marketCutoff = daysAgo(MARKET_DAYS);
  const stockCutoff = daysAgo(STOCK_DAYS);

  // Preserve the released-ranking candidate boundary used by /stock, but only
  // fetch lightweight identifiers here. The old page then loaded market, X,
  // restock and stock payloads for those candidates even though it rendered
  // stock reports only.
  const [marketResult, stockResult, restockResult] = await Promise.all([
    serviceRoleSupabase
      .from("market_listings")
      .select("variant_id")
      .not("variant_id", "is", null)
      .gte("last_observed_at", marketCutoff)
      .order("last_observed_at", { ascending: false })
      .limit(SIGNAL_LIMIT),
    serviceRoleSupabase
      .from("stock_reports")
      .select("variant_id")
      .not("variant_id", "is", null)
      .gte("reported_at", stockCutoff)
      .order("reported_at", { ascending: false })
      .limit(SIGNAL_LIMIT),
    serviceRoleSupabase
      .from("restock_events")
      .select("variant_id")
      .not("variant_id", "is", null)
      .gte("reported_at", stockCutoff)
      .order("reported_at", { ascending: false })
      .limit(SIGNAL_LIMIT),
  ]);

  const failed = [marketResult, stockResult, restockResult].find((result) => result.error);
  if (failed?.error) throw new Error(`Supabase stock feed signals fetch failed: ${failed.error.message}`);

  const candidateVariantIds = unique([
    ...(marketResult.data ?? []).map((row) => row.variant_id),
    ...(stockResult.data ?? []).map((row) => row.variant_id),
    ...(restockResult.data ?? []).map((row) => row.variant_id),
  ]);
  if (!candidateVariantIds.length) return emptyRecords();

  const variants = [];
  for (const ids of chunks(candidateVariantIds, CHUNK_SIZE)) {
    const { data, error } = await applyPublicVariantFilter(
      serviceRoleSupabase.from("variants").select(VARIANT_SELECT)
    )
      .eq("released", true)
      .in("id", ids);
    if (error) throw new Error(`Supabase stock feed variants fetch failed: ${error.message}`);
    variants.push(...(data ?? []));
  }
  if (!variants.length) return emptyRecords();

  const seriesIds = unique(variants.map((row) => row.series_id));
  const series = [];
  for (const ids of chunks(seriesIds, CHUNK_SIZE)) {
    const { data, error } = await serviceRoleSupabase
      .from("series")
      .select(SERIES_SELECT)
      .eq("is_released", true)
      .in("id", ids);
    if (error) throw new Error(`Supabase stock feed series fetch failed: ${error.message}`);
    series.push(...(data ?? []));
  }

  const publicSeriesIds = new Set(series.map((row) => row.id).filter(Boolean));
  const publicVariants = variants.filter((row) => publicSeriesIds.has(row.series_id));
  const publicVariantIds = publicVariants.map((row) => row.id).filter(Boolean);
  if (!publicVariantIds.length) return emptyRecords();

  // Only stock reports attached to variants that can actually render on this
  // page are needed. This removes the former market/X/restock payload fan-out
  // and also avoids loading reports for sibling variants that are not in the
  // released signal candidate set.
  const stockReports = await fetchRowsByVariant("stock_reports", STOCK_SELECT, publicVariantIds);

  return {
    series,
    variants: publicVariants,
    marketListings: [],
    marketObservations: [],
    xReactions: [],
    restockEvents: [],
    stockReports,
    importIssues: [],
    ingestionRuns: [],
    communityReports: [],
  };
}

async function fetchRowsByVariant(table, select, variantIds) {
  const rows = [];
  for (const ids of chunks(variantIds, CHUNK_SIZE)) {
    const pageSize = 1000;
    const first = await serviceRoleSupabase
      .from(table)
      .select(select, { count: "exact" })
      .in("variant_id", ids)
      .range(0, pageSize - 1);
    if (first.error) throw new Error(`Supabase stock feed ${table} fetch failed: ${first.error.message}`);
    rows.push(...(first.data ?? []));

    const total = first.count ?? first.data?.length ?? 0;
    for (let from = pageSize; from < total; from += pageSize) {
      const page = await serviceRoleSupabase
        .from(table)
        .select(select)
        .in("variant_id", ids)
        .range(from, Math.min(total - 1, from + pageSize - 1));
      if (page.error) throw new Error(`Supabase stock feed ${table} page fetch failed: ${page.error.message}`);
      rows.push(...(page.data ?? []));
    }
  }
  return rows;
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

function emptyRecords() {
  return {
    series: [],
    variants: [],
    marketListings: [],
    marketObservations: [],
    xReactions: [],
    restockEvents: [],
    stockReports: [],
    importIssues: [],
    ingestionRuns: [],
    communityReports: [],
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function chunks(values, size) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

function daysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}
