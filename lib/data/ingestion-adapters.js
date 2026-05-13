import { IMPORT_ISSUE_TYPES, SOURCE_TYPES } from "../domain/gacha-schema";
import {
  normalizeMarketListing,
  normalizeOfficialProduct,
  normalizeOfficialVariant,
  normalizeRestockEvent,
  normalizeStockReport,
  normalizeXReaction,
} from "../domain/source-normalizers";
import { createListingImportIssue } from "../domain/listing-classifier";
import { mergeGachaRecords, normalizeRecordShape } from "./gacha-repository";

export function createRepositoryRecords({
  baseRecords = {},
  officialSchedule = [],
  officialProducts = [],
  marketListingsRaw = [],
  xReactionsRaw = [],
  restockEventsRaw = [],
  stockReportsRaw = [],
} = {}) {
  const officialRecords = mergeGachaRecords(
    ingestOfficialSchedule(officialSchedule),
    ingestOfficialProducts(officialProducts)
  );
  const catalog = mergeGachaRecords(baseRecords, officialRecords);

  return mergeGachaRecords(
    baseRecords,
    officialRecords,
    ingestMarketListings(marketListingsRaw, catalog),
    ingestXReactions(xReactionsRaw, catalog),
    ingestRestockEvents(restockEventsRaw, catalog),
    ingestStockReports(stockReportsRaw, catalog)
  );
}

export function ingestOfficialSchedule(rawSchedule = []) {
  const series = [];
  const variants = [];
  const importIssues = [];

  for (const raw of asArray(rawSchedule)) {
    const normalizedSeries = normalizeOfficialProduct({
      ...raw,
      source_type: SOURCE_TYPES.OFFICIAL,
    });
    if (!normalizedSeries.id || !normalizedSeries.name) {
      importIssues.push(createImportIssue("official_schedule", raw, IMPORT_ISSUE_TYPES.INVALID_RECORD));
      continue;
    }

    const seriesRecord = toSeriesRecord(normalizedSeries, raw.is_released ?? raw.released ?? false);
    series.push(seriesRecord);

    const rawVariants = asArray(raw.variants || raw.items || raw.lineup);
    if (!rawVariants.length) {
      importIssues.push(createImportIssue("official_schedule", raw, IMPORT_ISSUE_TYPES.MISSING_VARIANTS, seriesRecord.id));
    }

    for (const variantRaw of rawVariants) {
      variants.push(normalizeOfficialVariant(variantRaw, seriesRecord));
    }
  }

  return { series, variants, importIssues };
}

export function ingestOfficialProducts(rawProducts = []) {
  const series = [];
  const variants = [];
  const importIssues = [];

  for (const raw of asArray(rawProducts)) {
    const normalizedSeries = normalizeOfficialProduct(raw);
    if (!normalizedSeries.id || !normalizedSeries.name) {
      importIssues.push(createImportIssue("official_product", raw, IMPORT_ISSUE_TYPES.INVALID_RECORD));
      continue;
    }

    const seriesRecord = toSeriesRecord(normalizedSeries, raw.is_released ?? raw.released ?? false);
    series.push(seriesRecord);

    const rawVariants = asArray(raw.variants || raw.items || raw.lineup);
    if (!rawVariants.length) {
      importIssues.push(createImportIssue("official_product", raw, IMPORT_ISSUE_TYPES.MISSING_VARIANTS, seriesRecord.id));
    }

    for (const variantRaw of rawVariants) {
      variants.push(normalizeOfficialVariant(variantRaw, seriesRecord));
    }
  }

  return { series, variants, importIssues };
}

export function ingestMarketListings(rawListings = [], catalog = {}) {
  const normalizedCatalog = normalizeRecordShape(catalog);
  const marketListings = asArray(rawListings).map((raw) => normalizeMarketListing(raw, normalizedCatalog));
  const importIssues = marketListings
    .filter((listing) => listing.review_required)
    .map((listing) => createListingImportIssue(listing.raw, listing.variant_id ? IMPORT_ISSUE_TYPES.UNKNOWN_LISTING_TYPE : IMPORT_ISSUE_TYPES.UNKNOWN_VARIANT));

  return { marketListings, importIssues };
}

export function ingestXReactions(rawReactions = [], catalog = {}) {
  const normalizedCatalog = normalizeRecordShape(catalog);
  const xReactions = asArray(rawReactions).map((raw) => normalizeXReaction(raw, normalizedCatalog));
  const importIssues = xReactions
    .filter((reaction) => reaction.review_required)
    .map((reaction) => createImportIssue("x_reactions", reaction.raw, IMPORT_ISSUE_TYPES.UNKNOWN_VARIANT));

  return { xReactions, importIssues };
}

export function ingestRestockEvents(rawEvents = [], catalog = {}) {
  const normalizedCatalog = normalizeRecordShape(catalog);
  const restockEvents = asArray(rawEvents).map((raw) => normalizeRestockEvent(raw, normalizedCatalog));
  const importIssues = restockEvents
    .filter((event) => event.review_required)
    .map((event) => createImportIssue("restock_events", event.raw, IMPORT_ISSUE_TYPES.UNKNOWN_VARIANT));

  return { restockEvents, importIssues };
}

export function ingestStockReports(rawReports = [], catalog = {}) {
  const normalizedCatalog = normalizeRecordShape(catalog);
  const stockReports = asArray(rawReports).map((raw) => normalizeStockReport(raw, normalizedCatalog));
  const importIssues = stockReports
    .filter((report) => report.review_required)
    .map((report) => createImportIssue("stock_reports", report.raw, IMPORT_ISSUE_TYPES.UNKNOWN_VARIANT));

  return { stockReports, importIssues };
}

function toSeriesRecord(series, isReleased) {
  return {
    id: series.id,
    slug: series.slug || series.id,
    name: series.name,
    franchise: series.franchise,
    brand: series.brand,
    category: series.category,
    release_month: series.release_month,
    release_week: series.release_week,
    release_date: series.release_date,
    price: series.price,
    is_released: Boolean(isReleased),
    official_url: series.official_url,
    source_type: SOURCE_TYPES.OFFICIAL,
    raw: series.raw,
  };
}

function createImportIssue(tableName, raw, issueType, parentId = "") {
  return {
    id: `issue-${tableName}-${parentId || raw.id || raw.url || raw.name || Date.now()}`.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 140),
    issue_type: issueType,
    table_name: tableName,
    record_id: parentId,
    source: SOURCE_TYPES.OFFICIAL,
    source_url: raw.official_url || raw.url || "",
    raw,
    resolved: false,
    note: issueType === IMPORT_ISSUE_TYPES.MISSING_VARIANTS ? "公式シリーズに単品lineupが未入力" : "投入前に形式確認が必要",
  };
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
