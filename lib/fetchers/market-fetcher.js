export async function fetchMarketListingsRaw(options = {}) {
  const rawFeedUrls = parseList(options.rawFeedUrls ?? process.env.MARKET_RAW_FEED_URLS);
  const records = [];
  const issues = [];

  for (const url of rawFeedUrls) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent": "GachaLensBot/0.1 (+approved-market-feed)",
        },
      });
      if (!response.ok) {
        issues.push(createIssue("market_raw_feed", url, `HTTP ${response.status}`));
        continue;
      }
      const data = await response.json();
      records.push(...normalizeContainer(data, { source: "market_raw_feed", url }));
    } catch (error) {
      issues.push(createIssue("market_raw_feed", url, error.message));
    }
  }

  return {
    ok: issues.length === 0,
    source: "market",
    fetchedAt: new Date().toISOString(),
    count: records.length,
    records: dedupeById(records),
    issues,
    safety: describeMarketFetcherSafety(),
  };
}

export function describeMarketFetcherSafety() {
  return {
    enabled: true,
    mode: "approved_raw_feed_only",
    reason: "Market collection uses approved JSON feeds or exports first. Uncontrolled scraping is intentionally not part of the primary cron path.",
    acceptedInputs: ["marketListingsRaw JSON", "manual CSV export converted to JSON", "approved marketplace API response"],
    env: "MARKET_RAW_FEED_URLS",
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

function createIssue(source, sourceUrl, message) {
  return {
    id: stableId("market-fetch", source, sourceUrl, message),
    issue_type: "market_fetch_review",
    table_name: "market_listings",
    source,
    source_url: sourceUrl,
    resolved: false,
    note: message,
    raw: { source, source_url: sourceUrl, message },
  };
}

function dedupeById(records) {
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

function parseList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[\n,]/).map(text).filter(Boolean);
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
