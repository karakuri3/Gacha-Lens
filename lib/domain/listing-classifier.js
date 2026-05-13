import { IMPORT_ISSUE_TYPES, LISTING_TYPES, MARKET_REVIEW_TYPES } from "./gacha-schema";

const TYPE_RULES = [
  {
    type: LISTING_TYPES.SECRET_SINGLE,
    keywords: ["シークレット", "シクレ", "secret", "sec", "隠し"],
  },
  {
    type: LISTING_TYPES.RARE_SINGLE,
    keywords: ["レア", "rare", "限定カラー", "リカラー", "クリアカラー", "特別"],
  },
  {
    type: LISTING_TYPES.COMPLETE_SET,
    keywords: ["コンプ", "コンプリート", "全種", "フルセット", "complete", "full set"],
  },
  {
    type: LISTING_TYPES.PARTIAL_SET,
    keywords: ["2種", "3種", "4種", "一部", "セット"],
  },
  {
    type: LISTING_TYPES.SEALED_BULK,
    keywords: ["未開封", "まとめ", "大量"],
  },
  {
    type: LISTING_TYPES.LOOSE_BULK,
    keywords: ["バラ", "まとめ"],
  },
];

export function classifyListingTitle(title = "") {
  const normalized = String(title).toLowerCase();
  if (!normalized) return LISTING_TYPES.UNKNOWN;

  for (const rule of TYPE_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))) {
      return rule.type;
    }
  }

  return LISTING_TYPES.UNKNOWN;
}

export function classifyMarketListing(rawListing = {}, catalog = {}) {
  const explicit = rawListing.listing_type || rawListing.listingType;
  if (explicit && Object.values(LISTING_TYPES).includes(explicit)) return explicit;
  if (explicit === MARKET_REVIEW_TYPES.FULL_SET) return LISTING_TYPES.COMPLETE_SET;
  if (explicit === MARKET_REVIEW_TYPES.RARE_OR_SECRET) return LISTING_TYPES.RARE_SINGLE;

  const titleType = classifyListingTitle(rawListing.title || rawListing.name || "");
  if (titleType !== LISTING_TYPES.UNKNOWN) return titleType;

  const matchedVariant = resolveVariantFromListing(rawListing, catalog);
  return matchedVariant ? LISTING_TYPES.SINGLE : LISTING_TYPES.UNKNOWN;
}

export function toMarketReviewType(listingType) {
  if (listingType === LISTING_TYPES.SINGLE) return MARKET_REVIEW_TYPES.SINGLE;
  if ([LISTING_TYPES.RARE_SINGLE, LISTING_TYPES.SECRET_SINGLE].includes(listingType)) return MARKET_REVIEW_TYPES.RARE_OR_SECRET;
  if (listingType === LISTING_TYPES.COMPLETE_SET) return MARKET_REVIEW_TYPES.FULL_SET;
  if ([LISTING_TYPES.PARTIAL_SET, LISTING_TYPES.POPULAR_SET].includes(listingType)) return MARKET_REVIEW_TYPES.PARTIAL_SET;
  return MARKET_REVIEW_TYPES.UNKNOWN;
}

export function resolveVariantFromListing(rawListing = {}, catalog = {}) {
  const variants = catalog.variants ?? [];
  const explicitId = rawListing.variant_id || rawListing.variantId;
  if (explicitId) {
    return variants.find((variant) => variant.id === explicitId || variant.slug === explicitId) ?? null;
  }

  const title = String(rawListing.title || rawListing.name || "").toLowerCase();
  if (!title) return null;

  return variants.find((variant) => {
    const names = [variant.name, variant.variant_name, variant.slug].filter(Boolean).map((value) => String(value).toLowerCase());
    return names.some((name) => name && title.includes(name));
  }) ?? null;
}

export function resolveSeriesFromListing(rawListing = {}, catalog = {}) {
  const series = catalog.series ?? [];
  const explicitId = rawListing.series_id || rawListing.seriesId;
  if (explicitId) {
    return series.find((entry) => entry.id === explicitId || entry.slug === explicitId) ?? null;
  }

  const title = String(rawListing.title || rawListing.name || "").toLowerCase();
  if (!title) return null;

  return series.find((entry) => {
    const names = [entry.name, entry.slug, entry.franchise].filter(Boolean).map((value) => String(value).toLowerCase());
    return names.some((name) => name && title.includes(name));
  }) ?? null;
}

export function createListingImportIssue(rawListing = {}, reason = IMPORT_ISSUE_TYPES.UNKNOWN_LISTING_TYPE) {
  return {
    id: `issue-market-${rawListing.id || rawListing.source_url || rawListing.title || Date.now()}`.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 120),
    issue_type: reason,
    table_name: "market_listings",
    source: rawListing.source || "mercari",
    source_url: rawListing.source_url || rawListing.url || "",
    raw: rawListing,
    resolved: false,
    note: reason === IMPORT_ISSUE_TYPES.UNKNOWN_VARIANT ? "公式variant_idへ手動紐付けが必要" : "listing_typeを人間が確認してください",
  };
}
