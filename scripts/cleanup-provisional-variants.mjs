import fs from "node:fs";
import path from "node:path";
import { deleteRowsByIds, fetchRows } from "./supabase-rest.mjs";

loadEnvFile(".env.local");

const variants = await fetchRows("variants", { select: "id,series_id,variant_type" });
const realSeriesIds = new Set(
  variants.filter((row) => row.variant_type !== "provisional").map((row) => row.series_id).filter(Boolean)
);
const candidates = variants.filter(
  (row) => row.variant_type === "provisional" && realSeriesIds.has(row.series_id)
);
const referenceRows = await Promise.all([
  fetchRows("market_listings", { select: "variant_id,matched_variant_id" }),
  fetchRows("x_reactions", { select: "variant_id,matched_variant_id" }),
  fetchRows("restock_events", { select: "variant_id,matched_variant_id" }),
  fetchRows("stock_reports", { select: "variant_id,matched_variant_id" }),
]);
const referencedIds = new Set(
  referenceRows.flat().flatMap((row) => [row.variant_id, row.matched_variant_id]).filter(Boolean)
);
const deletableIds = candidates.map((row) => row.id).filter((id) => !referencedIds.has(id));
const preservedIds = candidates.map((row) => row.id).filter((id) => referencedIds.has(id));
const deleted = await deleteRowsByIds("variants", deletableIds);

console.log(JSON.stringify({
  ok: true,
  variants: variants.length,
  provisionalCandidates: candidates.length,
  deleted,
  preservedBecauseReferenced: preservedIds.length,
  preservedIds,
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
