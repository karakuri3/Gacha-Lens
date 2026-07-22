export const CATALOG_SCOPES = Object.freeze(["variant", "series"]);
export const CATALOG_RELEASES = Object.freeze(["all", "released", "upcoming"]);
export const CATALOG_SORTS = Object.freeze(["relevance", "newest", "price_asc", "price_desc"]);

const LEGACY_MODES = new Set(["circulating", "market", "opportunity"]);

export function normalizeSearchText(value, { maxLength = 120 } = {}) {
  return firstValue(value)
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

export function normalizeCatalogMonth(value) {
  const normalized = normalizeSearchText(value, { maxLength: 7 });
  const match = normalized.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!match) return "";
  const year = Number(match[1]);
  return year >= 2000 && year <= 2100 ? normalized : "";
}

export function parseCatalogQuery(input = {}) {
  const q = normalizeSearchText(input.q, { maxLength: 80 });
  const legacyFilter = normalizeSearchText(input.filter || input.legacyMode, { maxLength: 24 });
  const scope = oneOf(input.scope, CATALOG_SCOPES, "variant");
  const releaseFallback = legacyRelease(legacyFilter);
  const release = oneOf(input.release, CATALOG_RELEASES, releaseFallback);
  const requestedSort = normalizeSearchText(input.sort, { maxLength: 24 });
  const sort = normalizeSort(requestedSort, q);

  return {
    q,
    scope,
    release,
    category: normalizeSearchText(input.category, { maxLength: 120 }),
    month: normalizeCatalogMonth(input.month),
    sort,
    page: normalizePage(input.page),
    legacyMode: LEGACY_MODES.has(legacyFilter) ? legacyFilter : "",
  };
}

export function buildCatalogHref(query = {}, changes = {}, options = {}) {
  const resetPage = options.resetPage !== false;
  const next = parseCatalogQuery({ ...query, ...changes, page: resetPage ? 1 : changes.page ?? query.page });
  const params = new URLSearchParams();

  if (next.q) params.set("q", next.q);
  if (next.scope !== "variant") params.set("scope", next.scope);
  if (next.release !== "all") params.set("release", next.release);
  if (next.category) params.set("category", next.category);
  if (next.month) params.set("month", next.month);
  if (next.sort !== defaultSort(next.q)) params.set("sort", next.sort);
  if (next.page > 1) params.set("page", String(next.page));
  if (next.legacyMode) params.set("filter", next.legacyMode);

  const search = params.toString();
  return search ? `/series?${search}` : "/series";
}

export function hasActiveCatalogFilters(query = {}) {
  const value = parseCatalogQuery(query);
  return Boolean(
    value.q ||
      value.scope !== "variant" ||
      value.release !== "all" ||
      value.category ||
      value.month ||
      value.sort !== defaultSort(value.q) ||
      value.legacyMode
  );
}

export function catalogMonthRange(month) {
  const normalized = normalizeCatalogMonth(month);
  if (!normalized) return null;
  const [year, monthNumber] = normalized.split("-").map(Number);
  const next = monthNumber === 12 ? `${year + 1}-01` : `${year}-${String(monthNumber + 1).padStart(2, "0")}`;
  return { start: `${normalized}-01`, end: `${next}-01` };
}

export function shiftCatalogMonth(month, offset) {
  const normalized = normalizeCatalogMonth(month);
  if (!normalized) return "";
  const [year, monthNumber] = normalized.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + Number(offset || 0), 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatCatalogMonth(month) {
  const normalized = normalizeCatalogMonth(month);
  if (!normalized) return "";
  const [year, monthNumber] = normalized.split("-").map(Number);
  return `${year}年${monthNumber}月`;
}

export function recordMatchesCatalogQuery(record = {}, query = {}, scope = "variant") {
  const parsed = parseCatalogQuery({ ...query, scope });
  if (scope === "variant" && String(record.variant_type || "").toLowerCase() === "provisional") return false;
  if (parsed.release === "released" && !Boolean(record.released ?? record.is_released)) return false;
  if (parsed.release === "upcoming" && Boolean(record.released ?? record.is_released)) return false;
  if (parsed.category && normalizeSearchText(record.category) !== parsed.category) return false;
  if (parsed.month && recordMonth(record) !== parsed.month) return false;
  if (!parsed.q) return true;

  const values = scope === "series"
    ? [record.name, record.franchise, record.brand, record.category, record.slug]
    : [record.name, record.series_name, record.parent_name, record.franchise, record.character, record.brand, record.category, record.tags, record.slug];
  const haystack = normalizeSearchText(values.flat().filter(Boolean).join(" ")).toLocaleLowerCase("ja");
  return haystack.includes(parsed.q.toLocaleLowerCase("ja"));
}

function normalizeSort(value, q) {
  if (value === "relevance") return q ? "relevance" : "newest";
  if (CATALOG_SORTS.includes(value)) return value;
  if (value === "release" || value === "recommended") return q ? "relevance" : "newest";
  return defaultSort(q);
}

function defaultSort(q) {
  return q ? "relevance" : "newest";
}

function legacyRelease(filter) {
  if (["released", "circulating", "market"].includes(filter)) return "released";
  if (["upcoming", "opportunity"].includes(filter)) return "upcoming";
  return "all";
}

function normalizePage(value) {
  const page = Number.parseInt(firstValue(value), 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function oneOf(value, allowed, fallback) {
  const normalized = normalizeSearchText(value, { maxLength: 24 });
  return allowed.includes(normalized) ? normalized : fallback;
}

function firstValue(value) {
  if (Array.isArray(value)) return String(value[0] ?? "");
  return String(value ?? "");
}

function recordMonth(record) {
  const date = String(record.release_date || record.releaseDate || "");
  if (/^\d{4}-\d{2}/.test(date)) return date.slice(0, 7);
  return normalizeCatalogMonth(record.release_month || record.schedule_month);
}
