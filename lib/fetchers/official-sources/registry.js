const PROVIDERS = Object.freeze({
  kitan_club: {
    source: "kitan_club",
    manufacturer: "キタンクラブ",
    list_url: "https://kitan.jp/products/",
    detail_path: /^\/products\//,
    archive_values: Array.from({ length: 17 }, (_, index) => String(2010 + index)),
  },
  qualia: {
    source: "qualia",
    manufacturer: "クオリア",
    list_url: "https://www.qualia-45.jp/product.html",
    lineup_archive_url: "https://www.qualia-45.jp/distinations/",
    detail_path: /^\/(?:product|products)\//,
  },
});

export const OFFICIAL_SOURCE_EXPANSION_LIMITS = Object.freeze({
  current_detail_limit: 5,
  backfill_sample_detail_limit: 5,
  qualia_lineup_fetch_limit: 3,
  qualia_lineup_archive_page_limit: 2,
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
  const cursors = normalizeProviderCursors(options.providerCursors);

  for (const provider of providers) {
    sourceResults.push(await fetchProvider(provider, { mode, fetchImpl, limits, cursor: cursors[provider.source] }));
    if (limits.request_delay_ms > 0 && provider !== providers.at(-1)) await sleep(limits.request_delay_ms);
  }

  return {
    schema_version: 1,
    mode,
    source_scope: "diagnostic_only",
    cursor: {
      mode,
      providers: Object.fromEntries(sourceResults.map((provider) => [provider.source, provider.next_cursor])),
      full_backfill_executed: false,
    },
    limits,
    providers: sourceResults,
  };
}

async function fetchProvider(provider, { mode, fetchImpl, limits, cursor }) {
  let navigation = null;
  let archiveValues = provider.archive_values;
  if (provider.source === "qualia") {
    navigation = await requestText(provider.list_url, { fetchImpl, limits });
    if (!navigation.ok) return { ...emptyMetrics(provider), mode, parser_success: false, issue_codes: [navigation.issue_code], records: [], metadata_records: [], next_cursor: null };
    archiveValues = parseQualiaArchiveNavigation(navigation.body, provider.list_url);
    if (!archiveValues.length) return { ...emptyMetrics(provider), mode, parser_success: false, issue_codes: ["official_archive_navigation_zero_results"], records: [], metadata_records: [], next_cursor: null };
  }
  const archive = resolveArchive(provider, mode, cursor, archiveValues);
  if (!archive.url) return { ...emptyMetrics(provider), mode, parser_success: false, issue_codes: ["official_archive_cursor_not_found"], records: [], metadata_records: [], next_cursor: null };
  const metrics = { ...emptyMetrics(provider), mode, archive_cursor: archive.current, archive_span: archive.span, estimated_remaining_history: archive.remaining };
  if (navigation) { metrics.list_pages_fetched += 1; metrics.request_count += navigation.attempts; }
  const list = navigation && archive.url === provider.list_url ? navigation : await requestText(archive.url, { fetchImpl, limits });
  if (list !== navigation) metrics.request_count += list.attempts;
  metrics.request_failures += list.ok ? 0 : 1;
  if (!list.ok) return { ...metrics, parser_success: false, issue_codes: [list.issue_code], records: [], metadata_records: [], next_cursor: archive.next };

  const discovered = parseProviderList(provider.source, list.body, archive.url);
  metrics.list_pages_fetched += 1;
  metrics.products_discovered = discovered.length;
  if (!discovered.length) return { ...metrics, parser_success: false, issue_codes: ["official_source_zero_results"], records: [], next_cursor: archive.next };

  const selected = selectDiagnosticDetails(discovered, mode, limits);
  const records = [];
  const metadataRecords = [];
  const formalLineupEvidence = [];
  const pendingQualiaProducts = [];
  const detailOutcomes = [];
  const issues = [];
  for (const entry of selected) {
    metrics.detail_attempted += 1;
    const detail = await requestText(entry.official_url, { fetchImpl, limits });
    metrics.request_count += detail.attempts;
    metrics.request_failures += detail.ok ? 0 : 1;
    if (!detail.ok) {
      metrics.detail_failures += 1;
      issues.push(detail.issue_code);
      detailOutcomes.push({ kind: "rejected", reason: detail.issue_code });
      if (limits.request_delay_ms > 0 && entry !== selected.at(-1)) await sleep(limits.request_delay_ms);
      continue;
    }
    const parsed = parseProviderDetail(provider.source, detail.body, entry.official_url, entry);
    if (!parsed.ok) {
      if (provider.source === "qualia" && parsed.metadata?.series_name) {
        pendingQualiaProducts.push({ entry, metadata: parsed.metadata });
        if (limits.request_delay_ms > 0 && entry !== selected.at(-1)) await sleep(limits.request_delay_ms);
        continue;
      }
      metrics.detail_failures += 1;
      metrics.parse_failures += 1;
      issues.push(parsed.issue_code);
      detailOutcomes.push({ kind: "rejected", reason: parsed.issue_code });
      if (limits.request_delay_ms > 0 && entry !== selected.at(-1)) await sleep(limits.request_delay_ms);
      continue;
    }
    metrics.detail_success += 1;
    records.push(parsed.record);
    detailOutcomes.push({ kind: "successful" });
    if (limits.request_delay_ms > 0 && entry !== selected.at(-1)) await sleep(limits.request_delay_ms);
  }
  if (provider.source === "qualia") {
    const qualiaLineupUrls = await discoverQualiaLineupUrls(provider, {
      fetchImpl,
      limits,
      metrics,
      issues,
      preferredSeriesNames: pendingQualiaProducts.map((pending) => pending.metadata.series_name),
    });
    const lineups = await fetchQualiaLineups(qualiaLineupUrls, { fetchImpl, limits, metrics, issues });
    for (const lineup of lineups) formalLineupEvidence.push(sanitizeFormalLineupEvidence(lineup.record));
    for (const pending of pendingQualiaProducts) {
      const linkResults = lineups.map((lineup) => linkQualiaProductToLineup(pending.metadata, lineup));
      const linked = linkResults.find((result) => result.linked);
      if (linked) {
        records.push(buildQualiaLinkedRecord(provider, pending.entry, pending.metadata, linked));
        metrics.detail_success += 1;
        detailOutcomes.push({ kind: "successful" });
        continue;
      }
      metadataRecords.push(sanitizeDiscoveryMetadata(provider, pending.entry, pending.metadata));
      detailOutcomes.push({ kind: "metadata_only", reason: linkResults.at(0)?.reason || "official_detail_zero_lineup" });
    }
  }
  const safeRecords = uniqueRecords(records);
  const safeMetadataRecords = uniqueBy(metadataRecords, (record) => record.official_url);
  const successfulRecords = detailOutcomes.filter((outcome) => outcome.kind === "successful");
  const metadataOnlyRecords = detailOutcomes.filter((outcome) => outcome.kind === "metadata_only");
  const rejectedRecords = detailOutcomes.filter((outcome) => outcome.kind === "rejected");
  if (detailOutcomes.length !== metrics.detail_attempted) throw new Error("Official source diagnostic detail outcomes are incomplete.");
  return {
    ...metrics,
    next_cursor: archive.next,
    successful_records: successfulRecords.length,
    metadata_only_records: metadataOnlyRecords.length,
    metadata_only_reasons: countIssueCodes(metadataOnlyRecords.map((outcome) => outcome.reason)),
    rejected_records: rejectedRecords.length,
    rejection_reasons: countIssueCodes(rejectedRecords.map((outcome) => outcome.reason)),
    parser_success: safeRecords.length > 0,
    parser_complete: metadataOnlyRecords.length === 0 && rejectedRecords.length === 0,
    issue_codes: [...new Set(issues)].sort(),
    records: safeRecords,
    metadata_records: safeMetadataRecords,
    formal_lineup_evidence: uniqueBy(formalLineupEvidence, (record) => record.official_url),
  };
}

export function parseProviderList(source, body, baseUrl) {
  const provider = assertProvider(source);
  const pattern = provider.source === "kitan_club"
    ? /<a[^>]+href=["']([^"']*\/products\/[^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/gi
    : /<a[^>]+href=["']([^"']*\/product\/view\/\d+[^"'#?]*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const results = [];
  for (const match of String(body || "").matchAll(pattern)) {
    const officialUrl = canonicalProviderUrl(match[1], baseUrl, provider);
    if (!officialUrl) continue;
    // Both live listings may be image-only cards. Detail metadata is the authoritative name source.
    results.push({ official_url: officialUrl, series_name: cleanText(match[2]) || null, source_product_id: providerProductId(provider, officialUrl) });
  }
  return uniqueBy(results, (entry) => entry.official_url);
}

export function parseProviderDetail(source, body, officialUrl, discovery = {}) {
  const provider = assertProvider(source);
  const html = String(body || "");
  const detail = provider.source === "kitan_club" ? parseKitanDetail(html, officialUrl) : parseQualiaDetail(html, officialUrl);
  const sourceProductId = discovery.source_product_id || providerProductId(provider, officialUrl);
  const seriesName = detail.series_name || text(discovery.series_name);
  if (!seriesName || !sourceProductId) return { ok: false, issue_code: "official_detail_parse_failed" };
  const metadata = { series_name: seriesName, release_date: detail.release_date, release_month: detail.release_month, price: detail.price, expected_variant_count: detail.expected_variant_count };
  if (!detail.variant_names.length) return { ok: false, issue_code: "official_detail_zero_lineup", metadata };
  if (!Number.isInteger(detail.expected_variant_count) || detail.expected_variant_count <= 0 || detail.expected_variant_count !== detail.variant_names.length) return { ok: false, issue_code: "official_detail_variant_count_mismatch", metadata };
  const variants = detail.variant_names.map((name, index) => ({ name, image_candidate: detail.variant_images[index] || null }));
  const distinctVariantImages = new Set(variants.map((variant) => variant.image_candidate).filter(Boolean));
  return {
    ok: true,
    record: {
      source: provider.source,
      source_product_id: sourceProductId,
      official_url: canonicalProviderUrl(officialUrl, officialUrl, provider),
      manufacturer: provider.manufacturer,
      series_name: seriesName,
      release_date: detail.release_date,
      release_month: detail.release_month,
      price: detail.price,
      variant_count: variants.length,
      variants,
      series_image_candidate: detail.series_image_candidate,
      image_scope_candidate: distinctVariantImages.size === variants.length && variants.length > 1 ? "variant" : "series",
      copyright_text: detail.copyright_text,
      source_parser_version: `${provider.source}:v1`,
      diagnostic_identity: {
        series_id: stableIdentity(provider.source, sourceProductId, canonicalProviderUrl(officialUrl, officialUrl, provider)),
        variant_ids: variants.map((variant) => stableIdentity(provider.source, sourceProductId, normalizeName(variant.name))),
      },
    },
  };
}

export function parseQualiaLineupDocument(body, officialUrl) {
  const html = String(body || "");
  if (!/^https:\/\/www\.qualia-45\.jp\/distinations\/[^/]+\/$/.test(officialUrl)) return { ok: false, issue_code: "qualia_lineup_url_rejected" };
  const fields = definitionFields(html);
  const series_name = fields.get("商品名") || cleanText(html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1]);
  const heading = html.match(/<h[23][^>]*>\s*Lineup\s*<\/h[23]>([\s\S]*?)(?=<h[23][^>]*>|<footer|$)/i)?.[1] || "";
  const variant_names = [...heading.matchAll(/<(?:li|p)[^>]*>([\s\S]*?)<\/(?:li|p)>/gi)].map((match) => cleanText(match[1])).filter(Boolean);
  const expected_variant_count = expectedCount(fields.get("価格") || html);
  const uniqueVariantNames = [...new Set(variant_names)];
  if (!series_name || !variant_names.length || !expected_variant_count || expected_variant_count > 20 || uniqueVariantNames.length !== expected_variant_count) return { ok: false, issue_code: "qualia_lineup_parse_failed" };
  return { ok: true, record: { official_url: officialUrl, series_name, release_date: parseReleaseDate(fields.get("発売日")), release_month: parseReleaseMonth(fields.get("発売日")), price: parsePrice(fields.get("価格")), variant_names: uniqueVariantNames, source_parser_version: "qualia:lineup:v1" } };
}

export function linkQualiaProductToLineup(product, lineup) {
  if (!product || !lineup?.ok) return { linked: false, reason: "lineup_unavailable" };
  const candidate = lineup.record;
  const productName = normalizeName(product.series_name);
  if (!productName || productName !== normalizeName(candidate.series_name)) return { linked: false, reason: "lineup_identity_mismatch" };
  if (!product.release_month || !candidate.release_month || product.release_month !== candidate.release_month) return { linked: false, reason: "lineup_release_month_mismatch" };
  if (!Number.isFinite(product.price) || !Number.isFinite(candidate.price) || product.price !== candidate.price) return { linked: false, reason: "lineup_price_mismatch" };
  if (!Number.isInteger(product.expected_variant_count) || product.expected_variant_count !== candidate.variant_names.length) return { linked: false, reason: "lineup_variant_count_mismatch" };
  if (product.release_date && candidate.release_date && product.release_date !== candidate.release_date) return { linked: false, reason: "lineup_release_date_mismatch" };
  return { linked: true, variants: candidate.variant_names.map((name) => ({ name, image_candidate: null })), lineup_url: candidate.official_url };
}

export function parseQualiaArchiveNavigation(body, baseUrl) {
  const seen = new Map();
  for (const match of String(body || "").matchAll(/href=["']([^"']*\/product\/search\/ym:(\d{4}-\d{2})[^"']*)["']/gi)) {
    const url = safeUrl(match[1], baseUrl);
    if (url && !seen.has(match[2])) seen.set(match[2], { value: match[2], url });
  }
  return [...seen.values()].sort((left, right) => left.value.localeCompare(right.value));
}

export function parseQualiaLineupLinks(body, baseUrl) {
  return parseQualiaLineupEntries(body, baseUrl).map((entry) => entry.url);
}

export function parseQualiaLineupEntries(body, baseUrl) {
  const seen = new Set();
  const entries = [];
  for (const match of String(body || "").matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = canonicalQualiaLineupUrl(match[1], baseUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const content = match[2];
    const title = cleanText(content) || cleanText(content.match(/\balt=["']([^"']+)["']/i)?.[1]);
    entries.push({ url, title: title || null });
  }
  return entries;
}

export function parseQualiaLineupArchivePages(body, baseUrl) {
  const pages = new Set([canonicalQualiaLineupArchiveUrl(baseUrl)]);
  for (const match of String(body || "").matchAll(/<a[^>]+href=["']([^"']+)["']/gi)) {
    const url = canonicalQualiaLineupArchiveUrl(match[1], baseUrl);
    if (url) pages.add(url);
  }
  return [...pages].filter(Boolean).sort((left, right) => lineupArchivePageNumber(left) - lineupArchivePageNumber(right));
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
    successful_records: Number(provider?.successful_records || records.length),
    metadata_only_records: Number(provider?.metadata_only_records || 0),
    metadata_only_reasons: { ...(provider?.metadata_only_reasons || {}) },
    rejected_records: Number(provider?.rejected_records || 0),
    rejection_reasons: { ...(provider?.rejection_reasons || {}) },
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
    lineup_discovered: Number(provider?.lineup_discovered || 0),
    lineup_attempted: Number(provider?.lineup_attempted || 0),
    lineup_success: Number(provider?.lineup_success || 0),
    lineup_failures: Number(provider?.lineup_failures || 0),
    lineup_fetch_limit: Number(provider?.lineup_fetch_limit || 0),
    lineup_archive_pages_fetched: Number(provider?.lineup_archive_pages_fetched || 0),
    lineup_archive_page_limit: Number(provider?.lineup_archive_page_limit || 0),
  };
}

function emptyMetrics(provider) {
  return { source: provider.source, manufacturer: provider.manufacturer, list_url: provider.list_url, mode: null, list_pages_fetched: 0, products_discovered: 0, detail_attempted: 0, detail_success: 0, detail_failures: 0, parse_failures: 0, successful_records: 0, metadata_only_records: 0, metadata_only_reasons: {}, rejected_records: 0, rejection_reasons: {}, request_count: 0, request_failures: 0, lineup_discovered: 0, lineup_attempted: 0, lineup_success: 0, lineup_failures: 0, lineup_fetch_limit: 0, lineup_archive_pages_fetched: 0, lineup_archive_page_limit: 0 };
}

function sanitizeDiscoveryMetadata(provider, entry, metadata) {
  return {
    source: provider.source,
    source_product_id: entry.source_product_id,
    official_url: entry.official_url,
    series_name: text(metadata.series_name),
    release_date: text(metadata.release_date) || null,
    release_month: text(metadata.release_month) || null,
    price: Number.isFinite(metadata.price) ? metadata.price : null,
    source_parser_version: `${provider.source}:v1`,
    formal_lineup: false,
  };
}

function resolveArchive(provider, mode, cursor, archiveValues = provider.archive_values) {
  if (mode === "CURRENT" && provider.source === "qualia") {
    const latest = archiveValues?.at(-1);
    if (!latest?.url || !latest?.value) return { current: null, next: null, url: null, span: null, remaining: "unknown" };
    return { current: latest.value, next: null, url: latest.url, span: `${archiveValues.at(0)?.value}..${latest.value}`, remaining: "not_requested" };
  }
  if (mode !== "BACKFILL_SAMPLE") return { current: null, next: null, url: provider.list_url, span: null, remaining: "not_requested" };
  const values = archiveValues || [];
  const cursorValue = text(cursor);
  const index = cursorValue ? values.findIndex((value) => text(typeof value === "string" ? value : value.value) === cursorValue) : 0;
  if (index < 0) return { current: null, next: null, url: null, span: null, remaining: "unknown" };
  const currentEntry = values[index];
  const nextEntry = values[index + 1] || null;
  const current = typeof currentEntry === "string" ? currentEntry : currentEntry?.value;
  const next = typeof nextEntry === "string" ? nextEntry : nextEntry?.value || null;
  const url = typeof currentEntry === "object" ? currentEntry.url : `https://kitan.jp/product_age/${current}/`;
  return { current, next, url, span: `${text(typeof values.at(0) === "string" ? values.at(0) : values.at(0)?.value)}..${text(typeof values.at(-1) === "string" ? values.at(-1) : values.at(-1)?.value)}`, remaining: values.length - index - 1 };
}

function normalizeProviderCursors(value) {
  const cursors = value && typeof value === "object" ? value : {};
  return { kitan_club: text(cursors.kitan_club) || null, qualia: text(cursors.qualia) || null };
}

function selectDiagnosticDetails(entries, mode, limits) {
  const limit = mode === "CURRENT" ? limits.current_detail_limit : limits.backfill_sample_detail_limit;
  return entries.slice(0, limit);
}

async function fetchQualiaLineups(urls, { fetchImpl, limits, metrics, issues }) {
  const selected = urls.slice(0, limits.qualia_lineup_fetch_limit);
  metrics.lineup_discovered = urls.length;
  metrics.lineup_fetch_limit = limits.qualia_lineup_fetch_limit;
  const lineups = [];
  for (const url of selected) {
    metrics.lineup_attempted += 1;
    const response = await requestText(url, { fetchImpl, limits });
    metrics.request_count += response.attempts;
    metrics.request_failures += response.ok ? 0 : 1;
    if (!response.ok) {
      metrics.lineup_failures += 1;
      issues.push(response.issue_code);
      if (limits.request_delay_ms > 0 && url !== selected.at(-1)) await sleep(limits.request_delay_ms);
      continue;
    }
    const parsed = parseQualiaLineupDocument(response.body, url);
    if (!parsed.ok) {
      metrics.lineup_failures += 1;
      issues.push(parsed.issue_code);
      if (limits.request_delay_ms > 0 && url !== selected.at(-1)) await sleep(limits.request_delay_ms);
      continue;
    }
    metrics.lineup_success += 1;
    lineups.push(parsed);
    if (limits.request_delay_ms > 0 && url !== selected.at(-1)) await sleep(limits.request_delay_ms);
  }
  return lineups;
}

async function discoverQualiaLineupUrls(provider, { fetchImpl, limits, metrics, issues, preferredSeriesNames = [] }) {
  const root = canonicalQualiaLineupArchiveUrl(provider.lineup_archive_url);
  const archiveUrls = [root];
  const discovered = new Map();
  metrics.lineup_archive_page_limit = limits.qualia_lineup_archive_page_limit;
  for (let index = 0; index < archiveUrls.length && index < limits.qualia_lineup_archive_page_limit; index += 1) {
    const url = archiveUrls[index];
    const response = await requestText(url, { fetchImpl, limits });
    metrics.request_count += response.attempts;
    metrics.request_failures += response.ok ? 0 : 1;
    if (!response.ok) {
      issues.push(response.issue_code);
      continue;
    }
    metrics.lineup_archive_pages_fetched += 1;
    for (const entry of parseQualiaLineupEntries(response.body, url)) {
      if (!discovered.has(entry.url)) discovered.set(entry.url, entry);
    }
    for (const pageUrl of parseQualiaLineupArchivePages(response.body, url)) {
      if (!archiveUrls.includes(pageUrl) && archiveUrls.length < limits.qualia_lineup_archive_page_limit) archiveUrls.push(pageUrl);
    }
    if (limits.request_delay_ms > 0 && index !== Math.min(archiveUrls.length, limits.qualia_lineup_archive_page_limit) - 1) await sleep(limits.request_delay_ms);
  }
  const preferred = new Set(preferredSeriesNames.map(normalizeName).filter(Boolean));
  return [...discovered.values()]
    .sort((left, right) => Number(preferred.has(normalizeName(right.title))) - Number(preferred.has(normalizeName(left.title))))
    .map((entry) => entry.url);
}

function buildQualiaLinkedRecord(provider, entry, metadata, linked) {
  const variants = linked.variants;
  return {
    source: provider.source,
    source_product_id: entry.source_product_id,
    official_url: entry.official_url,
    manufacturer: provider.manufacturer,
    series_name: metadata.series_name,
    release_date: metadata.release_date,
    release_month: metadata.release_month,
    price: metadata.price,
    variant_count: variants.length,
    variants,
    series_image_candidate: null,
    image_scope_candidate: "unknown",
    copyright_text: null,
    source_parser_version: "qualia:product-view+lineup:v1",
    diagnostic_identity: {
      series_id: stableIdentity(provider.source, entry.source_product_id, entry.official_url),
      variant_ids: variants.map((variant) => stableIdentity(provider.source, entry.source_product_id, normalizeName(variant.name))),
    },
  };
}

function sanitizeFormalLineupEvidence(record) {
  return { official_url: record.official_url, series_name: record.series_name, release_month: record.release_month, price: record.price, variant_count: record.variant_names.length };
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

function parseKitanDetail(html, baseUrl) {
  const fields = definitionFields(html);
  const title = cleanText(html.match(/<h2[^>]*class=["'][^"']*c-productDetail__title[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i)?.[1]) || fields.get("商品名") || "";
  const pickup = [...html.matchAll(/<li[^>]*class=["'][^"']*c-productDetail__pickup-item[^"']*["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["'][^>]*>[\s\S]*?<p[^>]*class=["'][^"']*c-productDetail__pickup-text[^"']*["'][^>]*>([\s\S]*?)<\/p>[\s\S]*?<\/li>/gi)];
  const pickupVariants = pickup.map((match) => ({ name: cleanText(match[2]), image: safeUrl(match[1], baseUrl) })).filter((variant) => variant.name);
  const expected_variant_count = expectedCount(fields.get("価格") || html);
  const proseVariants = parseKitanLineupProse(html, expected_variant_count);
  const variants = proseVariants.length === expected_variant_count
    ? proseVariants.map((name) => ({ name, image: pickupVariants.find((variant) => normalizeName(variant.name) === normalizeName(name))?.image || null }))
    : pickupVariants;
  return { series_name: title, variant_names: variants.map((variant) => variant.name), variant_images: variants.map((variant) => variant.image), expected_variant_count, release_date: parseReleaseDate(fields.get("発売日")), release_month: parseReleaseMonth(fields.get("発売日")), price: parsePrice(fields.get("価格")), series_image_candidate: safeUrl(html.match(/<div[^>]*class=["'][^"']*c-productDetail__thum[^"']*["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i)?.[1], baseUrl), copyright_text: cleanText(html.match(/(?:©|\(c\))[^<\n]+/i)?.[0]) || null };
}

function parseKitanLineupProse(html, expectedVariantCount) {
  const match = String(html || "").match(/ラインナップは[「『]\s*([\s\S]*?)\s*[」』]\s*の全\s*(\d+)\s*種/i);
  if (!match || Number(match[2]) !== expectedVariantCount) return [];
  const names = cleanText(match[1]).split(/\s*、\s*/).map(cleanText).filter(Boolean);
  return names.length === expectedVariantCount && new Set(names.map(normalizeName)).size === expectedVariantCount ? names : [];
}

function parseQualiaDetail(html, baseUrl) {
  const fields = definitionFields(html);
  const series_name = fields.get("商品名") || cleanText(html.match(/<h3[^>]*class=["'][^"']*title-1[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i)?.[1]);
  // Qualia's current view pages expose product metadata and a gallery but not named variants. Do not infer names from an image.
  return { series_name, variant_names: [], variant_images: [], expected_variant_count: expectedCount(fields.get("価格") || html), release_date: parseReleaseDate(fields.get("発売日")), release_month: parseReleaseMonth(fields.get("発売日")), price: parsePrice(fields.get("価格")), series_image_candidate: safeUrl(html.match(/<div[^>]*class=["'][^"']*gallery01[^"']*["'][\s\S]*?<img[^>]+src=["']([^"']+)["']/i)?.[1], baseUrl), copyright_text: cleanText(html.match(/(?:©|\(c\))[^<\n]+/i)?.[0]) || null };
}

function definitionFields(html) { const fields = new Map(); for (const match of String(html).matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi)) fields.set(cleanText(match[1]), cleanText(match[2])); return fields; }
function countIssueCodes(values) { return Object.fromEntries([...new Set(values || [])].sort().map((value) => [value, (values || []).filter((entry) => entry === value).length])); }
function expectedCount(value) { const matched = String(value || "").match(/全\s*(\d+)\s*種/); return matched ? Number(matched[1]) : null; }
function parseReleaseDate(html) { const matched = String(html || "").match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/); return matched ? `${matched[1]}-${matched[2].padStart(2, "0")}-${matched[3].padStart(2, "0")}` : null; }
function parseReleaseMonth(html) { const matched = String(html || "").match(/(20\d{2})年\s*(\d{1,2})月/); return matched ? `${matched[1]}-${matched[2].padStart(2, "0")}` : null; }
function parsePrice(html) { const value = String(html || "").match(/(?:価格|price)?\s*(?:[：:]\s*)?(?:1回|各)?\s*([\d,]+)\s*円/i)?.[1]; return value ? Number(value.replaceAll(",", "")) : null; }
function providerProductId(provider, url) { const parsed = new URL(url); return text(parsed.searchParams.get("id")) || text(parsed.pathname.split("/").filter(Boolean).at(-1)); }
function stableIdentity(...parts) { return parts.map((part) => encodeURIComponent(String(part).trim())).join(":"); }
function canonicalProviderUrl(value, baseUrl, provider) { try { const url = new URL(value, baseUrl); url.hash = ""; if (url.protocol !== "https:" || url.hostname !== new URL(provider.list_url).hostname || !provider.detail_path.test(url.pathname)) return null; return url.toString(); } catch { return null; } }
function canonicalQualiaLineupUrl(value, baseUrl) { try { const url = new URL(value, baseUrl); url.hash = ""; if (url.protocol !== "https:" || !["qualia-45.jp", "www.qualia-45.jp"].includes(url.hostname) || url.search || !/^\/distinations\/[^/?#]+\/$/.test(url.pathname) || /^\/distinations\/page\/\d+\/$/.test(url.pathname)) return null; url.hostname = "www.qualia-45.jp"; return url.toString(); } catch { return null; } }
function canonicalQualiaLineupArchiveUrl(value, baseUrl = "https://www.qualia-45.jp/distinations/") { try { const url = new URL(value, baseUrl); url.hash = ""; if (url.protocol !== "https:" || !["qualia-45.jp", "www.qualia-45.jp"].includes(url.hostname) || url.search || !/^\/distinations\/(?:page\/\d+\/)?$/.test(url.pathname)) return null; url.hostname = "www.qualia-45.jp"; return url.toString(); } catch { return null; } }
function lineupArchivePageNumber(url) { return Number(new URL(url).pathname.match(/\/page\/(\d+)\//)?.[1] || 1); }
function assertProvider(source) { const provider = PROVIDERS[text(source)]; if (!provider) throw new Error("Unsupported diagnostic official source."); return provider; }
function normalizeLimits(options) { return { current_detail_limit: bounded(options.currentDetailLimit, 1, 5, OFFICIAL_SOURCE_EXPANSION_LIMITS.current_detail_limit), backfill_sample_detail_limit: bounded(options.backfillSampleDetailLimit, 1, 5, OFFICIAL_SOURCE_EXPANSION_LIMITS.backfill_sample_detail_limit), qualia_lineup_fetch_limit: bounded(options.qualiaLineupFetchLimit, 1, 3, OFFICIAL_SOURCE_EXPANSION_LIMITS.qualia_lineup_fetch_limit), qualia_lineup_archive_page_limit: bounded(options.qualiaLineupArchivePageLimit, 1, 2, OFFICIAL_SOURCE_EXPANSION_LIMITS.qualia_lineup_archive_page_limit), request_timeout_ms: bounded(options.requestTimeoutMs, 1_000, 30_000, OFFICIAL_SOURCE_EXPANSION_LIMITS.request_timeout_ms), retry_limit: bounded(options.retryLimit, 0, 1, OFFICIAL_SOURCE_EXPANSION_LIMITS.retry_limit), request_delay_ms: bounded(options.requestDelayMs, 0, 5_000, OFFICIAL_SOURCE_EXPANSION_LIMITS.request_delay_ms) }; }
function bounded(value, min, max, fallback) { const parsed = Number(value); return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback; }
function uniqueRecords(records) { return uniqueBy(records, (record) => record.diagnostic_identity.series_id); }
function uniqueBy(values, key) { const result = new Map(); for (const value of values) if (!result.has(key(value))) result.set(key(value), value); return [...result.values()]; }
function safeUrl(value, base) { try { const url = new URL(value, base); return url.protocol === "https:" ? url.toString() : null; } catch { return null; } }
function normalizeName(value) { return text(value).normalize("NFKC").replace(/\s+/g, " "); }
function cleanText(value) { return String(value || "").replace(/<[^>]+>/g, " ").replace(/&(?:nbsp|amp);/gi, " ").replace(/\s+/g, " ").trim(); }
function text(value) { return value == null ? "" : String(value).trim(); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
