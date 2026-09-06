import "server-only";
import {
  createGachaRepository,
  getRelatedSeries as getRelatedSeriesBase,
  getSeriesBySlug as getSeriesBySlugBase,
} from "./series.js";
import {
  fetchSupabaseScopedRelatedCatalog,
  fetchSupabaseScopedVariantDetail,
} from "./data/supabase-public-variant-detail.js";
import { runDataSourceOperation } from "./data/data-source-policy.js";
import {
  hasServiceRoleSupabaseConfig,
  serviceRoleSupabase,
} from "./supabase/service-role-client.js";

export * from "./series.js";

// Variant-detail HTML is shared at the Cloudflare Workers Cache boundary.
// Keep these reads out of Next unstable_cache so decoded Japanese slugs never
// participate in framework cache metadata. Cold reads are scoped to the target
// or related variant identities instead of hydrating every signal in a series.
export async function getSeriesBySlug(slug) {
  const normalizedSlug = normalizeSlugValue(slug);

  if (!shouldUseScopedSupabase()) {
    return getSeriesBySlugBase(normalizedSlug);
  }

  return runDataSourceOperation("variant-detail-edge-safe", async () => {
    const records = await fetchSupabaseScopedVariantDetail(serviceRoleSupabase, normalizedSlug);
    return records ? createGachaRepository(records).findVariantBySlug(normalizedSlug) : null;
  });
}

export async function getRelatedSeries(slug, limit = 4) {
  const normalizedSlug = normalizeSlugValue(slug);

  if (!shouldUseScopedSupabase()) {
    return getRelatedSeriesBase(normalizedSlug, limit);
  }

  return runDataSourceOperation("related-variants-edge-safe", async () => {
    const records = await fetchSupabaseScopedRelatedCatalog(
      serviceRoleSupabase,
      normalizedSlug,
      { candidateLimit: 24 }
    );
    return records ? createGachaRepository(records).getRelatedVariants(normalizedSlug, limit) : [];
  });
}

function shouldUseScopedSupabase() {
  const configuredSource = String(process.env.GACHA_DATA_SOURCE || "").trim().toLowerCase();
  return hasServiceRoleSupabaseConfig && configuredSource !== "sample";
}

function normalizeSlugValue(value) {
  const text = String(value || "").trim();
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
