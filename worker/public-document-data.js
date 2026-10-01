const INTERNAL_HOST = "gacha-lens.internal";
const PATH_PREFIX = "/__public-data/v1/";
const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 1000;

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    },
  });
}

function config(env) {
  const base = String(env?.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const key = String(env?.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(base) || !key) return null;
  return { base, key };
}

async function rest(env, table, params) {
  const cfg = config(env);
  if (!cfg) throw new Error("public_data_supabase_config_unavailable");
  const url = new URL(`${cfg.base}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: {
      apikey: cfg.key,
      authorization: `Bearer ${cfg.key}`,
      accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`public_data_rest_${table}_${response.status}`);
  return response.json();
}

function int(value, fallback, min = 0, max = MAX_LIMIT) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function publicSeriesFilter(extra = {}) {
  return {
    source_type: "eq.official_site",
    ...extra,
  };
}

function publicVariantFilter(extra = {}) {
  return {
    source_type: "eq.official_site",
    variant_type: "neq.provisional",
    review_required: "eq.false",
    ...extra,
  };
}

async function seriesList(env, url) {
  const limit = int(url.searchParams.get("limit"), DEFAULT_LIMIT, 1);
  const offset = int(url.searchParams.get("offset"), 0);
  const released = url.searchParams.get("released");
  const params = publicSeriesFilter({
    select: "id,slug,name,franchise,brand,category,release_month,release_week,release_date,price,image_url,official_url,is_released,updated_at",
    order: "release_date.desc.nullslast,updated_at.desc",
    limit,
    offset,
  });
  if (released === "true" || released === "false") params.is_released = `eq.${released}`;
  return rest(env, "series", params);
}

async function schedule(env, url) {
  const limit = int(url.searchParams.get("limit"), 120, 1);
  const offset = int(url.searchParams.get("offset"), 0);
  const month = String(url.searchParams.get("month") ?? "").trim();
  const params = publicSeriesFilter({
    select: "id,slug,name,brand,category,release_month,release_week,release_date,price,image_url,is_released,updated_at",
    order: "release_date.asc.nullslast,updated_at.desc",
    limit,
    offset,
  });
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) params.release_month = `eq.${month}`;
  else params.release_date = `gte.${new Date().toISOString().slice(0, 10)}`;
  return rest(env, "series", params);
}

async function seriesDetail(env, url) {
  const slug = String(url.searchParams.get("slug") ?? "").trim();
  if (!/^[A-Za-z0-9._~%-]{1,240}$/.test(slug)) return null;
  const rows = await rest(env, "series", publicSeriesFilter({
    select: "id,slug,name,franchise,brand,category,release_month,release_week,release_date,price,image_url,official_url,is_released,updated_at",
    slug: `eq.${slug}`,
    limit: 1,
  }));
  const series = rows[0] ?? null;
  if (!series) return null;
  const variants = await rest(env, "variants", publicVariantFilter({
    select: "id,slug,series_id,name,variant_type,rarity,image,released,price,brand,release_month,release_week,release_date,official_url,updated_at",
    series_id: `eq.${series.id}`,
    order: "release_date.asc.nullslast,name.asc",
    limit: 200,
  }));
  return { series, variants };
}

async function variantDetail(env, url) {
  const slug = String(url.searchParams.get("slug") ?? "").trim();
  if (!/^[A-Za-z0-9._~%-]{1,240}$/.test(slug)) return null;
  const variants = await rest(env, "variants", publicVariantFilter({
    select: "id,slug,series_id,name,variant_type,rarity,image,released,price,brand,release_month,release_week,release_date,official_url,updated_at",
    slug: `eq.${slug}`,
    limit: 1,
  }));
  const variant = variants[0] ?? null;
  if (!variant) return null;
  const parents = await rest(env, "series", publicSeriesFilter({
    select: "id,slug,name,franchise,brand,category,release_month,release_week,release_date,price,image_url,official_url,is_released,updated_at",
    id: `eq.${variant.series_id}`,
    limit: 1,
  }));
  const series = parents[0] ?? null;
  if (!series) return null;
  return { series, variant };
}

async function sitemapSeries(env, url) {
  const limit = int(url.searchParams.get("limit"), MAX_LIMIT, 1);
  const offset = int(url.searchParams.get("offset"), 0);
  return rest(env, "series", publicSeriesFilter({
    select: "slug,updated_at",
    order: "slug.asc",
    limit,
    offset,
  }));
}

async function sitemapVariants(env, url) {
  const limit = int(url.searchParams.get("limit"), MAX_LIMIT, 1);
  const offset = int(url.searchParams.get("offset"), 0);
  return rest(env, "variants", publicVariantFilter({
    select: "slug,updated_at",
    order: "slug.asc",
    limit,
    offset,
  }));
}

async function counts(env) {
  const cfg = config(env);
  if (!cfg) throw new Error("public_data_supabase_config_unavailable");
  async function count(table, filters) {
    const url = new URL(`${cfg.base}/rest/v1/${table}`);
    url.searchParams.set("select", "id");
    url.searchParams.set("limit", "1");
    for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, value);
    const response = await fetch(url, {
      headers: {
        apikey: cfg.key,
        authorization: `Bearer ${cfg.key}`,
        prefer: "count=exact",
        range: "0-0",
      },
    });
    if (!response.ok) throw new Error(`public_data_count_${table}_${response.status}`);
    const match = /\/(\d+)$/.exec(response.headers.get("content-range") ?? "");
    return match ? Number(match[1]) : 0;
  }
  const [series, variants] = await Promise.all([
    count("series", publicSeriesFilter({})),
    count("variants", publicVariantFilter({})),
  ]);
  return { series, variants };
}

export async function handlePublicDocumentData(request, env) {
  const url = new URL(request.url);
  if (url.hostname !== INTERNAL_HOST || !url.pathname.startsWith(PATH_PREFIX)) return null;
  if (!["GET", "HEAD"].includes(request.method)) return json({ error: "method_not_allowed" }, 405);

  try {
    let value;
    if (url.pathname === `${PATH_PREFIX}series`) value = await seriesList(env, url);
    else if (url.pathname === `${PATH_PREFIX}schedule`) value = await schedule(env, url);
    else if (url.pathname === `${PATH_PREFIX}series-detail`) value = await seriesDetail(env, url);
    else if (url.pathname === `${PATH_PREFIX}variant-detail`) value = await variantDetail(env, url);
    else if (url.pathname === `${PATH_PREFIX}sitemap-series`) value = await sitemapSeries(env, url);
    else if (url.pathname === `${PATH_PREFIX}sitemap-variants`) value = await sitemapVariants(env, url);
    else if (url.pathname === `${PATH_PREFIX}counts`) value = await counts(env);
    else return json({ error: "public_data_route_not_found" }, 404);

    if (value === null) return json({ error: "not_found" }, 404);
    const response = json(value, 200);
    return request.method === "HEAD"
      ? new Response(null, { status: response.status, headers: response.headers })
      : response;
  } catch (error) {
    return json({ error: "public_data_unavailable", detail: String(error?.message ?? error) }, 503);
  }
}
