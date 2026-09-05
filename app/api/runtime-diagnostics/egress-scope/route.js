import { createGachaRepository } from "@/lib/series";
import {
  fetchSupabaseCatalogVariant,
  fetchSupabaseRelatedCatalog,
} from "@/lib/data/supabase-gacha-repository";
import {
  fetchSupabaseScopedRelatedCatalog,
  fetchSupabaseScopedVariantDetail,
} from "@/lib/data/supabase-public-variant-detail";
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
    const [oldRecords, scopedRecords, oldRelatedRecords, scopedRelatedRecords] = await Promise.all([
      fetchSupabaseCatalogVariant(serviceRoleSupabase, TARGET_SLUG),
      fetchSupabaseScopedVariantDetail(serviceRoleSupabase, TARGET_SLUG),
      fetchSupabaseRelatedCatalog(serviceRoleSupabase, TARGET_SLUG, { candidateLimit: 24 }),
      fetchSupabaseScopedRelatedCatalog(serviceRoleSupabase, TARGET_SLUG, { candidateLimit: 24 }),
    ]);
    if (!oldRecords || !scopedRecords || !oldRelatedRecords || !scopedRelatedRecords) {
      return Response.json({ status: "failed", reason: "target-missing" }, { headers: noStoreHeaders() });
    }

    const oldSummary = summarizeRecords(oldRecords);
    const scopedSummary = summarizeRecords(scopedRecords);
    const oldRelatedSummary = summarizeRecords(oldRelatedRecords);
    const scopedRelatedSummary = summarizeRecords(scopedRelatedRecords);

    const oldRepository = createGachaRepository(oldRecords);
    const scopedRepository = createGachaRepository(scopedRecords);
    const oldRelatedRepository = createGachaRepository(oldRelatedRecords);
    const scopedRelatedRepository = createGachaRepository(scopedRelatedRecords);

    const oldItem = oldRepository.findVariantBySlug(TARGET_SLUG);
    const scopedItem = scopedRepository.findVariantBySlug(TARGET_SLUG);
    const oldRelated = renderedRelatedSnapshot(oldRelatedRepository, oldItem);
    const scopedRelated = renderedRelatedSnapshot(scopedRelatedRepository, scopedItem);

    return Response.json({
      status: "ok",
      target: TARGET_SLUG,
      detail: {
        old: oldSummary,
        scoped: scopedSummary,
        reduction: reductionSummary(oldSummary, scopedSummary),
        semanticSnapshotEqual: JSON.stringify(semanticSnapshot(oldItem)) === JSON.stringify(semanticSnapshot(scopedItem)),
        semanticSnapshot: semanticSnapshot(scopedItem),
      },
      related: {
        old: oldRelatedSummary,
        scoped: scopedRelatedSummary,
        reduction: reductionSummary(oldRelatedSummary, scopedRelatedSummary),
        semanticSnapshotEqual: JSON.stringify(oldRelated) === JSON.stringify(scopedRelated),
        oldSemanticSnapshot: oldRelated,
        semanticSnapshot: scopedRelated,
      },
      rawColumnOpportunity: {
        detail: rawOpportunity(scopedRecords),
        related: rawOpportunity(scopedRelatedRecords),
      },
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

function reductionSummary(before, after) {
  return {
    signalRows: ratioReduction(before.signalRows, after.signalRows),
    signalJsonBytes: ratioReduction(before.signalJsonBytes, after.signalJsonBytes),
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

function renderedRelatedSnapshot(repository, item) {
  if (!repository || !item) return [];
  const isReleased = Boolean(item.is_released);
  return repository
    .getRelatedVariants(TARGET_SLUG, 8)
    .filter((entry) => Boolean(entry.is_released) === isReleased)
    .slice(0, 3)
    .map(relatedSnapshot);
}

function relatedSnapshot(item) {
  return {
    slug: item.slug,
    name: item.name,
    series_id: item.series_id,
    is_released: item.is_released,
    trend_score: item.trend_score,
    circulation_score: item.circulation_score,
    market_price_median: item.market_price_median,
  };
}

function rawOpportunity(records) {
  const market = Array.isArray(records?.marketListings) ? records.marketListings : [];
  const restock = Array.isArray(records?.restockEvents) ? records.restockEvents : [];
  const variantMarket = market.filter((row) => row.variant_id || row.matched_variant_id);
  const seriesSetMarket = market.filter((row) => !row.variant_id && !row.matched_variant_id);
  return {
    variantMarketRows: variantMarket.length,
    variantMarketRawJsonBytes: nestedRawBytes(variantMarket),
    seriesSetMarketRows: seriesSetMarket.length,
    seriesSetMarketRawJsonBytes: nestedRawBytes(seriesSetMarket),
    restockRows: restock.length,
    restockRawJsonBytes: nestedRawBytes(restock),
    removableRawJsonBytesEstimate: nestedRawBytes(variantMarket) + nestedRawBytes(restock),
  };
}

function nestedRawBytes(rows) {
  return (rows ?? []).reduce((sum, row) => sum + (row?.raw == null ? 0 : jsonBytes(row.raw)), 0);
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
