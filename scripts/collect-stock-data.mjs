import fs from "node:fs";
import path from "node:path";
import { fetchStockRaw } from "../lib/fetchers/stock-fetcher.js";
import { getGeneratedDataPath } from "./generated-paths.mjs";

loadEnvFile(".env.local");

const outputPath = getGeneratedDataPath("stock-raw.json");
const result = await fetchStockRaw();
writeJson(outputPath, result);
console.log(JSON.stringify(summarize("stock", result, outputPath), null, 2));

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function summarize(source, result, filePath) {
  return {
    ok: Boolean(result.ok),
    source,
    fetchedAt: result.fetchedAt,
    configuredSources: result.configuredSources ?? 0,
    configuredXSearchQueries: result.configuredXSearchQueries ?? 0,
    configuredXMonitorAccounts: result.configuredXMonitorAccounts ?? 0,
    restockEventsRaw: Array.isArray(result.restockEventsRaw) ? result.restockEventsRaw.length : 0,
    stockReportsRaw: Array.isArray(result.stockReportsRaw) ? result.stockReportsRaw.length : 0,
    records: Array.isArray(result.records) ? result.records.length : 0,
    issues: Array.isArray(result.issues) ? result.issues.length : 0,
    feedResults: result.feedResults ?? [],
    xSearchResults: result.xSearchResults ?? [],
    outputPath: path.relative(process.cwd(), filePath),
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
