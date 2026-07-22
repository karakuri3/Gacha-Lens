import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const migrationDirectory = path.join(root, "supabase", "migrations");
const candidateName = "20260715000000_initial_foundation.sql";
const candidatePath = path.join(migrationDirectory, candidateName);
const checkPath = path.join(root, "supabase", "foundation-baseline-check.sql");
const workflowPath = path.join(root, ".github", "workflows", "foundation-baseline.yml");
const foundationTables = [
  "source_weights",
  "series",
  "variants",
  "market_listings",
  "x_reactions",
  "restock_events",
  "stock_reports",
  "import_issues",
];
const expectedColumnOrder = {
  source_weights: ["source_type", "weight", "label", "updated_at"],
  series: ["id", "slug", "name", "franchise", "brand", "category", "release_month", "release_week", "release_date", "price", "image_url", "official_url", "is_released", "source_type", "raw", "created_at", "updated_at"],
  variants: ["id", "slug", "series_id", "name", "variant_type", "rarity", "role", "image", "released", "price", "brand", "release_month", "release_week", "release_date", "official_url", "axes", "signals", "tags", "source_type", "review_required", "raw", "created_at", "updated_at"],
  market_listings: ["id", "variant_id", "series_id", "title", "listing_type", "market_review_type", "classification_reason", "classification_confidence", "classification_details", "price", "status", "source", "source_type", "source_url", "listed_at", "sold_at", "confidence", "review_required", "raw", "created_at", "updated_at", "matched_variant_id"],
  x_reactions: ["id", "variant_id", "series_id", "source_type", "author_type", "text", "url", "posted_at", "reposts", "likes", "quotes", "intent_tags", "intent_labels", "confidence", "review_required", "raw", "created_at", "updated_at", "matched_variant_id"],
  restock_events: ["id", "variant_id", "series_id", "source_type", "source_weight", "event_type", "event_label", "classification_reason", "classification_keywords", "text", "region", "shop_name", "source_url", "reported_at", "confidence", "review_required", "raw", "created_at", "updated_at", "matched_variant_id"],
  stock_reports: ["id", "variant_id", "series_id", "source_type", "source_weight", "status", "status_label", "classification_reason", "classification_keywords", "text", "region", "shop_name", "source_url", "reported_at", "confidence", "review_required", "raw", "created_at", "updated_at", "matched_variant_id"],
  import_issues: ["id", "issue_type", "table_name", "record_id", "source", "source_url", "raw", "resolved", "note", "assignee", "resolved_at", "created_at", "updated_at"],
};
const expectedIndexes = [
  "variants_series_id_idx",
  "market_listings_variant_id_idx",
  "market_listings_matched_variant_id_idx",
  "market_listings_review_required_idx",
  "x_reactions_variant_id_idx",
  "x_reactions_matched_variant_id_idx",
  "restock_events_variant_id_idx",
  "restock_events_matched_variant_id_idx",
  "stock_reports_variant_id_idx",
  "stock_reports_matched_variant_id_idx",
  "import_issues_resolved_idx",
];
const excludedObjects = [
  "ingestion_runs",
  "market_listing_observations",
  "sync_market_observation_links",
  "community_reports",
  "outbound_clicks",
  "series_lineup",
  "series_price_history",
  "series_restock_info",
  "series_stock_reports",
  "forecast_snapshots",
];

const sql = fs.readFileSync(candidatePath, "utf8");
const normalized = stripSqlComments(sql).toLowerCase();

test("candidate timestamp precedes every existing migration", () => {
  const names = fs.readdirSync(migrationDirectory).filter((name) => name.endsWith(".sql")).sort();
  assert.equal(names[0], candidateName);
  assert.ok(names.length >= 8);
});

test("candidate creates each Foundation table exactly once without IF NOT EXISTS", () => {
  const created = [...normalized.matchAll(/create\s+table\s+public\.([a-z_]+)/g)].map((match) => match[1]);
  assert.deepEqual(created.sort(), [...foundationTables].sort());
  assert.equal(new Set(created).size, foundationTables.length);
  assert.doesNotMatch(normalized, /create\s+table\s+if\s+not\s+exists/);
});

test("candidate excludes later-owned, legacy, and deferred objects", () => {
  for (const objectName of excludedObjects) assert.equal(normalized.includes(objectName), false, objectName);
  assert.equal(normalized.includes("last_observed_at"), false);
});

test("candidate preserves the remote Foundation column order", () => {
  for (const [tableName, expectedColumns] of Object.entries(expectedColumnOrder)) {
    const actualColumns = tableBody(normalized, tableName)
      .split("\n")
      .map((line) => line.trim().replace(/,$/, ""))
      .filter(Boolean)
      .map((line) => line.match(/^([a-z_]+)/)?.[1]);
    assert.deepEqual(actualColumns, expectedColumns, tableName);
  }
});

test("candidate preserves required keys and checks", () => {
  assert.match(tableBody(normalized, "source_weights"), /weight\s+numeric\s+not\s+null\s+check\s*\(weight\s*>=\s*0\s+and\s+weight\s*<=\s*1\)/);
  assert.match(tableBody(normalized, "series"), /slug\s+text\s+not\s+null\s+unique/);
  assert.match(tableBody(normalized, "variants"), /series_id\s+text\s+not\s+null\s+references\s+public\.series\(id\)\s+on\s+delete\s+cascade/);
  for (const tableName of ["market_listings", "x_reactions", "restock_events", "stock_reports"]) {
    const body = tableBody(normalized, tableName);
    assert.match(body, /variant_id\s+text\s+references\s+public\.variants\(id\)\s+on\s+delete\s+set\s+null/);
    assert.match(body, /series_id\s+text\s+references\s+public\.series\(id\)\s+on\s+delete\s+set\s+null/);
  }
  assert.equal((normalized.match(/\bid\s+text\s+primary\s+key/g) ?? []).length, 7);
});

test("candidate creates the required non-constraint indexes exactly once", () => {
  const actualIndexes = [...normalized.matchAll(/create\s+index\s+([a-z_]+)/g)].map((match) => match[1]);
  assert.deepEqual(actualIndexes.sort(), [...expectedIndexes].sort());
  assert.equal(new Set(actualIndexes).size, expectedIndexes.length);
  assert.doesNotMatch(normalized, /create\s+index\s+if\s+not\s+exists/);
});

test("candidate contains no data mutation, destructive, scheduled, or credential SQL", () => {
  assert.doesNotMatch(normalized, /(^|;)\s*(insert|update|delete|truncate)\b/m);
  assert.doesNotMatch(normalized, /\bdrop\s+(table|schema|extension)\b/);
  assert.doesNotMatch(normalized, /\b(cron\.|net\.http|vault|authorization)\b/);
  assert.doesNotMatch(normalized, /https?:\/\//);
  assert.doesNotMatch(normalized, /\b(?:sbp|eyj)[a-z0-9_.-]{8,}/i);
});

test("candidate includes only the required extension", () => {
  const extensions = [...normalized.matchAll(/create\s+extension\s+if\s+not\s+exists\s+([a-z0-9_-]+)/g)]
    .map((match) => match[1]);
  assert.deepEqual(extensions, ["pgcrypto"]);
});

test("candidate enables RLS and revokes anon/authenticated on all Foundation tables", () => {
  for (const tableName of foundationTables) {
    assert.match(normalized, new RegExp(`alter\\s+table\\s+public\\.${tableName}\\s+enable\\s+row\\s+level\\s+security`));
    assert.match(normalized, new RegExp(`revoke\\s+all\\s+privileges\\s+on\\s+table\\s+public\\.${tableName}\\s+from\\s+anon,\\s*authenticated`));
  }
  assert.doesNotMatch(normalized, /force\s+row\s+level\s+security/);
  assert.doesNotMatch(normalized, /create\s+policy/);
  assert.doesNotMatch(normalized, /grant\s+(insert|update|delete|truncate)/);
});

test("matched_variant_id belongs to the four signal tables", () => {
  for (const tableName of ["market_listings", "x_reactions", "restock_events", "stock_reports"]) {
    const body = tableBody(normalized, tableName);
    assert.match(body, /matched_variant_id\s+text\s+references\s+public\.variants\(id\)\s+on\s+delete\s+set\s+null/);
  }
  assert.equal((normalized.match(/matched_variant_id\s+text/g) ?? []).length, 4);
});

test("read-only check uses catalog queries without mutation", () => {
  const checkSql = stripSqlComments(fs.readFileSync(checkPath, "utf8")).toLowerCase();
  assert.match(checkSql, /^\s*with\b/);
  assert.match(checkSql, /select\s+issue_type,\s*object_name,\s*detail\s+from\s+findings/);
  assert.match(checkSql, /information_schema\.columns/);
  assert.match(checkSql, /pg_constraint/);
  assert.match(checkSql, /pg_indexes/);
  assert.match(checkSql, /pg_policies/);
  assert.match(checkSql, /has_table_privilege/);
  assert.match(checkSql, /last_observed_at/);
  assert.match(checkSql, /market_listing_observations/);
  assert.match(checkSql, /legacy_table_present/);
  assert.match(checkSql, /unexpected_cron_job/);
  assert.doesNotMatch(checkSql, /(^|;)\s*(insert|update|delete|truncate|alter|create|drop|grant|revoke)\b/m);
});

test("CI uses a disposable local stack with a fixed CLI and guaranteed cleanup", () => {
  const workflow = fs.readFileSync(workflowPath, "utf8");
  assert.match(workflow, /SUPABASE_CLI_VERSION:\s*2\.109\.1/);
  assert.match(workflow, /supabase@\"\$SUPABASE_CLI_VERSION\" start/);
  assert.match(workflow, /db reset --local --no-seed/);
  assert.match(workflow, /foundation-baseline-check\.sql/);
  assert.match(workflow, /if:\s*always\(\)/);
  assert.match(workflow, /stop --no-backup/);
  assert.doesNotMatch(workflow, /--linked|db push|migration repair|include-all/);
});

function tableBody(source, tableName) {
  const match = source.match(new RegExp(`create\\s+table\\s+public\\.${tableName}\\s*\\(([\\s\\S]*?)\\n\\);`));
  assert.ok(match, `${tableName} definition is missing`);
  return match[1];
}

function stripSqlComments(source) {
  return source.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}
