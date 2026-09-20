import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const migrationPath = path.join(
  root,
  "supabase",
  "migrations",
  "20260921023000_add_public_read_indexes.sql",
);

test("public read index migration is additive and bounded", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  assert.match(sql, /create index if not exists series_category_release_order_idx/i);
  assert.match(sql, /on public\.series \(\s*category,\s*release_date desc nulls last,\s*updated_at desc,\s*id asc\s*\)/i);

  assert.match(sql, /create index if not exists variants_public_series_id_idx/i);
  assert.match(sql, /on public\.variants \(series_id\)/i);
  assert.match(sql, /variant_type is null or variant_type <> 'provisional'/i);
  assert.match(sql, /slug is not null/i);
  assert.match(sql, /name is not null/i);

  assert.doesNotMatch(sql, /\bdrop\b/i);
  assert.doesNotMatch(sql, /\balter\s+table\b/i);
  assert.doesNotMatch(sql, /\bupdate\b/i);
  assert.doesNotMatch(sql, /\bdelete\b/i);
  assert.doesNotMatch(sql, /\binsert\b/i);
});
