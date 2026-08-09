import { filterPublicSitemapRows, sitemapParentOf } from "./sitemap-publication.js";

export const DISCOVERY_FACET_MIN_SERIES = 2;

const EXCLUDED_FACET_NAMES = new Set([
  "",
  "-",
  "--",
  "n/a",
  "na",
  "null",
  "undefined",
  "unknown",
  "その他",
  "なし",
  "不明",
  "未分類",
  "未登録",
]);

export function normalizeDiscoveryFacetName(value) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 120);
}

export function isMeaningfulDiscoveryFacetName(value) {
  const normalized = normalizeDiscoveryFacetName(value);
  return Boolean(normalized && !EXCLUDED_FACET_NAMES.has(normalized.toLocaleLowerCase("ja")));
}

export function collectPublicDiscoveryFacets(rows = [], options = {}) {
  const minSeries = Math.max(DISCOVERY_FACET_MIN_SERIES, Number(options.minSeries) || DISCOVERY_FACET_MIN_SERIES);
  const publicRows = filterPublicSitemapRows(rows);
  return {
    franchises: aggregateFacet(publicRows, "franchise", minSeries),
    brands: aggregateFacet(publicRows, "brand", minSeries),
  };
}

export function findPublicDiscoveryFacet(facets = [], value) {
  const target = normalizeDiscoveryFacetName(value).toLocaleLowerCase("ja");
  if (!target) return null;
  return (Array.isArray(facets) ? facets : []).find(
    (facet) => normalizeDiscoveryFacetName(facet?.name).toLocaleLowerCase("ja") === target,
  ) ?? null;
}

export function decodeDiscoveryFacetParam(value) {
  const source = Array.isArray(value) ? value[0] : value;
  try {
    return normalizeDiscoveryFacetName(decodeURIComponent(String(source || "")));
  } catch {
    return "";
  }
}

export function discoveryFacetHref(type, name) {
  const base = type === "brand" ? "/brands" : type === "franchise" ? "/franchises" : "";
  const normalized = normalizeDiscoveryFacetName(name);
  return base && normalized ? `${base}/${encodeURIComponent(normalized)}` : base || "/series";
}

function aggregateFacet(rows, field, minSeries) {
  const groups = new Map();
  for (const row of rows) {
    const name = normalizeDiscoveryFacetName(sitemapParentOf(row)?.[field]);
    if (!isMeaningfulDiscoveryFacetName(name)) continue;
    const key = name.toLocaleLowerCase("ja");
    const group = groups.get(key) ?? { name, seriesIds: new Set(), variantIds: new Set() };
    group.seriesIds.add(String(row.series_id));
    group.variantIds.add(String(row.id || `${row.series_id}:${row.slug}`));
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      name: group.name,
      series_count: group.seriesIds.size,
      variant_count: group.variantIds.size,
    }))
    .filter((facet) => facet.series_count >= minSeries)
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}
