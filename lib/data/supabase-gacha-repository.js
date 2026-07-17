import { createAsyncRecordDataSource } from "./repository-contract";

const TABLE_MAP = {
  series: "series",
  variants: "variants",
  marketListings: "market_listings",
  marketObservations: "market_listing_observations",
  xReactions: "x_reactions",
  restockEvents: "restock_events",
  stockReports: "stock_reports",
  importIssues: "import_issues",
  ingestionRuns: "ingestion_runs",
  communityReports: "community_reports",
};

const TABLE_SELECTS = {
  series: "id,slug,name,franchise,brand,category,release_month,release_week,release_date,price,image_url,official_url,is_released,source_type,created_at,updated_at",
  variants: "id,slug,series_id,name,variant_type,rarity,role,image,released,price,brand,release_month,release_week,release_date,official_url,axes,signals,tags,source_type,review_required,created_at,updated_at",
  marketListings: "id,variant_id,matched_variant_id,series_id,title,listing_type,market_review_type,classification_reason,classification_confidence,price,status,source,source_type,source_url,listed_at,sold_at,last_observed_at,confidence,review_required,created_at,updated_at",
  marketObservations: "id,listing_id,variant_id,series_id,price,status,source,observed_at,created_at",
  xReactions: "id,variant_id,matched_variant_id,series_id,source_type,author_type,text,url,posted_at,reposts,likes,quotes,intent_tags,intent_labels,confidence,review_required,created_at,updated_at",
  restockEvents: "id,variant_id,matched_variant_id,series_id,source_type,source_weight,event_type,event_label,text,region,shop_name,source_url,reported_at,confidence,review_required,created_at,updated_at",
  stockReports: "id,variant_id,matched_variant_id,series_id,source_type,source_weight,status,status_label,text,region,shop_name,source_url,reported_at,confidence,review_required,created_at,updated_at",
  importIssues: "id,issue_type,table_name,record_id,source,source_url,raw,resolved,note,assignee,resolved_at,created_at,updated_at",
  ingestionRuns: "id,task,status,trigger_source,started_at,finished_at,duration_ms,summary,error_message,created_at,updated_at",
  communityReports: "id,variant_id,series_id,report_type,price,shop_name,region,source_url,note,occurred_at,status,confidence,review_required,reviewed_at,created_at,updated_at",
};

export function createSupabaseGachaDataSource(supabaseClient, options = {}) {
  const includeImportIssues = options.includeImportIssues !== false;
  const publicCatalogLimit = Number(options.publicCatalogLimit) || 0;
  return createAsyncRecordDataSource({
    name: "supabase",
    async loadRecords() {
      if (!supabaseClient) return {};

      const catalogPromise = publicCatalogLimit > 0
        ? fetchLimitedCatalog(supabaseClient, publicCatalogLimit)
        : Promise.all([
            fetchTable(supabaseClient, TABLE_MAP.series, TABLE_SELECTS.series),
            fetchTable(supabaseClient, TABLE_MAP.variants, TABLE_SELECTS.variants),
          ]).then(([series, variants]) => ({ series, variants }));

      const [
        catalog,
        marketListings,
        xReactions,
        restockEvents,
        stockReports,
        importIssues,
        ingestionRuns,
        communityReports,
      ] = await Promise.all([
        catalogPromise,
        fetchOptionalTable(supabaseClient, TABLE_MAP.marketListings, TABLE_SELECTS.marketListings),
        fetchOptionalTable(supabaseClient, TABLE_MAP.xReactions, TABLE_SELECTS.xReactions),
        fetchOptionalTable(supabaseClient, TABLE_MAP.restockEvents, TABLE_SELECTS.restockEvents),
        fetchOptionalTable(supabaseClient, TABLE_MAP.stockReports, TABLE_SELECTS.stockReports),
        includeImportIssues
          ? fetchOptionalTable(supabaseClient, TABLE_MAP.importIssues, TABLE_SELECTS.importIssues)
          : Promise.resolve([]),
        includeImportIssues
          ? fetchRecentRows(supabaseClient, TABLE_MAP.ingestionRuns, TABLE_SELECTS.ingestionRuns, "started_at", 80)
          : Promise.resolve([]),
        includeImportIssues
          ? fetchRecentRows(supabaseClient, TABLE_MAP.communityReports, TABLE_SELECTS.communityReports, "created_at", 200)
          : Promise.resolve([]),
      ]);

      return {
        series: catalog.series,
        variants: catalog.variants,
        marketListings,
        xReactions,
        restockEvents,
        stockReports,
        importIssues,
        ingestionRuns,
        communityReports,
      };
    },
  });
}

async function fetchLimitedCatalog(client, limit) {
  const relationSelect = `${TABLE_SELECTS.variants},parent:series!inner(${TABLE_SELECTS.series})`;
  const releasedLimit = Math.max(1, Math.floor(limit / 2));
  const upcomingLimit = Math.max(1, limit - releasedLimit);
  const [releasedResult, upcomingResult] = await Promise.all([
    client
      .from(TABLE_MAP.variants)
      .select(relationSelect)
      .eq("released", true)
      .order("release_date", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(releasedLimit),
    client
      .from(TABLE_MAP.variants)
      .select(relationSelect)
      .eq("released", false)
      .order("release_date", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(upcomingLimit),
  ]);
  const error = releasedResult.error || upcomingResult.error;
  if (error) throw new Error(`Supabase public catalog fetch failed: ${error.message}`);

  const rows = [...(releasedResult.data ?? []), ...(upcomingResult.data ?? [])];
  return splitCatalogRows([...new Map(rows.map((row) => [row.id, row])).values()]);
}

export async function fetchSupabaseCatalogPage(supabaseClient, options = {}) {
  if (!supabaseClient) throw new Error("Supabase client is required");
  const pageSize = Math.max(1, Math.min(120, Number(options.pageSize) || 120));
  const page = Math.max(1, Number(options.page) || 1);
  const from = (page - 1) * pageSize;
  const queryText = sanitizeSearch(options.q);
  const matchingSeriesIds = queryText ? await findMatchingSeriesIds(supabaseClient, queryText) : [];
  const relationSelect = `${TABLE_SELECTS.variants},parent:series!inner(${TABLE_SELECTS.series})`;
  let query = supabaseClient.from(TABLE_MAP.variants).select(relationSelect, { count: "exact" });

  if (options.filter === "released") query = query.eq("released", true);
  if (options.filter === "upcoming") query = query.eq("released", false);
  if (queryText) {
    const clauses = [`name.ilike.%${queryText}%`, `rarity.ilike.%${queryText}%`, `role.ilike.%${queryText}%`];
    if (matchingSeriesIds.length) clauses.push(`series_id.in.(${matchingSeriesIds.join(",")})`);
    query = query.or(clauses.join(","));
  }

  const result = await query
    .order("release_date", { ascending: options.sort === "release", nullsFirst: false })
    .order("updated_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (result.error) throw new Error(`Supabase catalog page fetch failed: ${result.error.message}`);

  const catalog = splitCatalogRows(result.data ?? []);
  const signals = await fetchSignalsForCatalog(supabaseClient, catalog);
  return {
    records: { ...catalog, ...signals, importIssues: [] },
    total: result.count ?? catalog.variants.length,
    page,
    pageSize,
  };
}

export async function fetchSupabaseCatalogCounts(supabaseClient) {
  if (!supabaseClient) return null;
  const [series, all, released, upcoming] = await Promise.all([
    countRows(supabaseClient, TABLE_MAP.series),
    countRows(supabaseClient, TABLE_MAP.variants),
    countRows(supabaseClient, TABLE_MAP.variants, { column: "released", value: true }),
    countRows(supabaseClient, TABLE_MAP.variants, { column: "released", value: false }),
  ]);
  return { series, all, released, upcoming };
}

export async function fetchSupabaseReleasedSignalCatalog(supabaseClient, options = {}) {
  if (!supabaseClient) throw new Error("Supabase client is required");
  const signalLimit = Math.max(100, Math.min(3000, Number(options.signalLimit) || 1000));
  const marketCutoff = new Date(Date.now() - 180 * 86400000).toISOString();
  const stockCutoff = new Date(Date.now() - 45 * 86400000).toISOString();
  const [marketResult, stockResult, restockResult] = await Promise.all([
    supabaseClient
      .from(TABLE_MAP.marketListings)
      .select("variant_id")
      .not("variant_id", "is", null)
      .gte("last_observed_at", marketCutoff)
      .order("last_observed_at", { ascending: false })
      .limit(signalLimit),
    supabaseClient
      .from(TABLE_MAP.stockReports)
      .select("variant_id")
      .not("variant_id", "is", null)
      .gte("reported_at", stockCutoff)
      .order("reported_at", { ascending: false })
      .limit(signalLimit),
    supabaseClient
      .from(TABLE_MAP.restockEvents)
      .select("variant_id")
      .not("variant_id", "is", null)
      .gte("reported_at", stockCutoff)
      .order("reported_at", { ascending: false })
      .limit(signalLimit),
  ]);
  const failed = [marketResult, stockResult, restockResult].find((result) => result.error);
  if (failed?.error) throw new Error(`Supabase ranking signals fetch failed: ${failed.error.message}`);

  const variantIds = [...new Set(
    [marketResult.data, stockResult.data, restockResult.data]
      .flat()
      .map((row) => row?.variant_id)
      .filter(Boolean)
  )];
  if (!variantIds.length) return { series: [], variants: [], marketListings: [], xReactions: [], restockEvents: [], stockReports: [] };

  const relationSelect = `${TABLE_SELECTS.variants},parent:series!inner(${TABLE_SELECTS.series})`;
  const rows = [];
  for (const idBatch of chunkValues(variantIds, 100)) {
    const { data, error } = await supabaseClient
      .from(TABLE_MAP.variants)
      .select(relationSelect)
      .eq("released", true)
      .in("id", idBatch);
    if (error) throw new Error(`Supabase ranking catalog fetch failed: ${error.message}`);
    rows.push(...(data ?? []));
  }
  const catalog = splitCatalogRows(rows);
  return { ...catalog, ...(await fetchSignalsForCatalog(supabaseClient, catalog)), importIssues: [] };
}

export async function fetchSupabaseCatalogVariant(supabaseClient, slug) {
  if (!supabaseClient || !slug) return null;
  const relationSelect = `${TABLE_SELECTS.variants},parent:series!inner(${TABLE_SELECTS.series})`;
  let { data, error } = await supabaseClient
    .from(TABLE_MAP.variants)
    .select(relationSelect)
    .eq("slug", slug)
    .limit(1)
    .maybeSingle();
  if (!data && !error) {
    ({ data, error } = await supabaseClient
      .from(TABLE_MAP.variants)
      .select(relationSelect)
      .eq("id", slug)
      .limit(1)
      .maybeSingle());
  }
  if (error) throw new Error(`Supabase catalog variant fetch failed: ${error.message}`);
  if (!data) return null;
  const siblingResult = await supabaseClient
    .from(TABLE_MAP.variants)
    .select(relationSelect)
    .eq("series_id", data.series_id)
    .order("name", { ascending: true });
  if (siblingResult.error) throw new Error(`Supabase sibling variants fetch failed: ${siblingResult.error.message}`);
  const catalog = splitCatalogRows(siblingResult.data?.length ? siblingResult.data : [data]);
  const targetCatalog = {
    series: catalog.series,
    variants: catalog.variants.filter((variant) => variant.id === data.id),
  };
  const [signals, marketObservations] = await Promise.all([
    fetchSignalsForCatalog(supabaseClient, targetCatalog),
    fetchRowsIn(supabaseClient, TABLE_MAP.marketObservations, TABLE_SELECTS.marketObservations, "variant_id", [data.id]),
  ]);
  return { ...catalog, ...signals, marketObservations, importIssues: [] };
}

function splitCatalogRows(rows) {
  const seriesById = new Map();
  const variants = [];
  for (const row of rows) {
    const { parent, ...variant } = row;
    if (parent?.id) seriesById.set(parent.id, parent);
    variants.push(variant);
  }
  return { series: [...seriesById.values()], variants };
}

async function fetchSignalsForCatalog(client, catalog) {
  const variantIds = catalog.variants.map((row) => row.id).filter(Boolean);
  const seriesIds = catalog.series.map((row) => row.id).filter(Boolean);
  const [variantMarket, seriesMarket, xReactions, restockEvents, stockReports] = await Promise.all([
    fetchRowsIn(client, TABLE_MAP.marketListings, TABLE_SELECTS.marketListings, "variant_id", variantIds),
    fetchRowsIn(client, TABLE_MAP.marketListings, TABLE_SELECTS.marketListings, "series_id", seriesIds),
    fetchRowsIn(client, TABLE_MAP.xReactions, TABLE_SELECTS.xReactions, "variant_id", variantIds),
    fetchRowsIn(client, TABLE_MAP.restockEvents, TABLE_SELECTS.restockEvents, "variant_id", variantIds),
    fetchRowsIn(client, TABLE_MAP.stockReports, TABLE_SELECTS.stockReports, "variant_id", variantIds),
  ]);
  return {
    marketListings: [...new Map([...variantMarket, ...seriesMarket].map((row) => [row.id, row])).values()],
    xReactions,
    restockEvents,
    stockReports,
  };
}

async function fetchRowsIn(client, tableName, select, column, values) {
  if (!values.length) return [];
  const rows = [];
  for (const valueBatch of chunkValues(values, 100)) {
    const pageSize = 1000;
    const firstPage = await client
      .from(tableName)
      .select(select, { count: "exact" })
      .in(column, valueBatch)
      .range(0, pageSize - 1);
    if (firstPage.error) {
      console.warn(`[supabase-gacha] ${tableName} catalog signals unavailable: ${firstPage.error.message}`);
      return rows;
    }
    rows.push(...(firstPage.data ?? []));
    const total = firstPage.count ?? firstPage.data?.length ?? 0;
    for (let from = pageSize; from < total; from += pageSize) {
      const page = await client
        .from(tableName)
        .select(select)
        .in(column, valueBatch)
        .range(from, Math.min(total - 1, from + pageSize - 1));
      if (page.error) {
        console.warn(`[supabase-gacha] ${tableName} catalog signal page unavailable: ${page.error.message}`);
        break;
      }
      rows.push(...(page.data ?? []));
    }
  }
  return rows;
}

async function findMatchingSeriesIds(client, q) {
  const { data, error } = await client
    .from(TABLE_MAP.series)
    .select("id")
    .or(`name.ilike.%${q}%,franchise.ilike.%${q}%,brand.ilike.%${q}%`)
    .limit(300);
  if (error) return [];
  return (data ?? []).map((row) => row.id).filter(Boolean);
}

async function countRows(client, tableName, filter = null) {
  let query = client.from(tableName).select("id", { count: "exact", head: true });
  if (filter) query = query.eq(filter.column, filter.value);
  const { count, error } = await query;
  if (error) throw new Error(`Supabase ${tableName} count failed: ${error.message}`);
  return count ?? 0;
}

function sanitizeSearch(value) {
  return String(value || "").trim().replace(/[,%()]/g, "").slice(0, 80);
}

function chunkValues(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

export function toSupabaseTablePayload(records = {}) {
  return {
    [TABLE_MAP.series]: records.series ?? [],
    [TABLE_MAP.variants]: records.variants ?? [],
    [TABLE_MAP.marketListings]: records.marketListings ?? [],
    [TABLE_MAP.xReactions]: records.xReactions ?? [],
    [TABLE_MAP.restockEvents]: records.restockEvents ?? [],
    [TABLE_MAP.stockReports]: records.stockReports ?? [],
    [TABLE_MAP.importIssues]: records.importIssues ?? [],
  };
}

export async function upsertOfficialRecords(supabaseClient, records = {}) {
  if (!supabaseClient) throw new Error("Supabase client is required");
  const payload = toSupabaseTablePayload(records);

  await upsertTable(supabaseClient, TABLE_MAP.series, payload[TABLE_MAP.series]);
  await upsertTable(supabaseClient, TABLE_MAP.variants, payload[TABLE_MAP.variants]);

  return {
    series: payload[TABLE_MAP.series].length,
    variants: payload[TABLE_MAP.variants].length,
  };
}

export async function upsertMarketRecords(supabaseClient, records = {}) {
  if (!supabaseClient) throw new Error("Supabase client is required");
  const payload = toSupabaseTablePayload(records);

  await upsertTable(supabaseClient, TABLE_MAP.marketListings, payload[TABLE_MAP.marketListings]);
  await upsertTable(supabaseClient, TABLE_MAP.importIssues, payload[TABLE_MAP.importIssues]);

  return {
    marketListings: payload[TABLE_MAP.marketListings].length,
    importIssues: payload[TABLE_MAP.importIssues].length,
  };
}

export async function upsertXReactionRecords(supabaseClient, records = {}) {
  if (!supabaseClient) throw new Error("Supabase client is required");
  const payload = toSupabaseTablePayload(records);

  await upsertTable(supabaseClient, TABLE_MAP.xReactions, payload[TABLE_MAP.xReactions]);
  await upsertTable(supabaseClient, TABLE_MAP.importIssues, payload[TABLE_MAP.importIssues]);

  return {
    xReactions: payload[TABLE_MAP.xReactions].length,
    importIssues: payload[TABLE_MAP.importIssues].length,
  };
}

export async function upsertStockSignalRecords(supabaseClient, records = {}) {
  if (!supabaseClient) throw new Error("Supabase client is required");
  const payload = toSupabaseTablePayload(records);

  await upsertTable(supabaseClient, TABLE_MAP.restockEvents, payload[TABLE_MAP.restockEvents]);
  await upsertTable(supabaseClient, TABLE_MAP.stockReports, payload[TABLE_MAP.stockReports]);
  await upsertTable(supabaseClient, TABLE_MAP.importIssues, payload[TABLE_MAP.importIssues]);

  return {
    restockEvents: payload[TABLE_MAP.restockEvents].length,
    stockReports: payload[TABLE_MAP.stockReports].length,
    importIssues: payload[TABLE_MAP.importIssues].length,
  };
}

async function upsertTable(client, tableName, rows = []) {
  if (!rows.length) return;
  const { error } = await client.from(tableName).upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`Supabase ${tableName} upsert failed: ${error.message}`);
}

async function fetchTable(client, tableName, select = "*") {
  const { data, error } = await fetchAllRows(client, tableName, select);
  if (error) {
    throw new Error(`Supabase ${tableName} fetch failed: ${error.message}`);
  }
  return data ?? [];
}

async function fetchOptionalTable(client, tableName, select = "*") {
  const { data, error } = await fetchAllRows(client, tableName, select);
  if (error) {
    console.warn(`[supabase-gacha] Optional table ${tableName} unavailable: ${error.message}`);
    return [];
  }
  return data ?? [];
}

async function fetchRecentRows(client, tableName, select, orderColumn, limit) {
  const { data, error } = await client
    .from(tableName)
    .select(select)
    .order(orderColumn, { ascending: false })
    .limit(limit);
  if (error) {
    console.warn(`[supabase-gacha] Optional table ${tableName} unavailable: ${error.message}`);
    return [];
  }
  return data ?? [];
}

async function fetchAllRows(client, tableName, select = "*") {
  const pageSize = 1000;
  const firstPage = await client
    .from(tableName)
    .select(select, { count: "exact" })
    .range(0, pageSize - 1);
  if (firstPage.error) return { data: [], error: firstPage.error };

  const rows = [...(firstPage.data ?? [])];
  const total = firstPage.count ?? rows.length;
  if (total <= pageSize) return { data: rows, error: null };

  const pageRequests = [];
  for (let from = pageSize; from < total; from += pageSize) {
    pageRequests.push(
      client.from(tableName).select(select).range(from, Math.min(total - 1, from + pageSize - 1))
    );
  }

  const pages = await Promise.all(pageRequests);
  const failed = pages.find((page) => page.error);
  if (failed?.error) return { data: rows, error: failed.error };
  for (const page of pages) rows.push(...(page.data ?? []));
  return { data: rows, error: null };
}
