import fs from "node:fs";
import path from "node:path";
import { fetchXReactionsRaw } from "../lib/fetchers/x-fetcher.js";

loadEnvFile(".env.local");

const outputPath = path.join(process.cwd(), "data", "generated", "x-reactions-raw.json");
const result = await fetchXReactionsRaw();
writeJson(outputPath, result);
console.log(JSON.stringify(result, null, 2));

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
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
