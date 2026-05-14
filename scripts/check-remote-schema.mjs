import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

loadEnvFile(".env.local");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseKey = serviceRoleKey || publishableKey;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required");
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

const checks = [
  { table: "market_listings", column: "matched_variant_id" },
  { table: "x_reactions", column: "matched_variant_id" },
  { table: "restock_events", column: "matched_variant_id" },
  { table: "stock_reports", column: "matched_variant_id" },
];

const results = [];

for (const check of checks) {
  const { error } = await supabase
    .from(check.table)
    .select(`id, ${check.column}`)
    .limit(1);

  results.push({
    ...check,
    ok: !error,
    message: error?.message || "",
  });
}

const ok = results.every((result) => result.ok);

console.log(JSON.stringify({
  ok,
  checkedAt: new Date().toISOString(),
  results,
}, null, 2));

if (!ok) {
  process.exitCode = 1;
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
