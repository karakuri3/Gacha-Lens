export function formatSeries(item) {
  if (!item) return null;

  return {
    id: item.id,
    name: item.name,
    slug: item.slug,
    category: item.category,
    description: item.description,
    releaseDate: item.release_date,
    releaseOrder: item.release_order,
    price: item.price,
    itemCount: item.item_count,
    singlePrice: item.single_price,
    completePrice: item.complete_price,
    marketNote: item.market_note,
    selloutForecast: item.sellout_forecast,
    forecastReason: item.forecast_reason,
  };
}

export function formatSeriesList(data) {
  if (!Array.isArray(data)) return [];
  return data.map(formatSeries);
}

export function formatLineupList(data) {
  if (!Array.isArray(data)) return [];
  return data.map((item) => ({
    id: item.id,
    seriesSlug: item.series_slug,
    itemName: item.item_name,
    displayOrder: item.display_order,
  }));
}

export function formatPriceHistoryList(data) {
  if (!Array.isArray(data)) return [];

  return data.map((item) => ({
    id: item.id,
    seriesSlug: item.series_slug,
    recordedDate: item.recorded_date,
    singlePriceMin: item.single_price_min,
    singlePriceMax: item.single_price_max,
    completePriceMin: item.complete_price_min,
    completePriceMax: item.complete_price_max,
    note: item.note,
    createdAt: item.created_at,
  }));
}

export function formatRestockInfo(item) {
  if (!item) return null;

  return {
    id: item.id,
    seriesSlug: item.series_slug,
    restockStatus: item.restock_status,
    expectedRestockDate: item.expected_restock_date,
    restockNote: item.restock_note,
    updatedAt: item.updated_at,
  };
}

export function formatStockReport(item) {
  if (!item) return null;

  return {
    id: item.id,
    seriesSlug: item.series_slug,
    reportDate: item.report_date,
    prefecture: item.prefecture,
    storeName: item.store_name,
    stockStatus: item.stock_status,
    note: item.note,
    createdAt: item.created_at,
  };
}

export function formatStockReportList(data) {
  if (!Array.isArray(data)) return [];
  return data.map(formatStockReport);
}