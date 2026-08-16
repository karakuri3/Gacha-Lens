import {
  parseOfficialDetailDocument,
  parseOfficialSourceDocument,
} from "./official-fetcher.js";

export const OFFICIAL_LIVE_AUDIT_LIMITS = Object.freeze({
  gashapon_detail_limit: 2,
  takaratomy_detail_limit: 2,
  request_timeout_ms: 15_000,
});

export function buildOfficialLiveSourceUrls(now = new Date()) {
  const current = validDate(now) ?? new Date();
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(current).map((part) => [part.type, part.value]));
  const yearMonth = `${parts.year}${parts.month}`;
  return Object.freeze({
    gashapon_schedule: `https://gashapon.jp/schedule/?ym=${yearMonth}`,
    gashapon_products: "https://gashapon.jp/products/",
    takaratomy_search: "https://www.takaratomy-arts.co.jp/items/gacha/search.html?order=release&p=1&sort=0",
  });
}

export async function fetchOfficialLiveSnapshot(options = {}) {
  const now = validDate(options.now) ?? new Date();
  const fetchImpl = options.fetchImpl ?? fetch;
  const limits = {
    gashapon_detail_limit: boundedInteger(options.gashaponDetailLimit, 0, 2, OFFICIAL_LIVE_AUDIT_LIMITS.gashapon_detail_limit),
    takaratomy_detail_limit: boundedInteger(options.takaratomyDetailLimit, 0, 2, OFFICIAL_LIVE_AUDIT_LIMITS.takaratomy_detail_limit),
    request_timeout_ms: boundedInteger(options.requestTimeoutMs, 1_000, 30_000, OFFICIAL_LIVE_AUDIT_LIMITS.request_timeout_ms),
  };
  const urls = options.sourceUrls ?? buildOfficialLiveSourceUrls(now);
  const sourceSpecs = [
    { key: "gashapon_schedule", provider: "gashapon", url: urls.gashapon_schedule, successField: "records" },
    { key: "gashapon_products", provider: "gashapon", url: urls.gashapon_products, successField: "detailUrls" },
    { key: "takaratomy_search", provider: "takaratomy_arts", url: urls.takaratomy_search, successField: "records" },
  ];
  const sourceResults = [];

  for (const spec of sourceSpecs) {
    sourceResults.push(await fetchSource(spec, { fetchImpl, timeoutMs: limits.request_timeout_ms }));
  }

  const discoveries = sourceResults.flatMap((source) => {
    const recordsByUrl = new Map(source.records.map((record) => [record.official_url, record]));
    return source.detail_urls.map((url) => ({
      provider: source.provider,
      source_key: source.key,
      url,
      record: recordsByUrl.get(url) ?? null,
    }));
  });
  const selectedDetails = selectOfficialAuditDetails(discoveries, {
    now,
    marketInterestOfficialUrls: options.marketInterestOfficialUrls,
    gashaponLimit: limits.gashapon_detail_limit,
    takaratomyLimit: limits.takaratomy_detail_limit,
  });
  const detailResults = [];
  for (const detail of selectedDetails) {
    detailResults.push(await fetchDetail(detail, { fetchImpl, timeoutMs: limits.request_timeout_ms }));
  }

  const sources = sourceResults.map((source) => {
    const details = detailResults.filter((detail) => detail.source_key === source.key);
    const sourceRecords = [...source.records, ...details.map((detail) => detail.record).filter(Boolean)];
    return {
      source: source.key,
      provider: source.provider,
      url: source.url,
      http_success: source.http_success,
      http_status: source.http_status,
      parser_success: source.parser_success,
      records: source.records.length,
      discovered_urls: source.detail_urls.length,
      detail_attempts: details.length,
      detail_successes: details.filter((detail) => detail.http_success && detail.parser_success).length,
      detail_failures: details.filter((detail) => !detail.http_success || !detail.parser_success).length,
      formal_lineups: details.filter((detail) => isFormalRecord(detail.record)).length,
      zero_lineups: details.filter((detail) => detail.record && !isFormalRecord(detail.record)).length,
      issue_codes: [...new Set([...source.issue_codes, ...details.flatMap((detail) => detail.issue_codes)])].sort(),
      freshness: buildSourceFreshness(sourceRecords, now),
    };
  });

  return {
    fetched_at: now.toISOString(),
    limits,
    sources,
    discovery_records: sourceResults.flatMap((source) => source.records),
    formal_records: detailResults.map((detail) => detail.record).filter(isFormalRecord),
    detail_results: detailResults.map((detail) => ({
      provider: detail.provider,
      source_key: detail.source_key,
      url: detail.url,
      http_success: detail.http_success,
      http_status: detail.http_status,
      parser_success: detail.parser_success,
      issue_codes: detail.issue_codes,
      record: detail.record,
    })),
    issue_codes: [...new Set([
      ...sourceResults.flatMap((source) => source.issue_codes),
      ...detailResults.flatMap((detail) => detail.issue_codes),
    ])].sort(),
  };
}

export function selectOfficialAuditDetails(discoveries, options = {}) {
  const now = validDate(options.now) ?? new Date();
  const interest = new Set(asArray(options.marketInterestOfficialUrls).map(text).filter(Boolean));
  const limits = {
    gashapon: boundedInteger(options.gashaponLimit, 0, 2, 2),
    takaratomy_arts: boundedInteger(options.takaratomyLimit, 0, 2, 2),
  };
  const uniqueByUrl = new Map();
  for (const entry of asArray(discoveries).filter((candidate) => isAllowedOfficialDetailUrl(candidate?.url, candidate?.provider))) {
    const current = uniqueByUrl.get(entry.url);
    if (!current || (!current.record && entry.record)) uniqueByUrl.set(entry.url, entry);
  }
  const unique = [...uniqueByUrl.values()];

  return unique
    .map((entry) => ({ ...entry, priority: detailPriority(entry.record, entry.url, interest, now) }))
    .sort(comparePriority)
    .filter((entry, index, all) => {
      const providerIndex = all.slice(0, index + 1).filter((item) => item.provider === entry.provider).length;
      return providerIndex <= (limits[entry.provider] ?? 0);
    })
    .map(({ priority: _priority, ...entry }) => entry);
}

function detailPriority(record, url, interest, now) {
  const timestamp = Date.parse(String(record?.release_date ?? ""));
  const nowTime = now.getTime();
  const recentCutoff = nowTime - 120 * 24 * 60 * 60 * 1000;
  if (Number.isFinite(timestamp) && timestamp >= nowTime) return { bucket: 0, order: timestamp };
  if (Number.isFinite(timestamp) && timestamp >= recentCutoff) return { bucket: 1, order: -timestamp };
  if (interest.has(url)) return { bucket: 2, order: 0 };
  if (Number.isFinite(timestamp)) return { bucket: 3, order: -timestamp };
  return { bucket: 4, order: 0 };
}

function comparePriority(left, right) {
  return left.priority.bucket - right.priority.bucket
    || left.priority.order - right.priority.order
    || left.provider.localeCompare(right.provider)
    || left.url.localeCompare(right.url);
}

async function fetchSource(spec, options) {
  const request = await fetchText(spec.url, options);
  if (!request.ok) return {
    ...spec,
    http_success: false,
    http_status: request.status,
    parser_success: false,
    records: [],
    detail_urls: [],
    issue_codes: [request.issue_code],
  };

  try {
    const parsed = parseOfficialSourceDocument(request.body, spec.url, { contentType: request.content_type });
    const records = asArray(parsed.records);
    const detailUrls = [...new Set(asArray(parsed.detailUrls).filter((url) => isAllowedOfficialDetailUrl(url, spec.provider)))];
    const parserSuccess = spec.successField === "records" ? records.length > 0 : detailUrls.length > 0;
    return {
      ...spec,
      http_success: true,
      http_status: request.status,
      parser_success: parserSuccess,
      records,
      detail_urls: detailUrls,
      issue_codes: [...new Set([
        ...asArray(parsed.issues).map(issueCode),
        ...(parserSuccess ? [] : ["official_source_zero_results"]),
      ])].sort(),
    };
  } catch {
    return {
      ...spec,
      http_success: true,
      http_status: request.status,
      parser_success: false,
      records: [],
      detail_urls: [],
      issue_codes: ["official_source_parser_error"],
    };
  }
}

async function fetchDetail(detail, options) {
  const request = await fetchText(detail.url, options);
  if (!request.ok) return {
    ...detail,
    http_success: false,
    http_status: request.status,
    parser_success: false,
    record: null,
    issue_codes: [request.issue_code],
  };
  try {
    const parsed = parseOfficialDetailDocument(request.body, detail.url);
    const record = parsed.record ?? null;
    const parserSuccess = isFormalRecord(record);
    return {
      ...detail,
      http_success: true,
      http_status: request.status,
      parser_success: parserSuccess,
      record,
      issue_codes: [...new Set([
        ...asArray(parsed.issues).map(issueCode),
        ...(parserSuccess ? [] : ["official_detail_no_formal_lineup"]),
      ])].sort(),
    };
  } catch {
    return {
      ...detail,
      http_success: true,
      http_status: request.status,
      parser_success: false,
      record: null,
      issue_codes: ["official_detail_parser_error"],
    };
  }
}

async function fetchText(url, { fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: "application/json, text/html;q=0.9, */*;q=0.8",
        "user-agent": "GachaLensBot/0.1 (+read-only-official-audit)",
      },
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, status: response.status, issue_code: httpIssueCode(response.status) };
    return {
      ok: true,
      status: response.status,
      content_type: response.headers.get("content-type") ?? "",
      body: await response.text(),
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      issue_code: error?.name === "AbortError" ? "official_fetch_timeout" : "official_fetch_network_error",
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildSourceFreshness(records, now) {
  const timestamps = asArray(records)
    .map((record) => Date.parse(String(record?.release_date ?? "")))
    .filter(Number.isFinite);
  if (!timestamps.length) return { state: "unknown", latest_release_date: null, age_days: null };
  const latest = Math.max(...timestamps);
  const ageDays = Math.floor((now.getTime() - latest) / (24 * 60 * 60 * 1000));
  return {
    state: ageDays <= 180 ? "current" : "stale",
    latest_release_date: new Date(latest).toISOString().slice(0, 10),
    age_days: ageDays,
  };
}

function isFormalRecord(record) {
  return Boolean(record
    && record.source_type === "official_site"
    && record.review_required === false
    && asArray(record.variants).length > 0
    && asArray(record.variants).every((variant) => text(variant.name) && variant.review_required !== true));
}

function isAllowedOfficialDetailUrl(value, provider) {
  try {
    const url = new URL(value);
    if (provider === "gashapon") {
      return url.protocol === "https:" && url.hostname === "gashapon.jp"
        && url.pathname === "/products/detail.php" && url.searchParams.has("jan_code");
    }
    if (provider === "takaratomy_arts") {
      return url.protocol === "https:" && url.hostname === "www.takaratomy-arts.co.jp"
        && url.pathname === "/items/item.html" && url.searchParams.has("n");
    }
  } catch {
    return false;
  }
  return false;
}

function issueCode(issue) {
  const note = text(issue?.note).toLowerCase();
  if (note.includes("variant count mismatch")) return "official_detail_variant_count_mismatch";
  if (note.includes("no lineup") || note.includes("no variant")) return "official_detail_zero_lineup";
  if (note.includes("no takara tomy arts products") || note.includes("no official records")) return "official_source_zero_results";
  if (note.includes("age confirmation")) return "official_detail_access_interstitial";
  return "official_parser_review_required";
}

function httpIssueCode(status) {
  if (status === 429) return "official_fetch_rate_limited";
  if (Number(status) >= 500) return "official_fetch_http_5xx";
  return "official_fetch_http_error";
}

function boundedInteger(value, min, max, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return value == null ? "" : String(value).trim();
}
