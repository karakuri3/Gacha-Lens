const SITE_ORIGIN = "https://gachalens.com";
const DATA_ORIGIN = "https://gacha-lens.internal";
const MAX_SERIES_SITEMAP_PAGES = 20;
const VARIANT_SITEMAP_PAGE_SIZE = 1000;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeXml(value) {
  return escapeHtml(value);
}

function canonical(pathname, search = "") {
  const url = new URL(pathname + search, SITE_ORIGIN);
  return url.toString();
}

function htmlDocument({ title, description, pathname, body, robots = "index,follow" }) {
  const canonicalUrl = canonical(pathname);
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="${robots}"><link rel="canonical" href="${escapeHtml(canonicalUrl)}"><meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonicalUrl)}"></head><body><header><a href="/">Gacha Lens</a><nav><a href="/series">ガチャ一覧</a> <a href="/schedule">発売予定</a></nav></header><main>${body}</main></body></html>`;
}

function htmlResponse(request, document, status = 200, ttl = 120) {
  return new Response(request.method === "HEAD" ? null : document, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": `public, max-age=${ttl}, stale-while-revalidate=30`,
      "x-gacha-public-plane": "phase-a3",
    },
  });
}

function xmlResponse(request, document, ttl = 86400) {
  return new Response(request.method === "HEAD" ? null : document, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": `public, max-age=${ttl}, stale-while-revalidate=300`,
      "x-gacha-public-plane": "phase-a3",
    },
  });
}

function textResponse(request, text, contentType = "text/plain; charset=utf-8", ttl = 86400) {
  return new Response(request.method === "HEAD" ? null : text, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": `public, max-age=${ttl}, stale-while-revalidate=300`,
      "x-gacha-public-plane": "phase-a3",
    },
  });
}

function dataRequest(pathname, params = {}) {
  const url = new URL(pathname, DATA_ORIGIN);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return new Request(url, {
    method: "GET",
    headers: { accept: "application/json", "user-agent": "GachaLens-PublicWorker-A3" },
  });
}

async function readData(env, pathname, params) {
  if (!env?.APP || typeof env.APP.fetch !== "function") throw new Error("app_binding_unavailable");
  const response = await env.APP.fetch(dataRequest(pathname, params));
  if (!response.ok) {
    const error = await response.text().catch(() => "");
    throw new Error(`public_data_http_${response.status}:${error.slice(0, 160)}`);
  }
  return response.json();
}

function scheduleText(item) {
  return item.release_date || item.release_month || item.release_week || "発売時期未定";
}

function seriesCards(rows) {
  if (!rows.length) return "<p>公開中の商品情報を準備しています。</p>";
  return `<ul>${rows.map((item) => `<li><a href="/series/${encodeURIComponent(item.slug)}"><strong>${escapeHtml(item.name)}</strong></a><div>${escapeHtml([item.brand, item.category, scheduleText(item)].filter(Boolean).join(" / "))}</div></li>`).join("")}</ul>`;
}

async function renderHome(request, env) {
  const [released, upcoming] = await Promise.all([
    readData(env, "/__public-data/v1/series", { released: true, limit: 12 }),
    readData(env, "/__public-data/v1/schedule", { limit: 12 }),
  ]);
  const body = `<h1>いま注目のガチャがすぐ分かる Gacha Lens</h1><section><h2>発売中のガチャ</h2>${seriesCards(released)}</section><section><h2>発売予定</h2>${seriesCards(upcoming)}</section>`;
  return htmlResponse(request, htmlDocument({
    title: "Gacha Lens | ガチャの新作・価格・在庫情報",
    description: "発売中の価格動向、いま注目のガチャ、発売予定、在庫・再入荷情報をまとめて確認できます。",
    pathname: "/",
    body,
  }));
}

async function renderSeries(request, env) {
  const rows = await readData(env, "/__public-data/v1/series", { limit: 80 });
  const body = `<h1>ガチャ一覧</h1><p>公式情報をもとに公開中のガチャシリーズを掲載しています。</p>${seriesCards(rows)}`;
  return htmlResponse(request, htmlDocument({
    title: "ガチャ一覧 | Gacha Lens",
    description: "ガチャシリーズを発売時期・ブランド・カテゴリ情報とあわせて確認できます。",
    pathname: "/series",
    body,
  }), 200, 300);
}

async function renderSchedule(request, env, url) {
  const month = url.searchParams.get("month") ?? "";
  const page = Number(url.searchParams.get("page") ?? "1");
  const offset = Number.isInteger(page) && page > 1 ? (page - 1) * 120 : 0;
  const rows = await readData(env, "/__public-data/v1/schedule", { month, limit: 120, offset });
  const suffix = /^\d{4}-\d{2}$/.test(month) ? `（${escapeHtml(month)}）` : "";
  const body = `<h1>ガチャ発売予定${suffix}</h1><p>公式情報から発売予定を確認できます。</p>${seriesCards(rows)}`;
  return htmlResponse(request, htmlDocument({
    title: `ガチャ発売予定${suffix} | Gacha Lens`,
    description: "ガチャの発売予定・発売月を公式情報ベースで確認できます。",
    pathname: "/schedule",
    body,
  }));
}

async function renderSeriesDetail(request, env, slug) {
  const payload = await readData(env, "/__public-data/v1/series-detail", { slug }).catch((error) => {
    if (String(error?.message).includes("public_data_http_404")) return null;
    throw error;
  });
  if (!payload) {
    return htmlResponse(request, htmlDocument({
      title: "商品が見つかりません | Gacha Lens",
      description: "指定されたガチャシリーズは見つかりませんでした。",
      pathname: `/series/${slug}`,
      body: "<h1>商品が見つかりません</h1>",
      robots: "noindex,follow",
    }), 404, 60);
  }
  const item = payload.series;
  const variants = Array.isArray(payload.variants) ? payload.variants : [];
  const variantsHtml = variants.length
    ? `<ul>${variants.map((variant) => `<li><strong>${escapeHtml(variant.name)}</strong><div>${escapeHtml([variant.rarity, variant.release_date || variant.release_month].filter(Boolean).join(" / "))}</div></li>`).join("")}</ul>`
    : "<p>公開可能なバリエーション情報はありません。</p>";
  const body = `<article><h1>${escapeHtml(item.name)}</h1><p>${escapeHtml([item.brand, item.category, scheduleText(item)].filter(Boolean).join(" / "))}</p><section><h2>ラインナップ</h2>${variantsHtml}</section>${item.official_url ? `<p><a rel="nofollow noopener" href="${escapeHtml(item.official_url)}">公式情報</a></p>` : ""}</article>`;
  return htmlResponse(request, htmlDocument({
    title: `${item.name} | Gacha Lens`,
    description: `${item.name}の発売情報とラインナップを確認できます。`,
    pathname: `/series/${slug}`,
    body,
  }), 200, 300);
}

function sitemapUrl(pathname, lastmod) {
  return `<url><loc>${escapeXml(canonical(pathname))}</loc>${lastmod ? `<lastmod>${escapeXml(String(lastmod).slice(0, 10))}</lastmod>` : ""}</url>`;
}

async function renderSeriesSitemap(request, env) {
  const urls = [];
  for (let page = 0; page < MAX_SERIES_SITEMAP_PAGES; page += 1) {
    const rows = await readData(env, "/__public-data/v1/sitemap-series", { limit: 1000, offset: page * 1000 });
    urls.push(...rows.map((row) => sitemapUrl(`/series/${encodeURIComponent(row.slug)}`, row.updated_at)));
    if (rows.length < 1000) break;
  }
  return xmlResponse(request, `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`);
}

async function renderVariantSitemapIndex(request, env) {
  const counts = await readData(env, "/__public-data/v1/counts");
  const pages = Math.max(1, Math.ceil(Number(counts.variants || 0) / VARIANT_SITEMAP_PAGE_SIZE));
  const sitemaps = Array.from({ length: pages }, (_, index) => `<sitemap><loc>${escapeXml(canonical(`/variant-sitemap/${index + 1}`))}</loc></sitemap>`);
  return xmlResponse(request, `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemaps.join("")}</sitemapindex>`);
}

async function renderVariantSitemapPage(request, env, page) {
  const offset = (page - 1) * VARIANT_SITEMAP_PAGE_SIZE;
  const rows = await readData(env, "/__public-data/v1/sitemap-variants", { limit: VARIANT_SITEMAP_PAGE_SIZE, offset });
  const urls = rows.map((row) => sitemapUrl(`/series/${encodeURIComponent(row.slug)}`, row.updated_at));
  return xmlResponse(request, `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`);
}

function renderRootSitemap(request) {
  const paths = ["/series-sitemap.xml", "/variant-sitemap.xml"];
  return xmlResponse(request, `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<sitemap><loc>${escapeXml(canonical(path))}</loc></sitemap>`).join("")}</sitemapindex>`);
}

function renderRobots(request) {
  return textResponse(request, `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /review/\nSitemap: ${canonical("/sitemap.xml")}\n`);
}

export async function renderPublicDocument(request, env) {
  if (!["GET", "HEAD"].includes(request.method)) return null;
  const url = new URL(request.url);
  if (url.pathname === "/") return renderHome(request, env);
  if (url.pathname === "/series") return renderSeries(request, env);
  if (url.pathname === "/schedule") return renderSchedule(request, env, url);
  if (url.pathname === "/robots.txt") return renderRobots(request);
  if (url.pathname === "/sitemap.xml") return renderRootSitemap(request);
  if (url.pathname === "/series-sitemap.xml") return renderSeriesSitemap(request, env);
  if (url.pathname === "/variant-sitemap.xml") return renderVariantSitemapIndex(request, env);
  const shard = /^\/variant-sitemap\/([1-9]\d*)$/.exec(url.pathname);
  if (shard) return renderVariantSitemapPage(request, env, Number(shard[1]));
  const detail = /^\/series\/([^/]+)$/.exec(url.pathname);
  if (detail) return renderSeriesDetail(request, env, decodeURIComponent(detail[1]));
  return null;
}
