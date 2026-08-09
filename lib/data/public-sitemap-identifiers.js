import "server-only";

const DEFAULT_PAGE_SIZE = 1000;
const SITEMAP_SELECT = "id,slug,series_id,name,variant_type,parent:series!inner(id,slug,franchise,brand,category)";

export async function fetchPublicSitemapRows(supabaseClient, options = {}) {
  if (!supabaseClient) throw new Error("Supabase client is required");
  const pageSize = Math.max(1, Math.min(DEFAULT_PAGE_SIZE, Number(options.pageSize) || DEFAULT_PAGE_SIZE));
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const result = await supabaseClient
      .from("variants")
      .select(SITEMAP_SELECT)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (result.error) throw new Error(`Supabase public sitemap fetch failed: ${result.error.message}`);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
