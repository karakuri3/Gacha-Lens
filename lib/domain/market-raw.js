const MAX_RAW_DEPTH = 128;

export function compactMarketRawPayload(record = {}) {
  const start = isPlainObject(record.raw) ? record.raw : record;
  const chain = [];
  const visited = new Set();
  let current = start;

  while (isPlainObject(current)) {
    if (visited.has(current)) throw new Error("Market raw payload contains a cycle.");
    if (chain.length >= MAX_RAW_DEPTH) throw new Error(`Market raw payload exceeds ${MAX_RAW_DEPTH} levels.`);
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

export function mergeMarketRawRecords({ existingRecords = [], freshRecords = [], getId } = {}) {
  if (typeof getId !== "function") throw new Error("Market raw merge requires an ID resolver.");
  const recordsById = new Map();

  for (const record of existingRecords.filter(Boolean)) {
    const id = String(getId(record) ?? "").trim();
    if (!id) continue;
    recordsById.set(id, {
      id,
      record,
      fresh: false,
      preservedRaw: record.raw,
    });
  }
  for (const record of freshRecords.filter(Boolean)) {
    const id = String(getId(record) ?? "").trim();
    if (!id) continue;
    recordsById.set(id, {
      id,
      record,
      fresh: true,
      preservedRaw: undefined,
    });
  }
  return [...recordsById.values()];
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
