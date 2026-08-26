export const MAX_OBSERVER_SITEMAP_ROWS = 50000;
export const SERIES_OBSERVER_PAGE_SIZE = 1000;
export const SERIES_OBSERVER_SELECT = "id,slug,name,brand,official_url,price,release_date,release_month,source_type,updated_at";

export async function fetchBoundedSeriesObserverRows(supabaseClient, options = {}) {
  if (!supabaseClient) throw new Error("Supabase client is required");
  const pageSize = Math.max(1, Math.min(SERIES_OBSERVER_PAGE_SIZE, Number(options.pageSize) || SERIES_OBSERVER_PAGE_SIZE));
  const maxRows = Math.max(1, Math.min(MAX_OBSERVER_SITEMAP_ROWS, Number(options.maxRows) || MAX_OBSERVER_SITEMAP_ROWS));
  const rows = [];

  for (let offset = 0; offset <= maxRows; offset += pageSize) {
    const remaining = maxRows + 1 - rows.length;
    const requestSize = Math.min(pageSize, remaining);
    const result = await supabaseClient
      .from("series")
      .select(SERIES_OBSERVER_SELECT)
      .eq("source_type", "official_site")
      .order("id", { ascending: true })
      .range(offset, offset + requestSize - 1);

    if (result.error) throw new Error(`Supabase series observer sitemap fetch failed: ${result.error.message}`);
    const page = result.data ?? [];
    rows.push(...page);
    if (rows.length > maxRows) throw new Error(`Series observer source exceeds ${maxRows} rows`);
    if (page.length < requestSize) return rows;
  }

  throw new Error(`Series observer source exceeds ${maxRows} rows`);
}
