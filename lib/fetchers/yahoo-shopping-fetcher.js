import { createFetchIssue, parseList, stableId, text } from "./feed-source-utils.js";
import { isRelevantMarketItem } from "./market-item-relevance.js";
import { dedupeMarketQueries } from "./market-query-dedupe.js";
import {
  configurationRequestDiagnostics,
  resolveMarketRetryOptions,
  retryableJsonRequest,
} from "./retryable-json-request.js";

const DEFAULT_ENDPOINT = "https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch";
const AFFILIATE_DOCUMENTATION = "https://developer.yahoo.co.jp/webapi/shopping/affiliate.html";
const AFFILIATE_TYPE = "vc";
const AFFILIATE_PROVENANCE_CONTRACT = "item_search_v3_valuecommerce_code_join";

export async function fetchYahooShoppingListingsRaw(options = {}) {
  const appId = text(options.appId ?? process.env.YAHOO_SHOPPING_APP_ID);
  const affiliateTrackingId = text(options.affiliateTrackingId ?? process.env.YAHOO_AFFILIATE_TRACKING_ID);
  const enabled = parseBoolean(options.enabled ?? process.env.YAHOO_SHOPPING_FETCH_ENABLED ?? Boolean(appId));
  if (!enabled) return emptyResult({ enabled: false });

  const queryLimit = clamp(number(options.queryLimit ?? process.env.YAHOO_SHOPPING_QUERY_LIMIT) ?? 24, 1, 50);
  const dedupedQueries = dedupeMarketQueries(normalizeQueries(options.queries, options.keywords ?? process.env.YAHOO_SHOPPING_KEYWORDS));
  const queries = dedupedQueries.queries.slice(0, queryLimit);
  const endpoint = text(options.endpoint ?? process.env.YAHOO_SHOPPING_ITEM_SEARCH_URL) || DEFAULT_ENDPOINT;
  const results = clamp(number(options.results ?? process.env.YAHOO_SHOPPING_RESULTS) ?? 50, 1, 50);
  const delayMs = Math.max(0, number(options.delayMs ?? process.env.YAHOO_SHOPPING_REQUEST_DELAY_MS) ?? 350);
  const timeoutMs = clamp(number(options.timeoutMs ?? process.env.YAHOO_SHOPPING_REQUEST_TIMEOUT_MS) ?? 12000, 2000, 30000);
  const retryOptions = resolveMarketRetryOptions(options, timeoutMs);
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
  let requestCount = 0;
  for (let index = 0; index < queries.length; index += 1) {
    if (requestCount > 0 && delayMs) await delay(delayMs);
    const query = queries[index];
    const response = await fetchQuery(endpoint, {
      appId,
      query,
      queryIndex: index,
      requestKind: "discovery",
      results,
      retryOptions,
      fetchImpl: options.fetchImpl,
      sleep: options.sleep,
      clock: options.clock,
      random: options.random,
    });
    requestCount += 1;
    feedResults.push(response.feedResult);
    if (!response.ok) {
      issues.push(createFetchIssue("market_fetch", source, response.message, "market_listings"));
      continue;
    }
    const relevantItems = response.items.filter((item) => isRelevantMarketItem(item.name, query));
    let affiliateDestinations = new Map();
    if (affiliateTrackingId && relevantItems.some((item) => text(item.code))) {
      if (requestCount > 0 && delayMs) await delay(delayMs);
      const enrichment = await fetchQuery(endpoint, {
        appId,
        affiliateTrackingId,
        query,
        queryIndex: index,
        requestKind: "affiliate_enrichment",
        results,
        retryOptions,
        fetchImpl: options.fetchImpl,
        sleep: options.sleep,
        clock: options.clock,
        random: options.random,
      });
      requestCount += 1;
      feedResults.push(enrichment.feedResult);
      if (enrichment.ok) affiliateDestinations = buildAffiliateDestinationsByCode(enrichment.items);
    }

    records.push(...relevantItems.map((item) => normalizeItem(
      item,
      query,
      response.fetchedAt,
      affiliateDestinations.get(text(item.code)) || ""
    )));
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
    duplicateQueriesSkipped: dedupedQueries.duplicateQueriesSkipped,
  };
}

async function fetchQuery(endpoint, {
  appId,
  affiliateTrackingId,
  query,
  queryIndex,
  requestKind,
  results,
  retryOptions,
  fetchImpl,
  sleep,
  clock,
  random,
}) {
  const fetchedAt = new Date().toISOString();
  const url = new URL(endpoint);
  url.searchParams.set("appid", appId);
  url.searchParams.set("query", query.query);
  url.searchParams.set("results", String(results));
  url.searchParams.set("image_size", "600");
  url.searchParams.set("sort", "-score");
  if (requestKind === "affiliate_enrichment" && affiliateTrackingId) {
    url.searchParams.set("affiliate_type", AFFILIATE_TYPE);
    url.searchParams.set("affiliate_id", affiliateTrackingId);
  }

  const response = await retryableJsonRequest(url, {
    ...retryOptions,
    fetchImpl,
    sleep,
    clock,
    random,
    request: {
      headers: { accept: "application/json", "user-agent": "GachaLensBot/0.4 (+official-yahoo-shopping-api)" },
    },
  });
  return {
    ok: response.ok,
    message: response.message,
    items: response.ok && Array.isArray(response.data?.hits) ? response.data.hits : [],
    fetchedAt,
    feedResult: {
      name: requestKind === "affiliate_enrichment" ? `yahoo-affiliate:${query.query}` : `yahoo:${query.query}`,
      source: "yahoo_shopping",
      url: sourceUrl(),
      format: "api",
      ok: response.ok,
      status: response.status,
      message: response.message,
      query: query.query,
      query_index: queryIndex,
      request_kind: requestKind,
      ...response.diagnostics,
    },
  };
}

function normalizeItem(item, query, fetchedAt, affiliateUrl = "") {
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
      affiliate_url: text(affiliateUrl),
      affiliate_url_source: affiliateUrl ? "yahoo_api" : "",
      affiliate_url_contract: affiliateUrl ? AFFILIATE_PROVENANCE_CONTRACT : "",
      affiliate_url_documentation: affiliateUrl ? AFFILIATE_DOCUMENTATION : "",
    },
  };
}

function buildAffiliateDestinationsByCode(items = []) {
  const destinations = new Map();
  const conflicts = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const code = text(item.code);
    const affiliateUrl = text(item.url);
    if (!code || !affiliateUrl || conflicts.has(code)) continue;
    const existing = destinations.get(code);
    if (existing && existing !== affiliateUrl) {
      destinations.delete(code);
      conflicts.add(code);
      continue;
    }
    destinations.set(code, affiliateUrl);
  }
  return destinations;
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
    feedResults: [{
      name: source.name,
      source: source.source,
      url: source.url,
      format: "api",
      ok: false,
      status: null,
      message,
      ...configurationRequestDiagnostics(),
    }],
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
