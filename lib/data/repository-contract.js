import { normalizeRecordShape } from "./gacha-repository";

export const GACHA_REPOSITORY_TABLES = [
  "series",
  "variants",
  "marketListings",
  "xReactions",
  "restockEvents",
  "stockReports",
  "importIssues",
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
