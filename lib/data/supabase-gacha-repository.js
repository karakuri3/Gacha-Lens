import { createAsyncRecordDataSource } from "./repository-contract";

const TABLE_MAP = {
  series: "series",
  variants: "variants",
  marketListings: "market_listings",
  xReactions: "x_reactions",
  restockEvents: "restock_events",
  stockReports: "stock_reports",
  importIssues: "import_issues",
};

export function createSupabaseGachaDataSource(supabaseClient) {
  return createAsyncRecordDataSource({
    name: "supabase",
    async loadRecords() {
      if (!supabaseClient) return {};

      const [
        series,
        variants,
        marketListings,
        xReactions,
        restockEvents,
        stockReports,
        importIssues,
      ] = await Promise.all([
        fetchTable(supabaseClient, TABLE_MAP.series),
        fetchTable(supabaseClient, TABLE_MAP.variants),
        fetchOptionalTable(supabaseClient, TABLE_MAP.marketListings),
        fetchOptionalTable(supabaseClient, TABLE_MAP.xReactions),
        fetchOptionalTable(supabaseClient, TABLE_MAP.restockEvents),
        fetchOptionalTable(supabaseClient, TABLE_MAP.stockReports),
        fetchOptionalTable(supabaseClient, TABLE_MAP.importIssues),
      ]);

      return {
        series,
        variants,
        marketListings,
        xReactions,
        restockEvents,
        stockReports,
        importIssues,
      };
    },
  });
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

async function upsertTable(client, tableName, rows = []) {
  if (!rows.length) return;
  const { error } = await client.from(tableName).upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`Supabase ${tableName} upsert failed: ${error.message}`);
}

async function fetchTable(client, tableName) {
  const { data, error } = await client.from(tableName).select("*");
  if (error) {
    throw new Error(`Supabase ${tableName} fetch failed: ${error.message}`);
  }
  return data ?? [];
}

async function fetchOptionalTable(client, tableName) {
  const { data, error } = await client.from(tableName).select("*");
  if (error) {
    console.warn(`[supabase-gacha] Optional table ${tableName} unavailable: ${error.message}`);
    return [];
  }
  return data ?? [];
}
