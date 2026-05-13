import { mockMarketListings, mockRestockEvents, mockStockReports, mockXReactions } from "./mock-gacha-records";
import { officialProducts, officialSchedule } from "./official-input";
import { createRepositoryRecords } from "./ingestion-adapters";

export function createOfficialFirstRecords({
  schedule = officialSchedule,
  products = officialProducts,
  keepMockSignals = false,
} = {}) {
  const officialRecords = createRepositoryRecords({
    officialSchedule: schedule,
    officialProducts: products,
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
