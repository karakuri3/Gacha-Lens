import {
  buildFeedSources,
  createFetchIssue,
  fetchJsonFeedSources,
  summarizeFeedResults,
} from "./feed-source-utils.js";
import { fetchRakutenMarketListingsRaw } from "./rakuten-market-fetcher.js";

export async function fetchMarketListingsRaw(options = {}) {
  const sources = buildFeedSources({
    legacyUrls: options.rawFeedUrls ?? process.env.MARKET_RAW_FEED_URLS,
    sourcesJson: options.sourcesJson ?? process.env.MARKET_RAW_FEED_SOURCES_JSON,
    defaultName: "market",
    defaultSource: "market_raw_feed",
  });
  const records = [];
  const issues = [];
  const feedResults = await fetchJsonFeedSources(sources, {
    userAgent: "GachaLensBot/0.2 (+approved-market-feed)",
  });
  const rakutenResult = await fetchRakutenMarketListingsRaw(options.rakuten ?? {});

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

  return {
    ok: true,
    reviewRequired: issues.length > 0,
    source: "market",
    fetchedAt: new Date().toISOString(),
    configuredSources: sources.length + (rakutenResult.configuredSources ?? 0),
    count: records.length,
    records: dedupeById(records),
    issues,
    feedResults: [...summarizeFeedResults(feedResults), ...(rakutenResult.feedResults ?? [])],
    safety: describeMarketFetcherSafety(),
  };
}

export function describeMarketFetcherSafety() {
  return {
    enabled: true,
    mode: "approved_feed_export_primary",
    reason: "Market collection uses approved JSON/CSV feeds, exports, or approved APIs first. Uncontrolled scraping is intentionally not part of the primary cron path.",
    acceptedInputs: ["marketListingsRaw JSON", "market CSV export", "manual export converted to JSON", "approved marketplace API response", "Rakuten Ichiba Item Search API"],
    env: "MARKET_RAW_FEED_URLS, MARKET_RAW_FEED_SOURCES_JSON, or RAKUTEN_APPLICATION_ID/RAKUTEN_ACCESS_KEY",
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
