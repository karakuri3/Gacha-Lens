import fs from "node:fs";
import path from "node:path";
import { officialProducts, officialSchedule } from "../lib/data/official-input.js";
import { getGeneratedDataPath } from "./generated-paths.mjs";
import { loadOfficialCatalog } from "./load-official-catalog.mjs";
import { includeStaticSampleData, productionRecords } from "./nonproduction-data.mjs";
import { fetchIdSetSafe, upsertRows } from "./supabase-rest.mjs";

const SOURCE_WEIGHTS = {
  official_site: 1,
  official: 1,
  official_x: 0.92,
  shop_x: 0.76,
  user_x: 0.48,
  marketplace: 0.62,
};

loadEnvFile(".env.local");

const catalog = await loadOfficialCatalog([...officialSchedule, ...officialProducts]);
const loadedStockRaw = loadStockRaw();
const restockEventsRaw = productionRecords(loadedStockRaw.restockEventsRaw);
const stockReportsRaw = productionRecords(loadedStockRaw.stockReportsRaw);
const restockRows = restockEventsRaw.map((raw) => normalizeRestockEvent(raw, catalog));
const stockRows = stockReportsRaw.map((raw) => normalizeStockReport(raw, catalog));
const referenceIds = await loadReferenceIds();
const dbRestockRows = restockRows.map((row) => applyDbReferenceSafety(row, referenceIds));
const dbStockRows = stockRows.map((row) => applyDbReferenceSafety(row, referenceIds));
const issueRows = [
  ...dbRestockRows.filter((row) => row.review_required).map((row) => createImportIssue("restock_events", row.raw, "unknown_variant", row.id)),
  ...dbStockRows.filter((row) => row.review_required).map((row) => createImportIssue("stock_reports", row.raw, "unknown_variant", row.id)),
];

await upsertRows("restock_events", dbRestockRows, { label: "upsert-stock" });
await upsertRows("stock_reports", dbStockRows, { label: "upsert-stock" });
await upsertRows("import_issues", issueRows, { label: "upsert-stock" });

const restockLinked = restockRows.filter((row) => row.variant_id).length;
const stockLinked = stockRows.filter((row) => row.variant_id).length;
const savedRestockLinked = dbRestockRows.filter((row) => row.variant_id).length;
const savedStockLinked = dbStockRows.filter((row) => row.variant_id).length;
const reviewRequired = [...dbRestockRows, ...dbStockRows].filter((row) => row.review_required).length;

console.log(JSON.stringify({
  ok: true,
  raw: {
    restock: restockEventsRaw.length,
    stock: stockReportsRaw.length,
  },
  saved: {
    restockEvents: dbRestockRows.length,
    stockReports: dbStockRows.length,
    importIssues: issueRows.length,
  },
  linkedToVariant: {
    restock: restockLinked,
    stock: stockLinked,
    total: restockLinked + stockLinked,
  },
  savedLinkedToVariant: {
    restock: savedRestockLinked,
    stock: savedStockLinked,
    total: savedRestockLinked + savedStockLinked,
  },
  reviewRequired,
  restockBreakdown: countBy(dbRestockRows, "event_type"),
  stockBreakdown: countBy(dbStockRows, "status"),
}, null, 2));

function normalizeRestockEvent(raw, catalog) {
  const variant = resolveVariant(raw, catalog);
  const sourceType = normalizeSourceType(raw.source_type || raw.sourceType || raw.source);
  const classification = inferRestockEvent(raw);
  const reviewRequired = !variant || classification.event_type === "unknown";

  return {
    id: text(raw.id) || stableId("restock", variant?.id || raw.variant_id, raw.reported_at, raw.shop_name),
    variant_id: variant?.id || null,
    matched_variant_id: variant?.id || null,
    series_id: variant?.series_id || null,
    source_type: sourceType,
    source_weight: SOURCE_WEIGHTS[sourceType] ?? SOURCE_WEIGHTS.user_x,
    event_type: classification.event_type,
    event_label: classification.event_label,
    classification_reason: classification.reason,
    classification_keywords: classification.keywords,
    text: text(raw.text || raw.body || raw.title || raw.status),
    region: text(raw.region),
    shop_name: text(raw.shop_name || raw.shopName),
    source_url: text(raw.source_url || raw.url),
    reported_at: nullableText(raw.reported_at || raw.created_at || raw.createdAt),
    confidence: reviewRequired ? 0.25 : (SOURCE_WEIGHTS[sourceType] ?? SOURCE_WEIGHTS.user_x),
    review_required: reviewRequired,
    raw,
  };
}

function normalizeStockReport(raw, catalog) {
  const variant = resolveVariant(raw, catalog);
  const sourceType = normalizeSourceType(raw.source_type || raw.sourceType || raw.source);
  const classification = inferStockReport(raw);
  const reviewRequired = !variant || classification.status === "unknown";

  return {
    id: text(raw.id) || stableId("stock", variant?.id || raw.variant_id, raw.reported_at, raw.shop_name),
    variant_id: variant?.id || null,
    matched_variant_id: variant?.id || null,
    series_id: variant?.series_id || null,
    source_type: sourceType,
    source_weight: SOURCE_WEIGHTS[sourceType] ?? SOURCE_WEIGHTS.user_x,
    status: classification.status,
    status_label: text(raw.status_label || raw.status) || classification.status_label,
    classification_reason: classification.reason,
    classification_keywords: classification.keywords,
    text: text(raw.text || raw.body || raw.title || raw.status),
    region: text(raw.region),
    shop_name: text(raw.shop_name || raw.shopName),
    source_url: text(raw.source_url || raw.url),
    reported_at: nullableText(raw.reported_at || raw.created_at || raw.createdAt),
    confidence: reviewRequired ? 0.25 : (SOURCE_WEIGHTS[sourceType] ?? SOURCE_WEIGHTS.user_x),
    review_required: reviewRequired,
    raw,
  };
}

function inferRestockEvent(raw) {
  const body = normalizeSignal(raw.event_type || raw.eventType || raw.status || raw.text || raw.body || raw.title);
  const rules = [
    { event_type: "restock", event_label: "restock", reason: "restock_keyword", keywords: ["restock", "再入荷", "再販", "入荷再開", "入荷"] },
    { event_type: "replenishment", event_label: "replenishment", reason: "replenishment_keyword", keywords: ["replenish", "補充", "追加", "入れ替え"] },
  ];

  for (const rule of rules) {
    const keyword = rule.keywords.find((entry) => body.includes(normalizeSignal(entry)));
    if (keyword) return { ...rule, keywords: [keyword] };
  }

  return { event_type: "unknown", event_label: "unknown", reason: body ? "no_restock_keyword" : "empty_text", keywords: [] };
}

function inferStockReport(raw) {
  const body = normalizeSignal(raw.status || raw.status_label || raw.statusLabel || raw.text || raw.body || raw.title);
  const rules = [
    { status: "sold_out", status_label: "sold_out", reason: "sold_out_keyword", keywords: ["soldout", "sold_out", "売り切れ", "完売", "在庫なし", "品切れ"] },
    { status: "low", status_label: "low_stock", reason: "low_stock_keyword", keywords: ["low", "low_stock", "残り少ない", "残りわずか", "残少", "少なめ"] },
    { status: "restocked", status_label: "restocked", reason: "restocked_keyword", keywords: ["restocked", "再入荷", "補充", "入荷しました"] },
    { status: "in_stock", status_label: "in_stock", reason: "in_stock_keyword", keywords: ["in_stock", "在庫あり", "在庫有", "まだあります", "販売中"] },
  ];

  for (const rule of rules) {
    const keyword = rule.keywords.find((entry) => body.includes(normalizeSignal(entry)));
    if (keyword) return { ...rule, keywords: [keyword] };
  }

  return { status: "unknown", status_label: "unknown", reason: body ? "no_stock_keyword" : "empty_text", keywords: [] };
}

function resolveVariant(raw, catalog) {
  const explicit = text(raw.variant_id || raw.variantId);
  if (explicit && catalog.variantById.has(explicit)) return catalog.variantById.get(explicit);

  const body = normalize(`${raw.text || raw.body || raw.title || raw.name || ""}`);
  if (!body) return null;

  return catalog.variants.find((variant) => {
    return [variant.name, variant.slug].filter(Boolean).map(normalize).some((term) => term && body.includes(term));
  }) ?? null;
}

async function loadReferenceIds() {
  const [seriesIds, variantIds] = await Promise.all([
    fetchIdSetSafe("series", "upsert-stock"),
    fetchIdSetSafe("variants", "upsert-stock"),
  ]);
  return { seriesIds, variantIds };
}

function applyDbReferenceSafety(row, referenceIds) {
  const next = { ...row };
  let droppedReference = false;

  if (next.variant_id && !referenceIds.variantIds.has(next.variant_id)) {
    next.variant_id = null;
    next.matched_variant_id = null;
    droppedReference = true;
  }

  if (next.series_id && !referenceIds.seriesIds.has(next.series_id)) {
    next.series_id = null;
    droppedReference = true;
  }

  if (droppedReference) {
    next.review_required = true;
    next.confidence = Math.min(next.confidence, 0.25);
    next.raw = {
      ...(next.raw ?? {}),
      db_reference_missing: true,
    };
  }

  return next;
}

function createImportIssue(tableName, raw, issueType, recordId) {
  return {
    id: `issue-${tableName}-${recordId || raw.id || raw.url || Date.now()}`.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 140),
    issue_type: issueType,
    table_name: tableName,
    record_id: recordId || raw.id || "",
    source: raw.source_type || raw.sourceType || "user_x",
    source_url: raw.source_url || raw.url || "",
    raw,
    resolved: false,
    note: "variant_id に自動紐付けできないため、人間の確認対象として保持",
  };
}

function buildOfficialCatalog(rows) {
  const series = rows.map((raw) => ({
    id: text(raw.series_id || raw.id || raw.slug),
    slug: text(raw.slug || raw.series_slug || raw.id),
    name: text(raw.name || raw.title || raw.product_name),
    franchise: text(raw.franchise || raw.character || raw.work_name || raw.ip),
  }));
  const variants = rows.flatMap((row) => asArray(row.variants || row.items || row.lineup || row.line_up).map((variant) => ({
    id: text(variant.id || variant.variant_id),
    slug: text(variant.slug || variant.id || variant.variant_id),
    series_id: text(row.series_id || row.id || row.slug),
    name: text(variant.name || variant.title || variant.variant_name),
  })));

  return {
    series,
    variants,
    seriesById: new Map(series.map((entry) => [entry.id, entry])),
    variantById: new Map(variants.map((entry) => [entry.id, entry])),
  };
}

function normalizeSourceType(value) {
  const source = text(value).toLowerCase();
  if (["official_site", "officialsite", "official"].includes(source)) return "official_site";
  if (["official_x", "officialx"].includes(source)) return "official_x";
  if (["shop_x", "shopx", "store_x", "storex"].includes(source)) return "shop_x";
  if (["user_x", "userx", "x", "twitter"].includes(source)) return "user_x";
  return source || "user_x";
}

function loadStockRaw() {
  const generated = loadGeneratedStockRaw();
  const inputPath = path.join(process.cwd(), "lib", "data", "stock-input.js");
  let source = fs.readFileSync(inputPath, "utf8");
  source = source
    .replace(/import\s+\{[^}]+\}\s+from\s+["'][^"']+["'];?\s*/g, "")
    .replaceAll("SOURCE_TYPES.OFFICIAL_SITE", '"official_site"')
    .replaceAll("SOURCE_TYPES.OFFICIAL_X", '"official_x"')
    .replaceAll("SOURCE_TYPES.SHOP_X", '"shop_x"')
    .replaceAll("SOURCE_TYPES.USER_X", '"user_x"')
    .replaceAll("export const restockEventsRaw", "const restockEventsRaw")
    .replaceAll("export const stockReportsRaw", "const stockReportsRaw");

  const staticRaw = Function(`${source}\nreturn { restockEventsRaw, stockReportsRaw };`)();
  const staticRestock = includeStaticSampleData() ? staticRaw.restockEventsRaw ?? [] : [];
  const staticStock = includeStaticSampleData() ? staticRaw.stockReportsRaw ?? [] : [];
  return {
    restockEventsRaw: dedupeById([...(generated.restockEventsRaw ?? []), ...staticRestock]),
    stockReportsRaw: dedupeById([...(generated.stockReportsRaw ?? []), ...staticStock]),
  };
}

function loadGeneratedStockRaw() {
  const generatedPath = getGeneratedDataPath("stock-raw.json");
  if (!fs.existsSync(generatedPath)) return { restockEventsRaw: [], stockReportsRaw: [] };
  const parsed = JSON.parse(fs.readFileSync(generatedPath, "utf8"));
  return {
    restockEventsRaw: asArray(parsed.restockEventsRaw),
    stockReportsRaw: asArray(parsed.stockReportsRaw),
  };
}

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = row[key] || "unknown";
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
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

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function dedupeById(records) {
  return [...new Map(records.map((record) => [record.id || stableId(record.text, record.source_url, record.reported_at), record])).values()];
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function nullableText(value) {
  return text(value) || null;
}

function stableId(...parts) {
  return parts.filter(Boolean).map((part) => String(part).replace(/[^a-zA-Z0-9_-]+/g, "-")).join("-").slice(0, 120);
}

function normalize(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[（）()・･\s_-]+/g, "");
}

function normalizeSignal(value = "") {
  return String(value).trim().toLowerCase().replace(/[\s_・･-]+/g, "");
}
