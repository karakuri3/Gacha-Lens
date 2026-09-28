import "server-only";
import {
  hasServiceRoleSupabaseConfig,
  serviceRoleSupabase,
} from "./supabase/service-role-client.js";
import { applyEffectiveReleaseFilter } from "./data/supabase-gacha-repository.js";

const STOCK_DAYS = 45;
const REPORT_LIMIT = 300;
const CHUNK_SIZE = 100;

const REPORT_SELECT = "id,variant_id,matched_variant_id,series_id,status,status_label,region,shop_name,reported_at,review_required";
const VARIANT_SELECT = "id,slug,series_id,name,variant_type,rarity,role,image,released,price,brand,release_month,release_week,release_date";
const SERIES_SELECT = "id,slug,name,brand,image_url,is_released";

export async function getPublicStockSummaryRows() {
  if (!hasServiceRoleSupabaseConfig || !serviceRoleSupabase) return null;

  let reportQuery = serviceRoleSupabase
    .from("stock_reports")
    .select(REPORT_SELECT)
    .not("variant_id", "is", null)
    .gte("reported_at", daysAgo(STOCK_DAYS))
    .order("reported_at", { ascending: false })
    .limit(REPORT_LIMIT);
  reportQuery = reportQuery.or("review_required.is.null,review_required.eq.false");
  const reportResult = await reportQuery;
  if (reportResult.error) throw new Error(`Supabase public stock reports fetch failed: ${reportResult.error.message}`);

  const reports = reportResult.data ?? [];
  if (!reports.length) return [];

  const variantIds = unique(reports.map((row) => row.variant_id));
  const variants = [];
  for (const ids of chunks(variantIds, CHUNK_SIZE)) {
    let query = applyPublicVariantFilter(
      serviceRoleSupabase
        .from("variants")
        .select(VARIANT_SELECT)
        .in("id", ids)
    );
    query = applyEffectiveReleaseFilter(query, "released", "released", "release_date");
    const result = await query;
    if (result.error) throw new Error(`Supabase public stock variants fetch failed: ${result.error.message}`);
    variants.push(...(result.data ?? []));
  }

  const variantById = new Map(variants.map((row) => [row.id, row]));
  const seriesIds = unique(variants.map((row) => row.series_id));
  const series = [];
  for (const ids of chunks(seriesIds, CHUNK_SIZE)) {
    let query = serviceRoleSupabase
      .from("series")
      .select(SERIES_SELECT)
      .in("id", ids);
    query = applyEffectiveReleaseFilter(query, "released", "is_released", "release_date");
    const result = await query;
    if (result.error) throw new Error(`Supabase public stock series fetch failed: ${result.error.message}`);
    series.push(...(result.data ?? []));
  }
  const seriesById = new Map(series.map((row) => [row.id, row]));

  return reports.flatMap((report) => {
    const variant = variantById.get(report.variant_id);
    const parent = variant ? seriesById.get(variant.series_id) : null;
    if (!variant || !parent) return [];

    return [{
      report: {
        id: report.id,
        status: report.status,
        status_label: report.status_label,
        region: report.region,
        shop_name: report.shop_name,
        reported_at: report.reported_at,
      },
      item: {
        variant_id: variant.id,
        slug: variant.slug,
        name: variant.name,
        rarity: variant.rarity,
        role: variant.role,
        image: variant.image,
        image_url: variant.image,
        price: variant.price,
        brand: variant.brand || parent.brand,
        release_month: variant.release_month,
        release_week: variant.release_week,
        release_date: variant.release_date,
        is_released: true,
        series_id: parent.id,
        series_slug: parent.slug,
        series_name: parent.name,
        series_image_url: parent.image_url,
        image_scope: variant.image ? "variant" : (parent.image_url ? "series_fallback" : "missing"),
      },
    }];
  });
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
