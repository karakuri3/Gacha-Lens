import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { officialProducts, officialSchedule } from "../lib/data/official-input.js";

const SOURCE_WEIGHTS = {
  official_site: 1,
  official: 1,
  official_x: 0.92,
  shop_x: 0.76,
  user_x: 0.48,
  marketplace: 0.62,
};

const X_INTENT_TAGS = {
  COMPLETE_DEMAND: "comp_demand",
  ACE_DEMAND: "ace_demand",
  ATTENTION: "attention",
  DOLL_COMPATIBILITY: "doll_compatibility",
  MINIATURE_COMPATIBILITY: "miniature_compatibility",
};

const X_INTENT_LABELS = {
  [X_INTENT_TAGS.COMPLETE_DEMAND]: "全部欲しい / コンプ需要",
  [X_INTENT_TAGS.ACE_DEMAND]: "特定キャラだけ欲しい / 当たり枠需要",
  [X_INTENT_TAGS.ATTENTION]: "回したい / 注目度",
  [X_INTENT_TAGS.DOLL_COMPATIBILITY]: "ドール小物に使える / 互換性",
  [X_INTENT_TAGS.MINIATURE_COMPATIBILITY]: "ミニチュアとして良い / 互換性",
};

loadEnvFile(".env.local");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const catalog = buildOfficialCatalog([...officialSchedule, ...officialProducts]);
const xReactionsRaw = loadXReactionsRaw();
const xRows = xReactionsRaw.map((raw) => normalizeXReaction(raw, catalog));
const referenceIds = await loadReferenceIds();
const dbXRows = xRows.map((row) => applyDbReferenceSafety(row, referenceIds));
const issueRows = dbXRows
  .filter((row) => row.review_required)
  .map((row) => createImportIssue("x_reactions", row.raw, "unknown_variant", row.id));

await upsert("x_reactions", dbXRows);
await upsert("import_issues", issueRows);

const reviewRequired = dbXRows.filter((row) => row.review_required).length;
const linkedToVariant = xRows.filter((row) => row.variant_id).length;
const savedLinkedToVariant = dbXRows.filter((row) => row.variant_id).length;
const intentBreakdown = dbXRows.reduce((breakdown, row) => {
  for (const tag of row.intent_tags ?? []) {
    breakdown[tag] = (breakdown[tag] ?? 0) + 1;
  }
  return breakdown;
}, {});

console.log(JSON.stringify({
  ok: true,
  raw: xReactionsRaw.length,
  xReactions: dbXRows.length,
  importIssues: issueRows.length,
  linkedToVariant,
  savedLinkedToVariant,
  reviewRequired,
  intentBreakdown,
}, null, 2));

async function upsert(table, rows) {
  if (!rows.length) return;
  let safeRows = rows;

  for (let attempt = 0; attempt < 32; attempt += 1) {
    const { error } = await supabase.from(table).upsert(safeRows, { onConflict: "id" });
    if (!error) return;

    const missingColumn = parseMissingColumn(error.message);
    if (!missingColumn) throw new Error(`${table} upsert failed: ${error.message}`);

    safeRows = safeRows.map((row) => omitKey(row, missingColumn));
    console.warn(`[upsert-x] ${table}.${missingColumn} is not in the remote schema cache. Retrying without it.`);
  }

  throw new Error(`${table} upsert failed: too many schema fallback attempts`);
}

function normalizeXReaction(raw, catalog) {
  const variant = resolveVariant(raw, catalog);
  const sourceType = normalizeSourceType(raw.source_type || raw.sourceType);
  const intentTags = Array.isArray(raw.intent_tags)
    ? raw.intent_tags.map(text).filter(Boolean)
    : inferXIntentTags(raw.text || raw.body);
  const reviewRequired = !variant;

  return {
    id: text(raw.id) || stableId("x", variant?.id || raw.variant_id, raw.url, raw.posted_at),
    variant_id: variant?.id || null,
    matched_variant_id: variant?.id || null,
    series_id: variant?.series_id || null,
    source_type: sourceType,
    author_type: text(raw.author_type || raw.authorType) || "user",
    text: text(raw.text || raw.body),
    url: text(raw.url),
    posted_at: nullableText(raw.posted_at || raw.created_at || raw.createdAt),
    reposts: number(raw.reposts) ?? 0,
    likes: number(raw.likes) ?? 0,
    quotes: number(raw.quotes) ?? 0,
    intent_tags: intentTags,
    intent_labels: intentTags.map((tag) => X_INTENT_LABELS[tag] || tag),
    confidence: reviewRequired ? 0.25 : Math.max(0.25, SOURCE_WEIGHTS[sourceType] ?? 0.48),
    review_required: reviewRequired,
    raw,
  };
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

function inferXIntentTags(value = "") {
  const body = String(value);
  const normalized = normalize(body);
  const tags = [];
  if (hasAny(normalized, ["全部欲しい", "全部ほしい", "全種", "コンプ", "complete"])) tags.push(X_INTENT_TAGS.COMPLETE_DEMAND);
  if (hasAny(normalized, ["だけ欲しい", "だけほしい", "単品", "当たり"])) tags.push(X_INTENT_TAGS.ACE_DEMAND);
  if (hasAny(normalized, ["回したい", "回す", "絶対やる", "見つけたら"])) tags.push(X_INTENT_TAGS.ATTENTION);
  if (hasAny(normalized, ["ドール", "ねんどろ", "シルバニア", "1/12"])) tags.push(X_INTENT_TAGS.DOLL_COMPATIBILITY);
  if (hasAny(normalized, ["ミニチュア", "小物", "飾れる", "撮影"])) tags.push(X_INTENT_TAGS.MINIATURE_COMPATIBILITY);
  return [...new Set(tags)];
}

async function loadReferenceIds() {
  const [seriesIds, variantIds] = await Promise.all([
    fetchIdSet("series"),
    fetchIdSet("variants"),
  ]);
  return { seriesIds, variantIds };
}

async function fetchIdSet(tableName) {
  const { data, error } = await supabase.from(tableName).select("id");
  if (error) {
    console.warn(`[upsert-x] Could not read ${tableName}. References will be sent to review: ${error.message}`);
    return new Set();
  }
  return new Set((data ?? []).map((row) => row.id).filter(Boolean));
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
    source_url: raw.url || raw.source_url || "",
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

function hasAny(value, keywords) {
  return keywords.some((keyword) => value.includes(normalize(keyword)));
}

function parseMissingColumn(message = "") {
  return message.match(/Could not find the '([^']+)' column/)?.[1] ?? "";
}

function omitKey(row, key) {
  const next = { ...row };
  delete next[key];
  return next;
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

function loadXReactionsRaw() {
  const inputPath = path.join(process.cwd(), "lib", "data", "x-input.js");
  let source = fs.readFileSync(inputPath, "utf8");
  source = source
    .replace(/import\s+\{[^}]+\}\s+from\s+["'][^"']+["'];?\s*/g, "")
    .replaceAll("SOURCE_TYPES.OFFICIAL_X", '"official_x"')
    .replaceAll("SOURCE_TYPES.SHOP_X", '"shop_x"')
    .replaceAll("SOURCE_TYPES.USER_X", '"user_x"')
    .replaceAll("export const xReactionsRaw", "const xReactionsRaw");

  return Function(`${source}\nreturn xReactionsRaw;`)();
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

function stableId(...parts) {
  return parts.filter(Boolean).map((part) => String(part).replace(/[^a-zA-Z0-9_-]+/g, "-")).join("-").slice(0, 120);
}

function normalize(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[（）()・･\s_-]+/g, "");
}
