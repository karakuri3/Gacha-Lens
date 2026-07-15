const DAY_MS = 24 * 60 * 60 * 1000;

export function buildMarketSearchQueries(catalog = {}, options = {}) {
  const now = dateValue(options.now) ?? new Date();
  const limit = clamp(number(options.limit ?? process.env.MARKET_QUERY_LIMIT_PER_RUN) ?? 24, 1, 100);
  const recentShare = clamp(number(options.recentShare ?? process.env.MARKET_QUERY_RECENT_SHARE) ?? 0.65, 0.2, 0.9);
  const lookbackDays = Math.max(30, number(options.lookbackDays ?? process.env.MARKET_QUERY_LOOKBACK_DAYS) ?? 540);
  const hotDays = Math.min(lookbackDays, Math.max(14, number(options.hotDays ?? process.env.MARKET_QUERY_HOT_DAYS) ?? 120));
  const futureDays = Math.max(0, number(options.futureDays ?? process.env.MARKET_QUERY_FUTURE_DAYS) ?? 180);
  const series = Array.isArray(catalog.series) ? catalog.series : [];
  const variants = Array.isArray(catalog.variants) ? catalog.variants : [];
  const variantsBySeries = groupBy(variants.filter(isSearchableVariant), (variant) => variant.series_id);
  const candidates = series
    .map((entry) => ({ ...entry, releaseDate: dateValue(entry.release_date) }))
    .filter((entry) => entry.name && entry.releaseDate)
    .sort((a, b) => b.releaseDate - a.releaseDate);

  const recentFrom = new Date(now.getTime() - hotDays * DAY_MS);
  const recentTo = new Date(now.getTime() + futureDays * DAY_MS);
  const recent = candidates.filter((entry) => entry.releaseDate >= recentFrom && entry.releaseDate <= recentTo);
  const archiveFrom = new Date(now.getTime() - lookbackDays * DAY_MS);
  const archive = candidates.filter((entry) => entry.releaseDate < recentFrom && entry.releaseDate >= archiveFrom);
  const deepArchive = candidates.filter((entry) => entry.releaseDate < archiveFrom);
  const recentLimit = Math.min(limit, Math.max(1, Math.round(limit * recentShare)));
  const queries = [];

  for (const entry of rotatingWindow(recent, recentLimit, hourlyCursor(now, recent.length))) {
    queries.push(seriesQuery(entry));
    const children = variantsBySeries.get(entry.id) ?? [];
    const child = children[hourlyCursor(now, children.length, hash(entry.id))];
    if (child && queries.length < recentLimit) queries.push(variantQuery(entry, child));
    if (queries.length >= recentLimit) break;
  }

  const archiveLimit = limit - queries.length;
  const archivePool = interleave(
    rotatingWindow(archive, archive.length, hourlyCursor(now, archive.length, 17)),
    rotatingWindow(deepArchive, deepArchive.length, hourlyCursor(now, deepArchive.length, 31))
  );
  for (const entry of archivePool) {
    const children = variantsBySeries.get(entry.id) ?? [];
    const child = children[hourlyCursor(now, children.length, hash(entry.id) + 7)];
    if (child && queries.length < limit && queries.length % 2 === 0) {
      queries.push(variantQuery(entry, child));
    } else {
      queries.push(seriesQuery(entry));
    }
    if (queries.length >= recentLimit + archiveLimit) break;
  }

  if (queries.length < limit) {
    for (const entry of rotatingWindow(candidates, limit - queries.length, hourlyCursor(now, candidates.length, 31))) {
      queries.push(seriesQuery(entry));
    }
  }

  return dedupeQueries(queries).slice(0, limit);
}

function seriesQuery(series) {
  return {
    query: `${series.name} ガチャ`,
    kind: "series",
    series_id: series.id,
    release_date: isoDate(series.releaseDate),
  };
}

function variantQuery(series, variant) {
  return {
    query: `${series.name} ${variant.name} 単品`,
    kind: "variant",
    series_id: series.id,
    variant_id: variant.id,
    release_date: isoDate(series.releaseDate),
  };
}

function isSearchableVariant(variant) {
  const name = String(variant?.name ?? "").trim();
  return name.length >= 2 && variant?.variant_type !== "provisional";
}

function rotatingWindow(values, count, cursor) {
  if (!values.length || count <= 0) return [];
  const result = [];
  for (let index = 0; index < Math.min(count, values.length); index += 1) {
    result.push(values[(cursor + index) % values.length]);
  }
  return result;
}

function hourlyCursor(now, length, salt = 0) {
  if (!length) return 0;
  const hour = Math.floor(now.getTime() / (60 * 60 * 1000));
  return Math.abs(hour + salt) % length;
}

function hash(value) {
  return [...String(value ?? "")].reduce((total, char) => ((total * 31) + char.charCodeAt(0)) | 0, 0);
}

function groupBy(values, selector) {
  const grouped = new Map();
  for (const value of values) {
    const key = selector(value);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(value);
  }
  return grouped;
}

function interleave(first, second) {
  const values = [];
  const length = Math.max(first.length, second.length);
  for (let index = 0; index < length; index += 1) {
    if (first[index]) values.push(first[index]);
    if (second[index]) values.push(second[index]);
  }
  return values;
}

function dedupeQueries(queries) {
  return [...new Map(queries.map((entry) => [entry.query, entry])).values()];
}

function dateValue(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isoDate(value) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
