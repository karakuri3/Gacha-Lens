export const RELEASED_METRIC_LABELS = {
  price: "価格",
  singleMarket: "単品相場",
  profit: "利益目安",
  completeSet: "コンプ相場",
  stock: "在庫状況",
  sellThrough: "売れ行き",
  watch: "今見るべき度",
};

export const UPCOMING_METRIC_LABELS = {
  price: "価格",
  forecast: "期待値",
  upside: "価格上昇期待",
  scarcity: "流通少なめ",
  opportunity: "狙い目度",
  release: "発売",
};

export function buildReleasedCustomerMetrics(item = {}) {
  return [
    { label: RELEASED_METRIC_LABELS.price, value: formatYen(item.price) },
    {
      label: RELEASED_METRIC_LABELS.singleMarket,
      value: formatYen(item.market_price_median ?? item.market_summary?.single),
      tone: "highlight",
    },
    { label: RELEASED_METRIC_LABELS.profit, value: formatDiff(item.profit_estimate), tone: getDiffTone(item.profit_estimate) },
    { label: RELEASED_METRIC_LABELS.completeSet, value: formatYen(item.market_summary?.complete_set) },
    { label: RELEASED_METRIC_LABELS.stock, value: stockStatusLabel(item.stock_summary || item.availability_summary) },
    { label: RELEASED_METRIC_LABELS.sellThrough, value: sellThroughLabel(item.market_summary) },
    { label: RELEASED_METRIC_LABELS.watch, value: formatScore(watchScore(item)), tone: "highlight" },
  ];
}

export function buildUpcomingCustomerMetrics(item = {}) {
  return [
    { label: UPCOMING_METRIC_LABELS.price, value: formatYen(item.price) },
    { label: UPCOMING_METRIC_LABELS.forecast, value: formatScore(item.forecast_score), tone: "highlight" },
    { label: UPCOMING_METRIC_LABELS.upside, value: formatScore(priceUpsideScore(item)) },
    { label: UPCOMING_METRIC_LABELS.scarcity, value: formatScore(scarcityScore(item)) },
    { label: UPCOMING_METRIC_LABELS.opportunity, value: formatScore(opportunityScore(item)), tone: "highlight" },
    { label: UPCOMING_METRIC_LABELS.release, value: formatSchedule(item) },
  ];
}

export function customerTags(item = {}, isReleased = Boolean(item.is_released)) {
  const tags = [];
  if (isReleased) {
    if (watchScore(item) >= 70) tags.push("今見るべき");
    if (Number.isFinite(item.profit_estimate) && item.profit_estimate > 0) tags.push("利益あり");
    if ((item.circulation_score ?? 0) >= 42) tags.push("流通あり");
    if (sellThroughLabel(item.market_summary) !== "データ不足") tags.push("売れ行きあり");
    if (stockStatusLabel(item.stock_summary || item.availability_summary) !== "未取得") tags.push("在庫動きあり");
  } else {
    if (opportunityScore(item) >= 70) tags.push("狙い目");
    if (priceUpsideScore(item) >= 68) tags.push("価格上昇期待");
    if (scarcityScore(item) >= 60) tags.push("流通少なめ");
    if ((item.forecast_score ?? 0) >= 70) tags.push("期待値高め");
  }
  return [...new Set(tags)].slice(0, 4);
}

export function isCirculatingItem(item = {}) {
  if (!item?.is_released) return false;
  return hasActionableReleasedSignal(item);
}

export function releasedPriorityScore(item = {}) {
  const market = item.market_summary ?? {};
  const singleStats = market.type_stats?.single ?? {};
  const sold = singleStats.sold_count ?? 0;
  const active = singleStats.active_listing_count ?? 0;
  const stock = item.stock_summary ?? item.availability_summary ?? {};
  const stockMoves = (stock.restock_event_count ?? 0) + (stock.stock_report_count ?? 0);
  const genericPenalty = isGenericVariantName(item) ? 0.62 : 1;

  return (
    watchScore(item) * 12 +
    Math.max(0, item.profit_estimate ?? 0) * 0.75 +
    sold * 34 +
    active * 12 +
    stockMoves * 18
  ) * genericPenalty;
}

export function trendPriorityScore(item = {}) {
  const market = item.market_summary ?? {};
  const stock = item.stock_summary ?? item.availability_summary ?? {};
  const trend = item.trend_score ?? item.trend_summary?.score ?? 0;
  const xCount = item.trend_summary?.x_reaction_count ?? item.x_reactions?.length ?? 0;
  const singleStats = market.type_stats?.single ?? {};
  const sold = singleStats.sold_count ?? 0;
  const active = singleStats.active_listing_count ?? 0;
  const stockMoves = (stock.restock_event_count ?? 0) + (stock.stock_report_count ?? 0);
  const genericPenalty = isGenericVariantName(item) ? 0.64 : 1;

  return (
    trend * 10 +
    xCount * 22 +
    sold * 34 +
    active * 12 +
    stockMoves * 24 +
    Math.max(0, item.profit_estimate ?? 0) * 0.28
  ) * genericPenalty;
}

export function publicTrendTags(item = {}) {
  const market = item.market_summary ?? {};
  const stock = item.stock_summary ?? item.availability_summary ?? {};
  const trend = item.trend_score ?? item.trend_summary?.score ?? 0;
  const xCount = item.trend_summary?.x_reaction_count ?? item.x_reactions?.length ?? 0;
  const singleStats = market.type_stats?.single ?? {};
  const sold = singleStats.sold_count ?? 0;
  const active = singleStats.active_listing_count ?? 0;
  const stockMoves = (stock.restock_event_count ?? 0) + (stock.stock_report_count ?? 0);
  const tags = [];

  if (trend >= 72 || trendPriorityScore(item) >= 720) tags.push("急上昇");
  if (stockMoves > 0) tags.push("在庫動きあり");
  if (xCount > 0 || (item.x_signal_score ?? 0) >= 18) tags.push("SNS反応あり");
  if ((market.type_stats?.single?.sold_count ?? 0) > 0 || sold > 0) tags.push("単品需要強め");
  if ((market.type_stats?.complete_set?.sold_count ?? 0) > 0 || (item.complete_set_score ?? 0) >= 65) tags.push("コンプ需要強め");
  if (active >= 3) tags.push("出品増加中");
  if (Number.isFinite(item.profit_estimate) && item.profit_estimate > 0) tags.push("利益あり");

  return [...new Set([...tags, ...(customerTags(item, Boolean(item.is_released)) ?? [])])].slice(0, 5);
}

export function watchScore(item = {}) {
  const profitBoost = Math.min(24, Math.max(0, item.profit_estimate ?? 0) / 35);
  const market = item.market_summary ?? {};
  const singleStats = market.type_stats?.single ?? {};
  const stock = item.stock_summary ?? item.availability_summary ?? {};
  const stockMoves = (stock.restock_event_count ?? 0) + (stock.stock_report_count ?? 0);
  const singleSoldBoost = (singleStats.sold_count ?? 0) * 8;
  const singleActiveBoost = (singleStats.active_listing_count ?? 0) * 3;
  const directMarketBoost = hasDirectSingleMarketSignal(item) ? 18 : 0;
  const genericPenalty = isGenericVariantName(item) ? 0.78 : 1;

  return clampScore(
    ((item.trend_score ?? 0) * 0.32 +
      profitBoost +
      singleSoldBoost +
      singleActiveBoost +
      stockMoves * 5 +
      directMarketBoost) *
      genericPenalty
  );
}

export function opportunityScore(item = {}) {
  return clampScore((item.forecast_score ?? 0) * 0.48 + priceUpsideScore(item) * 0.3 + scarcityScore(item) * 0.22);
}

export function priceUpsideScore(item = {}) {
  const preorder = item.forecast_breakdown?.preorder ?? item.forecast_summary?.preorder ?? 0;
  return clampScore((item.forecast_score ?? 0) * 0.38 + (item.ace_character_score ?? 0) * 0.24 + (item.complete_set_score ?? 0) * 0.18 + preorder * 0.2);
}

export function scarcityScore(item = {}) {
  return clampScore((item.limitedness_score ?? 0) * 0.68 + (item.trend_score ?? 0) * 0.22 + (item.forecast_score ?? 0) * 0.1);
}

export function stockStatusLabel(summary = {}) {
  if (!summary?.has_stock_signal && !summary?.has_restock_signal) return "未取得";
  if (summary.latest_stock_status === "sold_out") return "売り切れ報告";
  if (summary.latest_stock_status === "low") return "残り少なめ";
  if (summary.latest_stock_status === "in_stock") return "在庫あり";
  if (summary.latest_stock_status === "restocked") return "補充あり";
  return "動きあり";
}

export function sellThroughLabel(summary = {}) {
  return summary?.sell_through_signal?.label || "データ不足";
}

export function formatYen(value) {
  return Number.isFinite(value) ? `${Math.round(value).toLocaleString("ja-JP")}円` : "未取得";
}

export function formatDiff(value) {
  if (!Number.isFinite(value)) return "データ不足";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("ja-JP")}円`;
}

export function formatScore(value) {
  return Number.isFinite(value) ? `${Math.round(value)}点` : "データ不足";
}

export function formatSchedule(item = {}) {
  const month = item.schedule_month || "";
  const week = item.schedule_week || "";
  return `${month} ${week ? `${week}より順次` : ""}`.trim() || "未定";
}

export function getDiffTone(value) {
  if (!Number.isFinite(value)) return "";
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "";
}

function hasActionableReleasedSignal(item = {}) {
  const stock = item.stock_summary ?? item.availability_summary ?? {};
  return Boolean(
    hasDirectSingleMarketSignal(item) ||
      Number.isFinite(item.profit_estimate) ||
      stock.has_stock_signal ||
      stock.has_restock_signal
  );
}

function hasDirectSingleMarketSignal(item = {}) {
  const market = item.market_summary ?? {};
  const singleStats = market.type_stats?.single ?? {};
  return Boolean(
    Number.isFinite(item.market_price_median) ||
      Number.isFinite(market.single) ||
      (singleStats.sold_count ?? 0) > 0 ||
      (singleStats.active_listing_count ?? 0) > 0
  );
}

function isGenericVariantName(item = {}) {
  const name = String(item.variant_name || item.name || "").replace(/単品$/, "").trim();
  return /^(variant[-_\s]?\d+|no\.?\s?\d+|[A-FＡ-Ｆ]|[ⒶⒷⒸⒹⒺⒻ])$/i.test(name);
}

function clampScore(value) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}
