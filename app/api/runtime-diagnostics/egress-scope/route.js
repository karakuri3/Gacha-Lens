import { createGachaRepository } from "@/lib/series";
import { fetchSupabaseCatalogVariant } from "@/lib/data/supabase-gacha-repository";
import { fetchSupabaseScopedVariantDetail } from "@/lib/data/supabase-public-variant-detail";
import {
  hasServiceRoleSupabaseConfig,
  serviceRoleSupabase,
} from "@/lib/supabase/service-role-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TARGET_SLUG = "tarts-y901096-ディズニー-マリー";
const RECORD_KEYS = [
  "series",
  "variants",
  "marketListings",
  "marketObservations",
  "xReactions",
  "restockEvents",
  "stockReports",
];

export async function GET(request) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  if (!hostname.endsWith(".workers.dev")) return new Response(null, { status: 404 });
  if (!hasServiceRoleSupabaseConfig) {
    return Response.json({ status: "failed", reason: "supabase-config-unavailable" }, { headers: noStoreHeaders() });
  }

  try {
    // Intentionally bounded one-shot A/B measurement. This route is temporary
    // and must be removed before the candidate can become Production-ready.
    const oldRecords = await fetchSupabaseCatalogVariant(serviceRoleSupabase, TARGET_SLUG);
    const scopedRecords = await fetchSupabaseScopedVariantDetail(serviceRoleSupabase, TARGET_SLUG);
    if (!oldRecords || !scopedRecords) {
      return Response.json({ status: "failed", reason: "target-missing" }, { headers: noStoreHeaders() });
    }

    const oldSummary = summarizeRecords(oldRecords);
    const scopedSummary = summarizeRecords(scopedRecords);
    const oldItem = createGachaRepository(oldRecords).findVariantBySlug(TARGET_SLUG);
    const scopedItem = createGachaRepository(scopedRecords).findVariantBySlug(TARGET_SLUG);

    return Response.json({
      status: "ok",
      target: TARGET_SLUG,
      old: oldSummary,
      scoped: scopedSummary,
      reduction: {
        signalRows: ratioReduction(oldSummary.signalRows, scopedSummary.signalRows),
        signalJsonBytes: ratioReduction(oldSummary.signalJsonBytes, scopedSummary.signalJsonBytes),
      },
      semanticSnapshotEqual: JSON.stringify(semanticSnapshot(oldItem)) === JSON.stringify(semanticSnapshot(scopedItem)),
      semanticSnapshot: semanticSnapshot(scopedItem),
    }, { headers: noStoreHeaders() });
  } catch (error) {
    return Response.json({
      status: "failed",
      error: {
        name: String(error?.name || "Error").slice(0, 80),
        message: String(error?.message || "").slice(0, 240),
      },
    }, { headers: noStoreHeaders() });
  }
}

function summarizeRecords(records) {
  const byKey = Object.fromEntries(RECORD_KEYS.map((key) => {
    const rows = Array.isArray(records?.[key]) ? records[key] : [];
    return [key, { rows: rows.length, jsonBytes: jsonBytes(rows) }];
  }));
  const signalKeys = ["marketListings", "marketObservations", "xReactions", "restockEvents", "stockReports"];
  return {
    byKey,
    signalRows: signalKeys.reduce((sum, key) => sum + byKey[key].rows, 0),
    signalJsonBytes: signalKeys.reduce((sum, key) => sum + byKey[key].jsonBytes, 0),
  };
}

function semanticSnapshot(item) {
  if (!item) return null;
  return {
    name: item.name,
    series_name: item.series_name,
    price: item.price,
    is_released: item.is_released,
    market_price_median: item.market_price_median,
    market_listing_count: Array.isArray(item.market_listings) ? item.market_listings.length : 0,
    market_observation_count: Array.isArray(item.market_observations) ? item.market_observations.length : 0,
    restock_event_count: Array.isArray(item.restock_events) ? item.restock_events.length : 0,
    stock_report_count: Array.isArray(item.stock_reports) ? item.stock_reports.length : 0,
    x_reaction_count: Array.isArray(item.x_reactions) ? item.x_reactions.length : 0,
    trend_score: item.trend_score,
    circulation_score: item.circulation_score,
    sibling_count: Array.isArray(item.sibling_variants) ? item.sibling_variants.length : 0,
  };
}

function jsonBytes(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function ratioReduction(before, after) {
  if (!Number.isFinite(before) || before <= 0) return null;
  return Number((((before - after) / before) * 100).toFixed(1));
}

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  };
}
