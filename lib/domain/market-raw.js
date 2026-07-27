const MAX_RAW_DEPTH = 128;

export function compactMarketRawPayload(record = {}) {
  const start = isPlainObject(record.raw) ? record.raw : record;
  const chain = [];
  const visited = new Set();
  let current = start;

  while (isPlainObject(current) && chain.length < MAX_RAW_DEPTH && !visited.has(current)) {
    visited.add(current);
    chain.push(current);
    current = current.raw;
  }

  const compacted = {};
  for (const node of chain.reverse()) {
    for (const [key, value] of Object.entries(node)) {
      if (key !== "raw") compacted[key] = value;
    }
  }
  return compacted;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
