import { LISTING_TYPES, SOURCE_TYPES, STOCK_STATUSES } from "./gacha-schema";
import { classifyMarketListing, resolveVariantFromListing } from "./listing-classifier";

export function normalizeMarketListing(raw = {}, catalog = {}) {
  const matchedVariant = resolveVariantFromListing(raw, catalog);
  const listingType = classifyMarketListing(raw, catalog);

  return {
    id: text(raw.id) || stableId("market", matchedVariant?.id || raw.variant_id, raw.title, raw.listed_at),
    variant_id: text(raw.variant_id || raw.variantId || matchedVariant?.id),
    series_id: text(raw.series_id || raw.seriesId || matchedVariant?.series_id),
    title: text(raw.title || raw.name),
    listing_type: listingType,
    price: number(raw.price),
    status: text(raw.status) || "active",
    source: text(raw.source) || "mercari",
    source_type: text(raw.source_type || raw.sourceType) || SOURCE_TYPES.MARKETPLACE,
    source_url: text(raw.source_url || raw.url),
    listed_at: text(raw.listed_at || raw.created_at || raw.createdAt),
    sold_at: text(raw.sold_at || raw.soldAt),
    confidence: clamp01(raw.confidence ?? (listingType === LISTING_TYPES.UNKNOWN ? 0.25 : 0.6)),
    review_required: !matchedVariant || listingType === LISTING_TYPES.UNKNOWN,
    raw,
  };
}

export function normalizeOfficialProduct(raw = {}) {
  return {
    id: text(raw.series_id || raw.id || raw.slug),
    series_id: text(raw.series_id || raw.id || raw.slug),
    slug: text(raw.slug),
    name: text(raw.name || raw.title),
    franchise: text(raw.franchise || raw.character || raw.work_name),
    brand: text(raw.brand || raw.maker || raw.manufacturer),
    category: text(raw.category),
    release_month: text(raw.release_month || raw.month),
    release_week: text(raw.release_week || raw.week),
    release_date: text(raw.release_date || raw.releaseDate),
    price: number(raw.price),
    official_url: text(raw.official_url || raw.url),
    source_type: SOURCE_TYPES.OFFICIAL,
    raw,
  };
}

export function normalizeOfficialVariant(raw = {}, series = {}) {
  return {
    id: text(raw.id || raw.variant_id || `${series.id}-${slugify(raw.name || raw.title || "variant")}`),
    slug: text(raw.slug || `${series.slug}-${slugify(raw.name || raw.title || "variant")}`),
    series_id: text(raw.series_id || series.id),
    name: text(raw.name || raw.title),
    variant_type: text(raw.variant_type || raw.type) || "normal",
    rarity: text(raw.rarity) || "通常",
    role: text(raw.role) || "単品",
    image: text(raw.image || raw.image_url || raw.imageUrl),
    released: boolean(raw.released ?? series.is_released),
    axes: normalizeAxes(raw.axes || raw.forecast_axes || raw.forecastAxes),
    signals: normalizeSignals(raw.signals),
    tags: Array.isArray(raw.tags) ? raw.tags.map(text).filter(Boolean) : [],
    official_url: text(raw.official_url || raw.url || series.official_url),
    raw,
  };
}

export function normalizeXReaction(raw = {}, catalog = {}) {
  const variant = resolveVariantFromText(raw, catalog);

  return {
    id: text(raw.id) || stableId("x", variant?.id || raw.variant_id, raw.url, raw.posted_at),
    variant_id: text(raw.variant_id || raw.variantId || variant?.id),
    series_id: text(raw.series_id || raw.seriesId || variant?.series_id),
    source_type: text(raw.source_type || raw.sourceType) || SOURCE_TYPES.USER_X,
    author_type: text(raw.author_type || raw.authorType) || "user",
    text: text(raw.text || raw.body),
    url: text(raw.url),
    posted_at: text(raw.posted_at || raw.created_at || raw.createdAt),
    reposts: number(raw.reposts) ?? 0,
    likes: number(raw.likes) ?? 0,
    quotes: number(raw.quotes) ?? 0,
    intent_tags: Array.isArray(raw.intent_tags) ? raw.intent_tags.map(text).filter(Boolean) : inferXIntentTags(raw.text || raw.body),
    confidence: clamp01(raw.confidence ?? (variant ? 0.5 : 0.25)),
    review_required: !variant,
    raw,
  };
}

export function normalizeRestockEvent(raw = {}, catalog = {}) {
  const variant = resolveVariantFromText(raw, catalog);

  return {
    id: text(raw.id) || stableId("restock", variant?.id || raw.variant_id, raw.reported_at, raw.shop_name),
    variant_id: text(raw.variant_id || raw.variantId || variant?.id),
    series_id: text(raw.series_id || raw.seriesId || variant?.series_id),
    source_type: text(raw.source_type || raw.sourceType) || SOURCE_TYPES.USER_X,
    event_type: text(raw.event_type || raw.eventType) || "restock",
    region: text(raw.region),
    shop_name: text(raw.shop_name || raw.shopName),
    source_url: text(raw.source_url || raw.url),
    reported_at: text(raw.reported_at || raw.created_at || raw.createdAt),
    confidence: clamp01(raw.confidence ?? (variant ? 0.5 : 0.25)),
    review_required: !variant,
    raw,
  };
}

export function normalizeStockReport(raw = {}, catalog = {}) {
  const variant = resolveVariantFromText(raw, catalog);

  return {
    id: text(raw.id) || stableId("stock", variant?.id || raw.variant_id, raw.reported_at, raw.shop_name),
    variant_id: text(raw.variant_id || raw.variantId || variant?.id),
    series_id: text(raw.series_id || raw.seriesId || variant?.series_id),
    source_type: text(raw.source_type || raw.sourceType) || SOURCE_TYPES.USER_X,
    status: normalizeStockStatus(raw.status),
    status_label: text(raw.status_label || raw.status),
    region: text(raw.region),
    shop_name: text(raw.shop_name || raw.shopName),
    source_url: text(raw.source_url || raw.url),
    reported_at: text(raw.reported_at || raw.created_at || raw.createdAt),
    confidence: clamp01(raw.confidence ?? (variant ? 0.5 : 0.25)),
    review_required: !variant || normalizeStockStatus(raw.status) === STOCK_STATUSES.UNKNOWN,
    raw,
  };
}

function normalizeAxes(value = {}) {
  return {
    complete: number(value.complete) ?? 0,
    ace: number(value.ace || value.ace_character) ?? 0,
    compatibility: number(value.compatibility) ?? 0,
    limited: number(value.limited || value.limitedness) ?? 0,
  };
}

function normalizeSignals(value = {}) {
  return {
    preorder: number(value.preorder) ?? 0,
    x: number(value.x) ?? 0,
  };
}

function inferXIntentTags(value = "") {
  const body = String(value);
  const tags = [];
  if (body.includes("全部欲しい") || body.includes("コンプ")) tags.push("コンプ需要");
  if (body.includes("だけ欲しい") || body.includes("単品")) tags.push("単品需要");
  if (body.includes("回す")) tags.push("初動注目");
  if (body.includes("ドール") || body.includes("1/12") || body.includes("小物")) tags.push("互換性");
  return tags;
}

function normalizeStockStatus(value) {
  const status = text(value);
  if (["in_stock", "在庫あり"].includes(status)) return STOCK_STATUSES.IN_STOCK;
  if (["low", "少ない", "残り少なめ"].includes(status)) return STOCK_STATUSES.LOW;
  if (["sold_out", "売り切れ"].includes(status)) return STOCK_STATUSES.SOLD_OUT;
  if (["restocked", "補充", "再入荷"].includes(status)) return STOCK_STATUSES.RESTOCKED;
  return STOCK_STATUSES.UNKNOWN;
}

function resolveVariantFromText(raw = {}, catalog = {}) {
  if (raw.variant_id || raw.variantId) {
    const explicit = text(raw.variant_id || raw.variantId);
    return catalog.variants?.find((variant) => variant.id === explicit || variant.slug === explicit) ?? { id: explicit };
  }

  const body = text(raw.text || raw.body || raw.title || raw.name || raw.shop_name);
  if (!body) return null;
  const lower = body.toLowerCase();
  return catalog.variants?.find((variant) => {
    const names = [variant.name, variant.variant_name, variant.slug].filter(Boolean).map((value) => String(value).toLowerCase());
    return names.some((name) => lower.includes(name));
  }) ?? null;
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function number(value) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function boolean(value) {
  if (typeof value === "boolean") return value;
  if (value == null) return false;
  return ["true", "1", "released", "発売中"].includes(String(value).toLowerCase());
}

function clamp01(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed));
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

function stableId(...parts) {
  return parts.filter(Boolean).map((part) => String(part).replace(/[^a-zA-Z0-9_-]+/g, "-")).join("-").slice(0, 120);
}
