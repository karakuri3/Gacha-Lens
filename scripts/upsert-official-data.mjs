import fs from "node:fs";
import path from "node:path";
import { officialProducts, officialSchedule } from "../lib/data/official-input.js";
import { getGeneratedDataPath } from "./generated-paths.mjs";
import { deleteOfficialVariantsBySeriesIds, upsertRows } from "./supabase-rest.mjs";

loadEnvFile(".env.local");

const generatedOfficial = loadGeneratedOfficialRaw();
const officialRows = dedupeById([...generatedOfficial.records, ...officialSchedule, ...officialProducts]);
const seriesRows = dedupeRowsById(officialRows.map(toSeriesRow));
const variantSourceRows = officialRows.filter(hasVariantRows);
const variantRows = dedupeRowsById(officialRows.flatMap((series) => {
  return asArray(series.variants || series.items || series.lineup || series.line_up).map((variant) => toVariantRow(variant, series));
}));

const issueRows = generatedOfficial.issues.map((issue) => ({
  ...issue,
  record_id: issue.record_id || issue.id,
  resolved: Boolean(issue.resolved),
}));

await upsertRows("series", seriesRows, { label: "upsert-official" });
await replaceOfficialVariants(variantSourceRows.map(toSeriesRow));
await upsertRows("variants", variantRows, { label: "upsert-official" });
await upsertRows("import_issues", issueRows, { label: "upsert-official" });

console.log(JSON.stringify({
  ok: true,
  generatedRows: generatedOfficial.records.length,
  generatedIssues: generatedOfficial.issues.length,
  sourceRows: officialRows.length,
  series: seriesRows.length,
  variants: variantRows.length,
  importIssues: issueRows.length,
}, null, 2));

function replaceOfficialVariants(seriesRows) {
  const seriesIds = seriesRows.map((row) => row.id).filter(Boolean);
  return deleteOfficialVariantsBySeriesIds(seriesIds);
}

function loadGeneratedOfficialRaw() {
  const filePath = getGeneratedDataPath("official-raw.json");
  if (!fs.existsSync(filePath)) return { records: [], issues: [] };

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return {
    records: Array.isArray(parsed.records) ? parsed.records : [],
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
  };
}

function dedupeById(records) {
  return [...new Map(records.filter(Boolean).map((record) => [text(record.id || record.series_id || record.slug), record])).values()];
}

function dedupeRowsById(rows) {
  return [...new Map(rows.filter((row) => row?.id).map((row) => [row.id, row])).values()];
}

function hasVariantRows(raw) {
  return asArray(raw?.variants || raw?.items || raw?.lineup || raw?.line_up).length > 0;
}

function toSeriesRow(raw) {
  return {
    id: text(raw.series_id || raw.id || raw.slug),
    slug: text(raw.slug || raw.series_slug || raw.id),
    name: text(raw.name || raw.title || raw.product_name),
    franchise: text(raw.franchise || raw.character || raw.work_name || raw.ip),
    brand: text(raw.brand || raw.maker || raw.manufacturer),
    category: text(raw.category || raw.genre),
    release_month: normalizeMonth(raw.release_month || raw.month || raw.releaseMonth),
    release_week: normalizeWeek(raw.release_week || raw.week || raw.releaseWeek),
    release_date: nullableText(raw.release_date || raw.releaseDate),
    price: number(raw.price || raw.price_yen || raw.priceYen),
    image_url: text(raw.image || raw.image_url || raw.imageUrl || raw.product_image || raw.thumbnail),
    official_url: text(raw.official_url || raw.url || raw.product_url),
    is_released: Boolean(raw.is_released ?? raw.released),
    source_type: "official_site",
    raw,
  };
}

function toVariantRow(raw, series) {
  const seriesRow = toSeriesRow(series);
  const name = text(raw.name || raw.title || raw.variant_name);
  return {
    id: text(raw.id || raw.variant_id || `${seriesRow.id}-${slugify(name || "variant")}`),
    slug: text(raw.slug || `${seriesRow.slug}-${slugify(name || "variant")}`),
    series_id: seriesRow.id,
    name,
    variant_type: text(raw.variant_type || raw.type) || "normal",
    rarity: text(raw.rarity) || "通常",
    role: text(raw.role) || "単品",
    image: text(raw.image || raw.image_url || raw.imageUrl || raw.product_image || raw.thumbnail || seriesRow.image_url),
    released: Boolean(raw.released ?? seriesRow.is_released),
    price: number(raw.price || raw.price_yen || raw.priceYen) ?? seriesRow.price,
    brand: text(raw.brand || seriesRow.brand),
    release_month: normalizeMonth(raw.release_month || raw.month || raw.releaseMonth || seriesRow.release_month),
    release_week: normalizeWeek(raw.release_week || raw.week || raw.releaseWeek || seriesRow.release_week),
    release_date: nullableText(raw.release_date || raw.releaseDate || seriesRow.release_date),
    official_url: text(raw.official_url || raw.url || seriesRow.official_url),
    axes: raw.axes || raw.forecast_axes || raw.forecastAxes || {},
    signals: raw.signals || {},
    tags: Array.isArray(raw.tags) ? raw.tags.map(text).filter(Boolean) : [],
    source_type: "official_site",
    review_required: !name,
    raw,
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

function normalizeMonth(value) {
  const raw = text(value);
  if (!raw) return "";
  const matched = raw.match(/(\d{1,2})/);
  return matched ? `${Number(matched[1])}月` : raw;
}

function normalizeWeek(value) {
  const raw = text(value);
  if (!raw) return "";
  if (raw.includes("未定")) return "未定";
  const matched = raw.match(/([1-5１２３４５])/);
  if (!matched) return raw;
  const numberMap = { "１": "1", "２": "2", "３": "3", "４": "4", "５": "5" };
  return `第${numberMap[matched[1]] || matched[1]}週`;
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function nullableText(value) {
  return text(value) || null;
}

function number(value) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff-]+/gi, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "item";
}
