import { IMPORT_ISSUE_TYPES, LISTING_TYPES, MARKET_REVIEW_TYPES } from "./gacha-schema";

const TYPE_RULES = [
  {
    type: LISTING_TYPES.SECRET_SINGLE,
    reason: "secret_keyword",
    confidence: 0.88,
    keywords: ["シークレット", "シクレ", "secret", "sec", "隠し", "レア枠"],
  },
  {
    type: LISTING_TYPES.RARE_SINGLE,
    reason: "rare_keyword",
    confidence: 0.82,
    keywords: ["レア", "rare", "限定カラー", "レアカラー", "リカラー", "クリアカラー", "特別", "当たり"],
  },
  {
    type: LISTING_TYPES.COMPLETE_SET,
    reason: "full_set_keyword",
    confidence: 0.92,
    keywords: ["コンプ", "コンプリート", "全種", "フルセット", "complete", "fullset", "full set"],
  },
  {
    type: LISTING_TYPES.PARTIAL_SET,
    reason: "semi_complete_keyword",
    confidence: 0.78,
    keywords: ["セミコンプ", "準コンプ"],
  },
  {
    type: LISTING_TYPES.PARTIAL_SET,
    reason: "partial_set_keyword",
    confidence: 0.72,
    keywords: ["2種", "3種", "4種", "2点", "3点", "4点", "二種", "三種", "四種", "一部", "セット", "よりどり", "まとめ"],
  },
  {
    type: LISTING_TYPES.SEALED_BULK,
    reason: "sealed_bulk_keyword",
    confidence: 0.48,
    keywords: ["未開封", "カプセル未開封", "袋未開封", "大量"],
  },
  {
    type: LISTING_TYPES.LOOSE_BULK,
    reason: "loose_bulk_keyword",
    confidence: 0.38,
    keywords: ["バラ", "まとめ", "まとめ売り"],
  },
];

const TITLE_ALIASES = [
  { aliases: ["リンレン", "リン・レン", "リン&レン", "リン レン"], names: ["鏡音リン", "鏡音レン"] },
  { aliases: ["ミクさん", "miku"], names: ["初音ミク"] },
  { aliases: ["パンどろぼうチクタク", "パンどろぼう チクタク", "チクタク"], names: ["パンどろぼう（チクタク）"] },
  { aliases: ["パンどろぼうやめられない", "やめられない"], names: ["パンどろぼう（やめられない）"] },
  { aliases: ["パンどろぼうへんしん", "へんしんだ"], names: ["パンどろぼう（へんしん）"] },
  { aliases: ["パンどろぼうやい"], names: ["パンどろぼう（やい）"] },
];

export function classifyListingTitle(title = "") {
  return classifyListingTitleDetailed(title).listing_type;
}

export function classifyListingTitleDetailed(title = "") {
  const normalized = normalize(title);
  if (!normalized) return classification(LISTING_TYPES.UNKNOWN, "empty_title", {}, 0.1);

  for (const rule of TYPE_RULES) {
    const keyword = rule.keywords.find((entry) => normalized.includes(normalize(entry)));
    if (keyword) return classification(rule.type, rule.reason, { matched_keywords: [keyword] }, rule.confidence);
  }

  return classification(LISTING_TYPES.UNKNOWN, "no_type_keyword", {}, 0.2);
}

export function classifyMarketListing(rawListing = {}, catalog = {}) {
  return classifyMarketListingDetailed(rawListing, catalog).listing_type;
}

export function classifyMarketListingDetailed(rawListing = {}, catalog = {}) {
  const explicit = rawListing.listing_type || rawListing.listingType;
  if (explicit && Object.values(LISTING_TYPES).includes(explicit)) {
    return classification(explicit, "explicit_listing_type", {}, 0.95);
  }
  if (explicit === MARKET_REVIEW_TYPES.FULL_SET) return classification(LISTING_TYPES.COMPLETE_SET, "explicit_review_type", {}, 0.95);
  if (explicit === MARKET_REVIEW_TYPES.RARE_OR_SECRET) return classification(LISTING_TYPES.RARE_SINGLE, "explicit_review_type", {}, 0.9);

  const title = rawListing.title || rawListing.name || "";
  const titleResult = classifyListingTitleDetailed(title);
  const allowFranchiseVariant = titleResult.listing_type === LISTING_TYPES.UNKNOWN && shouldAllowFranchiseVariantForSingle(title, catalog);
  const matchedVariants = resolveVariantsFromListing(rawListing, catalog, { allowFranchiseVariant });

  if (titleResult.listing_type === LISTING_TYPES.COMPLETE_SET) {
    return classification(
      LISTING_TYPES.COMPLETE_SET,
      titleResult.reason,
      {
        ...titleResult.details,
        matched_variant_ids: matchedVariants.map((variant) => variant.id),
      },
      titleResult.confidence
    );
  }

  if (titleResult.listing_type === LISTING_TYPES.PARTIAL_SET || matchedVariants.length > 1) {
    const reason = matchedVariants.length > 1 ? "multiple_variants_detected" : titleResult.reason;
    return classification(
      LISTING_TYPES.PARTIAL_SET,
      reason,
      {
        ...titleResult.details,
        matched_variant_ids: matchedVariants.map((variant) => variant.id),
      },
      Math.max(titleResult.confidence, matchedVariants.length > 1 ? 0.82 : 0)
    );
  }

  if ([LISTING_TYPES.RARE_SINGLE, LISTING_TYPES.SECRET_SINGLE].includes(titleResult.listing_type)) {
    return classification(
      titleResult.listing_type,
      titleResult.reason,
      {
        ...titleResult.details,
        matched_variant_ids: matchedVariants.map((variant) => variant.id),
      },
      titleResult.confidence
    );
  }

  if (matchedVariants.length === 1) {
    return classification(LISTING_TYPES.SINGLE, "single_variant_detected", {
      matched_variant_ids: [matchedVariants[0].id],
      matched_keywords: getVariantMatchTerms(matchedVariants[0], title, catalog),
    }, 0.86);
  }

  const matchedSeries = resolveSeriesFromListing(rawListing, catalog);
  if (matchedSeries) {
    return classification(LISTING_TYPES.UNKNOWN, "series_only_match", {
      matched_series_id: matchedSeries.id,
      matched_keywords: getSeriesMatchTerms(matchedSeries, title),
    }, 0.32);
  }

  return classification(LISTING_TYPES.UNKNOWN, titleResult.reason, titleResult.details, titleResult.confidence);
}

export function toMarketReviewType(listingType) {
  if (listingType === LISTING_TYPES.SINGLE) return MARKET_REVIEW_TYPES.SINGLE;
  if ([LISTING_TYPES.RARE_SINGLE, LISTING_TYPES.SECRET_SINGLE].includes(listingType)) return MARKET_REVIEW_TYPES.RARE_OR_SECRET;
  if (listingType === LISTING_TYPES.COMPLETE_SET) return MARKET_REVIEW_TYPES.FULL_SET;
  if ([LISTING_TYPES.PARTIAL_SET, LISTING_TYPES.POPULAR_SET].includes(listingType)) return MARKET_REVIEW_TYPES.PARTIAL_SET;
  return MARKET_REVIEW_TYPES.UNKNOWN;
}

export function resolveVariantFromListing(rawListing = {}, catalog = {}) {
  const title = rawListing.title || rawListing.name || "";
  return resolveVariantsFromListing(rawListing, catalog, { allowFranchiseVariant: shouldAllowFranchiseVariantForSingle(title, catalog) })[0] ?? null;
}

export function resolveVariantsFromListing(rawListing = {}, catalog = {}, options = {}) {
  const variants = catalog.variants ?? [];
  const title = normalize(expandAliases(rawListing.title || rawListing.name || ""));
  const explicitId = rawListing.variant_id || rawListing.variantId;
  if (explicitId) {
    const explicit = variants.find((variant) => variant.id === explicitId || variant.slug === explicitId);
    const additional = variants.filter((variant) => {
      if (variant.id === explicit?.id) return false;
      if (!options.allowFranchiseVariant && isFranchiseNameVariant(variant, catalog) && !franchiseVariantAppearsExplicitly(variant, title)) return false;
      return variantMatchesTitle(variant, title, catalog, options);
    });
    return explicit ? dedupeById([explicit, ...additional]) : dedupeById(additional);
  }

  if (!title) return [];

  const matched = variants.filter((variant) => {
    if (!options.allowFranchiseVariant && isFranchiseNameVariant(variant, catalog) && !franchiseVariantAppearsExplicitly(variant, title)) return false;
    return variantMatchesTitle(variant, title, catalog, options);
  });
  return dedupeById(matched);
}

export function resolveSeriesFromListing(rawListing = {}, catalog = {}) {
  const series = catalog.series ?? [];
  const explicitId = rawListing.series_id || rawListing.seriesId;
  if (explicitId) {
    return series.find((entry) => entry.id === explicitId || entry.slug === explicitId) ?? null;
  }

  const title = normalize(rawListing.title || rawListing.name || "");
  if (!title) return null;

  return series.find((entry) => getSeriesTerms(entry).some((term) => term && title.includes(term))) ?? null;
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
    note: reason === IMPORT_ISSUE_TYPES.UNKNOWN_VARIANT ? "variant_id への手動紐付けが必要" : "listing_type を人間が確認してください",
  };
}

function variantMatchesTitle(variant, normalizedTitle, catalog = {}, options = {}) {
  return getVariantTerms(variant, catalog, options).some((term) => term && normalizedTitle.includes(term));
}

function getVariantMatchTerms(variant, title, catalog = {}) {
  const normalizedTitle = normalize(expandAliases(title));
  return getVariantTerms(variant, catalog, { allowFranchiseVariant: true }).filter((term) => term && normalizedTitle.includes(term));
}

function getSeriesMatchTerms(series, title) {
  const normalizedTitle = normalize(title);
  return getSeriesTerms(series).filter((term) => term && normalizedTitle.includes(term));
}

function getVariantTerms(variant, catalog = {}, options = {}) {
  const base = [variant.name, variant.variant_name, variant.slug];
  const aliases = TITLE_ALIASES.filter((entry) => entry.names.some((name) => normalize(name) === normalize(variant.name || variant.variant_name))).flatMap((entry) => entry.aliases);
  const parent = (catalog.series ?? []).find((series) => series.id === variant.series_id);
  const terms = [...base, ...aliases].filter(Boolean).map(normalize).filter(Boolean);

  if (parent && isFranchiseNameVariant(variant, catalog) && !options.allowFranchiseVariant) {
    return terms.filter((term) => term !== normalize(parent.franchise) && term !== normalize(parent.name));
  }

  return terms;
}

function hasSingleKeyword(value = "") {
  const title = normalize(value);
  return ["単品", "ひとつ", "1点", "1種", "一種", "単体"].some((keyword) => title.includes(normalize(keyword)));
}

function shouldAllowFranchiseVariantForSingle(value = "") {
  return hasSingleKeyword(value);
}

function isFranchiseNameVariant(variant, catalog = {}) {
  const parent = (catalog.series ?? []).find((series) => series.id === variant.series_id);
  if (!parent) return false;
  const variantName = normalize(variant.name || variant.variant_name);
  return Boolean(variantName && (variantName === normalize(parent.franchise) || variantName === normalize(parent.name)));
}

function franchiseVariantAppearsExplicitly(variant, normalizedTitle) {
  const term = normalize(variant.name || variant.variant_name);
  if (!term) return false;
  const firstIndex = normalizedTitle.indexOf(term);
  if (firstIndex < 0) return false;
  return normalizedTitle.indexOf(term, firstIndex + term.length) >= 0 || hasSingleKeyword(normalizedTitle);
}

function getSeriesTerms(series = {}) {
  return [series.name, series.slug, series.franchise, series.brand].filter(Boolean).map(normalize).filter(Boolean);
}

function expandAliases(value = "") {
  let expanded = String(value);
  for (const entry of TITLE_ALIASES) {
    for (const alias of entry.aliases) {
      if (normalize(expanded).includes(normalize(alias))) {
        expanded += ` ${entry.names.join(" ")}`;
      }
    }
  }
  return expanded;
}

function classification(listingType, reason, details = {}, confidence = 0.5) {
  return {
    listing_type: listingType,
    market_review_type: toMarketReviewType(listingType),
    reason,
    confidence,
    details,
  };
}

function dedupeById(items = []) {
  return [...new Map(items.filter(Boolean).map((item) => [item.id, item])).values()];
}

function normalize(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s・･\-_/／()（）【】\[\]「」『』!！?？.,，。:：]+/g, "")
    .trim();
}
