import "server-only";
import { fetchBoundedSeriesObserverRows } from "./series-observer-pagination";

const DEFAULT_PAGE_SIZE = 1000;
const SITEMAP_SELECT = "id,slug,series_id,name,variant_type,parent:series!inner(id,slug,franchise,brand,category)";
const PARENT_SITEMAP_SELECT = "id,slug,franchise,brand,category,variants!inner()";\nconst DISCOVERY_PARENT_SELECT = "id,slug,franchise,brand,category,variants!inner(id)";
const MAX_PARENT_SITEMAP_ROWS = 50000;

export const VARIANT_SITEMAP_SHARD_SIZE = 1000;
export const MAX_VARIANT_SITEMAP_SHARDS = 5000;
const VARIANT_SITEMAP_SELECT = "id,slug,series_id,parent:series!inner(id)";

export async function fetchPublicSitemapParentRows(supabaseClient, options = {}) {
  return fetchPublicParentRows(supabaseClient, {
    ...options,
    select: PARENT_SITEMAP_SELECT,
    errorLabel: "public sitemap parent",
  });
}

async function fetchPublicParentRows(supabaseClient, options = {}) {
  if (!supabaseClient) throw new Error("Supabase client is required");
  const pageSize = Math.max(1, Math.min(DEFAULT_PAGE_SIZE, Number(options.pageSize) || DEFAULT_PAGE_SIZE));
  const select = String(options.select || PARENT_SITEMAP_SELECT);
  const errorLabel = String(options.errorLabel || "public parent");
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const result = await supabaseClient
      .from("series")
      .select(select)
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

    if (result.error) throw new Error(`Supabase ${errorLabel} fetch failed: ${result.error.message}`);
    const page = result.data ?? [];
    rows.push(...page);
    if (rows.length > MAX_PARENT_SITEMAP_ROWS) {
      throw new Error(`Public parent source exceeds ${MAX_PARENT_SITEMAP_ROWS} rows`);
    }
    if (page.length < pageSize) return rows;
  }
}

export async function fetchPublicDiscoveryParentRows(supabaseClient, options = {}) {
  return fetchPublicParentRows(supabaseClient, {
    ...options,
    select: DISCOVERY_PARENT_SELECT,
    errorLabel: "public discovery parent",
  });
}

export async function fetchPublicVariantSitemapCount(supabaseClient) {
  if (!supabaseClient) throw new Error("Supabase client is required");
  const result = await applyPublicVariantSitemapFilter(
    supabaseClient
      .from("variants")
      .select("id,parent:series!inner(id)", { count: "exact", head: true })
  );
  if (result.error) throw new Error(`Supabase public variant sitemap count failed: ${result.error.message}`);
  return result.count ?? 0;
}

export async function fetchPublicVariantSitemapPage(supabaseClient, options = {}) {
  if (!supabaseClient) throw new Error("Supabase client is required");
  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const pageSize = Math.max(1, Math.min(VARIANT_SITEMAP_SHARD_SIZE, Number(options.pageSize) || VARIANT_SITEMAP_SHARD_SIZE));
  if (page > MAX_VARIANT_SITEMAP_SHARDS) {
    throw new Error(`Variant sitemap shard exceeds ${MAX_VARIANT_SITEMAP_SHARDS} pages`);
  }
  const from = (page - 1) * pageSize;
  const result = await applyPublicVariantSitemapFilter(
    supabaseClient.from("variants").select(VARIANT_SITEMAP_SELECT)
  )
    .order("id", { ascending: true })
    .range(from, from + pageSize - 1);
  if (result.error) throw new Error(`Supabase public variant sitemap page failed: ${result.error.message}`);
  return result.data ?? [];
}

function applyPublicVariantSitemapFilter(query) {
  return query
    .or("variant_type.is.null,variant_type.neq.provisional")
    .not("series_id", "is", null)
    .not("slug", "is", null)
    .neq("slug", "")
    .not("name", "is", null)
    .neq("name", "");
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
