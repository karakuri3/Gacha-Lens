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
        fetchTable(supabaseClient, TABLE_MAP.marketListings),
        fetchTable(supabaseClient, TABLE_MAP.xReactions),
        fetchTable(supabaseClient, TABLE_MAP.restockEvents),
        fetchTable(supabaseClient, TABLE_MAP.stockReports),
        fetchTable(supabaseClient, TABLE_MAP.importIssues),
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

async function fetchTable(client, tableName) {
  const { data, error } = await client.from(tableName).select("*");
  if (error) {
    throw new Error(`Supabase ${tableName} fetch failed: ${error.message}`);
  }
  return data ?? [];
}
