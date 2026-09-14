const JST_TIME_ZONE = "Asia/Tokyo";
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})/;
const SAFE_COLUMN = /^[a-z_][a-z0-9_]*$/;

export function jstCalendarDate(value = new Date()) {
  const date = validDate(value);
  if (!date) throw new TypeError("A valid date/time is required");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: JST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function releaseCalendarDate(value) {
  if (typeof value === "string") {
    const match = value.trim().match(DATE_ONLY);
    if (match && isValidDateParts(match[1], match[2], match[3])) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  const date = validDate(value);
  return date ? jstCalendarDate(date) : "";
}

export function releaseDateAtJstStart(value) {
  const day = releaseCalendarDate(value);
  return day ? new Date(`${day}T00:00:00+09:00`) : null;
}

export function effectiveReleaseState(record = {}, { parent = null, now = new Date() } = {}) {
  const today = jstCalendarDate(now);
  const persisted = releaseBoolean(record) ?? releaseBoolean(parent);
  if (persisted === true) return true;

  const releaseDay = releaseCalendarDate(
    record?.release_date
      ?? record?.releaseDate
      ?? parent?.release_date
      ?? parent?.releaseDate
  );
  if (releaseDay && releaseDay <= today) return true;
  return persisted === true;
}

export function buildEffectiveReleaseQueryPlan({
  state,
  booleanColumn = "released",
  releaseDateColumn = "release_date",
  now = new Date(),
} = {}) {
  if (!SAFE_COLUMN.test(booleanColumn) || !SAFE_COLUMN.test(releaseDateColumn)) {
    throw new TypeError("Release-state query columns must be safe identifiers");
  }
  if (state !== "released" && state !== "upcoming") return null;

  const today = jstCalendarDate(now);
  if (state === "released") {
    return {
      today,
      eq: null,
      or: `${booleanColumn}.eq.true,and(${booleanColumn}.eq.false,${releaseDateColumn}.lte.${today})`,
    };
  }
  return {
    today,
    eq: [booleanColumn, false],
    or: `${releaseDateColumn}.gt.${today},${releaseDateColumn}.is.null`,
  };
}

function releaseBoolean(record) {
  if (!record || typeof record !== "object") return null;
  if (typeof record.released === "boolean") return record.released;
  if (typeof record.is_released === "boolean") return record.is_released;
  if (typeof record.isReleased === "boolean") return record.isReleased;
  return null;
}

function validDate(value) {
  const date = value instanceof Date ? value : value == null || value === "" ? null : new Date(value);
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function isValidDateParts(yearText, monthText, dayText) {
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
