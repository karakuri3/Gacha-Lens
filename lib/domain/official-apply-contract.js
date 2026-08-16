import { createHash } from "node:crypto";

export const OFFICIAL_APPLY_CONTRACT_SCHEMA_VERSION = 1;

export const OFFICIAL_WRITE_TABLES = Object.freeze({
  series: Object.freeze([
    "id", "slug", "name", "franchise", "brand", "category", "release_month", "release_week",
    "release_date", "price", "image_url", "official_url", "is_released", "source_type",
  ]),
  variants: Object.freeze([
    "id", "slug", "series_id", "name", "variant_type", "image", "released", "price", "brand",
    "release_month", "release_week", "release_date", "official_url", "source_type", "review_required",
  ]),
  restock_events: Object.freeze([
    "id", "variant_id", "matched_variant_id", "series_id", "source_type", "source_weight", "event_type",
    "event_label", "classification_reason", "classification_keywords", "text", "region", "shop_name",
    "source_url", "reported_at", "confidence", "review_required", "evidence",
  ]),
});

export const OFFICIAL_PRECONDITION_COLUMNS = Object.freeze({
  series: Object.freeze([
    "id", "slug", "name", "franchise", "brand", "category", "release_month", "release_week",
    "release_date", "price", "image_url", "official_url", "is_released", "source_type", "raw",
  ]),
  variants: Object.freeze([
    "id", "slug", "series_id", "name", "variant_type", "rarity", "role", "image", "released", "price",
    "brand", "release_month", "release_week", "release_date", "official_url", "axes", "signals", "tags",
    "source_type", "review_required", "raw",
  ]),
  restock_events: Object.freeze([
    "id", "variant_id", "matched_variant_id", "series_id", "source_type", "source_weight", "event_type",
    "event_label", "classification_reason", "classification_keywords", "text", "region", "shop_name",
    "source_url", "reported_at", "confidence", "review_required", "raw",
  ]),
});

const OPERATIONS = new Set(["insert", "update", "none"]);
const NUMERIC_COLUMNS = new Set(["price", "source_weight", "confidence"]);
const BOOLEAN_COLUMNS = new Set(["is_released", "released", "review_required"]);
const ARRAY_COLUMNS = new Set(["classification_keywords", "tags"]);
const JSON_COLUMNS = new Set(["evidence", "raw", "axes", "signals"]);
const DATE_COLUMNS = new Set(["release_date"]);
const TIMESTAMP_COLUMNS = new Set(["reported_at"]);

export function buildOfficialSeriesWriteValues(record = {}) {
  return canonicalizeOfficialRow("series", {
    id: record.id,
    slug: record.slug || record.id,
    name: record.name,
    franchise: nullable(record.franchise),
    brand: nullable(record.brand),
    category: nullable(record.category),
    release_month: nullable(record.release_month),
    release_week: nullable(record.release_week),
    release_date: nullable(record.release_date),
    price: nullableNumber(record.price),
    image_url: nullable(record.image_url),
    official_url: nullable(record.official_url),
    is_released: Boolean(record.released ?? record.is_released),
    source_type: "official_site",
  });
}

export function buildOfficialVariantWriteValues(variant = {}, series = {}) {
  return canonicalizeOfficialRow("variants", {
    id: variant.id,
    slug: variant.slug || `${series.slug || series.id}-${slugify(variant.name || "variant")}`,
    series_id: series.id,
    name: variant.name,
    variant_type: variant.variant_type || "normal",
    image: nullable(variant.image || variant.image_url || series.image_url),
    released: Boolean(variant.released ?? series.released ?? series.is_released),
    price: nullableNumber(variant.price ?? series.price),
    brand: nullable(variant.brand || series.brand),
    release_month: nullable(variant.release_month || series.release_month),
    release_week: nullable(variant.release_week || series.release_week),
    release_date: nullable(variant.release_date || series.release_date),
    official_url: nullable(variant.official_url || series.official_url),
    source_type: "official_site",
    review_required: false,
  });
}

export function buildOfficialRestockWriteValues(event = {}, evidence = null) {
  return canonicalizeOfficialRow("restock_events", {
    id: event.id,
    variant_id: null,
    matched_variant_id: null,
    series_id: event.series_id,
    source_type: event.source_type,
    source_weight: event.source_weight,
    event_type: event.event_type,
    event_label: nullable(event.event_label),
    classification_reason: nullable(event.classification_reason),
    classification_keywords: event.classification_keywords,
    text: nullable(event.text),
    region: nullable(event.region),
    shop_name: nullable(event.shop_name),
    source_url: nullable(event.source_url),
    reported_at: nullable(event.reported_at),
    confidence: event.confidence,
    review_required: false,
    evidence: evidence ?? event.evidence ?? event.raw ?? {},
  });
}

export function buildOfficialApplyOperation({ table, operation, values, existing }) {
  if (!OFFICIAL_WRITE_TABLES[table]) throw new Error("Official apply table is not allowed.");
  if (!OPERATIONS.has(operation)) throw new Error("Official apply operation is invalid.");
  const canonicalValues = canonicalizeOfficialRow(table, values);
  if (!canonicalValues.id) throw new Error("Official apply row identity is missing.");
  const hasExisting = existing != null;
  if (operation === "insert" && hasExisting) throw new Error("Official insert apply contract has an existing row.");
  if (operation !== "insert" && !hasExisting) throw new Error("Official existing-row apply contract is missing its precondition.");
  return {
    table,
    id: canonicalValues.id,
    operation,
    values: canonicalValues,
    precondition_digest: hasExisting ? digestOfficialPreconditionRow(table, existing) : null,
  };
}

export function validateOfficialApplyOperation(value, expectedTable) {
  if (!value || value.table !== expectedTable || !OFFICIAL_WRITE_TABLES[expectedTable]) {
    throw new Error("Official apply operation table is invalid.");
  }
  if (!OPERATIONS.has(value.operation) || text(value.id) !== text(value.values?.id)) {
    throw new Error("Official apply operation contract is invalid.");
  }
  const actualKeys = Object.keys(value.values || {}).sort();
  const expectedKeys = [...OFFICIAL_WRITE_TABLES[expectedTable]].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error("Official apply operation contains non-whitelisted columns.");
  }
  const canonicalValues = canonicalizeOfficialRow(expectedTable, value.values);
  if (canonicalJson(canonicalValues) !== canonicalJson(value.values)) {
    throw new Error("Official apply operation values are not canonical.");
  }
  const digest = text(value.precondition_digest);
  if (value.operation === "insert") {
    if (value.precondition_digest !== null) throw new Error("Official insert precondition must be absent.");
  } else if (!/^sha256:[0-9a-f]{64}$/.test(digest)) {
    throw new Error("Official existing-row precondition digest is invalid.");
  }
  return value;
}

export function canonicalizeOfficialRow(table, row = {}) {
  const columns = OFFICIAL_WRITE_TABLES[table];
  if (!columns) throw new Error("Official row table is not allowed.");
  return Object.fromEntries(columns.map((column) => {
    const sourceColumn = table === "restock_events" && column === "evidence" ? "raw" : column;
    const rawValue = row[column] !== undefined ? row[column] : row[sourceColumn];
    return [column, normalizeColumn(column, rawValue)];
  }));
}

export function canonicalizeOfficialPreconditionRow(table, row = {}) {
  const columns = OFFICIAL_PRECONDITION_COLUMNS[table];
  if (!columns) throw new Error("Official precondition table is not allowed.");
  return Object.fromEntries(columns.map((column) => [column, normalizeColumn(column, row[column])]));
}

export function officialDatabaseColumns(table) {
  return OFFICIAL_WRITE_TABLES[table].map((column) => column === "evidence" ? "raw" : column);
}

export function officialPreconditionDatabaseColumns(table) {
  const columns = OFFICIAL_PRECONDITION_COLUMNS[table];
  if (!columns) throw new Error("Official precondition table is not allowed.");
  return columns;
}

export function toOfficialDatabaseRow(table, values) {
  const canonical = canonicalizeOfficialRow(table, values);
  return Object.fromEntries(Object.entries(canonical)
    .map(([column, value]) => [column === "evidence" ? "raw" : column, value]));
}

export function digestOfficialRow(table, row) {
  return sha256(canonicalJson(canonicalizeOfficialRow(table, row)));
}

export function digestOfficialPreconditionRow(table, row) {
  return sha256(canonicalJson(canonicalizeOfficialPreconditionRow(table, row)));
}

export function officialCanonicalDigest(value) {
  return sha256(canonicalJson(value));
}

export function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

function normalizeColumn(column, value) {
  if (ARRAY_COLUMNS.has(column)) return [...new Set(asArray(value).map(text).filter(Boolean))].sort();
  if (JSON_COLUMNS.has(column)) return sortValue(value && typeof value === "object" ? value : {});
  if (value === undefined || value === null) return null;
  if (NUMERIC_COLUMNS.has(column)) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  if (BOOLEAN_COLUMNS.has(column)) return value === true || value === "true";
  if (DATE_COLUMNS.has(column)) {
    if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
    const normalized = text(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
  }
  if (TIMESTAMP_COLUMNS.has(column)) {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }
  return text(value) || null;
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function nullable(value) {
  return text(value) || null;
}

function nullableNumber(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function slugify(value) {
  return text(value).toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff-]+/gi, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "item";
}

function asArray(value) {
  return Array.isArray(value) ? value.filter((entry) => entry != null) : [];
}

function text(value) {
  return value == null ? "" : String(value).trim();
}
