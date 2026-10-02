import { STATIC_BRAND_FACETS, STATIC_FRANCHISE_FACETS } from "./discovery-static-manifest.js";
import { STATIC_CATEGORY_FACETS } from "./category-static-manifest.js";

const SITE_ORIGIN = "https://gachalens.com";
const DATA_ORIGIN = "https://gacha-lens.internal";
const MAX_SERIES_SITEMAP_PAGES = 20;
const VARIANT_SITEMAP_PAGE_SIZE = 1000;
const MAX_VARIANT_SITEMAP_PAGES = 1000;

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

async function variantShardHasRows(env, page) {
  const offset = (page - 1) * VARIANT_SITEMAP_PAGE_SIZE;
  const rows = await readData(env, "/__public-data/v1/sitemap-variants", { limit: 1, offset });
  return Array.isArray(rows) && rows.length > 0;
}

async function discoverVariantSitemapPages(env) {
  if (!(await variantShardHasRows(env, 1))) return 0;

  let low = 1;
  let high = 2;
  while (await variantShardHasRows(env, high)) {
    low = high;
    high *= 2;
    if (high > 131072) throw new Error("variant_sitemap_shard_bound_exceeded");
  }

  while (low + 1 < high) {
    const mid = Math.floor((low + high) / 2);
    if (await variantShardHasRows(env, mid)) low = mid;
    else high = mid;
  }
  return low;
}

async function renderVariantSitemapIndex(request, env) {
  const pages = await discoverVariantSitemapPages(env);
  const sitemaps = Array.from({ length: pages }, (_, index) => `<sitemap><loc>${escapeXml(canonical(`/variant-sitemap/${index + 1}`))}</loc></sitemap>`);
  return xmlResponse(request, `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemaps.join("")}</sitemapindex>`);
}

async function renderVariantSitemapPage(request, env, page) {
  if (page > MAX_VARIANT_SITEMAP_PAGES) {
    return new Response(request.method === "HEAD" ? null : "Not Found", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=60",
        "x-gacha-public-plane": "phase-a3",
      },
    });
  }
  const offset = (page - 1) * VARIANT_SITEMAP_PAGE_SIZE;
  const rows = await readData(env, "/__public-data/v1/sitemap-variants", { limit: VARIANT_SITEMAP_PAGE_SIZE, offset });
  if (!rows.length) {
    return new Response(request.method === "HEAD" ? null : "Not Found", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=60",
        "x-gacha-public-plane": "phase-a3",
      },
    });
  }
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

const STATIC_LEGAL_PAGES = Object.freeze({
  "/privacy": {
    title: "プライバシーポリシー | Gacha Lens",
    heading: "プライバシーポリシー",
    description: "Gacha Lensにおける利用情報、投稿情報、外部送信、保存期間などの取り扱いを説明します。",
    lead: "サービス上で扱う情報と、その利用目的を明示します。",
    sections: [
      ["1. 取得する情報", "当サイトは、閲覧時の一般的なアクセスログ、エラー情報、端末・ブラウザに関する情報を、ホスティング事業者等を通じて取得する場合があります。販売先リンクの利用状況や、投稿された価格・在庫情報等をサービス改善・確認のために取り扱います。"],
      ["2. 利用目的", "商品情報、価格傾向、在庫・再入荷情報の提供と品質改善、不正利用や障害の検知、お問い合わせ対応等に利用します。"],
      ["3. 外部サービスとCookie等", "ホスティング、データベース、アクセス解析、広告、アフィリエイト等の外部サービスを利用する場合があります。第三者広告を有効化する場合は、対象地域の同意要件と本ポリシーを確認します。"],
      ["4. 保存・安全管理", "取得した情報は利用目的に必要な範囲で保存し、アクセス制限、権限分離、ログ監査等の合理的な安全管理措置を講じます。"],
      ["5. 開示・削除等", "ご本人に関する情報の開示、訂正、削除その他のご相談は、お問い合わせ窓口からご連絡ください。"],
      ["6. 改定", "法令、利用サービス、提供機能の変更に応じて本ポリシーを改定することがあります。"],
    ],
  },
  "/terms": {
    title: "利用規約 | Gacha Lens",
    heading: "利用規約",
    description: "Gacha Lensの利用条件、禁止事項、投稿情報の扱いなどを定めます。",
    lead: "Gacha Lensをご利用いただく際の条件です。",
    sections: [
      ["1. 適用", "本規約は、Gacha Lensが提供するウェブサイトおよび関連機能の利用に適用されます。"],
      ["2. 提供情報", "掲載する価格、発売、在庫、再入荷、注目度等は参考情報であり、正確性、完全性、最新性、商品の入手可能性を保証するものではありません。"],
      ["3. 禁止事項", "法令または公序良俗に反する行為、権利侵害、虚偽投稿、過度な負荷、不正取得・改変、アクセス制御の回避等を禁止します。"],
      ["4. 投稿情報", "利用者は投稿に必要な権利を有し、内容が正確であることを確認してください。"],
      ["5. サービスの変更・停止", "保守、障害、外部サービスの仕様変更その他の事情により、機能を変更または停止する場合があります。"],
      ["6. 知的財産権", "商品名、画像、商標等の権利は各権利者に帰属します。"],
      ["7. 準拠法", "本規約は日本法に準拠します。"],
    ],
  },
  "/disclaimer": {
    title: "免責事項 | Gacha Lens",
    heading: "免責事項",
    description: "Gacha Lensが掲載する価格、発売予定、在庫、予測情報等に関する免責事項です。",
    lead: "掲載情報は購入・売却を保証するものではありません。",
    sections: [
      ["参考情報としての提供", "価格、出品・成約件数、在庫、再入荷、発売予定、ランキング、予測スコア等は、取得時点のデータに基づく参考情報です。"],
      ["取引・購入の判断", "当サイトは商品の販売者、買取業者、投資助言業者ではありません。公式情報と販売先の表示をご確認ください。"],
      ["発売前予測", "発売前の期待度や注目度は予測であり、将来の価格、人気、希少性、入手難度を保証しません。"],
      ["外部サイト", "外部サイトの内容、在庫、価格、取引、安全性について当サイトは保証しません。"],
      ["権利関係", "Gacha Lensは非公式の情報サービスです。各メーカー、作品、販売事業者その他の権利者とは、明示がある場合を除き提携・承認関係にありません。"],
    ],
  },
  "/affiliate-disclosure": {
    title: "広告・アフィリエイトについて | Gacha Lens",
    heading: "広告・アフィリエイトについて",
    description: "Gacha Lensの広告掲載、アフィリエイトリンク、ランキングの独立性について説明します。",
    lead: "広告の有無と商品評価を分離して運営します。",
    sections: [
      ["アフィリエイト広告", "商品検索や販売先へのリンクにアフィリエイト広告を利用する場合があります。"],
      ["ランキングと予測の独立性", "ランキング、注目度、価格情報、発売前予測は、アフィリエイト報酬の有無や料率を評価要素に含めません。"],
      ["販売先リンク", "各販売先の価格、在庫、送料、ポイント、取引条件はリンク先でご確認ください。"],
      ["Amazonアソシエイト", "Amazonアソシエイト・プログラムを有効にした場合、Gacha LensはAmazonのアソシエイトとして適格販売により収入を得ます。"],
    ],
  },
  "/operator": {
    title: "運営情報 | Gacha Lens",
    heading: "運営情報",
    description: "Gacha Lensの運営方針、情報源、訂正方針、お問い合わせ窓口をご案内します。",
    lead: "ガチャの情報を、探しやすく比較しやすい形で届けます。",
    sections: [
      ["サービス", "サービス名: Gacha Lens / 運営: Gacha Lens 運営事務局 / 提供内容: ガチャの発売、価格動向、在庫・再入荷、トレンド情報"],
      ["編集・掲載方針", "公式情報を商品マスタの基準とし、市場情報や利用者報告は商品・単品との対応を確認して掲載します。"],
      ["訂正方針", "誤った商品情報等を確認した場合は、根拠を確認したうえで訂正します。修正依頼はお問い合わせからお送りください。"],
      ["非公式サービス", "当サイトは各メーカー、作品、販売事業者の公式サイトではありません。"],
    ],
  },
});

function renderStaticLegalPage(request, pathname) {
  const page = STATIC_LEGAL_PAGES[pathname];
  if (!page) return null;
  const sections = page.sections.map(([title, text]) => `<section><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p></section>`).join("");
  const body = `<article><h1>${escapeHtml(page.heading)}</h1><p>${escapeHtml(page.lead)}</p>${sections}</article>`;
  return htmlResponse(request, htmlDocument({
    title: page.title,
    description: page.description,
    pathname,
    body,
  }), 200, 86400);
}

export async function renderPublicDocument(request, env) {
  if (!["GET", "HEAD"].includes(request.method)) return null;
  const url = new URL(request.url);
  if (url.pathname === "/") return renderHome(request, env);
  if (url.pathname === "/series") return renderSeries(request, env);
  if (url.pathname === "/schedule") return renderSchedule(request, env, url);
  if (url.pathname === "/robots.txt") return renderRobots(request);
  if (STATIC_LEGAL_PAGES[url.pathname]) return renderStaticLegalPage(request, url.pathname);
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
