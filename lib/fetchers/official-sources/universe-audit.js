import crypto from "node:crypto";

const KITAN_ROOT = "https://kitan.jp/products/";
const QUALIA_ROOT = "https://www.qualia-45.jp/product.html";
const QUALIA_LINEUP_ROOT = "https://www.qualia-45.jp/distinations/";
const QUALIA_CATEGORY_FALLBACK = Object.freeze(Array.from({ length: 8 }, (_, index) => 12 + index));

export const OFFICIAL_SOURCE_UNIVERSE_AUDIT_LIMITS = Object.freeze({
  global_hard_cap: 150,
  request_timeout_ms: 15_000,
  retry_limit: 1,
  request_delay_ms: 750,
  category_page_hard_cap: 64,
});

export function parseKitanYearNavigation(body, baseUrl = KITAN_ROOT) {
  const byYear = new Map();
  for (const match of String(body || "").matchAll(/href=["']([^"']*\/product_age\/(20\d{2})\/[^"']*)["']/gi)) {
    const url = canonicalKitanArchiveUrl(match[1], baseUrl, match[2]);
    if (url && !byYear.has(match[2])) byYear.set(match[2], { year: match[2], url });
  }
  return [...byYear.values()].sort((a, b) => a.year.localeCompare(b.year));
}

export function parseKitanProductLinks(body, baseUrl = KITAN_ROOT) {
  const found = [];
  for (const match of String(body || "").matchAll(/href=["']([^"']*\/products\/[^"'#?]+\/?)["']/gi)) {
    const url = canonicalKitanProductUrl(match[1], baseUrl);
    if (url) found.push({ source_product_id: new URL(url).pathname.split("/").filter(Boolean).at(-1), official_url: url });
  }
  return uniqueBy(found, (item) => item.official_url).sort((a, b) => a.official_url.localeCompare(b.official_url));
}

export function parseQualiaMonthNavigation(body, baseUrl = QUALIA_ROOT) {
  const byMonth = new Map();
  for (const match of String(body || "").matchAll(/href=["']([^"']*\/product\/search\/ym:(20\d{2}-(?:0[1-9]|1[0-2]))[^"']*)["']/gi)) {
    const url = canonicalQualiaMonthUrl(match[1], baseUrl, match[2]);
    if (url && !byMonth.has(match[2])) byMonth.set(match[2], { month: match[2], url });
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export function countQualiaDuplicateMonthLinks(body, baseUrl = QUALIA_ROOT) {
  const valid = [];
  for (const match of String(body || "").matchAll(/href=["']([^"']*\/product\/search\/ym:(20\d{2}-(?:0[1-9]|1[0-2]))[^"']*)["']/gi)) {
    if (canonicalQualiaMonthUrl(match[1], baseUrl, match[2])) valid.push(match[2]);
  }
  return Math.max(0, valid.length - new Set(valid).size);
}

export function parseQualiaCategoryNavigation(body, baseUrl = QUALIA_ROOT) {
  const byId = new Map();
  for (const match of String(body || "").matchAll(/href=["']([^"']*\/product\/index\/(\d+)[^"']*)["']/gi)) {
    const url = canonicalQualiaCategoryUrl(match[1], baseUrl, match[2]);
    if (url && !byId.has(match[2])) byId.set(match[2], { category_id: Number(match[2]), url });
  }
  return [...byId.values()].sort((a, b) => a.category_id - b.category_id);
}

export function parseQualiaCategoryPagination(body, baseUrl, categoryId) {
  const urls = new Set([canonicalQualiaCategoryUrl(baseUrl, baseUrl, String(categoryId))].filter(Boolean));
  const html = String(body || "");
  const patterns = [
    /href=["']([^"']*\/product\/index\/(\d+)\/page\/(\d+)\/?[^"']*)["']/gi,
    /href=["']([^"']*\/product\/index\/(\d+)\/page:(\d+)\/?[^"']*)["']/gi,
    /href=["']([^"']*\/product\/index\/(\d+)[^"']*[?&]page=(\d+)[^"']*)["']/gi,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      if (Number(match[2]) !== Number(categoryId)) continue;
      const url = canonicalQualiaCategoryPageUrl(match[1], baseUrl, categoryId, Number(match[3]));
      if (url) urls.add(url);
    }
  }
  return [...urls].sort((a, b) => categoryPageNumber(a) - categoryPageNumber(b));
}

export function parseQualiaProductLinks(body, baseUrl = QUALIA_ROOT) {
  const found = [];
  for (const match of String(body || "").matchAll(/href=["']([^"']*\/product\/view\/(\d+)\/?[^"'#]*)["']/gi)) {
    const url = canonicalQualiaProductUrl(match[1], baseUrl, match[2]);
    if (url) found.push({ source_product_id: match[2], official_url: url });
  }
  return uniqueBy(found, (item) => item.source_product_id).sort((a, b) => Number(a.source_product_id) - Number(b.source_product_id));
}

export function parseDetailReleaseEvidence(body) {
  const text = cleanText(body);
  const date = text.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  const month = text.match(/(20\d{2})年\s*(\d{1,2})月/);
  return {
    detail_release_date: date ? `${date[1]}-${date[2].padStart(2, "0")}-${date[3].padStart(2, "0")}` : null,
    detail_release_month: month ? `${month[1]}-${month[2].padStart(2, "0")}` : null,
  };
}

export function classifyKitanRecord({ archiveYear, detailReleaseMonth, detailReleaseDate = null, targetMonth, rejected = false }) {
  const normalizedTarget = normalizeTargetMonth(targetMonth);
  const year = archiveYear === null || archiveYear === undefined ? null : String(archiveYear);
  if (rejected) return { classification: "rejected", classification_source: "detail_fetch_or_parse", archive_year: year, detail_release_month: null, detail_release_date: null };
  if (year && year > normalizedTarget.slice(0, 4)) return { classification: "target_period", classification_source: "archive_year", archive_year: year, detail_release_month: detailReleaseMonth || null, detail_release_date: detailReleaseDate || null };
  if (detailReleaseMonth) return { classification: detailReleaseMonth >= normalizedTarget ? "target_period" : "before_target", classification_source: "detail_release_month", archive_year: year, detail_release_month: detailReleaseMonth, detail_release_date: detailReleaseDate || null };
  return { classification: "undated", classification_source: "none", archive_year: year, detail_release_month: null, detail_release_date: null };
}

export function classifyQualiaRecord({ archiveMonths = [], detailReleaseMonth = null, detailReleaseDate = null, targetMonth, rejected = false }) {
  const normalizedTarget = normalizeTargetMonth(targetMonth);
  const months = [...new Set(archiveMonths.filter(Boolean))].sort();
  if (rejected) r