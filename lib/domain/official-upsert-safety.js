import { isOfficialRereleaseRecord } from "./official-rerelease.js";

export async function loadExistingRealVariantCatalogStrict(fetchRowsImpl) {
  if (typeof fetchRowsImpl !== "function") throw new Error("Official catalog reader is required.");
  let rows;
  try {
    rows = await fetchRowsImpl("variants", {
      select: "id,series_id,image",
      params: { variant_type: "neq.provisional" },
    });
  } catch (error) {
    throw new Error(`Existing real variants could not be read; official upsert stopped: ${error.message}`, { cause: error });
  }
  if (!Array.isArray(rows)) throw new Error("Existing real variant catalog is invalid; official upsert stopped.");

  const seriesIds = new Set();
  const imageById = new Map();
  for (const row of rows) {
    const id = text(row?.id);
    const seriesId = text(row?.series_id);
    const image = text(row?.image);
    if (seriesId) seriesIds.add(seriesId);
    if (id && image) imageById.set(id, image);
  }
  return { seriesIds, imageById };
}

export async function loadExistingRealVariantSeriesIdsStrict(fetchRowsImpl) {
  return (await loadExistingRealVariantCatalogStrict(fetchRowsImpl)).seriesIds;
}

export function resolveLegacyOfficialVariantImage(raw = {}, existingImage = null) {
  return text(
    raw?.image || raw?.image_url || raw?.imageUrl || raw?.product_image || raw?.thumbnail || existingImage,
  ) || null;
}

export const OFFICIAL_RERELEASE_SKIP_CONFIRMATION = "APPROVE_OFFICIAL_RERELEASE_SKIP_FOR_ONE_TIME_RECOVERY_V1";

export function partitionLegacyOfficialRecords(records) {
  const safeRecords = [];
  const blockedRecords = [];
  for (const record of Array.isArray(records) ? records : []) {
    if (isOfficialRereleaseRecord(record)) blockedRecords.push(record);
    else safeRecords.push(record);
  }
  return { safeRecords, blockedRecords };
}

export function resolveLegacyOfficialRereleasePolicy({ policy, confirmation } = {}) {
  const normalized = String(policy ?? "").trim() || "block";
  if (normalized === "block") return "block";
  if (normalized === "skip" && String(confirmation ?? "").trim() === OFFICIAL_RERELEASE_SKIP_CONFIRMATION) return "skip";
  throw new Error("Legacy official rerelease policy is invalid or missing its one-time recovery confirmation.");
}

export function assertLegacyOfficialRecordsSafe(records) {
  const { blockedRecords } = partitionLegacyOfficialRecords(records);
  const blockedIds = blockedRecords.map((record) => String(record?.id || record?.series_id || "unknown"));
  if (blockedIds.length) {
    throw new Error(`Legacy official upsert cannot persist rerelease semantics; use the reviewed bounded official path (${blockedIds.length} record(s)).`);
  }
  return records;
}

function text(value) {
  return value == null ? "" : String(value).trim();
}
