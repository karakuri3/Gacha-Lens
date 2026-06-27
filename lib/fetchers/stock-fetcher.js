import {
  buildFeedSources,
  createFetchIssue,
  fetchJsonFeedSources,
  parseList,
  summarizeFeedResults,
} from "./feed-source-utils.js";

const DEFAULT_STOCK_X_SEARCH_QUERIES = [
  "ガシャポン 再入荷 OR 補充 OR 在庫あり",
  "ガチャガチャ 売り切れ OR 完売 OR 在庫なし",
  "ガシャポン 入荷 OR 販売中 OR 残りわずか",
];

export async function fetchStockRaw(options = {}) {
  const sources = buildFeedSources({
    legacyUrls: options.rawFeedUrls ?? process.env.STOCK_RAW_FEED_URLS,
    sourcesJson: options.sourcesJson ?? process.env.STOCK_RAW_FEED_SOURCES_JSON,
    defaultName: "stock",
    defaultSource: "stock_raw_feed",
  });
  const bearerToken = options.xBearerToken ?? process.env.X_BEARER_TOKEN ?? "";
  const xSearchEnabled = parseBoolean(options.xSearchEnabled ?? process.env.STOCK_X_SEARCH_ENABLED ?? "true");
  const configuredXQueries = parseList(options.xQueries ?? process.env.STOCK_X_SEARCH_QUERIES);
  const xQueries = configuredXQueries.length ? configuredXQueries : (bearerToken && xSearchEnabled ? DEFAULT_STOCK_X_SEARCH_QUERIES : []);
  const xAccounts = parseList(options.xAccounts ?? process.env.STOCK_X_MONITOR_ACCOUNTS);
  const xMaxResults = Math.min(100, Math.max(10, number(options.xMaxResults ?? process.env.STOCK_X_SEARCH_MAX_RESULTS) ?? 10));
  const restockEventsRaw = [];
  const stockReportsRaw = [];
  const issues = [];
  const feedResults = await fetchJsonFeedSources(sources, {
    userAgent: "GachaLensBot/0.2 (+approved-stock-feed)",
  });
  const xSearchResults = [];

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

  if (bearerToken && xSearchEnabled) {
    for (const query of xQueries) {
      const result = await fetchStockXSearch(query, bearerToken, xMaxResults, {
        source: "stock_x_search",
        source_name: "stock-x-search",
      });
      xSearchResults.push(result.summary);
      issues.push(...result.issues);
      restockEventsRaw.push(...result.restockEventsRaw);
      stockReportsRaw.push(...result.stockReportsRaw);
    }

    for (const account of xAccounts) {
      const accountName = account.replace(/^@/, "");
      const query = `from:${accountName} (再入荷 OR 補充 OR 在庫 OR 売り切れ OR 完売 OR 入荷)`;
      const result = await fetchStockXSearch(query, bearerToken, xMaxResults, {
        source: "stock_x_account",
        source_name: accountName,
      });
      xSearchResults.push(result.summary);
      issues.push(...result.issues);
      restockEventsRaw.push(...result.restockEventsRaw);
      stockReportsRaw.push(...result.stockReportsRaw);
    }
  } else if ((configuredXQueries.length || xAccounts.length) && !bearerToken) {
    issues.push(createFetchIssue("stock_x_fetch", {
      source: "stock_x",
      name: "stock-x-api",
      url: "https://api.twitter.com/2/tweets/search/recent",
    }, "X_BEARER_TOKEN is required for STOCK_X_SEARCH_QUERIES or STOCK_X_MONITOR_ACCOUNTS", "stock_reports"));
  }

  const dedupedRestocks = dedupeById(restockEventsRaw);
  const dedupedStocks = dedupeById(stockReportsRaw);

  return {
    ok: true,
    reviewRequired: issues.length > 0,
    source: "stock",
    fetchedAt: new Date().toISOString(),
    configuredSources: sources.length,
    configuredXSearchQueries: xQueries.length,
    configuredXMonitorAccounts: xAccounts.length,
    count: dedupedRestocks.length + dedupedStocks.length,
    restockEventsRaw: dedupedRestocks,
    stockReportsRaw: dedupedStocks,
    records: [...dedupedRestocks, ...dedupedStocks],
    issues,
    feedResults: summarizeFeedResults(feedResults),
    xSearchResults: summarizeXSearchResults(xSearchResults),
    safety: describeStockFetcherSafety(),
  };
}

export function describeStockFetcherSafety() {
  return {
    enabled: true,
    mode: "approved_raw_feed_or_x_api",
    reason: "Stock and restock collection uses approved JSON feeds plus X API search/account monitoring. Ambiguous sightings still go to import_issues.",
    acceptedInputs: ["restockEventsRaw JSON", "stockReportsRaw JSON", "approved shop/official feed", "reviewed X export converted to JSON", "X API search results"],
    env: "STOCK_RAW_FEED_URLS, STOCK_RAW_FEED_SOURCES_JSON, STOCK_X_SEARCH_QUERIES, STOCK_X_MONITOR_ACCOUNTS",
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

async function fetchStockXSearch(query, bearerToken, maxResults, context) {
  const params = new URLSearchParams({
    query,
    "tweet.fields": "created_at,public_metrics,author_id",
    max_results: String(maxResults),
  });
  const url = `https://api.twitter.com/2/tweets/search/recent?${params}`;

  try {
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${bearerToken}`,
        accept: "application/json",
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        summary: { ok: false, query, status: response.status, message: data.detail || data.title || `HTTP ${response.status}` },
        restockEventsRaw: [],
        stockReportsRaw: [],
        issues: [createFetchIssue("stock_x_fetch", {
          source: context.source,
          name: context.source_name,
          url,
        }, data.detail || data.title || `HTTP ${response.status}`, "stock_reports")],
      };
    }

    const tweets = Array.isArray(data.data) ? data.data : [];
    const normalized = tweets.map((tweet) => normalizeXStockTweet(tweet, { ...context, query, url })).filter(Boolean);
    const restockEventsRaw = normalized.filter((record) => isRestockRecord(record));
    const stockReportsRaw = normalized.filter((record) => !isRestockRecord(record));

    return {
      summary: { ok: true, query, status: response.status, records: normalized.length },
      restockEventsRaw,
      stockReportsRaw,
      issues: [],
    };
  } catch (error) {
    return {
      summary: { ok: false, query, status: null, message: error.message },
      restockEventsRaw: [],
      stockReportsRaw: [],
      issues: [createFetchIssue("stock_x_fetch", {
        source: context.source,
        name: context.source_name,
        url,
      }, error.message, "stock_reports")],
    };
  }
}

function normalizeXStockTweet(tweet, context) {
  const textValue = text(tweet.text || tweet.body || tweet.title);
  if (!textValue) return null;
  const metrics = tweet.public_metrics || {};
  return {
    id: text(tweet.id) || stableId("stock-x", context.source, textValue),
    source_type: context.source === "stock_x_account" ? "shop_x" : "user_x",
    text: textValue,
    source_url: text(tweet.url) || (tweet.id ? `https://x.com/i/web/status/${tweet.id}` : ""),
    reported_at: text(tweet.reported_at || tweet.created_at || tweet.createdAt),
    likes: number(tweet.likes ?? metrics.like_count) ?? 0,
    reposts: number(tweet.reposts ?? metrics.retweet_count) ?? 0,
    quotes: number(tweet.quotes ?? metrics.quote_count) ?? 0,
    raw: { ...tweet, fetch_context: context },
  };
}

function isRestockRecord(record = {}) {
  const kind = normalize(`${record.kind || record.type || record.event_type || record.eventType || ""}`);
  if (kind.includes("restock") || kind.includes("replenish")) return true;
  const body = normalize(`${record.text || record.body || record.title || record.status || ""}`);
  return ["再入荷", "補充", "入荷", "restock", "replenish"].some((keyword) => body.includes(normalize(keyword)));
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

function summarizeXSearchResults(results) {
  return results.map((result) => ({
    ok: Boolean(result.ok),
    query: result.query || "",
    status: result.status ?? null,
    records: result.records ?? 0,
    message: result.message || "",
  }));
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function number(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  const normalized = text(value).toLowerCase();
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return true;
}

function normalize(value = "") {
  return String(value).trim().toLowerCase().replace(/[\s_・･-]+/g, "");
}

function stableId(...parts) {
  return parts.filter(Boolean).map((part) => String(part).toLowerCase().replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/gi, "-")).join("-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 140);
}
