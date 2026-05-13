import { analyzePriceHistory } from "./series-analytics";
import { analyzeStockReports } from "./stock-analytics";
import { buildSelloutForecast } from "./sellout-forecast";

export function enrichSeriesListWithInsights(
  seriesList,
  priceHistoryMap = {},
  restockInfoMap = {},
  stockReportMap = {}
) {
  if (!Array.isArray(seriesList)) {
    return [];
  }

  return seriesList.map((series) => {
    const priceHistory = priceHistoryMap[series.slug] ?? [];
    const restockInfo = restockInfoMap[series.slug] ?? null;
    const stockReports = stockReportMap[series.slug] ?? [];

    const priceAnalysis = analyzePriceHistory(priceHistory);
    const stockAnalysis = analyzeStockReports(stockReports);
    const autoForecast = buildSelloutForecast(
      series,
      priceHistory,
      restockInfo,
      stockReports
    );

    return {
      ...series,
      priceHistory,
      restockInfo,
      stockReports,
      priceAnalysis,
      stockAnalysis,
      autoForecast,
    };
  });
}