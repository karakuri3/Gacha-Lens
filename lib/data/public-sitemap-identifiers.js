import "server-only";
import { fetchBoundedSeriesObserverRows } from "./series-observer-pagination";

const DEFAULT_PAGE_SIZE = 1000;
const SITEMAP_SELECT = "id,slug,series_id,name,variant_type,parent:series!inner(id,slug,franchise,brand,category)";
const PARENT_SITEMAP_SELECT = "id,slug,franchise,brand,category,variants!inner()";
const MAX_PARENT_SITEMAP_ROWS = 50000;

export async function fetchPublicSitemapParentRows(supabaseClient, options = {}) {
  if (!supabaseClient) throw new Error("Supabase client is required");
  const pageSize = Math.max(1, Math.min(DEFAULT_PAGE_SIZE, Number(options.pageSize) || DEFAULT_PAGE_SIZE));
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const result = await supabaseClient
      .from("series")
      .select(PARENT_SITEMAP_SELECT)
      .not("slug", "is", null)
      .neq("slug", "")
      .or("variant_type.is.null,variant_type.neq.provisional", { referencedTable: "variants" })
      .not("variants.series_id", "is", null)
      .not("variants.slug", "is", null)
      .neq("variants.slug", "")
      .not("variants.name", "is", null)
      .neq("variants.name", "")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (result.error) throw new Error(`Supabase public sitemap parent fetch failed: ${result.error.message}`);
    const page = result.data ?? [];
    rows.push(...page);
    if (rows.length > MAX_PARENT_SITEMAP_ROWS) {
      throw new Error(`Public sitemap parent source exceeds ${MAX_PARENT_SITEMAP_ROWS} rows`);
    }
    if (page.length < pageSize) return rows;
  }
}

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
  return fetchBoundedSeriesObserverRows(supabaseClient, options);
}
