import { IMPORT_ISSUE_TYPES, LISTING_TYPES } from "./gacha-schema";

const TYPE_RULES = [
  {
    type: LISTING_TYPES.SECRET_SINGLE,
    keywords: ["シークレット", "secret", "sec", "隠し", "シクレ"],
  },
  {
    type: LISTING_TYPES.RARE_SINGLE,
    keywords: ["レア", "rare", "限定カラー", "リカラー", "クリアカラー"],
  },
  {
    type: LISTING_TYPES.COMPLETE_SET,
    keywords: ["コンプ", "コンプリート", "全種", "フルセット", "complete"],
  },
  {
    type: LISTING_TYPES.POPULAR_SET,
    keywords: ["人気キャラ", "主役", "当たり", "セット"],
    requiresAny: ["ちいかわ", "うさぎ", "ゾロ", "ピカチュウ", "シークレット"],
  },
  {
    type: LISTING_TYPES.SEALED_BULK,
    keywords: ["未開封", "まとめ", "大量"],
  },
  {
    type: LISTING_TYPES.LOOSE_BULK,
    keywords: ["バラ", "まとめ"],
  },
  {
    type: LISTING_TYPES.PARTIAL_SET,
    keywords: ["セット", "2種", "3種", "一部"],
  },
];

export function classifyListingTitle(title = "") {
  const normalized = String(title).toLowerCase();
  if (!normalized) return LISTING_TYPES.UNKNOWN;

  for (const rule of TYPE_RULES) {
    const hasKeyword = rule.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
    const hasRequired = !rule.requiresAny || rule.requiresAny.some((keyword) => normalized.includes(keyword.toLowerCase()));

    if (hasKeyword && hasRequired) {
      return rule.type;
    }
  }

  return LISTING_TYPES.UNKNOWN;
}

export function classifyMarketListing(rawListing = {}, catalog = {}) {
  const explicit = rawListing.listing_type || rawListing.listingType;
  if (explicit && Object.values(LISTING_TYPES).includes(explicit)) {
    return explicit;
  }

  const titleType = classifyListingTitle(rawListing.title || rawListing.name || "");
  if (titleType !== LISTING_TYPES.UNKNOWN) return titleType;

  const matchedVariant = resolveVariantFromListing(rawListing, catalog);
  return matchedVariant ? LISTING_TYPES.SINGLE : LISTING_TYPES.UNKNOWN;
}

export function resolveVariantFromListing(rawListing = {}, catalog = {}) {
  const variants = catalog.variants ?? [];
  const explicitId = rawListing.variant_id || rawListing.variantId;
  if (explicitId) {
    return variants.find((variant) => variant.id === explicitId || variant.slug === explicitId) ?? { id: explicitId };
  }

  const title = String(rawListing.title || rawListing.name || "").toLowerCase();
  if (!title) return null;

  return variants.find((variant) => {
    const names = [variant.name, variant.variant_name, variant.slug].filter(Boolean).map((value) => String(value).toLowerCase());
    return names.some((name) => name && title.includes(name));
  }) ?? null;
}

export function createListingImportIssue(rawListing = {}, reason = IMPORT_ISSUE_TYPES.UNKNOWN_LISTING_TYPE) {
  return {
    id: `issue-market-${rawListing.id || rawListing.source_url || rawListing.title || Date.now()}`.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 120),
    issue_type: reason,
    table_name: "market_listings",
    source: rawListing.source || "market",
    source_url: rawListing.source_url || rawListing.url || "",
    raw: rawListing,
    resolved: false,
    note: reason === IMPORT_ISSUE_TYPES.UNKNOWN_VARIANT ? "variant_idを人間が確認してください" : "listing_typeを人間が確認してください",
  };
}
