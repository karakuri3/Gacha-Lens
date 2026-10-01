const PUBLIC_DOCUMENT_DATA_PATH = "/.gacha-internal/public-document-data/v1";
const DEFAULT_SUPABASE_URL = "https://vxbrnvfhmzcxehuuzzum.supabase.co";
const SHA_RE = /^[0-9a-f]{40}$/i;
const APP_PREVIEW_RE = /^([0-9a-f]{8,64})-gacha-lens\.senpingxingzuo\.workers\.dev$/i;
const SERIES_SELECT = "id,slug,name,franchise,brand,category,release_month,release_week,release_date,price,image_url,official_url,is_released,source_type,created_at,updated_at";
const VARIANT_SELECT = "id,slug,series_id,name,variant_type,rarity,role,image,released,price,brand,release_month,release_week,release_date,official_url,source_type,updated_at";
const PARENT_SELECT = `parent:series!inner(${SERIES_SELECT})`;
const PUBLIC_VARIANT_FILTERS = [
  ["or", "(variant_type.is.null,variant_type.neq.provisional)"],
  ["series_id", "not.is.null"],
  ["slug", "not.is.null"],
  ["slug", "neq."],
  ["name", "not.is.null"],
  ["name", "neq."],
];
const STATIC_ROOT_PATHS = [
  "/", "/ranking", "/schedule", "/series", "/categories", "/brands", "/franchises",
  "/privacy", "/terms", "/disclaimer", "/affiliate-disclosure", "/operator", "/contact",
];

function json(request, body, status = 200, headers = {}) {
  return new Response(request.method === "HEAD" ? null : JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "application/json; charset=utf-8",
      "X-Gacha-Internal-Data": "v1",
      ...headers,
    },
  });
}

function safeSha(value) {
  const sha = String(value || "").trim().toLowerCase();
  return SHA_RE.test(sha) ? sha : null;
}

function isAllowedCaller(request, sourceSha) {
  const url = new URL(request.url);
  if (request.headers.get("x-gacha-public-source-sha") !== sourceSha) return false;
  if (url.hostname === "gacha-lens.internal") return true;
  const match = url.hostname.match(APP_PREVIEW_RE);
  return Boolean(match && sourceSha.startsWith(match[1].toLowerCase()));
}

function strictSearchParams(url, allowed) {
  for (const key of url.searchParams.keys()) if (!allowed.has(key)) return false;
  return true;
}

function cleanText(value, max = 120) {
  return String(value || "").normalize("NFKC").replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanSlug(value) {
  const slug = String(value || "").trim();
  if (!slug || slug.length > 240 || slug.includes("/")) return "";
  return slug;
}

function positiveInt(value, fallback = 1, max = 1000) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function monthRange(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || "")) return null;
  const [year, monthNumber] = month.split("-").map(Number);
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  return {
    start: `${year}-${String(monthNumber).padStart(2, "0")}-01`,
    end: `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`,
    legacy: `${monthNumber}月`,
  };
}

function configuredOrigin(env) {
  const value = String(env?.NEXT_PUBLIC_SUPABASE_URL || env?.SUPABASE_URL || DEFAULT_SUPABASE_URL).trim();
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

function serviceRoleKey(env) {
  const key = String(env?.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return key.length >= 20 ? key : null;
}

function createReadContext(env) {
  const origin = configuredOrigin(env);
  const key = serviceRoleKey(env);
  if (!origin || !key) return null;
  return { origin, key, subrequests: 0 };
}

async function restRows(context, table, params = [], options = {}) {
  if (context.subrequests >= 48) throw new Error("public_data_subrequest_budget_exceeded");
  const url = new URL(`/rest/v1/${table}`, context.origin);
  for (const [key, value] of params) url.searchParams.append(key, value);
  const from = Math.max(0, Number(options.from) || 0);
  const to = Math.max(from, Number(options.to) || from + 59);
  context.subrequests += 1;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      apikey: context.key,
      Authorization: `Bearer ${context.key}`,
      Accept: "application/json",
      Prefer: options.count ? "count=exact" : "count=none",
      Range: `${from}-${to}`,
      "Range-Unit": "items",
      "User-Agent": "GachaLens-AppPublicData/1",
    },
  });
  if (!response.ok) throw new Error(`public_data_origin_${response.status}`);
  const rows = await response.json();
  const contentRange = response.headers.get("content-range") || "";
  const totalText = contentRange.includes("/") ? contentRange.split("/").at(-1) : "";
  const total = /^\d+$/.test(totalText) ? Number(totalText) : null;
  return { rows: Array.isArray(rows) ? rows : [], total };
}

async function restAll(context, table, params, { maxRows = 50000, pageSize = 1000 } = {}) {
  const rows = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const result = await restRows(context, table, params, { from, to: from + pageSize - 1, count: from === 0 });
    rows.push(...result.rows);
    const total = result.total;
    if (result.rows.length < pageSize || (Number.isFinite(total) && rows.length >= total)) break;
  }
  return rows.slice(0, maxRows);
}

function publicVariantParams(select) {
  return [["select", select], ...PUBLIC_VARIANT_FILTERS];
}

function normalizeSeriesRow(row) {
  return row && typeof row === "object" ? row : null;
}

function normalizeVariantRow(row) {
  if (!row || typeof row !== "object") return null;
  const parent = row.parent && typeof row.parent === "object" ? row.parent : null;
  return { ...row, parent };
}

function applyCatalogFilters(params, query) {
  if (query.q) {
    const q = cleanText(query.q, 80).replace(/\s+/g, "*");
    if (q) params.push(["or", `(name.ilike.*${q}*,franchise.ilike.*${q}*,brand.ilike.*${q}*,category.ilike.*${q}*)`]);
  }
  if (query.category) params.push(["category", `eq.${cleanText(query.category, 80)}`]);
  const range = monthRange(query.month);
  if (range) params.push(["or", `(and(release_date.gte.${range.start},release_date.lt.${range.end}),and(release_date.is.null,release_month.eq.${range.legacy}),and(release_date.is.null,release_month.eq.${query.month}))`]);
  if (query.release === "released") params.push(["or", `(is_released.eq.true,release_date.lte.${query.today})`]);
  else if (query.release === "upcoming") {
    params.push(["is_released", "neq.true"]);
    params.push(["release_date", `gt.${query.today}`]);
  }
}

function sortForSeries(sort) {
  if (sort === "price_asc") return "price.asc.nullslast,updated_at.desc";
  if (sort === "price_desc") return "price.desc.nullslast,updated_at.desc";
  if (sort === "relevance") return "name.asc,updated_at.desc";
  return "release_date.desc.nullslast,updated_at.desc,id.asc";
}

async function loadSeriesCatalog(context, url) {
  const page = positiveInt(url.searchParams.get("page"), 1, 1000);
  const pageSize = 60;
  const q = cleanText(url.searchParams.get("q"), 80);
  const category = cleanText(url.searchParams.get("category"), 80);
  const month = String(url.searchParams.get("month") || "");
  const release = ["released", "upcoming"].includes(url.searchParams.get("release")) ? url.searchParams.get("release") : "";
  const sort = ["price_asc", "price_desc", "relevance"].includes(url.searchParams.get("sort")) ? url.searchParams.get("sort") : "new";
  const today = new Date().toISOString().slice(0, 10);
  const params = [["select", SERIES_SELECT]];
  applyCatalogFilters(params, { q, category, month, release, today });
  params.push(["order", sortForSeries(sort)]);
  const from = (page - 1) * pageSize;
  const result = await restRows(context, "series", params, { from, to: from + pageSize - 1, count: true });
  return { scope: "series", page, pageSize, total: result.total ?? result.rows.length, items: result.rows.map(normalizeSeriesRow).filter(Boolean) };
}

async function loadVariantCatalog(context, url) {
  const page = positiveInt(url.searchParams.get("page"), 1, 1000);
  const pageSize = 60;
  const q = cleanText(url.searchParams.get("q"), 80);
  const release = ["released", "upcoming"].includes(url.searchParams.get("release")) ? url.searchParams.get("release") : "";
  const month = String(url.searchParams.get("month") || "");
  const sort = ["price_asc", "price_desc", "relevance"].includes(url.searchParams.get("sort")) ? url.searchParams.get("sort") : "new";
  const params = publicVariantParams(`${VARIANT_SELECT},${PARENT_SELECT}`);
  if (q) {
    const token = q.replace(/\s+/g, "*");
    params.push(["or", `(name.ilike.*${token}*,rarity.ilike.*${token}*,role.ilike.*${token}*,brand.ilike.*${token}*)`]);
  }
  if (release === "released") params.push(["released", "eq.true"]);
  if (release === "upcoming") params.push(["released", "neq.true"]);
  const range = monthRange(month);
  if (range) params.push(["or", `(and(release_date.gte.${range.start},release_date.lt.${range.end}),and(release_date.is.null,release_month.eq.${range.legacy}),and(release_date.is.null,release_month.eq.${month}))`]);
  params.push(["order", sortForSeries(sort)]);
  const from = (page - 1) * pageSize;
  const result = await restRows(context, "variants", params, { from, to: from + pageSize - 1, count: true });
  return { scope: "variant", page, pageSize, total: result.total ?? result.rows.length, items: result.rows.map(normalizeVariantRow).filter(Boolean) };
}

async function loadSchedule(context, url) {
  const month = String(url.searchParams.get("month") || "");
  const page = positiveInt(url.searchParams.get("page"), 1, 1000);
  const pageSize = 60;
  const range = monthRange(month);
  const params = [["select", SERIES_SELECT]];
  if (range) params.push(["or", `(and(release_date.gte.${range.start},release_date.lt.${range.end}),and(release_date.is.null,release_month.eq.${range.legacy}),and(release_date.is.null,release_month.eq.${month}))`]);
  params.push(["order", "release_date.asc.nullslast,release_month.asc.nullslast,name.asc,id.asc"]);
  const from = (page - 1) * pageSize;
  const result = await restRows(context, "series", params, { from, to: from + pageSize - 1, count: true });
  const monthRows = await restAll(context, "series", [["select", "release_date,release_month"], ["order", "release_date.asc.nullslast,id.asc"]], { maxRows: 15000 });
  const months = [...new Set(monthRows.map((row) => {
    const date = String(row.release_date || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date.slice(0, 7);
    const stored = String(row.release_month || "");
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(stored) ? stored : "";
  }).filter(Boolean))].sort();
  return { month, months, page, pageSize, total: result.total ?? result.rows.length, items: result.rows };
}

async function loadVariantDetail(context, slug) {
  const params = publicVariantParams(`${VARIANT_SELECT},${PARENT_SELECT}`);
  params.push(["slug", `eq.${slug}`], ["limit", "1"]);
  const first = await restRows(context, "variants", params, { from: 0, to: 0 });
  const item = normalizeVariantRow(first.rows[0]);
  if (!item) return null;
  const siblings = await restRows(context, "variants", [
    ...publicVariantParams(VARIANT_SELECT),
    ["series_id", `eq.${item.series_id}`],
    ["order", "name.asc,id.asc"],
  ], { from: 0, to: 119 });
  return { item, siblings: siblings.rows };
}

async function loadParentDetail(context, slug) {
  const parent = await restRows(context, "series", [["select", SERIES_SELECT], ["slug", `eq.${slug}`], ["limit", "1"]], { from: 0, to: 0 });
  const item = normalizeSeriesRow(parent.rows[0]);
  if (!item) return null;
  const variants = await restRows(context, "variants", [
    ...publicVariantParams(VARIANT_SELECT),
    ["series_id", `eq.${item.id}`],
    ["order", "name.asc,id.asc"],
  ], { from: 0, to: 119 });
  return { item, variants: variants.rows };
}

async function loadHome(context) {
  const released = await restRows(context, "variants", [
    ...publicVariantParams(`${VARIANT_SELECT},${PARENT_SELECT}`),
    ["released", "eq.true"],
    ["order", "release_date.desc.nullslast,updated_at.desc,id.asc"],
  ], { from: 0, to: 11 });
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = await restRows(context, "series", [
    ["select", SERIES_SELECT],
    ["is_released", "neq.true"],
    ["release_date", `gt.${today}`],
    ["order", "release_date.asc.nullslast,updated_at.desc,id.asc"],
  ], { from: 0, to: 5 });
  return { released: released.rows.map(normalizeVariantRow).filter(Boolean), upcoming: upcoming.rows };
}

async function loadRootSitemap(context) {
  const rows = await restAll(context, "series", [["select", "slug,franchise,brand,category,release_date,release_month"], ["slug", "not.is.null"], ["order", "id.asc"]], { maxRows: 15000 });
  const paths = new Set(STATIC_ROOT_PATHS);
  const months = new Set();
  for (const row of rows) {
    if (row.franchise) paths.add(`/franchises/${encodeURIComponent(row.franchise)}`);
    if (row.brand) paths.add(`/brands/${encodeURIComponent(row.brand)}`);
    if (row.category) paths.add(`/categories/${encodeURIComponent(row.category)}`);
    const date = String(row.release_date || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) months.add(date.slice(0, 7));
    else if (/^\d{4}-\d{2}$/.test(String(row.release_month || ""))) months.add(String(row.release_month));
  }
  for (const month of months) paths.add(`/schedule?month=${month}`);
  return { paths: [...paths].sort() };
}

async function loadSeriesSitemap(context) {
  const rows = await restAll(context, "series", [["select", "slug,updated_at"], ["slug", "not.is.null"], ["slug", "neq."], ["source_type", "eq.official_site"], ["order", "id.asc"]], { maxRows: 50000 });
  return { entries: rows.filter((row) => row.slug).map((row) => ({ slug: row.slug, updated_at: row.updated_at || null })) };
}

async function loadVariantSitemapIndex(context) {
  const result = await restRows(context, "variants", [...publicVariantParams("id"), ["order", "id.asc"]], { from: 0, to: 0, count: true });
  const total = result.total ?? result.rows.length;
  return { total, shard_size: 1000, shards: Math.ceil(total / 1000) };
}

async function loadVariantSitemapShard(context, page) {
  const safePage = positiveInt(page, 1, 5000);
  const from = (safePage - 1) * 1000;
  const result = await restRows(context, "variants", [...publicVariantParams("slug,updated_at"), ["order", "id.asc"]], { from, to: from + 999, count: true });
  const total = result.total ?? 0;
  const shards = Math.ceil(total / 1000);
  if (safePage > Math.max(1, shards)) return { not_found: true, total, shards, entries: [] };
  return { total, shards, entries: result.rows.filter((row) => row.slug).map((row) => ({ slug: row.slug, updated_at: row.updated_at || null })) };
}

async function loadPayload(context, url) {
  const kind = url.searchParams.get("kind") || "";
  if (kind === "home") return loadHome(context);
  if (kind === "series") return url.searchParams.get("scope") === "variant" ? loadVariantCatalog(context, url) : loadSeriesCatalog(context, url);
  if (kind === "schedule") return loadSchedule(context, url);
  if (kind === "variant-detail") return loadVariantDetail(context, cleanSlug(url.searchParams.get("slug")));
  if (kind === "series-detail") return loadParentDetail(context, cleanSlug(url.searchParams.get("slug")));
  if (kind === "root-sitemap") return loadRootSitemap(context);
  if (kind === "series-sitemap") return loadSeriesSitemap(context);
  if (kind === "variant-sitemap-index") return loadVariantSitemapIndex(context);
  if (kind === "variant-sitemap-shard") return loadVariantSitemapShard(context, url.searchParams.get("page"));
  throw new Error("unsupported_public_data_kind");
}

export async function handlePublicDocumentData(request, env, { sourceSha } = {}) {
  const url = new URL(request.url);
  if (url.pathname !== PUBLIC_DOCUMENT_DATA_PATH) return null;
  if (!["GET", "HEAD"].includes(request.method)) return json(request, { error: "method_not_allowed" }, 405, { Allow: "GET, HEAD" });
  const exactSha = safeSha(sourceSha);
  if (!exactSha) return json(request, { error: "source_identity_unavailable" }, 503);
  if (!isAllowedCaller(request, exactSha)) return json(request, { error: "public_data_not_available" }, 404);
  const allowed = new Set(["kind", "scope", "page", "q", "category", "month", "release", "sort", "slug"]);
  if (!strictSearchParams(url, allowed)) return json(request, { error: "invalid_public_data_query" }, 400);
  const context = createReadContext(env);
  if (!context) return json(request, { error: "public_data_origin_unavailable" }, 503);
  try {
    const payload = await loadPayload(context, url);
    return json(request, { ok: true, source_sha: exactSha, payload, subrequests: context.subrequests });
  } catch (error) {
    const message = String(error?.message || error);
    const status = message === "unsupported_public_data_kind" ? 400 : 502;
    return json(request, { ok: false, source_sha: exactSha, error: status === 400 ? message : "public_data_read_failed", subrequests: context.subrequests }, status);
  }
}

export { PUBLIC_DOCUMENT_DATA_PATH };
