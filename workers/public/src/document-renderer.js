import { STATIC_BRAND_FACETS, STATIC_FRANCHISE_FACETS } from "./discovery-static-manifest.js";
import { STATIC_CATEGORY_FACETS } from "./category-static-manifest.js";

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

function jsonLd(value) {
  return `<script type="application/ld+json">${JSON.stringify(value).replaceAll("<", "\\u003c")}</script>`;
}

function websiteReference() {
  return { "@type":"WebSite", "@id":`${SITE_ORIGIN}/#website`, name:"Gacha Lens", url:`${SITE_ORIGIN}/` };
}

function breadcrumb(items) {
  return {
    "@context":"https://schema.org",
    "@type":"BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type":"ListItem", position:index + 1, name:item.name, item:item.url,
    })),
  };
}

function htmlDocument({ title, description, pathname, body, robots = "index,follow", structuredData = [] }) {
  const canonicalUrl = canonical(pathname);
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="${robots}"><link rel="canonical" href="${escapeHtml(canonicalUrl)}"><meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonicalUrl)}">${structuredData.map(jsonLd).join("")}</head><body><header><a href="/">Gacha Lens</a><nav><a href="/series">ガチャ一覧</a> <a href="/schedule">発売予定</a></nav></header><main>${body}</main></body></html>`;
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
  return `<ul>${rows.map((item) => `<li><a href="/series/group/${encodeURIComponent(item.slug)}"><strong>${escapeHtml(item.name)}</strong></a><div>${escapeHtml([item.brand, item.category, scheduleText(item)].filter(Boolean).join(" / "))}</div></li>`).join("")}</ul>`;
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
    description: "商品名・作品名・シリーズ名・カテゴリ・発売月から、公開中のガチャを探せます。",
    pathname: "/series",
    body,
  }), 200, 300);
}

function currentJstMonth(now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function renderSchedule(request, env, url) {
  const keys = [...url.searchParams.keys()];
  const rawMonth = url.searchParams.get("month") ?? "";
  const rawPage = url.searchParams.get("page");
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth) ? rawMonth : currentJstMonth();
  const page = rawPage && /^[1-9]\d*$/.test(rawPage) && Number(rawPage) <= 1000 ? Number(rawPage) : 1;
  const canonicalSearch = new URLSearchParams({ month });
  if (page > 1) canonicalSearch.set("page", String(page));
  const canonicalPath = `/schedule?${canonicalSearch.toString()}`;
  const validKeys = keys.every((key) => key === "month" || key === "page")
    && url.searchParams.getAll("month").length === 1
    && url.searchParams.getAll("page").length <= 1;
  if (!validKeys || rawMonth !== month || (rawPage !== null && (String(page) !== rawPage || page === 1))) {
    return Response.redirect(new URL(canonicalPath, url.origin).toString(), 308);
  }
  const offset = (page - 1) * 60;
  const rows = await readData(env, "/__public-data/v1/schedule", { month, limit: 60, offset });
  const suffix = page > 1 ? `（${page}ページ目）` : "";
  const body = `<h1>新作・発売スケジュール</h1><p>${escapeHtml(month)}の正式公開されたガチャシリーズを確認できます。</p>${seriesCards(rows)}`;
  return htmlResponse(request, htmlDocument({
    title: `${escapeHtml(month)}のガチャ新作・発売情報${suffix} | Gacha Lens`,
    description: "正式公開されたガチャシリーズの発売情報を月単位で漏れなく確認できます。",
    pathname: canonicalPath,
    body,
  }));
}

async function renderSeriesGroupDetail(request, env, slug) {
  const payload = await readData(env, "/__public-data/v1/series-detail", { slug }).catch((error) => {
    if (String(error?.message).includes("public_data_http_404")) return null;
    throw error;
  });
  if (!payload) {
    return htmlResponse(request, htmlDocument({
      title: "商品が見つかりません | Gacha Lens",
      description: "指定されたガチャシリーズは見つかりませんでした。",
      pathname: `/series/group/${slug}`,
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
  const pageUrl = canonical(`/series/group/${slug}`);
  const description = `${item.name}のラインナップ、定価、発売情報を確認できます。`;
  const listId = `${pageUrl}#lineup`;
  const structuredData = [
    {
      "@context":"https://schema.org", "@type":"CollectionPage",
      "@id":`${pageUrl}#collection-page`, name:item.name, description, url:pageUrl,
      image:item.image_url ? [item.image_url] : undefined, isPartOf:websiteReference(),
      mainEntity:{ "@id":listId },
    },
    {
      "@context":"https://schema.org", "@type":"ItemList", "@id":listId,
      name:`${item.name}の単品ラインナップ`, numberOfItems:variants.length,
      itemListElement:variants.map((variant, index) => ({
        "@type":"ListItem", position:index + 1, name:variant.name,
        url:canonical(`/series/${encodeURIComponent(variant.slug)}`),
      })),
    },
    breadcrumb([
      { name:"Gacha Lens", url:canonical("/") },
      { name:"ガチャ一覧", url:canonical("/series") },
      { name:item.name, url:pageUrl },
    ]),
  ];
  return htmlResponse(request, htmlDocument({
    title: `${item.name} シリーズ | Gacha Lens`,
    description,
    pathname: `/series/group/${slug}`,
    body,
    structuredData,
  }), 200, 300);
}

async function renderVariantDetail(request, env, slug) {
  const payload = await readData(env, "/__public-data/v1/variant-detail", { slug }).catch((error) => {
    if (String(error?.message).includes("public_data_http_404")) return null;
    throw error;
  });
  if (!payload) {
    return htmlResponse(request, htmlDocument({
      title: "商品が見つかりません | Gacha Lens",
      description: "指定されたガチャ商品は見つかりませんでした。",
      pathname: `/series/${slug}`,
      body: "<h1>商品が見つかりません</h1>",
      robots: "noindex,follow",
    }), 404, 60);
  }
  const item = payload.variant;
  const parent = payload.series;
  const body = `<article><h1>${escapeHtml(item.name)}</h1><p><a href="/series/group/${encodeURIComponent(parent.slug)}">${escapeHtml(parent.name)}</a></p><p>${escapeHtml([item.brand || parent.brand, item.rarity, item.release_date || item.release_month].filter(Boolean).join(" / "))}</p>${item.official_url ? `<p><a rel="nofollow noopener" href="${escapeHtml(item.official_url)}">公式情報</a></p>` : ""}</article>`;
  const pageUrl = canonical(`/series/${slug}`);
  const description = `${item.name}の定価、発売時期、${item.released ? "価格の動きと在庫情報" : "発売前の注目度と入手情報"}を確認できます。`;
  const structuredData = [
    {
      "@context":"https://schema.org", "@type":"ItemPage", "@id":`${pageUrl}#item-page`,
      name:item.name, description, url:pageUrl, image:item.image ? [item.image] : undefined,
      isPartOf:websiteReference(),
    },
    breadcrumb([
      { name:"Gacha Lens", url:canonical("/") },
      { name:"ガチャ一覧", url:canonical("/series") },
      { name:parent.name, url:canonical(`/series/group/${encodeURIComponent(parent.slug)}`) },
      { name:item.name, url:pageUrl },
    ]),
  ];
  return htmlResponse(request, htmlDocument({
    title: `${item.name} | Gacha Lens`,
    description,
    pathname: `/series/${slug}`,
    body,
    structuredData,
  }), 200, 300);
}

function sitemapUrl(pathname, lastmod) {
  return `<url><loc>${escapeXml(canonical(pathname))}</loc>${lastmod ? `<lastmod>${escapeXml(String(lastmod).slice(0, 10))}</lastmod>` : ""}</url>`;
}

async function renderSeriesSitemap(request, env) {
  const urls = [];
  for (let page = 0; page < MAX_SERIES_SITEMAP_PAGES; page += 1) {
    const rows = await readData(env, "/__public-data/v1/sitemap-series", { limit: 1000, offset: page * 1000 });
    urls.push(...rows.map((row) => sitemapUrl(`/series/group/${encodeURIComponent(row.slug)}`, row.updated_at)));
    if (rows.length < 1000) break;
  }
  return xmlResponse(request, `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`);
}

async function renderVariantSitemapIndex(request, env) {
  const shardDiscovery = await readData(env, "/__public-data/v1/sitemap-variant-shards");
  const pages = Number(shardDiscovery.pages);
  if (!Number.isInteger(pages) || pages < 1 || pages > 5000) {
    throw new Error("public_data_variant_sitemap_shards_invalid");
  }
  const sitemaps = Array.from({ length: pages }, (_, index) => `<sitemap><loc>${escapeXml(canonical(`/variant-sitemap/${index + 1}`))}</loc></sitemap>`);
  return xmlResponse(request, `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemaps.join("")}</sitemapindex>`);
}

async function renderVariantSitemapPage(request, env, page) {
  const offset = (page - 1) * VARIANT_SITEMAP_PAGE_SIZE;
  const rows = await readData(env, "/__public-data/v1/sitemap-variants", { limit: VARIANT_SITEMAP_PAGE_SIZE, offset });
  const urls = rows.map((row) => sitemapUrl(`/series/${encodeURIComponent(row.slug)}`, row.updated_at));
  return xmlResponse(request, `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`);
}

function toMonth(row) {
  const date = String(row?.release_date || "");
  if (/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(date)) return date.slice(0, 7);
  const month = String(row?.release_month || "");
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : "";
}

async function readAllScheduleMonths(env) {
  const months = new Set();
  for (let offset = 0; offset < 50000; offset += 1000) {
    const rows = await readData(env, "/__public-data/v1/schedule-months", { limit: 1000, offset });
    for (const row of rows) {
      const month = toMonth(row);
      if (month) months.add(month);
    }
    if (rows.length < 1000) break;
  }
  return [...months].sort();
}

function rootSitemapUrl(pathname, frequency, priority) {
  return `<url><loc>${escapeXml(canonical(pathname))}</loc><changefreq>${frequency}</changefreq><priority>${priority}</priority></url>`;
}

async function renderRootSitemap(request, env) {
  const staticPages = [
    ["/","daily","1"], ["/ranking","daily","0.9"], ["/ranking/series","daily","0.85"],
    ["/ranking/upcoming","daily","0.85"], ["/ranking/upcoming/series","daily","0.8"],
    ["/series","daily","0.9"], ["/guides","weekly","0.7"], ["/franchises","weekly","0.8"],
    ["/brands","weekly","0.8"], ["/categories","weekly","0.8"], ["/restocks","daily","0.8"],
    ["/stock","daily","0.8"], ["/privacy","yearly","0.3"], ["/terms","yearly","0.3"],
    ["/disclaimer","yearly","0.3"], ["/affiliate-disclosure","yearly","0.3"],
    ["/operator","yearly","0.3"], ["/contact","yearly","0.3"],
  ];
  const guideSlugs = ["market-price","price-history","stock-restock","forecast-ranking"];
  const months = await readAllScheduleMonths(env);
  const entries = [
    ...staticPages.map(([path, frequency, priority]) => rootSitemapUrl(path, frequency, priority)),
    ...months.map((month) => rootSitemapUrl(`/schedule?month=${encodeURIComponent(month)}`, "monthly", "0.8")),
    ...guideSlugs.map((slug) => rootSitemapUrl(`/guides/${encodeURIComponent(slug)}`, "monthly", "0.6")),
    ...STATIC_FRANCHISE_FACETS.map((facet) => rootSitemapUrl(`/franchises/${encodeURIComponent(facet.name)}`, "weekly", "0.7")),
    ...STATIC_BRAND_FACETS.map((facet) => rootSitemapUrl(`/brands/${encodeURIComponent(facet.name)}`, "weekly", "0.7")),
    ...STATIC_CATEGORY_FACETS.map((facet) => rootSitemapUrl(`/categories/${encodeURIComponent(facet.name)}`, "weekly", "0.7")),
  ];
  return xmlResponse(request, `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join("")}</urlset>`);
}

function renderRobots(request) {
  return textResponse(request, `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /review/\nDisallow: /supabase-series\nSitemap: ${canonical("/sitemap.xml")}\nSitemap: ${canonical("/series-sitemap.xml")}\nSitemap: ${canonical("/variant-sitemap.xml")}\nHost: ${canonical("/")}\n`);
}

export async function renderPublicDocument(request, env) {
  if (!["GET", "HEAD"].includes(request.method)) return null;
  const url = new URL(request.url);
  if (url.pathname === "/") return renderHome(request, env);
  if (url.pathname === "/series") return renderSeries(request, env);
  if (url.pathname === "/schedule") return renderSchedule(request, env, url);
  if (url.pathname === "/robots.txt") return renderRobots(request);
  if (url.pathname === "/sitemap.xml") return renderRootSitemap(request, env);
  if (url.pathname === "/series-sitemap.xml") return renderSeriesSitemap(request, env);
  if (url.pathname === "/variant-sitemap.xml") return renderVariantSitemapIndex(request, env);
  const shard = /^\/variant-sitemap\/([1-9]\d*)$/.exec(url.pathname);
  if (shard) return renderVariantSitemapPage(request, env, Number(shard[1]));
  const groupDetail = /^\/series\/group\/([^/]+)$/.exec(url.pathname);
  if (groupDetail) return renderSeriesGroupDetail(request, env, decodeURIComponent(groupDetail[1]));
  const detail = /^\/series\/([^/]+)$/.exec(url.pathname);
  if (detail) return renderVariantDetail(request, env, decodeURIComponent(detail[1]));
  return null;
}
