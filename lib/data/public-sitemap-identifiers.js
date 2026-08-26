import "server-only";

const DEFAULT_PAGE_SIZE = 1000;
const MAX_OBSERVER_SITEMAP_ROWS = 50000;
const SITEMAP_SELECT = "id,slug,series_id,name,variant_type,parent:series!inner(id,slug,franchise,brand,category)";
const SERIES_OBSERVER_SELECT = "id,slug,name,brand,official_url,price,release_date,release_month,source_type,updated_at";

export async function fetchPublicSitemapRows(supabaseClient, options = {}) {
  if (!supabaseClient) throw new Error("Supabase client is required");
  const pageSize = Math.max(1, Math.min(DEFAULT_PAGE_SIZE, Number(options.pageSize) || DEFAULT_PAGE_SIZE));
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const result = await supabaseClient
      .from("variants")
      .select(SITEMAP_SELECT)
      .or("variant_type.is.null,variant_type.neq.provisional")
      .not("series_id", "is", null)
      .not("slug", "is", null)
      .neq("slug", "")
      .not("name", "is", null)
      .neq("name", "")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (result.error) throw new Error(`Supabase public sitemap fetch failed: ${result.error.message}`);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export async function fetchSeriesObserverRows(supabaseClient, options = {}) {
  if (!supabaseClient) throw new Error("Supabase client is required");
  const maxRows = Math.max(1, Math.min(MAX_OBSERVER_SITEMAP_ROWS, Number(options.maxRows) || MAX_OBSERVER_SITEMAP_ROWS));
  const result = await supabaseClient
    .from("series")
    .select(SERIES_OBSERVER_SELECT)
    .eq("source_type", "official_site")
    .order("id", { ascending: true })
    .range(0, maxRows);
  if (result.error) throw new Error(`Supabase series observer sitemap fetch failed: ${result.error.message}`);
  const rows = result.data ?? [];
  if (rows.length > MAX_OBSERVER_SITEMAP_ROWS) throw new Error(`Series observer source exceeds ${MAX_OBSERVER_SITEMAP_ROWS} rows`);
  return rows;
}
