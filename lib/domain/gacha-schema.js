export const LISTING_TYPES = {
  SINGLE: "single",
  RARE_SINGLE: "rare_single",
  SECRET_SINGLE: "secret_single",
  COMPLETE_SET: "complete_set",
  PARTIAL_SET: "partial_set",
  POPULAR_SET: "popular_set",
  SEALED_BULK: "sealed_bulk",
  LOOSE_BULK: "loose_bulk",
  UNKNOWN: "unknown",
};

export const LISTING_TYPE_LABELS = {
  [LISTING_TYPES.SINGLE]: "単品",
  [LISTING_TYPES.RARE_SINGLE]: "レア単品",
  [LISTING_TYPES.SECRET_SINGLE]: "シークレット単品",
  [LISTING_TYPES.COMPLETE_SET]: "コンプセット",
  [LISTING_TYPES.PARTIAL_SET]: "一部セット",
  [LISTING_TYPES.POPULAR_SET]: "人気キャラセット",
  [LISTING_TYPES.SEALED_BULK]: "未開封まとめ",
  [LISTING_TYPES.LOOSE_BULK]: "バラまとめ",
  [LISTING_TYPES.UNKNOWN]: "要確認",
};

export const SOURCE_TYPES = {
  OFFICIAL: "official",
  OFFICIAL_X: "official_x",
  SHOP_X: "shop_x",
  USER_X: "user_x",
  MARKETPLACE: "marketplace",
};

export const SOURCE_WEIGHTS = {
  [SOURCE_TYPES.OFFICIAL]: 1,
  [SOURCE_TYPES.OFFICIAL_X]: 0.92,
  [SOURCE_TYPES.SHOP_X]: 0.76,
  [SOURCE_TYPES.USER_X]: 0.48,
  [SOURCE_TYPES.MARKETPLACE]: 0.62,
};

export const STOCK_STATUSES = {
  IN_STOCK: "in_stock",
  LOW: "low",
  SOLD_OUT: "sold_out",
  RESTOCKED: "restocked",
  UNKNOWN: "unknown",
};

export const DB_TABLES = {
  SERIES: "series",
  VARIANTS: "variants",
  MARKET_LISTINGS: "market_listings",
  RESTOCK_EVENTS: "restock_events",
  STOCK_REPORTS: "stock_reports",
  X_REACTIONS: "x_reactions",
  IMPORT_ISSUES: "import_issues",
};

export const IMPORT_ISSUE_TYPES = {
  UNKNOWN_VARIANT: "unknown_variant",
  UNKNOWN_LISTING_TYPE: "unknown_listing_type",
  MISSING_VARIANTS: "missing_variants",
  LOW_CONFIDENCE: "low_confidence",
  INVALID_RECORD: "invalid_record",
};
