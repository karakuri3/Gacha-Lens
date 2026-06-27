import {
  buildFeedSources,
  createFetchIssue,
  fetchJsonFeedSources,
  summarizeFeedResults,
} from "./feed-source-utils.js";

const DEFAULT_X_SEARCH_QUERIES = [
  "ガシャポン OR gashapon OR ガチャガチャ",
  "ガシャポン 全部欲しい OR コンプ OR 回したい",
  "ガシャポン ドール OR ミニチュア OR 小物",
];

export async function fetchXReactionsRaw(options = {}) {
  const bearerToken = options.bearerToken ?? process.env.X_BEARER_TOKEN ?? "";
  const configuredQueries = parseList(options.queries ?? process.env.X_SEARCH_QUERIES);
  const queries = configuredQueries.length ? configuredQueries : (bearerToken ? DEFAULT_X_SEARCH_QUERIES : []);
  const accounts = parseList(options.accounts ?? process.env.X_MONITOR_ACCOUNTS);
  const rawFeedSources = buildFeedSources({
    legacyUrls: options.rawFeedUrls ?? process.env.X_RAW_FEED_URLS,
    sourcesJson: options.sourcesJson ?? process.env.X_RAW_FEED_SOURCES_JSON,
    defaultName: "x",
    defaultSource: "raw_feed",
  });
  const maxResults = Math.min(100, Math.max(10, number(options.maxResults ?? process.env.X_SEARCH_MAX_RESULTS) ?? 25));
  const records = [];
  const issues = [];
  const feedResults = await fetchJsonFeedSources(rawFeedSources, {
    userAgent: "GachaLensBot/0.2 (+approved-x-feed)",
  });

  for (const result of feedResults) {
    if (!result.ok) {
      issues.push(createFetchIssue("x_fetch", result.source, result.message, "x_reactions"));
      continue;
    }
    records.push(...normalizeContainer(result.data, {
      source: result.source.source,
      source_name: result.source.name,
      url: result.source.url,
    }));
  }

  if (bearerToken) {
    for (const query of queries) {
      const result = await fetchRecentSearch(query, bearerToken, maxResults);
      records.push(...result.records);
      issues.push(...result.issues);
    }

    for (const account of accounts) {
      const result = await fetchAccountMentions(account, bearerToken, maxResults);
      records.push(...result.records);
      issues.push(...result.issues);
    }
  } else if (queries.length || accounts.length) {
    issues.push(createIssue("x_api", "", "X_BEARER_TOKEN is required for X_SEARCH_QUERIES or X_MONITOR_ACCOUNTS"));
  }

  return {
    ok: true,
    reviewRequired: issues.length > 0,
    source: "x",
    fetchedAt: new Date().toISOString(),
    configuredSources: rawFeedSources.length,
    count: records.length,
    records: dedupeById(records),
    issues,
    feedResults: summarizeFeedResults(feedResults),
  };
}

async function fetchRecentSearch(query, bearerToken, maxResults) {
  const params = new URLSearchParams({
    query,
    "tweet.fields": "created_at,public_metrics,author_id",
    max_results: String(maxResults),
  });
  const url = `https://api.twitter.com/2/tweets/search/recent?${params}`;
  return fetchXApi(url, bearerToken, { source: "search", query });
}

async function fetchAccountMentions(account, bearerToken, maxResults) {
  const query = `from:${account.replace(/^@/, "")}`;
  return fetchRecentSearch(query, bearerToken, maxResults);
}

async function fetchXApi(url, bearerToken, context) {
  try {
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${bearerToken}`,
        accept: "application/json",
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { records: [], issues: [createIssue(context.source, url, data.detail || data.title || `HTTP ${response.status}`)] };
    }
    return { records: normalizeContainer(data, { ...context, url }), issues: [] };
  } catch (error) {
    return { records: [], issues: [createIssue(context.source, url, error.message)] };
  }
}

function normalizeContainer(data, context) {
  const tweets = Array.isArray(data) ? data : Array.isArray(data.data) ? data.data : Array.isArray(data.xReactionsRaw) ? data.xReactionsRaw : [];
  return tweets.map((tweet) => normalizeTweet(tweet, context)).filter(Boolean);
}

function normalizeTweet(tweet, context) {
  const textValue = text(tweet.text || tweet.body || tweet.title);
  if (!textValue) return null;
  const metrics = tweet.public_metrics || {};
  return {
    id: text(tweet.id) || stableId("x", context.source, textValue),
    source_type: text(tweet.source_type || tweet.sourceType) || inferSourceType(tweet, context),
    author_type: text(tweet.author_type || tweet.authorType) || inferAuthorType(tweet, context),
    variant_id: text(tweet.variant_id || tweet.variantId),
    text: textValue,
    likes: number(tweet.likes ?? metrics.like_count) ?? 0,
    reposts: number(tweet.reposts ?? metrics.retweet_count) ?? 0,
    quotes: number(tweet.quotes ?? metrics.quote_count) ?? 0,
    url: text(tweet.url) || createTweetUrl(tweet),
    posted_at: text(tweet.posted_at || tweet.created_at || tweet.createdAt),
    raw: { ...tweet, fetch_context: context },
  };
}

function inferSourceType(tweet, context) {
  if (context.source === "raw_feed") return text(tweet.source_type) || "user_x";
  if (context.query?.startsWith("from:")) return "official_x";
  return "user_x";
}

function inferAuthorType(tweet, context) {
  if (context.query?.startsWith("from:")) return "official";
  return text(tweet.author_type) || "user";
}

function createTweetUrl(tweet) {
  return tweet.id ? `https://x.com/i/web/status/${tweet.id}` : "";
}

function createIssue(source, sourceUrl, message) {
  return {
    id: stableId("x-fetch", source, sourceUrl, message),
    issue_type: "x_fetch_review",
    table_name: "x_reactions",
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
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stableId(...parts) {
  return parts.filter(Boolean).map((part) => String(part).toLowerCase().replace(/[^a-z0-9]+/gi, "-")).join("-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 140);
}
