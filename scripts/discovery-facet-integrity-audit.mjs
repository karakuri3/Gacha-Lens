import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  collectPublicParentDiscoveryFacets,
  discoveryFacetHref,
  discoveryFacetLookupCandidates,
  discoveryFacetVariantCount,
  normalizeDiscoveryFacetIdentifier,
  normalizeDiscoveryFacetName,
} from "../lib/domain/discovery-facets.js";
import {
  collectPublicParentCategoryFacets,
  categoryDiscoveryHref,
} from "../lib/domain/category-discovery.js";
import {
  STATIC_BRAND_FACETS,
  STATIC_FRANCHISE_FACETS,
} from "../lib/domain/discovery-static-manifest.js";
import { STATIC_CATEGORY_FACETS } from "../lib/domain/category-static-manifest.js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Discovery integrity audit requires Supabase read credentials.");

const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const PAGE_SIZE = 1000;
const MAX_ROWS = 50000;
const SELECT = "id,slug,franchise,brand,category,image_url,is_released,release_date,variants!inner(count)";

const rows = [];
for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
  const result = await client
    .from("series")
    .select(SELECT)
    .not("slug", "is", null)
    .neq("slug", "")
    .or("variant_type.is.null,variant_type.neq.provisional", { referencedTable: "variants" })
    .not("variants.series_id", "is", null)
    .not("variants.slug", "is", null)
    .neq("variants.slug", "")
    .not("variants.name", "is", null)
    .neq("variants.name", "")
    .order("id", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);
  if (result.error) throw new Error(`Discovery integrity source failed: ${result.error.message}`);
  const page = result.data ?? [];
  rows.push(...page);
  if (page.length < PAGE_SIZE) break;
  if (rows.length >= MAX_ROWS) throw new Error(`Discovery integrity source reached the ${MAX_ROWS}-row bound`);
}

const discovery = collectPublicParentDiscoveryFacets(rows);
const categories = collectPublicParentCategoryFacets(rows);
const published = {
  franchise: discovery.franchises,
  brand: discovery.brands,
  category: categories,
};

let failures = 0;
for (const [type, facets] of Object.entries(published)) {
  for (const facet of facets) {
    const exactRows = rows.filter((row) => String(row?.[type] ?? "") === facet.name && discoveryFacetVariantCount(row?.variants) > 0);
    const seriesCount = new Set(exactRows.map((row) => String(row.id))).size;
    const variantCount = exactRows.reduce((sum, row) => sum + discoveryFacetVariantCount(row.variants), 0);
    const canonicalIdentifier = normalizeDiscoveryFacetIdentifier(facet.name);
    const normalizedDisplay = normalizeDiscoveryFacetName(facet.name);
    const href = type === "category" ? categoryDiscoveryHref(canonicalIdentifier) : discoveryFacetHref(type, canonicalIdentifier);
    const prefix = type === "category" ? "/categories/" : type === "brand" ? "/brands/" : "/franchises/";
    const segment = href.slice(prefix.length);
    const checks = {
      canonical_identity: canonicalIdentifier === facet.name,
      normalized_display_valid: Boolean(normalizedDisplay),
      exact_detail_rows: seriesCount > 0,
      exact_series_count: seriesCount === facet.series_count,
      exact_variant_count: variantCount === facet.variant_count,
      single_encode: href === `${prefix}${encodeURIComponent(canonicalIdentifier)}`,
      decoded_identifier: decodeURIComponent(segment) === canonicalIdentifier,
      lookup_candidate: discoveryFacetLookupCandidates(segment).includes(canonicalIdentifier),
    };
    for (const [label, ok] of Object.entries(checks)) {
      if (!ok) {
        failures += 1;
        console.error(JSON.stringify({ type, name: facet.name, label, href, seriesCount, variantCount, facet }));
      }
    }
  }
}

function assertManifest(label, actual, manifest) {
  const actualMap = new Map(actual.map((facet) => [facet.name, facet.series_count]));
  const manifestMap = new Map(manifest.map((facet) => [facet.name, facet.series_count]));
  assert.equal(manifestMap.size, actualMap.size, `${label} static manifest size drift`);
  for (const [name, count] of actualMap) {
    assert.equal(manifestMap.get(name), count, `${label} static manifest mismatch for ${name}`);
  }
}

assertManifest("franchise", published.franchise, STATIC_FRANCHISE_FACETS);
assertManifest("brand", published.brand, STATIC_BRAND_FACETS);
assertManifest("category", published.category, STATIC_CATEGORY_FACETS);

for (const name of ["ジュラシック・ワールド", "ちいかわ", "スター・ウォーズ", "Disney"]) {
  assert.ok(published.franchise.some((facet) => facet.name === name), `missing Production franchise control: ${name}`);
}
assert.ok(published.brand.some((facet) => facet.name === "バンダイ"), "missing Production brand control: バンダイ");
assert.ok(published.category.some((facet) => facet.name === "ガシャポン"), "missing Production category control: ガシャポン");

async function countExactDetailSeries(type, name) {
  const relation = "variants!inner(id)";
  let query = client
    .from("series")
    .select(`id,${relation}`, { count: "exact", head: true })
    .eq(type, name)
    .or("variant_type.is.null,variant_type.neq.provisional", { referencedTable: "variants" })
    .not("variants.series_id", "is", null)
    .not("variants.slug", "is", null)
    .neq("variants.slug", "")
    .not("variants.name", "is", null)
    .neq("variants.name", "");
  const result = await query;
  if (result.error) throw new Error(`Exact detail control failed for ${type}=${name}: ${result.error.message}`);
  return result.count ?? 0;
}

const controlDetailChecks = [];
for (const [type, name] of [
  ["franchise", "ジュラシック・ワールド"],
  ["franchise", "ちいかわ"],
  ["franchise", "スター・ウォーズ"],
  ["franchise", "Disney"],
  ["brand", "バンダイ"],
  ["category", "ガシャポン"],
]) {
  const facet = published[type].find((entry) => entry.name === name);
  const detailTotal = await countExactDetailSeries(type, name);
  assert.equal(detailTotal, facet.series_count, `exact detail count mismatch for ${type}=${name}`);
  controlDetailChecks.push({ type, name, series_count: detailTotal });
}

assert.equal(failures, 0, `Discovery facet integrity failures: ${failures}`);

console.log(JSON.stringify({
  public_parent_rows: rows.length,
  published_franchise: published.franchise.length,
  published_brand: published.brand.length,
  published_category: published.category.length,
  published_total: published.franchise.length + published.brand.length + published.category.length,
  integrity_failures: failures,
  control_detail_checks: controlDetailChecks,
  production_write_count: 0,
  schema_rls_change_count: 0,
}, null, 2));
