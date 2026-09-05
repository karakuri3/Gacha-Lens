import "server-only";
import {
  createGachaRepository,
  getSeriesBySlug as getSeriesBySlugBase,
} from "./series.js";
import { fetchSupabaseCatalogVariant } from "./data/supabase-gacha-repository.js";
import { runDataSourceOperation } from "./data/data-source-policy.js";
import {
  hasServiceRoleSupabaseConfig,
  serviceRoleSupabase,
} from "./supabase/service-role-client.js";

export * from "./series.js";

// Variant-detail HTML is shared at the Cloudflare Workers Cache boundary.
// Keep this read out of Next unstable_cache so decoded Japanese slugs never
// participate in framework cache metadata. Other series/catalog caches remain
// unchanged in ./series.js.
export async function getSeriesBySlug(slug) {
  const normalizedSlug = normalizeSlugValue(slug);
  const configuredSource = String(process.env.GACHA_DATA_SOURCE || "").trim().toLowerCase();

  if (!hasServiceRoleSupabaseConfig || configuredSource === "sample") {
    return getSeriesBySlugBase(normalizedSlug);
  }

  return runDataSourceOperation("variant-detail-edge-safe", async () => {
    const records = await fetchSupabaseCatalogVariant(serviceRoleSupabase, normalizedSlug);
    return records ? createGachaRepository(records).findVariantBySlug(normalizedSlug) : null;
  });
}

function normalizeSlugValue(value) {
  const text = String(value || "").trim();
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
