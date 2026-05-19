import fs from "node:fs";
import path from "node:path";
import { fetchMarketListingsRaw } from "../lib/fetchers/market-fetcher.js";
import { getGeneratedDataPath } from "./generated-paths.mjs";

loadEnvFile(".env.local");

const outputPath = getGeneratedDataPath("market-raw.json");
const result = await fetchMarketListingsRaw();
writeJson(outputPath, result);
console.log(JSON.stringify(summarize("market", result, outputPath), null, 2));

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function summarize(source, result, filePath) {
  return {
    ok: Boolean(result.ok),
    source,
    fetchedAt: result.fetchedAt,
    records: Array.isArray(result.records) ? result.records.length : 0,
    issues: Array.isArray(result.issues) ? result.issues.length : 0,
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
