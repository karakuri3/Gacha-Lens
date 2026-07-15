import fs from "node:fs";
import path from "node:path";
import { fetchOfficialRaw } from "../lib/fetchers/official-fetcher.js";
import { getGeneratedDataPath } from "./generated-paths.mjs";
import { fetchRows } from "./supabase-rest.mjs";

loadEnvFile(".env.local");

const outputPath = getGeneratedDataPath("official-raw.json");
const previous = readExistingResult(outputPath);
const knownDetailedOfficialUrls = await loadKnownDetailedOfficialUrls();
const result = await fetchOfficialRaw({
  previousRecords: previous.records,
  detailCursor: previous.detailCursor,
  knownDetailedOfficialUrls,
});
writeJson(outputPath, result);
console.log(JSON.stringify(summarize("official", result, outputPath), null, 2));

function readExistingResult(filePath) {
  if (!fs.existsSync(filePath)) return { records: [], detailCursor: 0 };
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return {
      records: Array.isArray(parsed.records) ? parsed.records : [],
      detailCursor: Number.isFinite(parsed.detailCursor) ? parsed.detailCursor : 0,
    };
  } catch {
    return { records: [], detailCursor: 0 };
  }
}

async function loadKnownDetailedOfficialUrls() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const rows = await fetchRows("variants", {
      select: "series:series!inner(official_url)",
      params: { variant_type: "neq.provisional" },
    });
    return [...new Set(rows.map((row) => row.series?.official_url).filter(Boolean))];
  } catch (error) {
    console.warn(`[official-fetch] Could not read DB detail progress: ${error.message}`);
    return [];
  }
}

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
    detailedRecords: result.detailedRecords ?? 0,
    detailQueue: result.detailQueue ?? 0,
    detailFetched: result.detailFetched ?? 0,
    remainingDetails: result.remainingDetails ?? 0,
    knownDetailedInDatabase: knownDetailedOfficialUrls.length,
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
