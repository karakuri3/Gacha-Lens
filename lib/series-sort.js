export const SERIES_SORT_OPTIONS = [
  { value: "release", label: "発売順" },
  { value: "score", label: "注目順" },
  { value: "trend", label: "相場上昇順" },
  { value: "single-price", label: "単品相場が高い順" },
  { value: "stock-pressure", label: "品薄順" },
];

export function normalizeSeriesSortKey(value) {
  const validValues = SERIES_SORT_OPTIONS.map((option) => option.value);
  return validValues.includes(value) ? value : "release";
}

export function sortSeriesList(seriesList, sortKey = "release") {
  const normalizedSortKey = normalizeSeriesSortKey(sortKey);
  const list = [...(seriesList ?? [])];

  if (normalizedSortKey === "score") {
    return list.sort((a, b) => {
      const scoreDiff =
        (b.autoForecast?.score ?? 0) - (a.autoForecast?.score ?? 0);

      if (scoreDiff !== 0) return scoreDiff;

      const stockPressureDiff =
        getStockPressureWeight(b) - getStockPressureWeight(a);
      if (stockPressureDiff !== 0) return stockPressureDiff;

      const trendDiff = getTrendWeight(b) - getTrendWeight(a);
      if (trendDiff !== 0) return trendDiff;

      return (a.releaseOrder ?? 9999) - (b.releaseOrder ?? 9999);
    });
  }

  if (normalizedSortKey === "trend") {
    return list.sort((a, b) => {
      const trendDiff = getTrendWeight(b) - getTrendWeight(a);
      if (trendDiff !== 0) return trendDiff;

      const scoreDiff =
        (b.autoForecast?.score ?? 0) - (a.autoForecast?.score ?? 0);
      if (scoreDiff !== 0) return scoreDiff;

      const stockPressureDiff =
        getStockPressureWeight(b) - getStockPressureWeight(a);
      if (stockPressureDiff !== 0) return stockPressureDiff;

      return (a.releaseOrder ?? 9999) - (b.releaseOrder ?? 9999);
    });
  }

  if (normalizedSortKey === "single-price") {
    return list.sort((a, b) => {
      const priceDiff =
        getSinglePriceAverage(b) - getSinglePriceAverage(a);

      if (priceDiff !== 0) return priceDiff;

      const scoreDiff =
        (b.autoForecast?.score ?? 0) - (a.autoForecast?.score ?? 0);
      if (scoreDiff !== 0) return scoreDiff;

      return (a.releaseOrder ?? 9999) - (b.releaseOrder ?? 9999);
    });
  }

  if (normalizedSortKey === "stock-pressure") {
    return list.sort((a, b) => {
      const stockPressureDiff =
        getStockPressureWeight(b) - getStockPressureWeight(a);
      if (stockPressureDiff !== 0) return stockPressureDiff;

      const scoreDiff =
        (b.autoForecast?.score ?? 0) - (a.autoForecast?.score ?? 0);
      if (scoreDiff !== 0) return scoreDiff;

      const trendDiff = getTrendWeight(b) - getTrendWeight(a);
      if (trendDiff !== 0) return trendDiff;

      return (a.releaseOrder ?? 9999) - (b.releaseOrder ?? 9999);
    });
  }

  return list.sort((a, b) => {
    return (a.releaseOrder ?? 9999) - (b.releaseOrder ?? 9999);
  });
}

function getTrendWeight(series) {
  const trend = series?.priceAnalysis?.trend;

  if (trend === "up") return 3;
  if (trend === "stable") return 2;
  if (trend === "down") return 1;

  return 0;
}

function getStockPressureWeight(series) {
  const pressureLevel = series?.stockAnalysis?.pressureLevel;

  if (pressureLevel === "very-high") return 4;
  if (pressureLevel === "high") return 3;
  if (pressureLevel === "medium") return 2;
  if (pressureLevel === "low") return 1;

  return 0;
}

function getSinglePriceAverage(series) {
  const latestText = series?.priceAnalysis?.latestSingleText;
  const fallbackText = series?.singlePrice;

  return parseRangeAverage(latestText || fallbackText);
}

function parseRangeAverage(text) {
  if (typeof text !== "string") return 0;

  const numbers = text.match(/\d+/g);

  if (!numbers || numbers.length === 0) {
    return 0;
  }

  const values = numbers.map(Number);

  if (values.length === 1) {
    return values[0];
  }

  return Math.round((values[0] + values[1]) / 2);
}