export function analyzePriceHistory(priceHistory) {
  if (!Array.isArray(priceHistory) || priceHistory.length === 0) {
    return {
      hasHistory: false,
      trend: "不明",
      trendLabel: "履歴なし",
      singleChangeText: "データなし",
      completeChangeText: "データなし",
      latestSingleText: "データなし",
      latestCompleteText: "データなし",
      summaryText: "相場履歴がまだないため、動きを判定できません。",
    };
  }

  const sortedHistory = [...priceHistory].sort((a, b) => {
    return new Date(a.recordedDate) - new Date(b.recordedDate);
  });

  const first = sortedHistory[0];
  const latest = sortedHistory[sortedHistory.length - 1];

  const firstSingleAvg =
    safeAverage(first.singlePriceMin, first.singlePriceMax);
  const latestSingleAvg =
    safeAverage(latest.singlePriceMin, latest.singlePriceMax);

  const firstCompleteAvg =
    safeAverage(first.completePriceMin, first.completePriceMax);
  const latestCompleteAvg =
    safeAverage(latest.completePriceMin, latest.completePriceMax);

  const singleDiff = latestSingleAvg - firstSingleAvg;
  const completeDiff = latestCompleteAvg - firstCompleteAvg;

  const trend = judgeTrend(singleDiff, completeDiff);

  return {
    hasHistory: true,
    trend,
    trendLabel: getTrendLabel(trend),
    singleChangeText: formatDiff(singleDiff),
    completeChangeText: formatDiff(completeDiff),
    latestSingleText: formatRange(
      latest.singlePriceMin,
      latest.singlePriceMax
    ),
    latestCompleteText: formatRange(
      latest.completePriceMin,
      latest.completePriceMax
    ),
    summaryText: buildSummaryText({
      trend,
      firstDate: first.recordedDate,
      latestDate: latest.recordedDate,
      singleDiff,
      completeDiff,
    }),
  };
}

function safeAverage(min, max) {
  const safeMin = Number(min ?? 0);
  const safeMax = Number(max ?? 0);
  return Math.round((safeMin + safeMax) / 2);
}

function judgeTrend(singleDiff, completeDiff) {
  const threshold = 50;

  if (singleDiff >= threshold || completeDiff >= threshold) {
    return "up";
  }

  if (singleDiff <= -threshold || completeDiff <= -threshold) {
    return "down";
  }

  return "stable";
}

function getTrendLabel(trend) {
  if (trend === "up") return "上昇";
  if (trend === "down") return "下落";
  return "横ばい";
}

function formatDiff(value) {
  if (value > 0) return `+${value}円`;
  if (value < 0) return `${value}円`;
  return "±0円";
}

function formatRange(min, max) {
  return `${min}円〜${max}円`;
}

function buildSummaryText({
  trend,
  firstDate,
  latestDate,
  singleDiff,
  completeDiff,
}) {
  const trendLabel = getTrendLabel(trend);

  return `${firstDate} と ${latestDate} を比べると、相場は「${trendLabel}」傾向です。単品平均は ${formatDiff(
    singleDiff
  )}、コンプ平均は ${formatDiff(completeDiff)} の変化です。`;
}