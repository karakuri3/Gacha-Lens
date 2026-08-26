import { isPublicVariant } from "./variant-publication.js";

export const MAX_OBSERVER_SITEMAP_URLS = 50000;

export function sitemapParentOf(row) {
  const parent = Array.isArray(row?.parent) ? row.parent[0] : row?.parent;
  return parent && typeof parent === "object" ? parent : null;
}

export function filterPublicSitemapRows(rows = []) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const seriesIds = new Set(
    sourceRows
      .map((row) => String(sitemapParentOf(row)?.id || "").trim())
      .filter(Boolean),
  );

  return sourceRows.filter((row) => {
    const parent = sitemapParentOf(row);
    return Boolean(
      parent
      && String(row?.series_id || "").trim() === String(parent.id || "").trim()
      && isPublicVariant(row, { seriesIds }),
    );
  });
}

export function collectPublicVariantSlugs(rows = []) {
  return [...new Set(
    filterPublicSitemapRows(rows)
      .map((row) => String(row?.slug || "").trim())
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b, "ja"));
}

export function collectPublicParentSeriesSlugs(rows = []) {
  return [...new Set(
    filterPublicSitemapRows(rows)
      .map((row) => String(sitemapParentOf(row)?.slug || "").trim())
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b, "ja"));
}

export function collectPublicSitemapIdentifiers(rows = []) {
  return {
    variantSlugs: collectPublicVariantSlugs(rows),
    parentSeriesSlugs: collectPublicParentSeriesSlugs(rows),
  };
}

export function collectSeriesObserverEntries({ parentSeriesSlugs = [], seriesRows = [], today } = {}) {
  const publicParentSlugs = new Set(asSortedUnique(parentSeriesSlugs));
  const entries = new Map([...publicParentSlugs].map((slug) => [slug, { slug, updated_at: null }]));

  for (const row of Array.isArray(seriesRows) ? seriesRows : []) {
    if (!isSafeRecentOfficialSeriesOnly(row, { today })) continue;
    const slug = text(row.slug);
    const existing = entries.get(slug);
    entries.set(slug, {
      slug,
      updated_at: existing?.updated_at || safeUpdatedAt(row.updated_at),
    });
  }

  return limitObserverEntries([...entries.values()]);
}

export function collectVariantObserverEntries(rows = []) {
  return limitObserverEntries(
    filterPublicSitemapRows(rows).map((row) => ({ slug: text(row.slug), updated_at: safeUpdatedAt(row.updated_at) }))
  );
}

export function isSafeRecentOfficialSeriesOnly(row = {}, { today } = {}) {
  if (text(row.source_type) !== "official_site"
    || !text(row.slug)
    || !text(row.name)
    || !text(row.brand)
    || !isSafeOfficialUrl(row.official_url)
    || !Number.isFinite(Number(row.price))
    || Number(row.price) <= 0) return false;

  const auditDate = validIsoDate(today);
  if (!auditDate) return false;
  const cutoff = subtractDays(auditDate, 180);
  const releaseDate = validIsoDate(row.release_date);
  if (releaseDate) return releaseDate >= cutoff;
  const releaseMonth = validIsoMonth(row.release_month);
  return Boolean(releaseMonth && releaseMonth >= cutoff.slice(0, 7));
}

export function buildObserverSitemapXml(entries = [], { siteUrl, pathPrefix }) {
  const prefix = text(pathPrefix);
  const origin = validHttpsOrigin(siteUrl);
  if (!origin || !prefix.startsWith("/")) throw new Error("Observer sitemap requires an absolute HTTPS site URL and path prefix.");
  const safeEntries = limitObserverEntries(entries);
  const urls = safeEntries.map((entry) => {
    const location = new URL(`${prefix}${encodeURIComponent(entry.slug)}`, origin).toString();
    const lastModified = safeUpdatedAt(entry.updated_at);
    return `<url><loc>${escapeXml(location)}</loc>${lastModified ? `<lastmod>${escapeXml(lastModified)}</lastmod>` : ""}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`;
}

function limitObserverEntries(entries) {
  const ordered = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const slug = text(entry?.slug);
    if (!slug || ordered.has(slug)) continue;
    ordered.set(slug, { slug, updated_at: safeUpdatedAt(entry.updated_at) });
  }
  const values = [...ordered.values()].sort((a, b) => a.slug.localeCompare(b.slug, "ja"));
  if (values.length > MAX_OBSERVER_SITEMAP_URLS) throw new Error(`Observer sitemap exceeds ${MAX_OBSERVER_SITEMAP_URLS} URLs`);
  return values;
}

function asSortedUnique(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja"));
}

function validIsoDate(value) {
  const date = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : "";
}

function validIsoMonth(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(text(value)) ? text(value) : "";
}

function subtractDays(date, days) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() - days);
  return result.toISOString().slice(0, 10);
}

function isSafeOfficialUrl(value) {
  try {
    const url = new URL(text(value));
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validHttpsOrigin(value) {
  try {
    const url = new URL(text(value));
    return url.protocol === "https:" && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function safeUpdatedAt(value) {
  const parsed = new Date(text(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character]);
}

function text(value) {
  return String(value ?? "").trim();
}
