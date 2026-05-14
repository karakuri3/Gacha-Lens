import { mockMarketListings, mockRestockEvents, mockStockReports, mockXReactions } from "./mock-gacha-records";
import { marketListingsRaw } from "./market-input";
import { officialProducts, officialSchedule } from "./official-input";
import { restockEventsRaw, stockReportsRaw } from "./stock-input";
import { xReactionsRaw } from "./x-input";
import { createRepositoryRecords } from "./ingestion-adapters";

export function createOfficialFirstRecords({
  schedule = officialSchedule,
  products = officialProducts,
  marketRaw = marketListingsRaw,
  xRaw = xReactionsRaw,
  restockRaw = restockEventsRaw,
  stockRaw = stockReportsRaw,
  keepMockSignals = false,
} = {}) {
  const officialRecords = createRepositoryRecords({
    officialSchedule: schedule,
    officialProducts: products,
    marketListingsRaw: marketRaw,
    xReactionsRaw: xRaw,
    restockEventsRaw: restockRaw,
    stockReportsRaw: stockRaw,
  });

  if (!keepMockSignals) return officialRecords;

  return createRepositoryRecords({
    baseRecords: {
      series: officialRecords.series,
      variants: officialRecords.variants,
      importIssues: officialRecords.importIssues,
      marketListings: mockMarketListings,
      restockEvents: mockRestockEvents,
      stockReports: mockStockReports,
      xReactions: mockXReactions,
    },
  });
}

export function hasOfficialInput() {
  return officialSchedule.length > 0 || officialProducts.length > 0;
}
