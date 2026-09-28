import { createClient } from "@supabase/supabase-js";
import {
  decodeDiscoveryFacetParam,
  discoveryFacetHref,
  discoveryFacetIdentifier,
  isMeaningfulDiscoveryFacetName,
} from "../lib/domain/discovery-facets.js";
import {
  categoryDiscoveryHref,
  decodeCategoryDiscoveryParam,
  isMeaningfulCategoryFacetName,
} from "../lib/domain/category-discovery.js";
import {
  STATIC_BRAND_FACETS,
  STATIC_FRANCHISE_FACETS,
} from "../lib/domain/discovery-static-manifest.js";
import { STATIC_CATEGORY_FACETS } from "../lib/domain/category-static-manifest.js";

const PAGE_SIZE = 1000;
const MAX_ROWS = 50000;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const publicParents = await fetchPublicParentRows();

const franchises = collectExactFacetRows(publicParents, "franchise", isMeaningfulDiscoveryFacetName);
const brands = collectExactFacetRows(publicParents, "brand", isMeaningfulDiscoveryFacetName);
const categories = collectCategoryRows(publicParents);

const results = [
  auditFacetSet("franchise", franchises, STATIC_FRANCHISE_FACETS, publicParents),
  auditFacetSet("brand", brands, STATIC_BRAND_FACETS, publicParents),
  auditFacetSet("category", categories, STATIC_CATEGORY_FACETS, publicParents),
];

const failures = results.flatMap((result) => result.failures.map((failure) => ({
  type: result.type,
  ...failure,
})));

console.log(JSON.stringify({
  ok: failures.length === 0,
  database_writes: 0,
  schema_changes: 0,
  published: Object.fromEntries(results.map((result) => [result.type, result.published])),
  audited_total: results.reduce((sum, result) => sum + result.published, 0),
  failures,
}, null, 2));

if (failures.length) process.exitCode = 1;

async function fetchPublicParentRows() {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await supabase
      .from("series")
      .select("id,slug,franchise,brand,category,variants!inner(count)")
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
    if (result.error) throw new Error(`Discovery integrity parent read failed: ${result.error.message}`);
    const page = result.data ?? [];
    rows.push(...page);
    if (rows.length > MAX_ROWS) throw new Error(`Discovery integrity parent rows exceed ${MAX_ROWS}`);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function collectExactFacetRows(rows, field, meaningful) {
  const groups = new Map();
  for (const row of rows) {
    const identifier = discoveryFacetIdentifier(row?.[field]);
    const count = embeddedVariantCount(row?.variants);
    if (!identifier || !meaningful(identifier) || count <= 0) continue;
    const group = groups.get(identifier) ?? { name: identifier, seriesIds: new Set(), variant_count: 0 };
    if (!group.seriesIds.has(row.id)) {
      group.seriesIds.add(row.id);
      group.variant_count += count;
    }
    groups.set(identifier, group);
  }
  return [...groups.values()]
    .map((group) => ({
      name: group.name,
      filter_value: group.name,
      series_count: group.seriesIds.size,
      variant_count: group.variant_count,
    }))
    .filter((facet) => facet.series_count >= 2)
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

function collectCategoryRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const raw = String(row?.category ?? "");
    const display = raw.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 120);
    if (!isMeaningfulCategoryFacetName(display)) continue;
    const key = display.toLocaleLowerCase("ja");
    const group = groups.get(key) ?? { name: display, rawValues: new Set(), seriesIds: new Set() };
    group.rawValues.add(raw);
    group.seriesIds.add(String(row.id || ""));
    groups.set(key, group);
  }
  return [...groups.values()]
    .filter((group) => group.rawValues.size === 1 && group.seriesIds.size >= 2)
    .map((group) => ({ name: group.name, filter_value: [...group.rawValues][0], series_count: group.seriesIds.size }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

function auditFacetSet(type, facets, manifest, rows) {
  const failures = [];
  const manifestMap = new Map(manifest.map((facet) => [facet.name, Number(facet.series_count)]));
  const liveMap = new Map(facets.map((facet) => [facet.name, Number(facet.series_count)]));

  for (const facet of facets) {
    const href = type === "category"
      ? categoryDiscoveryHref(facet.name)
      : discoveryFacetHref(type, facet.name);
    const segment = href.split("/").at(-1);
    const roundTrip = type === "category"
      ? decodeCategoryDiscoveryParam(segment)
      : decodeDiscoveryFacetParam(segment);
    if (roundTrip !== facet.name) {
      failures.push({ identifier: facet.name, reason: "identifier_round_trip_mismatch", href, roundTrip });
    }

    const dbValue = facet.filter_value ?? facet.name;
    const detailSeriesCount = countExactPublicParentMatches(rows, type, dbValue);
    if (detailSeriesCount !== Number(facet.series_count)) {
      failures.push({
        identifier: facet.name,
        db_value: dbValue,
        reason: "exact_detail_series_count_mismatch",
        published: Number(facet.series_count),
        detail: detailSeriesCount,
      });
    }

    if (!manifestMap.has(facet.name)) {
      failures.push({ identifier: facet.name, reason: "missing_static_route" });
    } else if (manifestMap.get(facet.name) !== Number(facet.series_count)) {
      failures.push({
        identifier: facet.name,
        reason: "static_series_count_mismatch",
        live: Number(facet.series_count),
        manifest: manifestMap.get(facet.name),
      });
    }
  }

  for (const [name] of manifestMap) {
    if (!liveMap.has(name)) failures.push({ identifier: name, reason: "stale_static_route" });
  }

  return { type, published: facets.length, failures };
}

function countExactPublicParentMatches(rows, type, value) {
  const field = type === "category" ? "category" : type === "brand" ? "brand" : "franchise";
  return new Set(
    rows
      .filter((row) => String(row?.[field] ?? "") === String(value))
      .filter((row) => embeddedVariantCount(row?.variants) > 0)
      .map((row) => String(row?.id || ""))
      .filter(Boolean),
  ).size;
}

function embeddedVariantCount(value) {
  if (Array.isArray(value)) {
    if (value.length === 1 && Number.isFinite(Number(value[0]?.count))) return Number(value[0].count);
    return value.length;
  }
  if (value && typeof value === "object" && Number.isFinite(Number(value.count))) return Number(value.count);
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}
