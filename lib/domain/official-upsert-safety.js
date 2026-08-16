import { isOfficialRereleaseRecord } from "./official-rerelease.js";

export async function loadExistingRealVariantSeriesIdsStrict(fetchRowsImpl) {
  if (typeof fetchRowsImpl !== "function") throw new Error("Official catalog reader is required.");
  let rows;
  try {
    rows = await fetchRowsImpl("variants", {
      select: "series_id",
      params: { variant_type: "neq.provisional" },
    });
  } catch (error) {
    throw new Error(`Existing real variants could not be read; official upsert stopped: ${error.message}`, { cause: error });
  }
  if (!Array.isArray(rows)) throw new Error("Existing real variant catalog is invalid; official upsert stopped.");
  return new Set(rows.map((row) => row?.series_id).filter(Boolean));
}

export function assertLegacyOfficialRecordsSafe(records) {
  const blockedIds = (Array.isArray(records) ? records : [])
    .filter(isOfficialRereleaseRecord)
    .map((record) => String(record?.id || record?.series_id || "unknown"));
  if (blockedIds.length) {
    throw new Error(`Legacy official upsert cannot persist rerelease semantics; use the reviewed bounded official path (${blockedIds.length} record(s)).`);
  }
  return records;
}
