import { LISTING_TYPES, SOURCE_TYPES, SOURCE_WEIGHTS, STOCK_STATUSES } from "./gacha-schema";
import { classifyMarketListingDetailed, resolveSeriesFromListing, resolveVariantFromListing } from "./listing-classifier";

export const X_INTENT_TAGS = {
  COMPLETE_DEMAND: "comp_demand",
  ACE_DEMAND: "ace_demand",
  ATTENTION: "attention",
  DOLL_COMPATIBILITY: "doll_compatibility",
  MINIATURE_COMPATIBILITY: "miniature_compatibility",
};

export const X_INTENT_LABELS = {
  [X_INTENT_TAGS.COMPLETE_DEMAND]: "全部欲しい / コンプ需要",
  [X_INTENT_TAGS.ACE_DEMAND]: "特定キャラだけ欲しい / 当たり枠需要",
  [X_INTENT_TAGS.ATTENTION]: "回したい / 注目度",
  [X_INTENT_TAGS.DOLL_COMPATIBILITY]: "ドール小物に使える / 互換性",
  [X_INTENT_TAGS.MINIATURE_COMPATIBILITY]: "ミニチュアとして良い / 互換性",
};

export function normalizeMarketListing(raw = {}, catalog = {}) {
  if (raw.normalized_entity === "market_listing") return raw;

  const matchedVariant = resolveVariantFromListing(raw, catalog);
  const matchedSeries = resolveSeriesFromListing(raw, catalog);
  const classification = classifyMarketListingDetailed(raw, catalog);
  const listingType = classification.listing_type;
  const isSeriesLevelSet = matchedSeries && [LISTING_TYPES.COMPLETE_SET, LISTING_TYPES.PARTIAL_SET, LISTING_TYPES.POPULAR_SET].includes(listingType);
  const isSeriesLevelRare = matchedSeries && [LISTING_TYPES.RARE_SINGLE, LISTING_TYPES.SECRET_SINGLE].includes(listingType);
  const reviewRequired = listingType === LISTING_TYPES.UNKNOWN || (!matchedVariant && !isSeriesLevelSet && !isSeriesLevelRare);
  const variantId = listingType === LISTING_TYPES.COMPLETE_SET ? "" : text(raw.variant_id || raw.variantId || matchedVariant?.id);

  return {
    normalized_entity: "market_listing",
    id: text(raw.id) || stableId("market", matchedVariant?.id || raw.variant_id, raw.title, raw.listed_at),
    variant_id: variantId,
    series_id: text(raw.series_id || raw.seriesId || matchedVariant?.series_id || matchedSeries?.id),
    title: text(raw.title || raw.name),
    listing_type: listingType,
    market_review_type: classification.market_review_type,
    classification_reason: classification.reason,
    classification_confidence: classification.confidence,
    classification_details: classification.details,
    price: number(raw.price),
    status: normalizeMarketStatus(raw.status),
    source: text(raw.source) || "mercari",
    source_type: text(raw.source_type || raw.sourceType) || SOURCE_TYPES.MARKETPLACE,
    source_url: text(raw.source_url || raw.url),
    listed_at: text(raw.listed_at || raw.created_at || raw.createdAt),
    sold_at: text(raw.sold_at || raw.soldAt),
    confidence: clamp01(raw.confidence ?? (reviewRequired ? 0.25 : classification.confidence)),
    review_required: reviewRequired,
    raw,
  };
}

export function normalizeOfficialProduct(raw = {}) {
  return {
    id: text(raw.series_id || raw.id || raw.slug),
    series_id: text(raw.series_id || raw.id || raw.slug),
    slug: text(raw.slug || raw.series_slug || raw.id),
    name: text(raw.name || raw.title || raw.product_name),
    franchise: text(raw.franchise || raw.character || raw.work_name || raw.ip),
    brand: text(raw.brand || raw.maker || raw.manufacturer),
    category: text(raw.category || raw.genre),
    release_month: normalizeMonth(raw.release_month || raw.month || raw.releaseMonth),
    release_week: normalizeWeek(raw.release_week || raw.week || raw.releaseWeek),
    release_date: text(raw.release_date || raw.releaseDate),
    price: number(raw.price || raw.price_yen || raw.priceYen),
    official_url: text(raw.official_url || raw.url || raw.product_url),
    image_url: text(raw.image || raw.image_url || raw.imageUrl || raw.product_image || raw.thumbnail),
    is_released: boolean(raw.is_released ?? raw.released),
    source_type: SOURCE_TYPES.OFFICIAL,
    raw,
  };
}

export function normalizeOfficialVariant(raw = {}, series = {}) {
  const name = text(raw.name || raw.title || raw.variant_name);
  const image = text(raw.image || raw.image_url || raw.imageUrl || raw.product_image || raw.thumbnail || series.image_url);

  return {
    id: text(raw.id || raw.variant_id || `${series.id}-${slugify(name || "variant")}`),
    slug: text(raw.slug || `${series.slug}-${slugify(name || "variant")}`),
    series_id: text(raw.series_id || series.id),
    name,
    variant_type: text(raw.variant_type || raw.type) || "normal",
    rarity: text(raw.rarity) || "通常",
    role: text(raw.role) || "単品",
    image: image || createOfficialPlaceholderImage(name || series.name || "公式データ"),
    released: boolean(raw.released ?? series.is_released),
    price: number(raw.price || raw.price_yen || raw.priceYen) ?? series.price ?? null,
    brand: text(raw.brand || series.brand),
    release_month: normalizeMonth(raw.release_month || raw.month || raw.releaseMonth || series.release_month),
    release_week: normalizeWeek(raw.release_week || raw.week || raw.releaseWeek || series.release_week),
    release_date: text(raw.release_date || raw.releaseDate || series.release_date),
    axes: normalizeAxes(raw.axes || raw.forecast_axes || raw.forecastAxes),
    signals: normalizeSignals(raw.signals),
    tags: Array.isArray(raw.tags) ? raw.tags.map(text).filter(Boolean) : [],
    official_url: text(raw.official_url || raw.url || series.official_url),
    source_type: SOURCE_TYPES.OFFICIAL,
    review_required: !name,
    raw,
  };
}

export function normalizeXReaction(raw = {}, catalog = {}) {
  if (raw.normalized_entity === "x_reaction") return raw;

  const variant = resolveVariantFromText(raw, catalog);
  const intentTags = Array.isArray(raw.intent_tags) ? raw.intent_tags.map(text).filter(Boolean) : inferXIntentTags(raw.text || raw.body);

  return {
    normalized_entity: "x_reaction",
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
    intent_tags: intentTags,
    intent_labels: intentTags.map((tag) => X_INTENT_LABELS[tag] || tag),
    confidence: clamp01(raw.confidence ?? (variant ? 0.62 : 0.25)),
    review_required: !variant,
    raw,
  };
}

export function normalizeRestockEvent(raw = {}, catalog = {}) {
  if (raw.normalized_entity === "restock_event") return raw;

  const variant = resolveVariantFromText(raw, catalog);
  const sourceType = normalizeSourceType(raw.source_type || raw.sourceType || raw.source);
  const classification = inferRestockEvent(raw);
  const reviewRequired = !variant || classification.event_type === "unknown";

  return {
    normalized_entity: "restock_event",
    id: text(raw.id) || stableId("restock", variant?.id || raw.variant_id, raw.reported_at, raw.shop_name),
    variant_id: text(raw.variant_id || raw.variantId || variant?.id),
    series_id: text(raw.series_id || raw.seriesId || variant?.series_id),
    source_type: sourceType,
    source_weight: SOURCE_WEIGHTS[sourceType] ?? SOURCE_WEIGHTS[SOURCE_TYPES.USER_X],
    event_type: classification.event_type,
    event_label: classification.event_label,
    classification_reason: classification.reason,
    classification_keywords: classification.keywords,
    text: text(raw.text || raw.body || raw.title || raw.status),
    region: text(raw.region),
    shop_name: text(raw.shop_name || raw.shopName),
    source_url: text(raw.source_url || raw.url),
    reported_at: text(raw.reported_at || raw.created_at || raw.createdAt),
    confidence: clamp01(raw.confidence ?? (reviewRequired ? 0.25 : (SOURCE_WEIGHTS[sourceType] ?? 0.48))),
    review_required: reviewRequired,
    raw,
  };
}

export function normalizeStockReport(raw = {}, catalog = {}) {
  if (raw.normalized_entity === "stock_report") return raw;

  const variant = resolveVariantFromText(raw, catalog);
  const sourceType = normalizeSourceType(raw.source_type || raw.sourceType || raw.source);
  const classification = inferStockReport(raw);
  const status = classification.status;
  const reviewRequired = !variant || status === STOCK_STATUSES.UNKNOWN;

  return {
    normalized_entity: "stock_report",
    id: text(raw.id) || stableId("stock", variant?.id || raw.variant_id, raw.reported_at, raw.shop_name),
    variant_id: text(raw.variant_id || raw.variantId || variant?.id),
    series_id: text(raw.series_id || raw.seriesId || variant?.series_id),
    source_type: sourceType,
    source_weight: SOURCE_WEIGHTS[sourceType] ?? SOURCE_WEIGHTS[SOURCE_TYPES.USER_X],
    status,
    status_label: text(raw.status_label || raw.status) || classification.status_label,
    classification_reason: classification.reason,
    classification_keywords: classification.keywords,
    text: text(raw.text || raw.body || raw.title || raw.status),
    region: text(raw.region),
    shop_name: text(raw.shop_name || raw.shopName),
    source_url: text(raw.source_url || raw.url),
    reported_at: text(raw.reported_at || raw.created_at || raw.createdAt),
    confidence: clamp01(raw.confidence ?? (reviewRequired ? 0.25 : (SOURCE_WEIGHTS[sourceType] ?? 0.48))),
    review_required: reviewRequired,
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

function inferRestockEvent(raw = {}) {
  const body = normalizedSignalText(raw.event_type || raw.eventType || raw.status || raw.text || raw.body || raw.title);
  const rules = [
    { event_type: "restock", event_label: "再入荷", reason: "restock_keyword", keywords: ["restock", "再入荷", "再販", "入荷再開", "入荷"] },
    { event_type: "replenishment", event_label: "補充", reason: "replenishment_keyword", keywords: ["replenish", "補充", "追加", "入れ替え"] },
  ];

  for (const rule of rules) {
    const keyword = rule.keywords.find((entry) => body.includes(normalizeSignalKeyword(entry)));
    if (keyword) return { ...rule, keywords: [keyword] };
  }

  return { event_type: "unknown", event_label: "unknown", reason: body ? "no_restock_keyword" : "empty_text", keywords: [] };
}

function inferStockReport(raw = {}) {
  const body = normalizedSignalText(raw.status || raw.status_label || raw.statusLabel || raw.text || raw.body || raw.title);
  const rules = [
    { status: STOCK_STATUSES.SOLD_OUT, status_label: "売り切れ", reason: "sold_out_keyword", keywords: ["soldout", "sold_out", "売り切れ", "完売", "在庫なし", "品切れ"] },
    { status: STOCK_STATUSES.LOW, status_label: "残り少ない", reason: "low_stock_keyword", keywords: ["low", "low_stock", "残り少ない", "残りわずか", "残少", "少なめ"] },
    { status: STOCK_STATUSES.RESTOCKED, status_label: "補充あり", reason: "restocked_keyword", keywords: ["restocked", "再入荷", "補充", "入荷しました"] },
    { status: STOCK_STATUSES.IN_STOCK, status_label: "在庫あり", reason: "in_stock_keyword", keywords: ["in_stock", "在庫あり", "在庫有", "まだあります", "販売中"] },
  ];

  for (const rule of rules) {
    const keyword = rule.keywords.find((entry) => body.includes(normalizeSignalKeyword(entry)));
    if (keyword) return { ...rule, keywords: [keyword] };
  }

  return { status: STOCK_STATUSES.UNKNOWN, status_label: "unknown", reason: body ? "no_stock_keyword" : "empty_text", keywords: [] };
}

function inferXIntentTags(value = "") {
  const body = String(value);
  const tags = [];
  if (/全部欲しい|全部ほしい|全種|コンプ|コンプリート|セットで欲しい/.test(body)) tags.push(X_INTENT_TAGS.COMPLETE_DEMAND);
  if (/だけ欲しい|だけほしい|単品|当たり|推し|シークレット|レア/.test(body)) tags.push(X_INTENT_TAGS.ACE_DEMAND);
  if (/回したい|回す|絶対やる|見つけたら|欲しい/.test(body)) tags.push(X_INTENT_TAGS.ATTENTION);
  if (/ドール|ねんどろ|シルバニア|1\/12|フィギュア小物/.test(body)) tags.push(X_INTENT_TAGS.DOLL_COMPATIBILITY);
  if (/ミニチュア|小物|飾れる|撮影|ジオラマ/.test(body)) tags.push(X_INTENT_TAGS.MINIATURE_COMPATIBILITY);
  return [...new Set(tags)];
}

function normalizeStockStatus(value) {
  const status = text(value);
  if (["in_stock", "在庫あり"].includes(status)) return STOCK_STATUSES.IN_STOCK;
  if (["low", "少ない", "残り少なめ"].includes(status)) return STOCK_STATUSES.LOW;
  if (["sold_out", "売り切れ"].includes(status)) return STOCK_STATUSES.SOLD_OUT;
  if (["restocked", "補充", "再入荷"].includes(status)) return STOCK_STATUSES.RESTOCKED;
  return STOCK_STATUSES.UNKNOWN;
}

function normalizeSourceType(value) {
  const source = text(value).toLowerCase();
  if (["official_site", "officialsite", "official", "maker", "manufacturer"].includes(source)) return SOURCE_TYPES.OFFICIAL_SITE;
  if (["official_x", "officialx"].includes(source)) return SOURCE_TYPES.OFFICIAL_X;
  if (["shop_x", "shopx", "store_x", "storex"].includes(source)) return SOURCE_TYPES.SHOP_X;
  if (["user_x", "userx", "x", "twitter"].includes(source)) return SOURCE_TYPES.USER_X;
  if (source === SOURCE_TYPES.MARKETPLACE) return SOURCE_TYPES.MARKETPLACE;
  return SOURCE_TYPES.USER_X;
}

function normalizedSignalText(value = "") {
  return normalizeSignalKeyword(text(value));
}

function normalizeSignalKeyword(value = "") {
  return String(value).trim().toLowerCase().replace(/[\s_・･-]+/g, "");
}

function normalizeMarketStatus(value) {
  const status = text(value);
  if (["sold", "sold_out", "soldout", "売り切れ", "売却済み", "sold済み"].includes(status)) return "sold";
  if (["pre_release", "予約", "発売前"].includes(status)) return "pre_release";
  return status || "active";
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
  const matched = raw.match(/([1-5１２３４５一二三四五])/);
  if (!matched) return raw;
  const numberMap = { "１": "1", "２": "2", "３": "3", "４": "4", "５": "5", "一": "1", "二": "2", "三": "3", "四": "4", "五": "5" };
  return `第${numberMap[matched[1]] || matched[1]}週`;
}

function resolveVariantFromText(raw = {}, catalog = {}) {
  if (raw.variant_id || raw.variantId) {
    const explicit = text(raw.variant_id || raw.variantId);
    return catalog.variants?.find((variant) => variant.id === explicit || variant.slug === explicit) ?? null;
  }

  const body = text(raw.text || raw.body || raw.title || raw.name || raw.shop_name);
  if (!body) return null;
  const lower = body.toLowerCase();
  return catalog.variants?.find((variant) => {
    const names = [variant.name, variant.variant_name, variant.slug].filter(Boolean).map((name) => String(name).toLowerCase());
    return names.some((name) => name && lower.includes(name));
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

function createOfficialPlaceholderImage(label) {
  const safeLabel = escapeXml(label);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900">
      <rect width="900" height="900" rx="64" fill="#f8fafc" />
      <rect x="150" y="170" width="600" height="520" rx="56" fill="#ffffff" stroke="#e5e7eb" stroke-width="3" />
      <circle cx="450" cy="378" r="142" fill="#dbeafe" />
      <rect x="298" y="552" width="304" height="42" rx="21" fill="#111827" />
      <text x="450" y="735" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="800" fill="#111827">${safeLabel}</text>
      <text x="450" y="790" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#64748b">Official product image pending</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
