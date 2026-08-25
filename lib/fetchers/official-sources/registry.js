const PROVIDERS = Object.freeze({
  kitan_club: {
    source: "kitan_club",
    manufacturer: "キタンクラブ",
    list_url: "https://kitan.jp/products/",
    detail_path: /^\/products\//,
  },
  qualia: {
    source: "qualia",
    manufacturer: "クオリア",
    list_url: "https://qualia-45.jp/",
    detail_path: /^\/(?:product|products)\//,
  },
});

export const OFFICIAL_SOURCE_EXPANSION_LIMITS = Object.freeze({
  current_detail_limit: 5,
  backfill_sample_detail_limit: 5,
  request_timeout_ms: 15_000,
  retry_limit: 1,
  request_delay_ms: 750,
});

export function listOfficialSourceExpansionProviders() {
  return Object.values(PROVIDERS).map(({ detail_path: _detailPath, ...provider }) => ({ ...provider }));
}

export function normalizeOfficialSourceExpansionMode(value) {
  const mode = text(value || "CURRENT").toUpperCase();
  if (mode !== "CURRENT" && mode !== "BACKFILL_SAMPLE") {
    throw new Error("Official source expansion mode must be CURRENT or BACKFILL_SAMPLE.");
  }
  return mode;
}

export async function fetchOfficialSourceExpansionDiagnostic(options = {}) {
  const mode = normalizeOfficialSourceExpansionMode(options.mode);
  const fetchImpl = options.fetchImpl || fetch;
  const limits = normalizeLimits(options);
  const providers = listOfficialSourceExpansionProviders();
  const sourceResults = [];

  for (const provider of providers) {
    sourceResults.push(await fetchProvider(provider, { mode, fetchImpl, limits }));
    if (limits.request_delay_ms > 0 && provider !== providers.at(-1)) await sleep(limits.request_delay_ms);
  }

  return {
    schema_version: 1,
    mode,
    source_scope: "diagnostic_only",
    cursor: { mode, next: null, full_backfill_executed: false },
    limits,
    providers: sourceResults,
  };
}

async function fetchProvider(provider, { mode, fetchImpl, limits }) {
  const metrics = { ...emptyMetrics(provider), mode };
  const list = await requestText(provider.list_url, { fetchImpl, limits });
  metrics.request_count += list.attempts;
  metrics.request_failures += list.ok ? 0 : 1;
  if (!list.ok) return { ...metrics, parser_success: false, issue_codes: [list.issue_code], records: [] };

  const discovered = parseProviderList(provider.source, list.body, provider.list_url);
  metrics.list_pages_fetched = 1;
  metrics.products_discovered = discovered.length;
  if (!discovered.length) return { ...metrics, parser_success: false, issue_codes: ["official_source_zero_results"], records: [] };

  const selected = selectDiagnosticDetails(discovered, mode, limits);
  const records = [];
  const issues = [];
  for (const entry of selected) {
    metrics.detail_attempted += 1;
    const detail = await requestText(entry.official_url, { fetchImpl, limits });
    metrics.request_count += detail.attempts;
    metrics.request_failures += detail.ok ? 0 : 1;
    if (!detail.ok) {
      metrics.detail_failures += 1;
      issues.push(detail.issue_code);
      continue;
    }
    const parsed = parseProviderDetail(provider.source, detail.body, entry.official_url, entry);
    if (!parsed.ok) {
      metrics.detail_failures += 1;
      metrics.parse_failures += 1;
      issues.push(parsed.issue_code);
      continue;
    }
    metrics.detail_success += 1;
    records.push(parsed.record);
    if (limits.request_delay_ms > 0 && entry !== selected.at(-1)) await sleep(limits.request_delay_ms);
  }
  return {
    ...metrics,
    parser_success: records.length > 0 && issues.length === 0,
    issue_codes: [...new Set(issues)].sort(),
    records: uniqueRecords(records),
  };
}

export function parseProviderList(source, body, baseUrl) {
  const provider = assertProvider(source);
  const pattern = provider.source === "kitan_club"
    ? /<a[^>]+href=["']([^"']*\/products\/[^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/gi
    : /<a[^>]+href=["']([^"']*\/(?:product|products)\/[^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const results = [];
  for (const match of String(body || "").matchAll(pattern)) {
    const officialUrl = canonicalProviderUrl(match[1], baseUrl, provider);
    const name = cleanText(match[2]);
    if (!officialUrl || !name) continue;
    results.push({ official_url: officialUrl, series_name: name, source_product_id: providerProductId(provider, officialUrl) });
  }
  return uniqueBy(results, (entry) => entry.official_url);
}

export function parseProviderDetail(source, body, officialUrl, discovery = {}) {
  const provider = assertProvider(source);
  const html = String(body || "");
  const sourceProductId = text(html.match(/data-product-id=["']([^"']+)["']/i)?.[1]) || discovery.source_product_id || providerProductId(provider, officialUrl);
  const seriesName = cleanText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]) || text(discovery.series_name);
  if (!seriesName || !sourceProductId) return { ok: false, issue_code: "official_detail_parse_failed" };
  const variantNames = parseLineup(html);
  if (!variantNames.length) return { ok: false, issue_code: "official_detail_zero_lineup" };
  const expectedVariantCount = Number(html.match(/全\s*(\d+)\s*種/)?.[1]);
  if (!Number.isInteger(expectedVariantCount) || expectedVariantCount <= 0 || expectedVariantCount !== variantNames.length) {
    return { ok: false, issue_code: "official_detail_variant_count_mismatch" };
  }
  const imageCandidates = parseImages(html, officialUrl);
  const variantImageMap = parseVariantImages(html, officialUrl);
  const seriesImage = imageCandidates[0] || null;
  const variants = variantNames.map((name) => ({
    name,
    image_candidate: variantImageMap.get(name) || null,
  }));
  const distinctVariantImages = new Set(variants.map((variant) => variant.image_candidate).filter(Boolean));
  return {
    ok: true,
    record: {
      source: provider.source,
      source_product_id: sourceProductId,
      official_url: canonicalProviderUrl(officialUrl, officialUrl, provider),
      manufacturer: provider.manufacturer,
      series_name: seriesName,
      release_date: parseReleaseDate(html),
      release_month: parseReleaseMonth(html),
      price: parsePrice(html),
      variant_count: variants.length,
      variants,
      series_image_candidate: seriesImage,
      image_scope_candidate: distinctVariantImages.size === variants.length && variants.length > 1 ? "variant" : "series",
      copyright_text: cleanText(html.match(/(?:©|\(c\))[^<\n]+/i)?.[0]) || null,
      source_parser_version: `${provider.source}:v1`,
      diagnostic_identity: {
        series_id: stableIdentity(provider.source, sourceProductId, canonicalProviderUrl(officialUrl, officialUrl, provider)),
        variant_ids: variants.map((variant) => stableIdentity(provider.source, sourceProductId, normalizeName(variant.name))),
      },
    },
  };
}

export function buildOfficialSourceExpansionMetrics(provider) {
  const records = Array.isArray(provider?.records) ? provider.records : [];
  const variants = records.flatMap((record) => record.variants || []);
  const dates = records.map((record) => record.release_date).filter(Boolean).sort();
  const identities = records.map((record) => record.diagnostic_identity?.series_id).filter(Boolean);
  const variantIdentities = records.flatMap((record) => record.diagnostic_identity?.variant_ids || []);
  return {
    list_pages_fetched: Number(provider?.list_pages_fetched || 0),
    products_discovered: Number(provider?.products_discovered || 0),
    detail_attempted: Number(provider?.detail_attempted || 0),
    detail_success: Number(provider?.detail_success || 0),
    parse_failures: Number(provider?.parse_failures || 0),
    products_with_release_date: records.filter((record) => record.release_date).length,
    products_with_price: records.filter((record) => Number.isFinite(record.price)).length,
    products_with_variants: records.filter((record) => record.variants?.length).length,
    total_variants: variants.length,
    products_with_distinct_variant_images: records.filter((record) => record.image_scope_candidate === "variant").length,
    products_with_series_only_image: records.filter((record) => record.image_scope_candidate === "series" && record.series_image_candidate).length,
    products_with_no_image: records.filter((record) => !record.series_image_candidate && !record.variants?.some((variant) => variant.image_candidate)).length,
    duplicate_product_identities: identities.length - new Set(identities).size,
    duplicate_variant_identities: variantIdentities.length - new Set(variantIdentities).size,
    oldest_observed_release: dates.at(0) || null,
    newest_observed_release: dates.at(-1) || null,
    estimated_remaining_history: provider?.mode === "BACKFILL_SAMPLE" ? "unknown" : "not_requested",
    request_count: Number(provider?.request_count || 0),
    request_failures: Number(provider?.request_failures || 0),
  };
}

function emptyMetrics(provider) {
  return { source: provider.source, manufacturer: provider.manufacturer, list_url: provider.list_url, mode: null, list_pages_fetched: 0, products_discovered: 0, detail_attempted: 0, detail_success: 0, detail_failures: 0, parse_failures: 0, request_count: 0, request_failures: 0 };
}

function selectDiagnosticDetails(entries, mode, limits) {
  const selected = [...entries].sort((left, right) => left.official_url.localeCompare(right.official_url));
  const limit = mode === "CURRENT" ? limits.current_detail_limit : limits.backfill_sample_detail_limit;
  return selected.slice(0, limit);
}

async function requestText(url, { fetchImpl, limits }) {
  let attempts = 0;
  while (attempts <= limits.retry_limit) {
    attempts += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), limits.request_timeout_ms);
    try {
      const response = await fetchImpl(url, { headers: { accept: "text/html;q=0.9, */*;q=0.8", "user-agent": "GachaLensBot/0.1 (+diagnostic-only-official-source-expansion)" }, signal: controller.signal });
      if (response.ok) return { ok: true, body: await response.text(), attempts };
      if (response.status !== 429 && response.status < 500) return { ok: false, attempts, issue_code: "official_fetch_http_error" };
    } catch (error) {
      if (error?.name === "AbortError") return { ok: false, attempts, issue_code: "official_fetch_timeout" };
    } finally { clearTimeout(timer); }
    if (attempts <= limits.retry_limit && limits.request_delay_ms > 0) await sleep(limits.request_delay_ms);
  }
  return { ok: false, attempts, issue_code: "official_fetch_network_or_rate_limit" };
}

function parseLineup(html) {
  const lines = [...String(html).matchAll(/<(?:li|p)[^>]*class=["'][^"']*(?:lineup|variant)[^"']*["'][^>]*>([\s\S]*?)<\/(?:li|p)>/gi)].map((match) => cleanText(match[1]));
  return [...new Set(lines.filter(Boolean))];
}
function parseImages(html, baseUrl) { return [...String(html).matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((match) => safeUrl(match[1], baseUrl)).filter(Boolean); }
function parseVariantImages(html, baseUrl) {
  const pairs = [...String(html).matchAll(/<(?:li|p)[^>]*data-variant=["']([^"']+)["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/gi)];
  return new Map(pairs.map((match) => [cleanText(match[1]), safeUrl(match[2], baseUrl)]).filter(([, url]) => url));
}
function parseReleaseDate(html) { return text(String(html).match(/(20\d{2})[年\/-]\s*(\d{1,2})[月\/-]\s*(\d{1,2})日?/)?.slice(1).map(Number).map((value, index) => index === 0 ? String(value) : String(value).padStart(2, "0")).join("-")) || null; }
function parseReleaseMonth(html) { const date = parseReleaseDate(html); return date ? date.slice(0, 7) : null; }
function parsePrice(html) { const value = String(html).match(/(?:価格|price)[^0-9]{0,12}([\d,]+)\s*円/i)?.[1]; return value ? Number(value.replaceAll(",", "")) : null; }
function providerProductId(provider, url) { const parsed = new URL(url); return text(parsed.searchParams.get("id")) || text(parsed.pathname.split("/").filter(Boolean).at(-1)); }
function stableIdentity(...parts) { return parts.map((part) => encodeURIComponent(String(part).trim())).join(":"); }
function canonicalProviderUrl(value, baseUrl, provider) { try { const url = new URL(value, baseUrl); url.hash = ""; if (url.protocol !== "https:" || url.hostname !== new URL(provider.list_url).hostname || !provider.detail_path.test(url.pathname)) return null; return url.toString(); } catch { return null; } }
function assertProvider(source) { const provider = PROVIDERS[text(source)]; if (!provider) throw new Error("Unsupported diagnostic official source."); return provider; }
function normalizeLimits(options) { return { current_detail_limit: bounded(options.currentDetailLimit, 1, 5, OFFICIAL_SOURCE_EXPANSION_LIMITS.current_detail_limit), backfill_sample_detail_limit: bounded(options.backfillSampleDetailLimit, 1, 5, OFFICIAL_SOURCE_EXPANSION_LIMITS.backfill_sample_detail_limit), request_timeout_ms: bounded(options.requestTimeoutMs, 1_000, 30_000, OFFICIAL_SOURCE_EXPANSION_LIMITS.request_timeout_ms), retry_limit: bounded(options.retryLimit, 0, 1, OFFICIAL_SOURCE_EXPANSION_LIMITS.retry_limit), request_delay_ms: bounded(options.requestDelayMs, 0, 5_000, OFFICIAL_SOURCE_EXPANSION_LIMITS.request_delay_ms) }; }
function bounded(value, min, max, fallback) { const parsed = Number(value); return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback; }
function uniqueRecords(records) { return uniqueBy(records, (record) => record.diagnostic_identity.series_id); }
function uniqueBy(values, key) { const result = new Map(); for (const value of values) if (!result.has(key(value))) result.set(key(value), value); return [...result.values()]; }
function safeUrl(value, base) { try { const url = new URL(value, base); return url.protocol === "https:" ? url.toString() : null; } catch { return null; } }
function normalizeName(value) { return text(value).normalize("NFKC").replace(/\s+/g, " "); }
function cleanText(value) { return String(value || "").replace(/<[^>]+>/g, " ").replace(/&(?:nbsp|amp);/gi, " ").replace(/\s+/g, " ").trim(); }
function text(value) { return value == null ? "" : String(value).trim(); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
