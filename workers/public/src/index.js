import { classifyPhaseA2Route, PUBLIC_BOOTSTRAP_OWNED_PATHS } from "./route-contract.js";

const RELEASE_SOURCE_SHA = "__GACHA_RELEASE_SOURCE_SHA__";
const SHA_RE = /^[0-9a-f]{40}$/;
const APP_RELEASE_SOURCE_PATH = "/api/runtime-diagnostics/release-source";
const APP_REPRESENTATIVE_PATH = "/review";
const INTERNAL_ORIGIN = "https://gacha-lens.internal";
const INTERNAL_DATA_PATH = "/.gacha-internal/public-document-data/v1";
const SITE_ORIGIN = "https://gachalens.com";
const PUBLIC_PREVIEW_SUFFIX = "-gacha-lens-public.senpingxingzuo.workers.dev";
const PUBLIC_CSS_PATH = "/gacha-public.css";

const PUBLIC_CSS = `
:root{color-scheme:light;--ink:#18212f;--muted:#667085;--line:#e5e7eb;--panel:#fff;--bg:#f7f8fb;--accent:#2563eb;--accent-soft:#eff6ff}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif;line-height:1.65}a{color:inherit;text-decoration:none}img{max-width:100%;display:block}.site-shell{width:min(1180px,calc(100% - 32px));margin:0 auto}.public-header{background:#fff;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}.public-header__row{height:64px;display:flex;align-items:center;gap:24px}.public-brand{font-weight:800;font-size:20px;letter-spacing:-.02em}.public-nav{display:flex;gap:16px;flex-wrap:wrap;font-size:14px}.public-nav a:hover{color:var(--accent)}.public-main{padding:32px 0 56px}.hero{display:grid;gap:8px;margin-bottom:24px}.hero h1{font-size:clamp(26px,4vw,38px);line-height:1.25;margin:0}.hero p{margin:0;color:var(--muted)}.panel{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px;margin:0 0 20px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}.card{display:flex;flex-direction:column;gap:10px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px;min-width:0}.card:hover{border-color:#c7d2fe;box-shadow:0 8px 22px rgba(15,23,42,.06)}.card__image{aspect-ratio:1/1;background:#f3f4f6;border-radius:10px;overflow:hidden;display:grid;place-items:center;color:var(--muted);font-size:13px}.card__image img{width:100%;height:100%;object-fit:contain}.card strong{line-height:1.45}.meta{color:var(--muted);font-size:13px}.tag-row{display:flex;flex-wrap:wrap;gap:6px}.tag{font-size:12px;background:var(--accent-soft);color:#1d4ed8;border-radius:999px;padding:3px 8px}.filters{display:grid;grid-template-columns:minmax(180px,1fr) repeat(2,minmax(130px,auto));gap:10px;align-items:end}.filters label{display:grid;gap:4px;color:var(--muted);font-size:12px}.filters input,.filters select{min-height:40px;border:1px solid var(--line);border-radius:9px;padding:8px 10px;background:#fff;color:var(--ink)}button,.button{display:inline-flex;align-items:center;justify-content:center;min-height:40px;border:0;border-radius:9px;background:var(--accent);color:#fff;padding:8px 14px;font-weight:700;cursor:pointer}.pagination{display:flex;justify-content:center;gap:8px;margin-top:22px}.pagination a,.pagination span{min-width:40px;padding:8px 12px;text-align:center;border:1px solid var(--line);border-radius:9px;background:#fff}.pagination .is-current{background:var(--ink);color:#fff}.detail{display:grid;grid-template-columns:minmax(260px,360px) 1fr;gap:28px}.detail__image{background:#fff;border:1px solid var(--line);border-radius:16px;min-height:320px;display:grid;place-items:center;overflow:hidden}.detail__image img{width:100%;height:100%;object-fit:contain}.detail dl{display:grid;grid-template-columns:max-content 1fr;gap:8px 18px;margin:18px 0}.detail dt{color:var(--muted)}.detail dd{margin:0}.month-nav{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 20px}.month-nav a{background:#fff;border:1px solid var(--line);padding:7px 10px;border-radius:8px;font-size:13px}.empty{padding:28px;text-align:center;color:var(--muted)}.public-footer{border-top:1px solid var(--line);background:#fff;padding:28px 0;color:var(--muted);font-size:13px}.public-footer__links{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:10px}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:760px){.site-shell{width:min(100% - 20px,1180px)}.public-header__row{height:auto;padding:12px 0;align-items:flex-start;flex-direction:column;gap:8px}.filters{grid-template-columns:1fr}.detail{grid-template-columns:1fr}.public-main{padding-top:22px}}
`;

function releaseSourceSha() {
  return SHA_RE.test(RELEASE_SOURCE_SHA) ? RELEASE_SOURCE_SHA : null;
}

function jsonResponse(request, value, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders,
  });
  return new Response(request.method === "HEAD" ? null : JSON.stringify(value), { status, headers });
}

function textResponse(request, body, status, contentType, cacheControl, route) {
  const headers = securityHeaders();
  headers.set("Content-Type", contentType);
  headers.set("Cache-Control", cacheControl);
  headers.set("Cloudflare-CDN-Cache-Control", cacheControl);
  headers.set("X-Gacha-Plane", "public");
  headers.set("X-Gacha-Route", route);
  headers.set("X-Gacha-Source-Sha", releaseSourceSha() || "unavailable");
  return new Response(request.method === "HEAD" ? null : body, { status, headers });
}

function securityHeaders() {
  return new Headers({
    "Content-Security-Policy": "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'none'; connect-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
}

function methodGuard(request) {
  if (request.method === "GET" || request.method === "HEAD") return null;
  return jsonResponse(request, { error: "method_not_allowed" }, 405, { Allow: "GET, HEAD" });
}

function fixedAppRequest(pathname) {
  const target = new URL(pathname, INTERNAL_ORIGIN);
  return new Request(target, {
    method: "GET",
    headers: {
      Accept: pathname === APP_RELEASE_SOURCE_PATH ? "application/json" : "text/html,application/xhtml+xml",
      "User-Agent": "GachaLens-PublicWorker",
    },
  });
}

async function readAppSourceSha(env) {
  if (!env?.APP || typeof env.APP.fetch !== "function") return { ok: false, status: 503, error: "app_binding_unavailable", sourceSha: null };
  const response = await env.APP.fetch(fixedAppRequest(APP_RELEASE_SOURCE_PATH));
  if (response.status !== 200) return { ok: false, status: 502, error: "app_source_identity_http_failure", sourceSha: null };
  const payload = await response.json().catch(() => null);
  const sourceSha = String(payload?.source_sha || "").trim().toLowerCase();
  if (!SHA_RE.test(sourceSha)) return { ok: false, status: 502, error: "app_source_identity_invalid", sourceSha: null };
  return { ok: true, status: 200, error: null, sourceSha };
}

async function appDelegationDiagnostic(request, env) {
  const ownSha = releaseSourceSha();
  if (!ownSha) return jsonResponse(request, { error: "public_source_identity_unavailable" }, 503);
  const appIdentity = await readAppSourceSha(env);
  if (!appIdentity.ok) return jsonResponse(request, { ok: false, public_source_sha: ownSha, app_source_sha: appIdentity.sourceSha, error: appIdentity.error }, appIdentity.status);
  if (appIdentity.sourceSha !== ownSha) return jsonResponse(request, { ok: false, public_source_sha: ownSha, app_source_sha: appIdentity.sourceSha, error: "mixed_source_sha" }, 409);
  const representative = await env.APP.fetch(fixedAppRequest(APP_REPRESENTATIVE_PATH));
  const representativeBody = representative.status === 200 ? await representative.clone().text() : "";
  const representativeOk = representative.status === 200 && representativeBody.includes("Review access");
  return jsonResponse(request, {
    ok: representativeOk,
    public_source_sha: ownSha,
    app_source_sha: appIdentity.sourceSha,
    representative: { path: APP_REPRESENTATIVE_PATH, status: representative.status, marker: representativeOk },
    error: representativeOk ? null : "app_representative_route_failed",
  }, representativeOk ? 200 : 502);
}

function previewAppOrigin(requestUrl) {
  const host = requestUrl.hostname.toLowerCase();
  if (!host.endsWith(PUBLIC_PREVIEW_SUFFIX)) return null;
  return `https://${host.replace("-gacha-lens-public.", "-gacha-lens.")}`;
}

function copyAllowedQuery(source, target, keys) {
  for (const key of keys) {
    const values = source.searchParams.getAll(key);
    if (values.length > 1) return false;
    if (values.length === 1 && values[0] !== "") target.searchParams.set(key, values[0]);
  }
  for (const key of source.searchParams.keys()) if (!keys.includes(key)) return false;
  return true;
}

async function fetchPublicData(request, env, kind, options = {}) {
  const ownSha = releaseSourceSha();
  if (!ownSha) return { ok: false, status: 503, error: "public_source_identity_unavailable" };
  const sourceUrl = new URL(request.url);
  const allowedKeys = options.allowedKeys || [];
  const target = new URL(INTERNAL_DATA_PATH, previewAppOrigin(sourceUrl) || INTERNAL_ORIGIN);
  target.searchParams.set("kind", kind);
  if (!copyAllowedQuery(sourceUrl, target, allowedKeys)) return { ok: false, status: 400, error: "invalid_public_query" };
  for (const [key, value] of Object.entries(options.fixed || {})) if (value != null && value !== "") target.searchParams.set(key, String(value));
  const dataRequest = new Request(target, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
      "User-Agent": "GachaLens-PublicWorker",
      "X-Gacha-Public-Source-Sha": ownSha,
    },
  });
  let response;
  try {
    const appPreview = previewAppOrigin(sourceUrl);
    response = appPreview ? await fetch(dataRequest) : await env?.APP?.fetch?.(dataRequest);
  } catch {
    return { ok: false, status: 502, error: "public_data_transport_failed" };
  }
  if (!response) return { ok: false, status: 503, error: "app_binding_unavailable" };
  const payload = await response.json().catch(() => null);
  const appSha = String(payload?.source_sha || "").trim().toLowerCase();
  if (!SHA_RE.test(appSha)) return { ok: false, status: 502, error: "app_source_identity_invalid" };
  if (appSha !== ownSha) return { ok: false, status: 409, error: "mixed_source_sha", public_source_sha: ownSha, app_source_sha: appSha };
  if (response.status !== 200 || payload?.ok !== true) return { ok: false, status: response.status || 502, error: payload?.error || "public_data_read_failed", app_source_sha: appSha };
  return { ok: true, status: 200, data: payload.payload, app_source_sha: appSha, subrequests: Number(payload.subrequests) || 0 };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function escapeXml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[char]));
}

function absolute(path) {
  return new URL(path || "/", SITE_ORIGIN).toString();
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? `¥${Math.round(number).toLocaleString("ja-JP")}` : "価格未定";
}

function scheduleText(item) {
  const date = String(item?.release_date || item?.parent?.release_date || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date.replace(/-/g, "/");
  return String(item?.release_month || item?.parent?.release_month || "発売時期未定");
}

function imageUrl(item) {
  return String(item?.image_url || item?.image || item?.parent?.image_url || "").trim();
}

function card(item, scope = "series") {
  const parent = item?.parent || null;
  const href = scope === "variant" ? `/series/${encodeURIComponent(item.slug)}` : `/series/group/${encodeURIComponent(item.slug)}`;
  const name = escapeHtml(item?.name || "名称未定");
  const image = imageUrl(item);
  const context = scope === "variant" ? [parent?.name, item?.rarity, scheduleText(item)].filter(Boolean).join(" ・ ") : [item?.franchise, item?.brand, scheduleText(item)].filter(Boolean).join(" ・ ");
  return `<a class="card" href="${href}"><div class="card__image">${image ? `<img src="${escapeHtml(image)}" alt="${name}" loading="lazy">` : "画像なし"}</div><strong>${name}</strong><span class="meta">${escapeHtml(context)}</span><div class="tag-row"><span class="tag">${escapeHtml(money(item?.price))}</span></div></a>`;
}

function header() {
  return `<header class="public-header"><div class="site-shell public-header__row"><a class="public-brand" href="/">Gacha Lens</a><nav class="public-nav" aria-label="メインナビゲーション"><a href="/series">ガチャ一覧</a><a href="/schedule">発売予定</a><a href="/categories">カテゴリ</a><a href="/ranking">ランキング</a><a href="/stock">在庫情報</a></nav></div></header>`;
}

function footer() {
  return `<footer class="public-footer"><div class="site-shell"><div class="public-footer__links"><a href="/privacy">プライバシー</a><a href="/terms">利用規約</a><a href="/disclaimer">免責事項</a><a href="/affiliate-disclosure">広告・アフィリエイトについて</a><a href="/operator">運営者情報</a><a href="/contact">お問い合わせ</a></div><span>© Gacha Lens</span></div></footer>`;
}

function documentShell({ title, description, canonical, body, noindex = false, schema = null }) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const canonicalUrl = absolute(canonical);
  const robots = noindex ? `<meta name="robots" content="noindex,follow">` : `<meta name="robots" content="index,follow">`;
  const schemaScript = schema ? `<script type="application/ld+json">${JSON.stringify(schema).replaceAll("<", "\\u003c")}</script>` : "";
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><meta name="description" content="${safeDescription}">${robots}<link rel="canonical" href="${escapeHtml(canonicalUrl)}"><meta property="og:site_name" content="Gacha Lens"><meta property="og:title" content="${safeTitle}"><meta property="og:description" content="${safeDescription}"><meta property="og:url" content="${escapeHtml(canonicalUrl)}"><meta property="og:type" content="website"><link rel="stylesheet" href="${PUBLIC_CSS_PATH}">${schemaScript}</head><body>${header()}<main class="public-main"><div class="site-shell">${body}</div></main>${footer()}</body></html>`;
}

function dataErrorDocument(error, pathname) {
  const status = error.status === 409 ? 409 : error.status === 400 ? 400 : 503;
  const title = status === 409 ? "Release source mismatch | Gacha Lens" : "一時的に商品情報を取得できません | Gacha Lens";
  const body = `<section class="panel empty"><h1>${status === 409 ? "公開面とApp面のバージョンが一致していません" : "商品情報を取得できません"}</h1><p>安全のため、このリクエストは失敗扱いにしています。</p></section>`;
  return { status, html: documentShell({ title, description: "Gacha Lens public document plane fail-closed response.", canonical: pathname, body, noindex: true }) };
}

function pagination(pathname, page, total, pageSize, sourceUrl) {
  const totalPages = Math.max(1, Math.ceil((Number(total) || 0) / pageSize));
  if (totalPages <= 1) return "";
  const links = [];
  for (const value of [...new Set([1, page - 1, page, page + 1, totalPages])].filter((value) => value >= 1 && value <= totalPages)) {
    const url = new URL(pathname, SITE_ORIGIN);
    for (const [key, current] of sourceUrl.searchParams.entries()) if (key !== "page") url.searchParams.set(key, current);
    if (value > 1) url.searchParams.set("page", String(value));
    links.push(value === page ? `<span class="is-current" aria-current="page">${value}</span>` : `<a href="${escapeHtml(url.pathname + url.search)}">${value}</a>`);
  }
  return `<nav class="pagination" aria-label="ページネーション">${links.join("")}</nav>`;
}

function renderHome(data) {
  const released = Array.isArray(data?.released) ? data.released : [];
  const upcoming = Array.isArray(data?.upcoming) ? data.upcoming : [];
  const body = `<section class="hero"><h1>いま注目のガチャがすぐ分かる Gacha Lens</h1><p>発売中の価格動向、いま注目のガチャ、発売予定、在庫・再入荷情報をまとめて確認できます。</p></section>${released.length ? `<section class="panel"><h2>発売中のガチャ</h2><div class="grid">${released.slice(0, 8).map((item) => card(item, "variant")).join("")}</div></section>` : `<section class="panel empty"><h2>公開中の注目データを準備しています</h2><p>商品データが揃い次第、ここに価格・発売・流通の情報を表示します。</p></section>`}${upcoming.length ? `<section class="panel"><h2>発売予定</h2><div class="grid">${upcoming.map((item) => card(item, "series")).join("")}</div></section>` : ""}`;
  return documentShell({ title: "Gacha Lens | ガチャの新作・価格・在庫情報", description: "発売中の価格動向、いま注目のガチャ、発売予定、在庫・再入荷情報をまとめて確認できます。", canonical: "/", body });
}

function renderSeries(data, requestUrl) {
  const scope = data?.scope === "variant" ? "variant" : "series";
  const items = Array.isArray(data?.items) ? data.items : [];
  const page = Number(data?.page) || 1;
  const total = Number(data?.total) || 0;
  const q = requestUrl.searchParams.get("q") || "";
  const category = requestUrl.searchParams.get("category") || "";
  const release = requestUrl.searchParams.get("release") || "";
  const sort = requestUrl.searchParams.get("sort") || "new";
  const canonicalUrl = new URL("/series", SITE_ORIGIN);
  if (scope === "variant") canonicalUrl.searchParams.set("scope", "variant");
  if (release) canonicalUrl.searchParams.set("release", release);
  if (requestUrl.searchParams.get("month")) canonicalUrl.searchParams.set("month", requestUrl.searchParams.get("month"));
  if (page > 1) canonicalUrl.searchParams.set("page", String(page));
  const heading = q ? `「${escapeHtml(q)}」の検索結果` : "ガチャ一覧";
  const body = `<section class="hero"><h1>${heading}</h1><p>シリーズと個別ラインナップを、発売時期や価格情報から探せます。</p></section><section class="panel"><form class="filters" method="get" action="/series"><label>検索<input type="search" name="q" value="${escapeHtml(q)}" placeholder="商品名・作品・ブランド"></label><label>表示<select name="scope"><option value="series"${scope === "series" ? " selected" : ""}>シリーズ</option><option value="variant"${scope === "variant" ? " selected" : ""}>個別商品</option></select></label><label>発売<select name="release"><option value="">すべて</option><option value="released"${release === "released" ? " selected" : ""}>発売済み</option><option value="upcoming"${release === "upcoming" ? " selected" : ""}>発売予定</option></select></label><input type="hidden" name="sort" value="${escapeHtml(sort)}"><button type="submit">絞り込む</button></form></section><section class="panel"><p class="meta">${total.toLocaleString("ja-JP")}件</p>${items.length ? `<div class="grid">${items.map((item) => card(item, scope)).join("")}</div>${pagination("/series", page, total, Number(data?.pageSize) || 60, requestUrl)}` : `<div class="empty">条件に一致するガチャはありません。</div>`}</section>`;
  const title = q ? `「${q}」の検索結果 | Gacha Lens` : "ガチャ一覧 | Gacha Lens";
  return documentShell({ title, description: "ガチャのシリーズ・商品を発売時期や価格から検索できます。", canonical: canonicalUrl.pathname + canonicalUrl.search, body, noindex: Boolean(q || category) });
}

function currentTokyoMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
}

function renderSchedule(data, requestUrl) {
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(data?.month || "") ? data.month : currentTokyoMonth();
  const items = Array.isArray(data?.items) ? data.items : [];
  const months = Array.isArray(data?.months) ? data.months : [];
  const page = Number(data?.page) || 1;
  const canonical = `/schedule?month=${month}${page > 1 ? `&page=${page}` : ""}`;
  const body = `<section class="hero"><h1>${escapeHtml(month.replace("-", "年"))}月のガチャ発売予定</h1><p>月ごとの発売予定・発売済みシリーズを確認できます。</p></section>${months.length ? `<nav class="month-nav" aria-label="発売月アーカイブ">${months.slice(-18).map((value) => `<a href="/schedule?month=${escapeHtml(value)}">${escapeHtml(value)}</a>`).join("")}</nav>` : ""}<section class="panel">${items.length ? `<div class="grid">${items.map((item) => card(item, "series")).join("")}</div>${pagination("/schedule", page, Number(data?.total) || 0, Number(data?.pageSize) || 60, requestUrl)}` : `<div class="empty">この月の発売情報はまだありません。</div>`}</section>`;
  return documentShell({ title: `${month} ガチャ発売予定 | Gacha Lens`, description: `${month}に発売予定・発売済みのガチャシリーズを確認できます。`, canonical, body, noindex: items.length === 0 });
}

function renderVariantDetail(data, slug) {
  const item = data?.item;
  if (!item) return null;
  const parent = item.parent || {};
  const siblings = Array.isArray(data?.siblings) ? data.siblings : [];
  const name = item.name || "商品詳細";
  const image = imageUrl(item);
  const canonical = `/series/${encodeURIComponent(slug)}`;
  const body = `<article><section class="detail"><div class="detail__image">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(name)}">` : "画像なし"}</div><div><p class="meta"><a href="/series/group/${encodeURIComponent(parent.slug || "")}">${escapeHtml(parent.name || "シリーズ")}</a></p><h1>${escapeHtml(name)}</h1><div class="tag-row">${item.rarity ? `<span class="tag">${escapeHtml(item.rarity)}</span>` : ""}${item.role ? `<span class="tag">${escapeHtml(item.role)}</span>` : ""}</div><dl><dt>価格</dt><dd>${escapeHtml(money(item.price))}</dd><dt>発売</dt><dd>${escapeHtml(scheduleText(item))}</dd><dt>ブランド</dt><dd>${escapeHtml(item.brand || parent.brand || "未登録")}</dd></dl>${item.official_url ? `<a class="button" href="${escapeHtml(item.official_url)}" rel="nofollow noopener">公式情報を見る</a>` : ""}</div></section>${siblings.length > 1 ? `<section class="panel"><h2>同じシリーズのラインナップ</h2><div class="grid">${siblings.filter((row) => row.slug !== item.slug).slice(0, 12).map((row) => card({ ...row, parent }, "variant")).join("")}</div></section>` : ""}</article>`;
  const schema = { "@context": "https://schema.org", "@type": "Product", name, image: image || undefined, brand: item.brand || parent.brand || undefined, url: absolute(canonical), offers: Number(item.price) > 0 ? { "@type": "Offer", priceCurrency: "JPY", price: Number(item.price), availability: "https://schema.org/InStock" } : undefined };
  return documentShell({ title: `${name} | Gacha Lens`, description: `${name}の発売情報・価格・シリーズ情報を確認できます。`, canonical, body, schema });
}

function renderParentDetail(data, slug) {
  const item = data?.item;
  if (!item) return null;
  const variants = Array.isArray(data?.variants) ? data.variants : [];
  const name = item.name || "シリーズ詳細";
  const image = imageUrl(item);
  const canonical = `/series/group/${encodeURIComponent(slug)}`;
  const body = `<article><section class="detail"><div class="detail__image">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(name)}">` : "画像なし"}</div><div><h1>${escapeHtml(name)}</h1><div class="tag-row">${item.franchise ? `<span class="tag">${escapeHtml(item.franchise)}</span>` : ""}${item.category ? `<span class="tag">${escapeHtml(item.category)}</span>` : ""}</div><dl><dt>価格</dt><dd>${escapeHtml(money(item.price))}</dd><dt>発売</dt><dd>${escapeHtml(scheduleText(item))}</dd><dt>ブランド</dt><dd>${escapeHtml(item.brand || "未登録")}</dd></dl>${item.official_url ? `<a class="button" href="${escapeHtml(item.official_url)}" rel="nofollow noopener">公式情報を見る</a>` : ""}</div></section><section class="panel"><h2>ラインナップ</h2>${variants.length ? `<div class="grid">${variants.map((row) => card({ ...row, parent: item }, "variant")).join("")}</div>` : `<div class="empty">公開中のラインナップを準備しています。</div>`}</section></article>`;
  return documentShell({ title: `${name} | Gacha Lens`, description: `${name}のラインナップ、発売情報、価格を確認できます。`, canonical, body, schema: { "@context": "https://schema.org", "@type": "CollectionPage", name, url: absolute(canonical) } });
}

function observerXml(entries, pathPrefix) {
  const rows = (Array.isArray(entries) ? entries : []).filter((entry) => entry?.slug).map((entry) => {
    const loc = `${SITE_ORIGIN}${pathPrefix}${encodeURIComponent(entry.slug)}`;
    const lastmod = /^\d{4}-\d{2}-\d{2}/.test(String(entry.updated_at || "")) ? `<lastmod>${escapeXml(String(entry.updated_at).slice(0, 10))}</lastmod>` : "";
    return `<url><loc>${escapeXml(loc)}</loc>${lastmod}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows.join("")}</urlset>`;
}

function rootSitemapXml(paths) {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${(Array.isArray(paths) ? paths : []).map((path) => `<url><loc>${escapeXml(absolute(path))}</loc></url>`).join("")}</urlset>`;
}

function sitemapIndexXml(shards) {
  const count = Math.max(0, Number(shards) || 0);
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Array.from({ length: count }, (_, index) => `<sitemap><loc>${SITE_ORIGIN}/variant-sitemap/${index + 1}</loc></sitemap>`).join("")}</sitemapindex>`;
}

async function renderPublicDocument(request, env, routeClass) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  if (pathname === "/robots.txt") {
    const body = `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /review/\nDisallow: /supabase-series\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\nSitemap: ${SITE_ORIGIN}/series-sitemap.xml\nSitemap: ${SITE_ORIGIN}/variant-sitemap.xml\n`;
    return textResponse(request, body, 200, "text/plain; charset=utf-8", "public, max-age=86400, stale-while-revalidate=300", "robots");
  }
  if (pathname === PUBLIC_CSS_PATH) return textResponse(request, PUBLIC_CSS, 200, "text/css; charset=utf-8", "public, max-age=86400, immutable", "public-css");

  let result;
  let html;
  let routeName = routeClass;
  if (pathname === "/") {
    result = await fetchPublicData(request, env, "home");
    if (result.ok) html = renderHome(result.data);
    routeName = "home";
  } else if (pathname === "/series") {
    result = await fetchPublicData(request, env, "series", { allowedKeys: ["scope", "page", "q", "category", "month", "release", "sort"] });
    if (result.ok) html = renderSeries(result.data, url);
    routeName = "series-index";
  } else if (pathname === "/schedule") {
    const normalized = new URL(request.url);
    if (!normalized.searchParams.get("month")) normalized.searchParams.set("month", currentTokyoMonth());
    result = await fetchPublicData(new Request(normalized, request), env, "schedule", { allowedKeys: ["month", "page"] });
    if (result.ok) html = renderSchedule(result.data, normalized);
    routeName = "schedule";
  } else if (/^\/series\/group\/[^/]+$/.test(pathname)) {
    const slug = decodeURIComponent(pathname.slice("/series/group/".length));
    result = await fetchPublicData(request, env, "series-detail", { fixed: { slug } });
    if (result.ok) html = renderParentDetail(result.data, slug);
    routeName = "series-detail";
  } else if (/^\/series\/[^/]+$/.test(pathname)) {
    const slug = decodeURIComponent(pathname.slice("/series/".length));
    result = await fetchPublicData(request, env, "variant-detail", { fixed: { slug } });
    if (result.ok) html = renderVariantDetail(result.data, slug);
    routeName = "variant-detail";
  } else if (pathname === "/sitemap.xml") {
    result = await fetchPublicData(request, env, "root-sitemap");
    if (result.ok) return textResponse(request, rootSitemapXml(result.data?.paths), 200, "application/xml; charset=utf-8", "public, max-age=86400, stale-while-revalidate=300", "root-sitemap");
  } else if (pathname === "/series-sitemap.xml") {
    result = await fetchPublicData(request, env, "series-sitemap");
    if (result.ok) return textResponse(request, observerXml(result.data?.entries, "/series/group/"), 200, "application/xml; charset=utf-8", "public, max-age=86400, stale-while-revalidate=300", "series-sitemap");
  } else if (pathname === "/variant-sitemap.xml") {
    result = await fetchPublicData(request, env, "variant-sitemap-index");
    if (result.ok) return textResponse(request, sitemapIndexXml(result.data?.shards), 200, "application/xml; charset=utf-8", "public, max-age=86400, stale-while-revalidate=300", "variant-sitemap-index");
  } else if (/^\/variant-sitemap\/[1-9]\d*$/.test(pathname)) {
    const page = pathname.slice("/variant-sitemap/".length);
    result = await fetchPublicData(request, env, "variant-sitemap-shard", { fixed: { page } });
    if (result.ok && result.data?.not_found) return textResponse(request, "Not found", 404, "text/plain; charset=utf-8", "no-store", "variant-sitemap-shard");
    if (result.ok) return textResponse(request, observerXml(result.data?.entries, "/series/"), 200, "application/xml; charset=utf-8", "public, max-age=86400, stale-while-revalidate=300", "variant-sitemap-shard");
  }

  if (!result?.ok) {
    const failure = dataErrorDocument(result || { status: 404 }, pathname);
    return textResponse(request, failure.html, failure.status, "text/html; charset=utf-8", "no-store, max-age=0", `${routeName}-fail-closed`);
  }
  if (!html) {
    const body = documentShell({ title: "ページが見つかりません | Gacha Lens", description: "指定された公開ページは見つかりませんでした。", canonical: pathname, body: `<section class="panel empty"><h1>ページが見つかりません</h1></section>`, noindex: true });
    return textResponse(request, body, 404, "text/html; charset=utf-8", "no-store, max-age=0", `${routeName}-not-found`);
  }
  const hasQuery = url.searchParams.size > 0;
  const cacheControl = hasQuery ? "public, max-age=0, must-revalidate" : /^\/series\//.test(pathname) ? "public, max-age=300, stale-while-revalidate=60" : "public, max-age=120, stale-while-revalidate=30";
  const response = textResponse(request, html, 200, "text/html; charset=utf-8", cacheControl, routeName);
  response.headers.set("X-Gacha-App-Source-Sha", result.app_source_sha || "");
  response.headers.set("X-Gacha-Data-Subrequests", String(result.subrequests ?? 0));
  return response;
}

export default {
  async fetch(request, env) {
    const guard = methodGuard(request);
    if (guard) return guard;
    const url = new URL(request.url);
    if (url.pathname === PUBLIC_CSS_PATH) return renderPublicDocument(request, env, "public-css");

    const routeClass = classifyPhaseA2Route(url.pathname);
    if (routeClass === "planned-public") return renderPublicDocument(request, env, routeClass);
    if (!PUBLIC_BOOTSTRAP_OWNED_PATHS.includes(url.pathname)) return jsonResponse(request, { error: "route_not_owned_by_public_bootstrap" }, 404);

    const sourceSha = releaseSourceSha();
    if (url.pathname === "/api/runtime-diagnostics/release-source") return jsonResponse(request, { plane: "public", source_sha: sourceSha }, sourceSha ? 200 : 503);
    if (url.pathname === "/api/runtime-diagnostics/public-plane") {
      return jsonResponse(request, { plane: "public", source_sha: sourceSha, app_binding: "APP", route_contract: "phase-a3-public-documents" }, sourceSha ? 200 : 503);
    }
    return appDelegationDiagnostic(request, env);
  },
};
