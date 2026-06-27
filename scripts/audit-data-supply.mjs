import fs from "node:fs";
import path from "node:path";
import { buildFeedSources, parseList } from "../lib/fetchers/feed-source-utils.js";
import { fetchMarketListingsRaw } from "../lib/fetchers/market-fetcher.js";
import { fetchStockRaw } from "../lib/fetchers/stock-fetcher.js";
import { fetchXReactionsRaw } from "../lib/fetchers/x-fetcher.js";
import { getGeneratedDataPath } from "./generated-paths.mjs";

loadEnvFile(".env.local");

const shouldFetch = process.argv.includes("--fetch");
const configured = {
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
  market: readGenerated("market-raw.json", (value) => value.records?.length ?? 0),
  x: readGenerated("x-reactions-raw.json", (value) => value.records?.length ?? 0),
  stock: readGenerated("stock-raw.json", (value) => (value.restockEventsRaw?.length ?? 0) + (value.stockReportsRaw?.length ?? 0)),
};
const summary = {
  ok: true,
  mode: shouldFetch ? "fetch" : "config",
  configuredSources: {
    market: configured.market.length,
    xRawFeeds: configured.xRaw.length,
    stock: configured.stock.length,
    xSearchQueries: parseList(process.env.X_SEARCH_QUERIES).length,
    xMonitorAccounts: parseList(process.env.X_MONITOR_ACCOUNTS).length,
    hasXBearerToken: Boolean(process.env.X_BEARER_TOKEN),
  },
  generatedRaw: generated,
  sources: {
    market: sanitizeSources(configured.market),
    xRaw: sanitizeSources(configured.xRaw),
    stock: sanitizeSources(configured.stock),
  },
  nextActions: buildNextActions(configured, generated),
};

if (shouldFetch) {
  const [market, x, stock] = await Promise.all([
    fetchMarketListingsRaw(),
    fetchXReactionsRaw(),
    fetchStockRaw(),
  ]);
  summary.fetch = {
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
    url: source.url,
    recordPath: source.recordPath || "",
    hasHeaders: Boolean(Object.keys(source.headers ?? {}).length || Object.keys(source.headerEnv ?? {}).length || source.bearerTokenEnv),
  }));
}

function buildNextActions(sources, generatedRaw) {
  const actions = [];
  if (!sources.market.length) actions.push("Add at least one approved market feed through MARKET_RAW_FEED_SOURCES_JSON.");
  if (!sources.xRaw.length && !process.env.X_BEARER_TOKEN) actions.push("Add X_BEARER_TOKEN or reviewed X_RAW_FEED_SOURCES_JSON.");
  if (!sources.stock.length) actions.push("Add at least one approved stock/restock feed through STOCK_RAW_FEED_SOURCES_JSON.");
  if (!generatedRaw.market.records) actions.push("Run npm run fetch:market after adding market feeds.");
  if (!generatedRaw.x.records) actions.push("Run npm run fetch:x after adding X sources.");
  if (!generatedRaw.stock.records) actions.push("Run npm run fetch:stock after adding stock feeds.");
  return actions.length ? actions : ["Data supply configuration is present. Use --fetch to test live source responses."];
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
