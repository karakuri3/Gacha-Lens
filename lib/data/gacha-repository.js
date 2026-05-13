export const EMPTY_GACHA_RECORDS = {
  series: [],
  variants: [],
  marketListings: [],
  restockEvents: [],
  stockReports: [],
  xReactions: [],
  importIssues: [],
};

export function createStaticGachaDataSource(records = EMPTY_GACHA_RECORDS) {
  const snapshot = normalizeRecordShape(records);

  return {
    name: "static",
    loadRecords() {
      return snapshot;
    },
  };
}

export function normalizeRecordShape(records = {}) {
  return {
    series: asArray(records.series),
    variants: asArray(records.variants),
    marketListings: asArray(records.marketListings),
    restockEvents: asArray(records.restockEvents),
    stockReports: asArray(records.stockReports),
    xReactions: asArray(records.xReactions),
    importIssues: asArray(records.importIssues),
  };
}

export function mergeGachaRecords(...recordSets) {
  return recordSets.reduce(
    (merged, records) => {
      const normalized = normalizeRecordShape(records);
      return {
        series: mergeById(merged.series, normalized.series),
        variants: mergeById(merged.variants, normalized.variants),
        marketListings: mergeById(merged.marketListings, normalized.marketListings),
        restockEvents: mergeById(merged.restockEvents, normalized.restockEvents),
        stockReports: mergeById(merged.stockReports, normalized.stockReports),
        xReactions: mergeById(merged.xReactions, normalized.xReactions),
        importIssues: mergeById(merged.importIssues, normalized.importIssues),
      };
    },
    { ...EMPTY_GACHA_RECORDS }
  );
}

export function collectReviewQueue(records = {}) {
  const normalized = normalizeRecordShape(records);
  const generatedIssues = [
    ...normalized.marketListings.filter((entry) => entry.review_required).map((entry) => issueFromRecord("market_listings", entry)),
    ...normalized.xReactions.filter((entry) => entry.review_required).map((entry) => issueFromRecord("x_reactions", entry)),
    ...normalized.restockEvents.filter((entry) => entry.review_required).map((entry) => issueFromRecord("restock_events", entry)),
    ...normalized.stockReports.filter((entry) => entry.review_required).map((entry) => issueFromRecord("stock_reports", entry)),
  ];

  return mergeById(normalized.importIssues, generatedIssues);
}

function mergeById(current = [], incoming = []) {
  const map = new Map();
  for (const item of [...current, ...incoming]) {
    const key = item?.id || `${item?.table_name || "record"}-${map.size}`;
    map.set(key, { ...(map.get(key) ?? {}), ...item, id: key });
  }
  return [...map.values()];
}

function issueFromRecord(tableName, record) {
  const reason = record.variant_id ? "unknown_listing_type" : "unknown_variant";
  return {
    id: `issue-${tableName}-${record.id}`.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 140),
    issue_type: reason,
    table_name: tableName,
    record_id: record.id,
    source: record.source || record.source_type || "",
    source_url: record.source_url || record.url || "",
    raw: record.raw || record,
    resolved: false,
    note: "自動分類できないため、人間の確認対象として保持",
  };
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
