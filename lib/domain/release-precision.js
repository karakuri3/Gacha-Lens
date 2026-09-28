const WEEK_DIGIT_MAP = Object.freeze({
  "１": "1", "２": "2", "３": "3", "４": "4", "５": "5", "６": "6",
  "一": "1", "二": "2", "三": "3", "四": "4", "五": "5", "六": "6",
});

export const SCHEDULE_RELEASE_WEEKS = Object.freeze([
  "第1週", "第2週", "第3週", "第4週", "第5週", "第6週",
]);

export function normalizeExplicitReleaseWeek(value = "") {
  const raw = text(value);
  if (!raw || raw.includes("未定")) return "";
  const match = raw.match(/([1-6１２３４５６一二三四五六])/);
  if (!match) return "";
  const digit = WEEK_DIGIT_MAP[match[1]] || match[1];
  return `第${digit}週`;
}

export function scheduleReleaseWeek(item = {}) {
  return normalizeExplicitReleaseWeek(item.release_week ?? item.schedule_week ?? "");
}

export function resolveReleasePrecision(item = {}) {
  const date = releaseDate(item);
  if (date && !isSyntheticBandaiMonthDate(item)) return "exact_date";
  if (scheduleReleaseWeek(item)) return "week";
  if (releaseMonthParts(item) || date) return "month";
  return "unknown";
}

export function releaseScheduleLabel(item = {}) {
  const precision = resolveReleasePrecision(item);
  const date = releaseDate(item);
  const month = releaseMonthLabel(item);
  const week = scheduleReleaseWeek(item);

  if (precision === "exact_date" && date) return date.replace(/-/g, "/");
  if (precision === "week") return [month, week].filter(Boolean).join(" ");
  if (precision === "month") return month ? `${month}・週未定` : "発売時期未定";
  return "発売時期未定";
}

export function compareScheduleReleaseItems(left = {}, right = {}) {
  const nameDifference = text(left.name).localeCompare(text(right.name), "ja");
  if (nameDifference) return nameDifference;
  return stableIdentity(left).localeCompare(stableIdentity(right), "en");
}

export function isSyntheticBandaiMonthDate(item = {}) {
  const date = releaseDate(item);
  if (!date) return false;
  try {
    const url = new URL(text(item.official_url ?? item.officialUrl));
    return /(^|\.)gashapon\.jp$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function releaseDate(item = {}) {
  const value = text(item.release_date ?? item.releaseDate);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function releaseMonthLabel(item = {}) {
  const parts = releaseMonthParts(item);
  if (!parts) return "";
  return parts.year ? `${parts.year}年${parts.month}月` : `${parts.month}月`;
}

function releaseMonthParts(item = {}) {
  const stored = text(item.release_month ?? item.schedule_month);
  const canonical = stored.match(/^(20\d{2})-(0[1-9]|1[0-2])$/);
  if (canonical) return { year: Number(canonical[1]), month: Number(canonical[2]) };

  const date = releaseDate(item);
  if (date) return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };

  const japanese = stored.match(/^(\d{1,2})月$/);
  if (japanese) {
    const month = Number(japanese[1]);
    if (month >= 1 && month <= 12) return { year: null, month };
  }
  return null;
}

function stableIdentity(item = {}) {
  return text(item.id ?? item.slug ?? item.series_id ?? item.series_slug);
}

function text(value) {
  return value == null ? "" : String(value).trim();
}
