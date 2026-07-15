const NON_PRODUCTION_PATTERN = /(?:^|[-_/])(sample|test)(?:[-_/]|\d|$)/i;

export function allowNonProductionData() {
  return String(process.env.ALLOW_NON_PRODUCTION_DATA || "false").toLowerCase() === "true";
}

export function includeStaticSampleData() {
  return String(process.env.INCLUDE_SAMPLE_DATA || "false").toLowerCase() === "true";
}

export function isNonProductionRecord(record = {}) {
  const values = [record.id, record.source_url, record.url, record.sourceUrl];
  return values.some((value) => NON_PRODUCTION_PATTERN.test(String(value || "")));
}

export function productionRecords(records = []) {
  if (allowNonProductionData()) return records.filter(Boolean);
  return records.filter((record) => record && !isNonProductionRecord(record));
}
