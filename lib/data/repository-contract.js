import { normalizeRecordShape } from "./gacha-repository";

export const GACHA_REPOSITORY_TABLES = [
  "series",
  "variants",
  "marketListings",
  "marketObservations",
  "xReactions",
  "restockEvents",
  "stockReports",
  "importIssues",
  "ingestionRuns",
  "communityReports",
];

export function createRecordDataSource({ name = "records", loadRecords }) {
  return {
    name,
    loadRecords() {
      return normalizeRecordShape(typeof loadRecords === "function" ? loadRecords() : {});
    },
  };
}

export function createAsyncRecordDataSource({ name = "records", loadRecords }) {
  return {
    name,
    async loadRecords() {
      return normalizeRecordShape(typeof loadRecords === "function" ? await loadRecords() : {});
    },
  };
}
