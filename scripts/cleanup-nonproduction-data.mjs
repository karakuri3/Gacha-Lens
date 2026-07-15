import fs from "node:fs";
import path from "node:path";
import { deleteRowsByIds, fetchRows } from "./supabase-rest.mjs";
import { isNonProductionRecord } from "./nonproduction-data.mjs";

loadEnvFile(".env.local");

const tables = ["market_listings", "x_reactions", "restock_events", "stock_reports", "import_issues"];
const results = [];

for (const table of tables) {
  const select = table === "x_reactions" ? "id,url" : "id,source_url";
  const rows = await fetchRows(table, { select });
  const ids = rows.filter(isNonProductionRecord).map((row) => row.id);
  const deleted = await deleteRowsByIds(table, ids);
  results.push({ table, scanned: rows.length, deleted });
}

console.log(JSON.stringify({
  ok: true,
  deleted: results.reduce((total, result) => total + result.deleted, 0),
  results,
}, null, 2));

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
