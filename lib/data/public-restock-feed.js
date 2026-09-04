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
const RESTOCK_SELECT = "id,variant_id,matched_variant_id,series_id,source_type,source_weight,event_type,event_label,classification_reason,classification_keywords,text,region,shop_name,source_url,reported_at,confidence,review_required,raw,created_at,updated_at";

export async function getReleasedRestockFeed() {
  if (!hasServiceRoleSupabaseConfig || !serviceRoleSupabase) return null;

  const marketCutoff = daysAgo(MARKET_DAYS);
  const stockCutoff = daysAgo(STOCK_DAYS);
  const [marketResult, stockResult, restockResult] = await Promise.all([
    serviceRoleSupabase
      .from("market_listings")
      .select("series_id")
      .not("series_id", "is", null)
      .gte("last_observed_at", marketCutoff)
      .order("last_observed_at", { ascending: false })
      .limit(SIGNAL_LIMIT),
    serviceRoleSupabase
      .from("stock_reports")
      .select("series_id")
      .not("series_id", "is", null)
      .gte("reported_at", stockCutoff)
      .order("reported_at", { ascending: false })
      .limit(SIGNAL_LIMIT),
    serviceRoleSupabase
      .from("restock_events")
      .select("series_id")
      .not("series_id", "is", null)
      .gte("reported_at", stockCutoff)
      .order("reported_at", { ascending: false })
      .limit(SIGNAL_LIMIT),
  ]);

  const failed = [marketResult, stockResult, restockResult].find((result) => result.error);
  if (failed?.error) throw new Error(`Supabase restock feed signals fetch failed: ${failed.error.message}`);

  const candidateSeriesIds = unique([
    ...(marketResult.data ?? []).map((row) => row.series_id),
    ...(stockResult.data ?? []).map((row) => row.series_id),
    ...(restockResult.data ?? []).map((row) => row.series_id),
  ]);
  if (!candidateSeriesIds.length) return [];

  const releasedSeries = [];
  for (const ids of chunks(candidateSeriesIds, CHUNK_SIZE)) {
    const { data, error } = await serviceRoleSupabase
      .from("series")
      .select(SERIES_SELECT)
      .eq("is_released", true)
      .in("id", ids);
    if (error) throw new Error(`Supabase restock feed series fetch failed: ${error.message}`);
    releasedSeries.push(...(data ?? []));
  }

  const releasedIds = releasedSeries.map((row) => row.id).filter(Boolean);
  if (!releasedIds.length) return [];

  // Restocks only needs restock events. The former ranking loader also fetched
  // market, X and stock payloads for every candidate series even though this
  // page never consumed them. Keep the same candidate-series boundary while
  // eliminating those three unused signal fan-outs.
  const [variants, events] = await Promise.all([
    fetchRowsBySeries("variants", VARIANT_SELECT, releasedIds),
    fetchRowsBySeries("restock_events", RESTOCK_SELECT, releasedIds),
  ]);

  const variantsBySeries = groupBy(variants, "series_id");
  const eventsBySeries = groupBy(events, "series_id");
  return releasedSeries.map((series) => ({
    ...series,
    series_id: series.id,
    variants: variantsBySeries.get(series.id) ?? [],
    restock_events: eventsBySeries.get(series.id) ?? [],
  }));
}

async function fetchRowsBySeries(table, select, seriesIds) {
  const rows = [];
  for (const ids of chunks(seriesIds, CHUNK_SIZE)) {
    const pageSize = 1000;
    const first = await serviceRoleSupabase
      .from(table)
      .select(select, { count: "exact" })
      .in("series_id", ids)
      .range(0, pageSize - 1);
    if (first.error) throw new Error(`Supabase restock feed ${table} fetch failed: ${first.error.message}`);
    rows.push(...(first.data ?? []));
    const total = first.count ?? first.data?.length ?? 0;
    for (let from = pageSize; from < total; from += pageSize) {
      const page = await serviceRoleSupabase
        .from(table)
        .select(select)
        .in("series_id", ids)
        .range(from, Math.min(total - 1, from + pageSize - 1));
      if (page.error) throw new Error(`Supabase restock feed ${table} page fetch failed: ${page.error.message}`);
      rows.push(...(page.data ?? []));
    }
  }
  return rows;
}

function groupBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const value = row?.[key];
    if (!value) continue;
    const group = groups.get(value) ?? [];
    group.push(row);
    groups.set(value, group);
  }
  return groups;
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
