import { createFetchIssue, parseList, stableId, text } from "./feed-source-utils.js";
import { isRelevantMarketItem } from "./market-item-relevance.js";

const DEFAULT_ENDPOINT = "https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch";

export async function fetchYahooShoppingListingsRaw(options = {}) {
  const appId = text(options.appId ?? process.env.YAHOO_SHOPPING_APP_ID);
  const enabled = parseBoolean(options.enabled ?? process.env.YAHOO_SHOPPING_FETCH_ENABLED ?? Boolean(appId));
  if (!enabled) return emptyResult({ enabled: false });

  const queryLimit = clamp(number(options.queryLimit ?? process.env.YAHOO_SHOPPING_QUERY_LIMIT) ?? 24, 1, 50);
  const queries = normalizeQueries(options.queries, options.keywords ?? process.env.YAHOO_SHOPPING_KEYWORDS).slice(0, queryLimit);
  const endpoint = text(options.endpoint ?? process.env.YAHOO_SHOPPING_ITEM_SEARCH_URL) || DEFAULT_ENDPOINT;
  const results = clamp(number(options.results ?? process.env.YAHOO_SHOPPING_RESULTS) ?? 50, 1, 50);
  const delayMs = Math.max(0, number(options.delayMs ?? process.env.YAHOO_SHOPPING_REQUEST_DELAY_MS) ?? 350);
  const source = {
    name: "yahoo-shopping-item-search",
    source: "yahoo_shopping",
    url: "https://developer.yahoo.co.jp/webapi/shopping/v3/itemsearch.html",
  };

  if (!appId) return issueResult(source, "YAHOO_SHOPPING_APP_ID is not configured.", queries.length);
  if (!queries.length) return issueResult(source, "No market search queries were generated.", 0);

  const records = [];
  const issues = [];
  const feedResults = [];
  for (let index = 0; index < queries.length; index += 1) {
    if (index > 0 && delayMs) await delay(delayMs);
    const query = queries[index];
    const response = await fetchQuery(endpoint, { appId, query, results });
    feedResults.push(response.feedResult);
    if (!response.ok) {
      issues.push(createFetchIssue("market_fetch", source, response.message, "market_listings"));
      continue;
    }
    records.push(...response.items
      .filter((item) => isRelevantMarketItem(item.name, query))
      .map((item) => normalizeItem(item, query, response.fetchedAt)));
  }

  return {
    ok: true,
    enabled: true,
    source: "yahoo_shopping",
    configuredSources: queries.length,
    count: records.length,
    records: dedupeById(records),
    issues,
    feedResults,
  };
}

async function fetchQuery(endpoint, { appId, query, results }) {
  const fetchedAt = new Date().toISOString();
  const url = new URL(endpoint);
  url.searchParams.set("appid", appId);
  url.searchParams.set("query", query.query);
  url.searchParams.set("results", String(results));
  url.searchParams.set("image_size", "600");
  url.searchParams.set("sort", "-score");

  try {
    const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "GachaLensBot/0.4 (+official-yahoo-shopping-api)" } });
    const body = await response.json().catch(() => ({}));
    const message = response.ok ? "" : body?.Error?.Message || body?.message || `HTTP ${response.status}`;
    return {
      ok: response.ok,
      message,
      items: Array.isArray(body.hits) ? body.hits : [],
      fetchedAt,
      feedResult: {
        name: `yahoo:${query.query}`,
        source: "yahoo_shopping",
        url: "https://developer.yahoo.co.jp/webapi/shopping/v3/itemsearch.html",
        format: "api",
        ok: response.ok,
        status: response.status,
        message,
      },
    };
  } catch (error) {
    return {
      ok: false,
      message: error.message,
      items: [],
      fetchedAt,
      feedResult: { name: `yahoo:${query.query}`, source: "yahoo_shopping", url: sourceUrl(), format: "api", ok: false, status: null, message: error.message },
    };
  }
}

function normalizeItem(item, query, fetchedAt) {
  const listingUrl = text(item.url);
  const code = text(item.code);
  return {
    id: stableId("yahoo", code || listingUrl || item.name),
    title: text(item.name),
    price: number(item.price),
    status: item.inStock === false ? "sold_out" : "active",
    source: "yahoo_shopping",
    source_type: "marketplace",
    source_url: listingUrl,
    listed_at: fetchedAt,
    sold_at: "",
    raw: {
      provider: "yahoo_shopping",
      query,
      code,
      seller: item.seller ?? {},
      image: item.exImage?.url || item.image?.medium || item.image?.small || "",
      review: item.review ?? {},
      condition: text(item.condition),
      fetchedAt,
      source_documentation: sourceUrl(),
    },
  };
}

function normalizeQueries(queries, keywords) {
  if (Array.isArray(queries) && queries.length) {
    return queries.map((entry) => typeof entry === "string" ? { query: entry } : entry).filter((entry) => text(entry.query));
  }
  return parseList(keywords).map((query) => ({ query }));
}

function emptyResult(extra = {}) {
  return { ok: true, source: "yahoo_shopping", configuredSources: 0, count: 0, records: [], issues: [], feedResults: [], ...extra };
}

function issueResult(source, message, configuredSources) {
  return {
    ...emptyResult({ enabled: true, configuredSources }),
    issues: [createFetchIssue("market_fetch", source, message, "market_listings")],
    feedResults: [{ name: source.name, source: source.source, url: source.url, format: "api", ok: false, status: null, message }],
  };
}

function sourceUrl() {
  return "https://developer.yahoo.co.jp/webapi/shopping/v3/itemsearch.html";
}

function dedupeById(records) {
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

function parseBoolean(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return !["0", "false", "no", "off"].includes(normalized);
}

function number(value) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
