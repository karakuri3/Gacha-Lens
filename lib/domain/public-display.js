export function buildReleasedCustomerMetrics(item = {}) {
  return [
    { label: "価格", value: formatYen(item.price) },
    { label: "単品相場", value: formatYen(item.market_price_median ?? item.market_summary?.single), tone: "highlight" },
    { label: "利益目安", value: formatDiff(item.profit_estimate), tone: getDiffTone(item.profit_estimate) },
    { label: "コンプ相場", value: formatYen(item.market_summary?.complete_set) },
    { label: "在庫状況", value: stockStatusLabel(item.stock_summary || item.availability_summary) },
    { label: "売れ行き", value: sellThroughLabel(item.market_summary) },
    { label: "今見るべき度", value: formatScore(watchScore(item)), tone: "highlight" },
  ];
}

export function buildUpcomingCustomerMetrics(item = {}) {
  return [
    { label: "価格", value: formatYen(item.price) },
    { label: "期待値", value: formatScore(item.forecast_score), tone: "highlight" },
    { label: "価格上昇期待", value: formatScore(priceUpsideScore(item)) },
    { label: "品薄予想", value: formatScore(scarcityScore(item)) },
    { label: "狙い目度", value: formatScore(opportunityScore(item)), tone: "highlight" },
    { label: "発売", value: formatSchedule(item) },
  ];
}

export function customerTags(item = {}, isReleased = Boolean(item.is_released)) {
  const tags = [];
  if (isReleased) {
    if (watchScore(item) >= 70) tags.push("今見るべき");
    if (Number.isFinite(item.profit_estimate) && item.profit_estimate > 0) tags.push("利益目安あり");
    if ((item.circulation_score ?? 0) >= 42) tags.push("流通あり");
    if (sellThroughLabel(item.market_summary) !== "データ不足") tags.push("売れ行きあり");
    if (stockStatusLabel(item.stock_summary || item.availability_summary) !== "未取得") tags.push("在庫動きあり");
  } else {
    if (opportunityScore(item) >= 70) tags.push("狙い目");
    if (priceUpsideScore(item) >= 68) tags.push("価格上昇期待");
    if (scarcityScore(item) >= 60) tags.push("品薄予想");
    if ((item.forecast_score ?? 0) >= 70) tags.push("期待値高め");
  }
  return [...new Set(tags)].slice(0, 4);
}

export function watchScore(item = {}) {
  const profitBoost = Math.min(24, Math.max(0, item.profit_estimate ?? 0) / 35);
  return clampScore((item.circulation_score ?? 0) * 0.42 + (item.trend_score ?? 0) * 0.28 + (item.sold_count ?? 0) * 6 + profitBoost);
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

function clampScore(value) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}
