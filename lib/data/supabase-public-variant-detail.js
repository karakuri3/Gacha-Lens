import { LISTING_TYPES } from "../domain/gacha-schema.js";

const TABLE_MAP = {
  series: "series",
  variants: "variants",
  marketListings: "market_listings",
  marketObservations: "market_listing_observations",
  xReactions: "x_reactions",
  restockEvents: "restock_events",
  stockReports: "stock_reports",
};

// Keep the public record shape aligned with the repository normalizers. This
// module changes query scope only; it deliberately does not change presentation
// semantics or persisted safety metadata.
const TABLE_SELECTS = {
  series: "id,slug,name,franchise,brand,category,release_month,release_week,release_date,price,image_url,official_url,is_released,source_type,created_at,updated_at",
  variants: "id,slug,series_id,name,variant_type,rarity,role,image,released,price,brand,release_month,release_week,release_date,official_url,axes,signals,tags,source_type,review_required,created_at,updated_at",
  marketListings: "id,variant_id,matched_variant_id,series_id,title,listing_type,market_review_type,classification_reason,classification_confidence,price,status,source,source_type,source_url,listed_at,sold_at,last_observed_at,confidence,review_required,raw,created_at,updated_at",
  marketObservations: "id,listing_id,variant_id,series_id,price,status,source,observed_at,created_at",
  xReactions: "id,variant_id,matched_variant_id,series_id,source_type,author_type,text,url,posted_at,reposts,likes,quotes,intent_tags,intent_labels,confidence,review_required,created_at,updated_at",
  restockEvents: "id,variant_id,matched_variant_id,series_id,source_type,source_weight,event_type,event_label,classification_reason,classification_keywords,text,region,shop_name,source_url,reported_at,confidence,review_required,raw,created_at,updated_at",
  stockReports: "id,variant_id,matched_variant_id,series_id,source_type,source_weight,status,status_label,text,region,shop_name,source_url,reported_at,confidence,review_required,created_at,updated_at",
};

const SERIES_SET_LISTING_TYPES = [
  LISTING_TYPES.COMPLETE_SET,
  LISTING_TYPES.PARTIAL_SET,
  LISTING_TYPES.POPULAR_SET,
];

const PAGE_SIZE = 1000;

export async function fetchSupabaseScopedVariantDetail(supabaseClient, slug) {
  if (!supabaseClient || !slug) return null;

  const relationSelect = `${TABLE_SELECTS.variants},parent:series!inner(${TABLE_SELECTS.series})`;
  let targetResult = await applyPublicVariantFilter(
    supabaseClient.from(TABLE_MAP.variants).select(relationSelect)
  )
    .eq("slug", slug)
    .limit(1)
    .maybeSingle();

  if (!targetResult.data && !targetResult.error) {
    targetResult = await applyPublicVariantFilter(
      supabaseClient.from(TABLE_MAP.variants).select(relationSelect)
    )
      .eq("id", slug)
      .limit(1)
      .maybeSingle();
  }

  if (targetResult.error) {
    throw new Error(`Supabase scoped catalog variant fetch failed: ${targetResult.error.message}`);
  }
  if (!targetResult.data) return null;

  const target = targetResult.data;
  const siblingResult = await applyPublicVariantFilter(
    supabaseClient.from(TABLE_MAP.variants).select(relationSelect)
  )
    .eq("series_id", target.series_id)
    .order("name", { ascending: true });
  if (siblingResult.error) {
    throw new Error(`Supabase scoped sibling variants fetch failed: ${siblingResult.error.message}`);
  }

  const catalog = splitCatalogRows(siblingResult.data?.length ? siblingResult.data : [target]);
  const signals = await fetchSignalsForVariantScope(supabaseClient, [target.id], catalog.series.map((row) => row.id));
  const marketObservations = await fetchRowsForColumn(
    supabaseClient,
    TABLE_MAP.marketObservations,
    TABLE_SELECTS.marketObservations,
    "variant_id",
    [target.id]
  );

  return {
    ...catalog,
    ...signals,
    marketObservations,
    importIssues: [],
  };
}

export async function fetchSupabaseScopedRelatedCatalog(supabaseClient, slug, options = {}) {
  if (!supabaseClient || !slug) return null;

  const candidateLimit = Math.max(1, Math.min(24, Number(options.candidateLimit) || 24));
  const relationSelect = `${TABLE_SELECTS.variants},parent:series!inner(${TABLE_SELECTS.series})`;
  const targetResult = await applyPublicVariantFilter(
    supabaseClient.from(TABLE_MAP.variants).select(relationSelect)
  )
    .eq("slug", slug)
    .limit(1)
    .maybeSingle();
  if (targetResult.error) {
    throw new Error(`Supabase scoped related target fetch failed: ${targetResult.error.message}`);
  }
  if (!targetResult.data) return null;

  const target = targetResult.data;
  const parent = target.parent ?? {};
  let candidates = applyPublicVariantFilter(
    supabaseClient.from(TABLE_MAP.variants).select(relationSelect)
  ).neq("id", target.id);

  if (parent.franchise) candidates = candidates.eq("parent.franchise", parent.franchise);
  else if (parent.brand) candidates = candidates.eq("parent.brand", parent.brand);
  else if (parent.category) candidates = candidates.eq("parent.category", parent.category);
  else candidates = candidates.eq("series_id", target.series_id);

  const candidateResult = await candidates
    .order("released", { ascending: false })
    .order("release_date", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(candidateLimit);
  if (candidateResult.error) {
    throw new Error(`Supabase scoped related candidates fetch failed: ${candidateResult.error.message}`);
  }

  const catalog = splitCatalogRows([target, ...(candidateResult.data ?? [])]);
  const signals = await fetchSignalsForVariantScope(
    supabaseClient,
    catalog.variants.map((row) => row.id),
    catalog.series.map((row) => row.id)
  );

  return {
    ...catalog,
    ...signals,
    marketObservations: [],
    importIssues: [],
  };
}

async function fetchSignalsForVariantScope(client, variantIds, seriesIds) {
  const ids = uniqueValues(variantIds);
  const parentIds = uniqueValues(seriesIds);
  if (!ids.length) return emptySignals();

  const [marketByVariant, marketByMatchedVariant, seriesSetListings, xByVariant, xByMatchedVariant, restockByVariant, restockByMatchedVariant, stockReports] = await Promise.all([
    fetchRowsForColumn(client, TABLE_MAP.marketListings, TABLE_SELECTS.marketListings, "variant_id", ids),
    fetchRowsForColumn(client, TABLE_MAP.marketListings, TABLE_SELECTS.marketListings, "matched_variant_id", ids),
    fetchSeriesSetListings(client, parentIds),
    fetchRowsForColumn(client, TABLE_MAP.xReactions, TABLE_SELECTS.xReactions, "variant_id", ids),
    fetchRowsForColumn(client, TABLE_MAP.xReactions, TABLE_SELECTS.xReactions, "matched_variant_id", ids),
    fetchRowsForColumn(client, TABLE_MAP.restockEvents, TABLE_SELECTS.restockEvents, "variant_id", ids),
    fetchRowsForColumn(client, TABLE_MAP.restockEvents, TABLE_SELECTS.restockEvents, "matched_variant_id", ids),
    fetchRowsForColumn(client, TABLE_MAP.stockReports, TABLE_SELECTS.stockReports, "variant_id", ids),
  ]);

  return {
    marketListings: dedupeRows([...marketByVariant, ...marketByMatchedVariant, ...seriesSetListings]),
    marketObservations: [],
    xReactions: dedupeRows([...xByVariant, ...xByMatchedVariant]),
    restockEvents: dedupeRows([...restockByVariant, ...restockByMatchedVariant]),
    stockReports: dedupeRows(stockReports),
  };
}

async function fetchSeriesSetListings(client, seriesIds) {
  if (!seriesIds.length) return [];
  return fetchPaged(() => client
    .from(TABLE_MAP.marketListings)
    .select(TABLE_SELECTS.marketListings)
    .in("series_id", seriesIds)
    .is("variant_id", null)
    .in("listing_type", SERIES_SET_LISTING_TYPES)
    .order("id", { ascending: true }));
}

async function fetchRowsForColumn(client, table, select, column, values) {
  const scopedValues = uniqueValues(values);
  if (!scopedValues.length) return [];
  return fetchPaged(() => client
    .from(table)
    .select(select)
    .in(column, scopedValues)
    .order("id", { ascending: true }));
}

async function fetchPaged(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (result.error) throw new Error(`Supabase scoped public signal fetch failed: ${result.error.message}`);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
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

function splitCatalogRows(rows) {
  const seriesById = new Map();
  const variants = [];
  for (const row of rows ?? []) {
    const { parent, ...variant } = row;
    if (parent?.id) seriesById.set(parent.id, parent);
    variants.push(variant);
  }
  return { series: [...seriesById.values()], variants };
}

function uniqueValues(values) {
  return [...new Set((values ?? []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function dedupeRows(rows) {
  return [...new Map((rows ?? []).filter(Boolean).map((row, index) => [row.id || `${row.source_url || "row"}-${index}`, row])).values()];
}

function emptySignals() {
  return {
    marketListings: [],
    marketObservations: [],
    xReactions: [],
    restockEvents: [],
    stockReports: [],
  };
}
