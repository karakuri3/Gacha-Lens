const DEFAULT_MAX_DAYS = 30;

export function dedupeMarketObservationsByListingDay(observations = []) {
  const byListingDay = new Map();
  const unlinked = [];

  for (const observation of Array.isArray(observations) ? observations : []) {
    const candidate = normalizeObservation(observation);
    if (!candidate) continue;

    if (!candidate.listing_id) {
      unlinked.push(candidate);
      continue;
    }

    const key = `${candidate.listing_id}\u0000${candidate.date}`;
    const current = byListingDay.get(key);
    if (!current || compareSelection(candidate, current) > 0) {
      byListingDay.set(key, candidate);
    }
  }

  return [...byListingDay.values(), ...unlinked]
    .sort(compareOutput)
    .map(toPublicObservation);
}

export function buildPriceHistoryRows(observations = [], options = {}) {
  const maxDays = normalizeMaxDays(options.maxDays ?? options.limit);
  if (maxDays === 0) return [];

  const groups = new Map();
  for (const observation of dedupeMarketObservationsByListingDay(observations)) {
    const current = groups.get(observation.date) ?? { prices: [], sold: 0 };
    current.prices.push(observation.price);
    if (observation.status === "sold") current.sold += 1;
    groups.set(observation.date, current);
  }

  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, maxDays)
    .map(([date, group]) => ({
      date,
      average: Math.round(group.prices.reduce((total, value) => total + value, 0) / group.prices.length),
      high: Math.max(...group.prices),
      low: Math.min(...group.prices),
      count: group.prices.length,
      sold: group.sold,
    }));
}

function normalizeObservation(observation) {
  if (!observation || typeof observation !== "object" || Array.isArray(observation)) return null;
  const price = Number(observation.price);
  if (!Number.isFinite(price) || price <= 0) return null;

  const observedAt = validTimestamp(observation.observed_at);
  const createdAt = validTimestamp(observation.created_at);
  const timestamp = observedAt ?? createdAt;
  if (timestamp === null) return null;

  return {
    id: text(observation.id),
    listing_id: text(observation.listing_id),
    price,
    status: text(observation.status).toLowerCase(),
    observed_at: observedAt === null ? null : new Date(observedAt).toISOString(),
    created_at: createdAt === null ? null : new Date(createdAt).toISOString(),
    date: new Date(timestamp).toISOString().slice(0, 10),
    timestamp,
  };
}

function compareSelection(left, right) {
  if (left.timestamp !== right.timestamp) return left.timestamp - right.timestamp;
  return left.id.localeCompare(right.id);
}

function compareOutput(left, right) {
  return (
    right.date.localeCompare(left.date)
    || right.timestamp - left.timestamp
    || left.listing_id.localeCompare(right.listing_id)
    || left.id.localeCompare(right.id)
    || left.price - right.price
    || left.status.localeCompare(right.status)
  );
}

function toPublicObservation(candidate) {
  return {
    id: candidate.id,
    listing_id: candidate.listing_id || null,
    price: candidate.price,
    status: candidate.status,
    observed_at: candidate.observed_at,
    created_at: candidate.created_at,
    date: candidate.date,
  };
}

function validTimestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeMaxDays(value) {
  if (value === undefined || value === null || value === "") return DEFAULT_MAX_DAYS;
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_DAYS;
  return Math.min(DEFAULT_MAX_DAYS, Math.max(0, parsed));
}

function text(value) {
  return String(value ?? "").trim();
}
