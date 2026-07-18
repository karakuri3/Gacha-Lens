import fs from "node:fs";
import path from "node:path";
import { fetchRows } from "./supabase-rest.mjs";

loadEnvFile(".env.local");

const tables = [
  ["series", "id,brand,release_date"],
  ["variants", "id,series_id,variant_type,review_required"],
  ["market_listings", "id,variant_id,matched_variant_id,series_id,listing_type,status,review_required"],
  ["market_listing_observations", "id,variant_id,series_id,status"],
  ["x_reactions", "id,variant_id,matched_variant_id,series_id,review_required"],
  ["restock_events", "id,variant_id,matched_variant_id,series_id,review_required"],
  ["stock_reports", "id,variant_id,matched_variant_id,series_id,status,review_required"],
  ["import_issues", "id,issue_type,table_name,resolved"],
  ["ingestion_runs", "id,task,status,finished_at"],
  ["community_reports", "id,variant_id,status,review_required"],
];

const entries = await Promise.all(tables.map(async ([table, select]) => {
  try {
    return [table, await fetchRows(table, { select, pageSize: 1000 })];
  } catch (error) {
    return [table, { error: error.message }];
  }
}));
const data = Object.fromEntries(entries);
const rows = (table) => Array.isArray(data[table]) ? data[table] : [];
const linkedVariantCount = (table) => rows(table).filter((row) => row.variant_id || row.matched_variant_id).length;
const distinctVariantCount = (table) => new Set(rows(table).map((row) => row.variant_id || row.matched_variant_id).filter(Boolean)).size;

const report = {
  auditedAt: new Date().toISOString(),
  counts: Object.fromEntries(tables.map(([table]) => [table, Array.isArray(data[table]) ? data[table].length : null])),
  officialMaster: {
    brands: countBy(rows("series"), (row) => row.brand || "unknown"),
    provisionalVariants: rows("variants").filter((row) => row.variant_type === "provisional").length,
    reviewRequiredVariants: rows("variants").filter((row) => row.review_required).length,
  },
  market: {
    listingTypes: countBy(rows("market_listings"), (row) => row.listing_type || "unknown"),
    statuses: countBy(rows("market_listings"), (row) => row.status || "unknown"),
    linkedListings: linkedVariantCount("market_listings"),
    linkedVariants: distinctVariantCount("market_listings"),
    reviewRequired: rows("market_listings").filter((row) => row.review_required).length,
  },
  availability: {
    restockEvents: rows("restock_events").length,
    restockLinked: linkedVariantCount("restock_events"),
    stockReports: rows("stock_reports").length,
    stockLinked: linkedVariantCount("stock_reports"),
    stockStatuses: countBy(rows("stock_reports"), (row) => row.status || "unknown"),
  },
  review: {
    unresolvedImportIssues: rows("import_issues").filter((row) => !row.resolved).length,
    issueTypes: countBy(rows("import_issues").filter((row) => !row.resolved), (row) => row.issue_type || "unknown"),
    pendingCommunityReports: rows("community_reports").filter((row) => row.status === "pending").length,
  },
  errors: Object.fromEntries(entries.filter(([, value]) => !Array.isArray(value)).map(([table, value]) => [table, value.error])),
};

console.log(JSON.stringify(report, null, 2));

function countBy(values, selector) {
  return Object.fromEntries(
    [...values.reduce((counts, value) => {
      const key = selector(value);
      counts.set(key, (counts.get(key) || 0) + 1);
      return counts;
    }, new Map())].sort((left, right) => right[1] - left[1])
  );
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
