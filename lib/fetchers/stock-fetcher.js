import {
  buildFeedSources,
  createFetchIssue,
  fetchJsonFeedSources,
  summarizeFeedResults,
} from "./feed-source-utils.js";

export async function fetchStockRaw(options = {}) {
  const sources = buildFeedSources({
    legacyUrls: options.rawFeedUrls ?? process.env.STOCK_RAW_FEED_URLS,
    sourcesJson: options.sourcesJson ?? process.env.STOCK_RAW_FEED_SOURCES_JSON,
    defaultName: "stock",
    defaultSource: "stock_raw_feed",
  });
  const restockEventsRaw = [];
  const stockReportsRaw = [];
  const issues = [];
  const feedResults = await fetchJsonFeedSources(sources, {
    userAgent: "GachaLensBot/0.2 (+approved-stock-feed)",
  });

  for (const result of feedResults) {
    if (!result.ok) {
      issues.push(createFetchIssue("stock_fetch", result.source, result.message, "stock_reports"));
      continue;
    }
    const normalized = normalizeContainer(result.data, {
      source: result.source.source,
      source_name: result.source.name,
      url: result.source.url,
    });
    restockEventsRaw.push(...normalized.restockEventsRaw);
    stockReportsRaw.push(...normalized.stockReportsRaw);
  }

  return {
    ok: true,
    reviewRequired: issues.length > 0,
    source: "stock",
    fetchedAt: new Date().toISOString(),
    configuredSources: sources.length,
    count: restockEventsRaw.length + stockReportsRaw.length,
    restockEventsRaw: dedupeById(restockEventsRaw),
    stockReportsRaw: dedupeById(stockReportsRaw),
    records: [...dedupeById(restockEventsRaw), ...dedupeById(stockReportsRaw)],
    issues,
    feedResults: summarizeFeedResults(feedResults),
    safety: describeStockFetcherSafety(),
  };
}

export function describeStockFetcherSafety() {
  return {
    enabled: true,
    mode: "approved_raw_feed_only",
    reason: "Stock and restock collection uses approved JSON feeds or exports first. Ambiguous sightings still go to import_issues.",
    acceptedInputs: ["restockEventsRaw JSON", "stockReportsRaw JSON", "approved shop/official feed", "reviewed X export converted to JSON"],
    env: "STOCK_RAW_FEED_URLS or STOCK_RAW_FEED_SOURCES_JSON",
    nextStep: "Feed safe raw records into data/generated/stock-raw.json, then reuse stock normalization and review_required handling.",
  };
}

function normalizeContainer(data, context) {
  const restocks = Array.isArray(data) ? [] : pickArray(data, ["restockEventsRaw", "restock_events", "restocks"]);
  const stockReports = Array.isArray(data) ? [] : pickArray(data, ["stockReportsRaw", "stock_reports", "stocks"]);
  const records = Array.isArray(data) ? data : pickArray(data, ["records", "data"]);

  const bucketed = records.reduce((result, record) => {
    if (isRestockRecord(record)) {
      result.restockEventsRaw.push(record);
    } else {
      result.stockReportsRaw.push(record);
    }
    return result;
  }, { restockEventsRaw: [], stockReportsRaw: [] });

  return {
    restockEventsRaw: [...restocks, ...bucketed.restockEventsRaw].map((record) => normalizeRestock(record, context)).filter(Boolean),
    stockReportsRaw: [...stockReports, ...bucketed.stockReportsRaw].map((record) => normalizeStock(record, context)).filter(Boolean),
  };
}

function normalizeRestock(record, context) {
  const textValue = text(record.text || record.body || record.title || record.status);
  if (!textValue) return null;
  return {
    id: text(record.id) || stableId("restock", context.source, record.source_url || record.url, textValue, record.reported_at || record.created_at),
    variant_id: text(record.variant_id || record.variantId),
    series_id: text(record.series_id || record.seriesId),
    source_type: text(record.source_type || record.sourceType || record.source) || "user_x",
    text: textValue,
    region: text(record.region),
    shop_name: text(record.shop_name || record.shopName),
    source_url: text(record.source_url || record.url),
    reported_at: text(record.reported_at || record.created_at || record.createdAt),
    raw: { ...record, fetch_context: context },
  };
}

function normalizeStock(record, context) {
  const textValue = text(record.text || record.body || record.title || record.status);
  if (!textValue) return null;
  return {
    id: text(record.id) || stableId("stock", context.source, record.source_url || record.url, textValue, record.reported_at || record.created_at),
    variant_id: text(record.variant_id || record.variantId),
    series_id: text(record.series_id || record.seriesId),
    source_type: text(record.source_type || record.sourceType || record.source) || "user_x",
    status: text(record.status),
    status_label: text(record.status_label || record.statusLabel),
    text: textValue,
    region: text(record.region),
    shop_name: text(record.shop_name || record.shopName),
    source_url: text(record.source_url || record.url),
    reported_at: text(record.reported_at || record.created_at || record.createdAt),
    raw: { ...record, fetch_context: context },
  };
}

function isRestockRecord(record = {}) {
  const kind = normalize(`${record.kind || record.type || record.event_type || record.eventType || ""}`);
  if (kind.includes("restock") || kind.includes("replenish")) return true;
  const body = normalize(`${record.text || record.body || record.title || record.status || ""}`);
  return ["再入荷", "補充", "入荷"].some((keyword) => body.includes(normalize(keyword)));
}

function pickArray(data, keys) {
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  return [];
}

function dedupeById(records) {
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function normalize(value = "") {
  return String(value).trim().toLowerCase().replace(/[\s_・･-]+/g, "");
}

function stableId(...parts) {
  return parts.filter(Boolean).map((part) => String(part).toLowerCase().replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/gi, "-")).join("-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 140);
}
