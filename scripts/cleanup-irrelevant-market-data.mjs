import fs from "node:fs";
import path from "node:path";
import { deleteRowsByIds, fetchRows } from "./supabase-rest.mjs";

loadEnvFile(".env.local");

const rows = await fetchRows("market_listings", {
  select: "id,source,title,variant_id,series_id",
});
const irrelevantIds = rows
  .filter((row) => row.source === "rakuten")
  .filter((row) => !row.variant_id && !row.series_id)
  .map((row) => row.id);
const irrelevantSet = new Set(irrelevantIds);
const issues = await fetchRows("import_issues", { select: "id,table_name,record_id" });
const issueIds = issues
  .filter((issue) => issue.table_name === "market_listings" && irrelevantSet.has(issue.record_id))
  .map((issue) => issue.id);

const [marketDeleted, issuesDeleted] = await Promise.all([
  deleteRowsByIds("market_listings", irrelevantIds),
  deleteRowsByIds("import_issues", issueIds),
]);

console.log(JSON.stringify({
  ok: true,
  scanned: rows.length,
  marketDeleted,
  issuesDeleted,
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
