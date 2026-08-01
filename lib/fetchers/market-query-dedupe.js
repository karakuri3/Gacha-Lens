export function dedupeMarketQueries(queries = []) {
  const seen = new Set();
  const values = [];

  for (const entry of queries) {
    const query = typeof entry === "string" ? { query: entry } : entry;
    const normalized = normalizeMarketQuery(query?.query);
    if (!normalized) continue;
    const key = [normalized, text(query?.variant_id), text(query?.series_id)].join("\u0000");
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(query);
  }

  return {
    queries: values,
    duplicateQueriesSkipped: Math.max(0, queries.length - values.length),
  };
}

export function normalizeMarketQuery(value) {
  return text(value).normalize("NFKC").replace(/\s+/g, " ").toLowerCase();
}

function text(value) {
  return value == null ? "" : String(value).trim();
}
