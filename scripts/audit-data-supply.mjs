import fs from "node:fs";
import path from "node:path";
import { buildFeedSources, parseList } from "../lib/fetchers/feed-source-utils.js";
import { fetchOfficialRaw } from "../lib/fetchers/official-fetcher.js";
import { fetchMarketListingsRaw } from "../lib/fetchers/market-fetcher.js";
import { fetchStockRaw } from "../lib/fetchers/stock-fetcher.js";
import { fetchXReactionsRaw } from "../lib/fetchers/x-fetcher.js";
import { getGeneratedDataPath } from "./generated-paths.mjs";

loadEnvFile(".env.local");

const shouldFetch = process.argv.includes("--fetch");
const stockXSearchEnabled = parseBoolean(process.env.STOCK_X_SEARCH_ENABLED ?? "false");
const stockXSearchQueries = parseList(process.env.STOCK_X_SEARCH_QUERIES);
const stockXMonitorAccounts = parseList(process.env.STOCK_X_MONITOR_ACCOUNTS);
const xFetchEnabled = parseBoolean(process.env.X_FETCH_ENABLED ?? "false");
const xSearchQueries = parseList(process.env.X_SEARCH_QUERIES);
const xMonitorAccounts = parseList(process.env.X_MONITOR_ACCOUNTS);
const rakutenMarketEnabled = parseBoolean(process.env.RAKUTEN_MARKET_FETCH_ENABLED ?? Boolean(process.env.RAKUTEN_APPLICATION_ID));
const configured = {
  official: parseList(process.env.OFFICIAL_SOURCE_URLS),
  market: buildFeedSources({
    legacyUrls: process.env.MARKET_RAW_FEED_URLS,
    sourcesJson: process.env.MARKET_RAW_FEED_SOURCES_JSON,
    defaultName: "market",
    defaultSource: "market_raw_feed",
  }),
  xRaw: buildFeedSources({
    legacyUrls: process.env.X_RAW_FEED_URLS,
    sourcesJson: process.env.X_RAW_FEED_SOURCES_JSON,
    defaultName: "x",
    defaultSource: "raw_feed",
  }),
  stock: buildFeedSources({
    legacyUrls: process.env.STOCK_RAW_FEED_URLS,
    sourcesJson: process.env.STOCK_RAW_FEED_SOURCES_JSON,
    defaultName: "stock",
    defaultSource: "stock_raw_feed",
  }),
};
const generated = {
  official: readGenerated("official-raw.json", (value) => value.records?.length ?? 0),
  market: readGenerated("market-raw.json", (value) => value.records?.length ?? 0),
  x: readGenerated("x-reactions-raw.json", (value) => value.records?.length ?? 0),
  stock: readGenerated("stock-raw.json", (value) => (value.restockEventsRaw?.length ?? 0) + (value.stockReportsRaw?.length ?? 0)),
};
const summary = {
  ok: true,
  mode: shouldFetch ? "fetch" : "config",
  configuredSources: {
    official: configured.official.length || 2,
    market: configured.market.length,
    xRawFeeds: configured.xRaw.length,
    stock: configured.stock.length,
    xOptional: true,
    xFetchEnabled,
    xSearchQueries: xSearchQueries.length,
    xMonitorAccounts: xMonitorAccounts.length,
    hasXBearerToken: Boolean(process.env.X_BEARER_TOKEN),
    stockXSearchEnabled,
    stockXSearchQueries: stockXSearchQueries.length,
    stockXMonitorAccounts: stockXMonitorAccounts.length,
    stockXCanUseBearerToken: stockXSearchEnabled && Boolean(process.env.X_BEARER_TOKEN),
    stockXDefaultQueriesActive: false,
    rakutenMarketEnabled,
    hasRakutenApplicationId: Boolean(process.env.RAKUTEN_APPLICATION_ID),
    hasRakutenAccessKey: Boolean(process.env.RAKUTEN_ACCESS_KEY),
    rakutenKeywords: parseList(process.env.RAKUTEN_MARKET_KEYWORDS).length || 4,
  },
  generatedRaw: generated,
  sources: {
    official: configured.official.length ? configured.official : ["https://gashapon.jp/schedule/", "https://gashapon.jp/products/"],
    market: sanitizeSources(configured.market),
    xRaw: sanitizeSources(configured.xRaw),
    stock: sanitizeSources(configured.stock),
  },
  nextActions: buildNextActions(configured, generated),
};

if (shouldFetch) {
  const [official, market, x, stock] = await Promise.all([
    fetchOfficialRaw(),
    fetchMarketListingsRaw(),
    fetchXReactionsRaw(),
    fetchStockRaw(),
  ]);
  summary.fetch = {
    official: summarizeFetch(official),
    market: summarizeFetch(market),
    x: summarizeFetch(x),
    stock: summarizeFetch(stock),
  };
}

console.log(JSON.stringify(summary, null, 2));

function summarizeFetch(result) {
  return {
    ok: Boolean(result.ok),
    configuredSources: result.configuredSources ?? 0,
    records: result.count ?? result.records?.length ?? 0,
    issues: result.issues?.length ?? 0,
    feedResults: result.feedResults ?? [],
  };
}

function sanitizeSources(sources) {
  return sources.map((source) => ({
    name: source.name,
    source: source.source,
    url: source.url || "",
    filePath: source.filePath || "",
    format: source.format || "",
    recordPath: source.recordPath || "",
    hasHeaders: Boolean(Object.keys(source.headers ?? {}).length || Object.keys(source.headerEnv ?? {}).length || source.bearerTokenEnv),
  }));
}

function buildNextActions(sources, generatedRaw) {
  const actions = [];
  const hasXBearerToken = Boolean(process.env.X_BEARER_TOKEN);
  const hasRakutenMarket = rakutenMarketEnabled && Boolean(process.env.RAKUTEN_APPLICATION_ID) && Boolean(process.env.RAKUTEN_ACCESS_KEY);
  const hasStockXApi = stockXSearchEnabled && hasXBearerToken && (stockXSearchQueries.length || stockXMonitorAccounts.length);
  const hasXConfigured = sources.xRaw.length || (xFetchEnabled && hasXBearerToken && (xSearchQueries.length || xMonitorAccounts.length));
  if (!generatedRaw.official.records) actions.push("Run npm run fetch:official to refresh the official master snapshot.");
  if (!sources.market.length && !hasRakutenMarket) actions.push("Add at least one approved market CSV/JSON export through MARKET_RAW_FEED_SOURCES_JSON or configure RAKUTEN_APPLICATION_ID plus RAKUTEN_ACCESS_KEY.");
  if (rakutenMarketEnabled && process.env.RAKUTEN_APPLICATION_ID && !process.env.RAKUTEN_ACCESS_KEY) actions.push("Add RAKUTEN_ACCESS_KEY for the current Rakuten Ichiba Item Search API.");
  if (!sources.stock.length && !hasStockXApi) actions.push("Add at least one approved stock/restock CSV/JSON export through STOCK_RAW_FEED_SOURCES_JSON.");
  if (!generatedRaw.market.records) actions.push("Run npm run fetch:market after adding market exports.");
  if (hasXConfigured && !generatedRaw.x.records) actions.push("Optional: run npm run fetch:x after adding X sources.");
  if (!generatedRaw.stock.records) actions.push("Run npm run fetch:stock after adding stock/restock exports.");
  return actions.length ? actions : ["Data supply configuration is present. Use --fetch to test live source responses."];
}

function parseBoolean(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return true;
}

function readGenerated(fileName, countFn) {
  const filePath = getGeneratedDataPath(fileName);
  if (!fs.existsSync(filePath)) return { records: 0, exists: false, path: path.relative(process.cwd(), filePath) };
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return {
    records: countFn(parsed),
    issues: Array.isArray(parsed.issues) ? parsed.issues.length : 0,
    exists: true,
    fetchedAt: parsed.fetchedAt || "",
    path: path.relative(process.cwd(), filePath),
  };
}

function loadEnvFile(fileName) {
  const envPath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(envPath)) return;
  const body = fs.readFileSync(envPath, "utf8");
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = rest.join("=").replace(/^["']|["']$/g, "");
  }
}
