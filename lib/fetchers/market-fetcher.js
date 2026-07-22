import {
  buildFeedSources,
  createFetchIssue,
  fetchJsonFeedSources,
  summarizeFeedResults,
} from "./feed-source-utils.js";
import {
  MARKET_SOURCE_SCOPES,
  describeMarketWriteReadiness,
  normalizeMarketSourceScope,
  selectMarketSourceFamilies,
} from "../domain/market-source-scope.js";
import { fetchRakutenMarketListingsRaw } from "./rakuten-market-fetcher.js";
import { fetchYahooShoppingListingsRaw } from "./yahoo-shopping-fetcher.js";
import { buildMarketSearchQueries } from "./market-query-planner.js";

export async function fetchMarketListingsRaw(options = {}) {
  const queries = options.queries ?? buildMarketSearchQueries(options.catalog ?? {}, options.queryPlanner ?? {});
  const configuration = describeMarketSourceConfiguration({ ...options, queryCount: queries.length });
  const sources = configuration.approvedFeedSourcesEnabled ? buildFeedSources({
    legacyUrls: options.rawFeedUrls ?? process.env.MARKET_RAW_FEED_URLS,
    sourcesJson: options.sourcesJson ?? process.env.MARKET_RAW_FEED_SOURCES_JSON,
    defaultName: "market",
    defaultSource: "market_raw_feed",
  }) : [];
  const records = [];
  const issues = [];
  const adapters = {
    approvedFeeds: fetchJsonFeedSources,
    rakuten: fetchRakutenMarketListingsRaw,
    yahoo: fetchYahooShoppingListingsRaw,
    ...(options.adapters ?? {}),
  };
  const feedResults = configuration.approvedFeedSourcesEnabled ? await adapters.approvedFeeds(sources, {
    userAgent: "GachaLensBot/0.2 (+approved-market-feed)",
  }) : [];
  const [rakutenResult, yahooResult] = await Promise.all([
    configuration.rakutenConfigured
      ? adapters.rakuten({ ...(options.rakuten ?? {}), queries })
      : Promise.resolve(emptyPlannerResult("rakuten_ichiba")),
    configuration.yahooConfigured
      ? adapters.yahoo({ ...(options.yahoo ?? {}), queries })
      : Promise.resolve(emptyPlannerResult("yahoo_shopping")),
  ]);

  for (const result of feedResults) {
    if (!result.ok) {
      issues.push(createFetchIssue("market_fetch", result.source, result.message, "market_listings"));
      continue;
    }
    records.push(...normalizeContainer(result.data, {
      source: result.source.source,
      source_name: result.source.name,
      url: result.source.url,
    }));
  }

  records.push(...rakutenResult.records);
  issues.push(...rakutenResult.issues);
  records.push(...yahooResult.records);
  issues.push(...yahooResult.issues);

  const approvedFeedRequestsAttempted = feedResults.length;
  const rakutenRequestsAttempted = (rakutenResult.feedResults ?? []).length;
  const yahooRequestsAttempted = (yahooResult.feedResults ?? []).length;
  const plannerApiRequestsAttempted = rakutenRequestsAttempted + yahooRequestsAttempted;

  return {
    ok: true,
    reviewRequired: issues.length > 0,
    source: "market",
    fetchedAt: new Date().toISOString(),
    sourceScope: configuration.sourceScope,
    approvedFeedSourcesEnabled: configuration.approvedFeedSourcesEnabled,
    plannerApiSourcesEnabled: configuration.plannerApiSourcesEnabled,
    approvedFeedSourcesConfigured: configuration.approvedFeedSourcesConfigured,
    plannerApiSourcesConfigured: configuration.plannerApiSourcesConfigured,
    configuredSources: configuration.configuredSources,
    approvedFeedRequestsAttempted,
    plannerApiRequestsAttempted,
    rakutenRequestsAttempted,
    yahooRequestsAttempted,
    writeReady: configuration.writeReady,
    blockingReason: configuration.blockingReason,
    count: records.length,
    records: dedupeById(records),
    issues,
    feedResults: [...summarizeFeedResults(feedResults), ...(rakutenResult.feedResults ?? []), ...(yahooResult.feedResults ?? [])],
    queryPlan: queries,
    safety: describeMarketFetcherSafety(),
  };
}

export function describeMarketSourceConfiguration(options = {}) {
  const selection = selectMarketSourceFamilies(options.sourceScope, MARKET_SOURCE_SCOPES.ALL);
  const approvedFeedSources = selection.approvedFeedSourcesEnabled ? buildFeedSources({
    legacyUrls: options.rawFeedUrls ?? process.env.MARKET_RAW_FEED_URLS,
    sourcesJson: options.sourcesJson ?? process.env.MARKET_RAW_FEED_SOURCES_JSON,
    defaultName: "market",
    defaultSource: "market_raw_feed",
  }) : [];
  const rakutenConfigured = selection.plannerApiSourcesEnabled && plannerApiConfigured(options.rakuten);
  const yahooConfigured = selection.plannerApiSourcesEnabled && yahooApiConfigured(options.yahoo);
  const plannerApiSourcesConfigured = Number(rakutenConfigured) + Number(yahooConfigured);
  const readiness = describeMarketWriteReadiness(selection.sourceScope, plannerApiSourcesConfigured);
  const queryCount = Math.max(0, Number(options.queryCount) || 0);

  return {
    ...selection,
    approvedFeedSourcesConfigured: approvedFeedSources.length,
    plannerApiSourcesConfigured,
    configuredSources: approvedFeedSources.length + plannerApiSourcesConfigured,
    rakutenConfigured,
    yahooConfigured,
    plannedSourceRequests: {
      approved_feed_exports: approvedFeedSources.length,
      rakuten_ichiba: rakutenConfigured ? Math.min(queryCount, positiveInteger(options.rakuten?.queryLimit ?? process.env.RAKUTEN_MARKET_QUERY_LIMIT, 8)) : 0,
      yahoo_shopping: yahooConfigured ? Math.min(queryCount, positiveInteger(options.yahoo?.queryLimit ?? process.env.YAHOO_SHOPPING_QUERY_LIMIT, 24)) : 0,
    },
    ...readiness,
  };
}

export { MARKET_SOURCE_SCOPES, normalizeMarketSourceScope };

export function describeMarketFetcherSafety() {
  return {
    enabled: true,
    mode: "approved_feed_export_primary",
    reason: "Market collection uses approved JSON/CSV feeds, exports, or approved APIs first. Uncontrolled scraping is intentionally not part of the primary cron path.",
    acceptedInputs: ["marketListingsRaw JSON", "market CSV export", "approved marketplace API response", "Rakuten Ichiba Item Search API", "Yahoo Shopping Item Search API"],
    env: "MARKET_RAW_FEED_URLS, MARKET_RAW_FEED_SOURCES_JSON, RAKUTEN_APPLICATION_ID/RAKUTEN_ACCESS_KEY, or YAHOO_SHOPPING_APP_ID",
    nextStep: "Feed safe raw records into data/generated/market-raw.json, then reuse classifyMarketListing.",
  };
}

function normalizeContainer(data, context) {
  const listings = Array.isArray(data)
    ? data
    : Array.isArray(data.marketListingsRaw)
      ? data.marketListingsRaw
      : Array.isArray(data.records)
        ? data.records
        : Array.isArray(data.data)
          ? data.data
          : [];

  return listings.map((listing) => normalizeListing(listing, context)).filter(Boolean);
}

function normalizeListing(listing, context) {
  const title = text(listing.title || listing.name);
  if (!title) return null;

  return {
    id: text(listing.id) || stableId("market", context.source, listing.source_url || listing.url, title, listing.listed_at || listing.sold_at),
    title,
    price: number(listing.price),
    status: text(listing.status),
    source: text(listing.source) || "approved_feed",
    source_type: "marketplace",
    source_url: text(listing.source_url || listing.url),
    listed_at: text(listing.listed_at || listing.created_at || listing.createdAt),
    sold_at: text(listing.sold_at || listing.soldAt),
    variant_id: text(listing.variant_id || listing.variantId),
    series_id: text(listing.series_id || listing.seriesId),
    raw: { ...listing, fetch_context: context },
  };
}

function dedupeById(records) {
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function number(value) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function stableId(...parts) {
  return parts.filter(Boolean).map((part) => String(part).toLowerCase().replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/gi, "-")).join("-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 140);
}

function plannerApiConfigured(sourceOptions = {}) {
  const applicationId = text(sourceOptions.applicationId ?? process.env.RAKUTEN_APPLICATION_ID);
  const accessKey = text(sourceOptions.accessKey ?? process.env.RAKUTEN_ACCESS_KEY);
  return sourceEnabled(sourceOptions.enabled ?? process.env.RAKUTEN_MARKET_FETCH_ENABLED, Boolean(applicationId))
    && Boolean(applicationId && accessKey);
}

function yahooApiConfigured(sourceOptions = {}) {
  const appId = text(sourceOptions.appId ?? process.env.YAHOO_SHOPPING_APP_ID);
  return sourceEnabled(sourceOptions.enabled ?? process.env.YAHOO_SHOPPING_FETCH_ENABLED, Boolean(appId)) && Boolean(appId);
}

function sourceEnabled(explicit, defaultValue) {
  if (explicit == null || String(explicit).trim() === "") return defaultValue;
  return !["0", "false", "no", "off"].includes(String(explicit).trim().toLowerCase());
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function emptyPlannerResult(source) {
  return { ok: true, enabled: false, source, configuredSources: 0, count: 0, records: [], issues: [], feedResults: [] };
}
