import { createFetchIssue, parseList, stableId, text } from "./feed-source-utils.js";

const DEFAULT_KEYWORDS = ["ガチャ", "ガチャガチャ", "カプセルトイ", "ガシャポン"];
const DEFAULT_ENDPOINT = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701";
const DEFAULT_ELEMENTS = [
  "itemName",
  "itemPrice",
  "itemUrl",
  "affiliateUrl",
  "itemCode",
  "availability",
  "shopName",
  "shopCode",
  "shopUrl",
  "mediumImageUrls",
  "smallImageUrls",
  "reviewCount",
  "reviewAverage",
  "genreId",
].join(",");

export async function fetchRakutenMarketListingsRaw(options = {}) {
  const enabled = parseBoolean(options.enabled ?? process.env.RAKUTEN_MARKET_FETCH_ENABLED ?? Boolean(process.env.RAKUTEN_APPLICATION_ID));
  if (!enabled) {
    return emptyResult({ enabled: false });
  }

  const applicationId = text(options.applicationId ?? process.env.RAKUTEN_APPLICATION_ID);
  const accessKey = text(options.accessKey ?? process.env.RAKUTEN_ACCESS_KEY);
  const affiliateId = text(options.affiliateId ?? process.env.RAKUTEN_AFFILIATE_ID);
  const endpoint = text(options.endpoint ?? process.env.RAKUTEN_ICHIBA_ITEM_SEARCH_URL) || DEFAULT_ENDPOINT;
  const keywords = parseList(options.keywords ?? process.env.RAKUTEN_MARKET_KEYWORDS);
  const searchKeywords = keywords.length ? keywords : DEFAULT_KEYWORDS;
  const hits = clamp(number(options.hits ?? process.env.RAKUTEN_MARKET_HITS) ?? 20, 1, 30);
  const delayMs = Math.max(0, number(options.delayMs ?? process.env.RAKUTEN_REQUEST_DELAY_MS) ?? 1200);
  const availability = text(options.availability ?? process.env.RAKUTEN_MARKET_AVAILABILITY) || "1";
  const sort = text(options.sort ?? process.env.RAKUTEN_MARKET_SORT) || "-updateTimestamp";
  const issues = [];
  const records = [];
  const feedResults = [];

  const source = {
    name: "rakuten-ichiba-item-search",
    source: "rakuten_ichiba",
    url: "https://webservice.rakuten.co.jp/documentation/ichiba-item-search",
  };

  if (!applicationId) {
    return issueResult(source, "RAKUTEN_APPLICATION_ID is not configured.", searchKeywords.length);
  }

  if (!accessKey) {
    return issueResult(source, "RAKUTEN_ACCESS_KEY is not configured. Current Rakuten Ichiba Item Search API requires accessKey with applicationId.", searchKeywords.length);
  }

  for (let index = 0; index < searchKeywords.length; index += 1) {
    const keyword = searchKeywords[index];
    if (index > 0 && delayMs) await delay(delayMs);

    const url = buildRakutenUrl(endpoint, {
      applicationId,
      accessKey,
      affiliateId,
      keyword,
      hits,
      availability,
      sort,
    });

    const result = await fetchRakutenKeyword(url, { keyword });
    feedResults.push(result.feedResult);

    if (!result.ok) {
      issues.push(createFetchIssue("market_fetch", source, result.message, "market_listings"));
      continue;
    }

    records.push(...result.items.map((item) => normalizeRakutenItem(item, {
      keyword,
      sourceUrl: source.url,
      fetchedAt: result.fetchedAt,
    })));
  }

  return {
    ok: true,
    enabled: true,
    source: "rakuten_ichiba",
    configuredSources: searchKeywords.length,
    count: records.length,
    records: dedupeById(records),
    issues,
    feedResults,
  };
}

function emptyResult(extra = {}) {
  return {
    ok: true,
    source: "rakuten_ichiba",
    configuredSources: 0,
    count: 0,
    records: [],
    issues: [],
    feedResults: [],
    ...extra,
  };
}

function issueResult(source, message, configuredSources) {
  return {
    ...emptyResult({ enabled: true, ok: true, configuredSources }),
    issues: [createFetchIssue("market_fetch", source, message, "market_listings")],
    feedResults: [{
      name: source.name,
      source: source.source,
      url: source.url,
      format: "api",
      ok: false,
      status: null,
      message,
    }],
  };
}

async function fetchRakutenKeyword(url, { keyword }) {
  const fetchedAt = new Date().toISOString();
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "GachaLensBot/0.3 (+rakuten-ichiba-api)",
      },
    });
    const body = await response.json().catch(() => ({}));
    const message = response.ok ? "" : body.error_description || body.message || body.error || `HTTP ${response.status}`;
    const items = response.ok ? extractItems(body) : [];

    return {
      ok: response.ok,
      message,
      items,
      fetchedAt,
      feedResult: {
        name: `rakuten:${keyword}`,
        source: "rakuten_ichiba",
        url: "https://webservice.rakuten.co.jp/documentation/ichiba-item-search",
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
      feedResult: {
        name: `rakuten:${keyword}`,
        source: "rakuten_ichiba",
        url: "https://webservice.rakuten.co.jp/documentation/ichiba-item-search",
        format: "api",
        ok: false,
        status: null,
        message: error.message,
      },
    };
  }
}

function buildRakutenUrl(endpoint, params) {
  const url = new URL(endpoint);
  url.searchParams.set("applicationId", params.applicationId);
  url.searchParams.set("accessKey", params.accessKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("keyword", params.keyword);
  url.searchParams.set("hits", String(params.hits));
  url.searchParams.set("availability", params.availability);
  url.searchParams.set("imageFlag", "1");
  url.searchParams.set("sort", params.sort);
  url.searchParams.set("elements", DEFAULT_ELEMENTS);
  if (params.affiliateId) url.searchParams.set("affiliateId", params.affiliateId);
  return url;
}

function extractItems(body) {
  const items = Array.isArray(body.items)
    ? body.items
    : Array.isArray(body.Items)
      ? body.Items
      : [];
  return items.map((entry) => entry.Item || entry.item || entry).filter(Boolean);
}

function normalizeRakutenItem(item, context) {
  const title = text(item.itemName);
  const itemCode = text(item.itemCode);
  const sourceUrl = text(item.affiliateUrl || item.itemUrl);
  const imageUrls = [
    ...asImageUrls(item.mediumImageUrls),
    ...asImageUrls(item.smallImageUrls),
  ];

  return {
    id: stableId("rakuten", itemCode || sourceUrl || title),
    title,
    price: number(item.itemPrice),
    status: text(item.availability) === "0" ? "sold_out" : "active",
    source: "rakuten",
    source_type: "marketplace",
    source_url: sourceUrl,
    listed_at: context.fetchedAt,
    sold_at: "",
    raw: {
      provider: "rakuten_ichiba",
      keyword: context.keyword,
      itemCode,
      shopName: text(item.shopName),
      shopCode: text(item.shopCode),
      shopUrl: text(item.shopUrl),
      reviewCount: number(item.reviewCount),
      reviewAverage: number(item.reviewAverage),
      genreId: text(item.genreId),
      imageUrls,
      fetchedAt: context.fetchedAt,
      source_documentation: context.sourceUrl,
    },
  };
}

function asImageUrls(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => text(entry.imageUrl || entry)).filter(Boolean);
}

function dedupeById(records) {
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBoolean(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return !["0", "false", "no", "off"].includes(normalized);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function number(value) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}
