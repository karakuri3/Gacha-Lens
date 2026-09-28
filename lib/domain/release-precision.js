import { formatCatalogMonth } from "./catalog-query.js";

export function normalizeExplicitReleaseWeek(value = "") {
  const text = String(value || "").trim();
  const match = text.match(/第\s*([1-5])\s*週/);
  if (match) return `第${match[1]}週`;
  return "";
}

export function releaseTiming(item = {}) {
  const rawWeek = String(item.release_week ?? item.schedule_week ?? "").trim();
  const week = normalizeExplicitReleaseWeek(rawWeek);
  const date = String(item.release_date ?? item.releaseDate ?? "").trim();
  const month = scheduleMonth(item, date);
  const explicitPrecision = String(item.release_precision ?? item.schedule_precision ?? "").trim();

  if (week) return { precision: "week", week, group: week, label: joinMonthAndWeek(month, week) };
  if (/未定|確認中/.test(rawWeek)) return { precision: month ? "month" : "unknown", week: "", group: "undated", label: month ? `${month}・週未定` : "発売時期未定" };

  if (explicitPrecision === "exact_date" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { precision: "exact_date", week: "", group: "undated", label: date.replace(/-/g, "/") };
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date.slice(8, 10) !== "01") {
    return { precision: "exact_date", week: "", group: "undated", label: date.replace(/-/g, "/") };
  }

  if (month) return { precision: "month", week: "", group: "undated", label: `${month}・週未定` };
  return { precision: "unknown", week: "", group: "undated", label: "発売時期未定" };
}

export function compareScheduleItems(left = {}, right = {}) {
  return String(left.name || "").localeCompare(String(right.name || ""), "ja")
    || String(left.slug || left.id || "").localeCompare(String(right.slug || right.id || ""));
}

function scheduleMonth(item, date) {
  const stored = String(item.release_month ?? item.schedule_month ?? "").trim();
  const normalized = formatCatalogMonth(stored);
  if (normalized) return normalized;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return formatCatalogMonth(date.slice(0, 7));
  const numeric = stored.match(/^(\d{1,2})月$/);
  if (numeric && /^\d{4}-\d{2}-\d{2}$/.test(date)) return `${date.slice(0, 4)}年${Number(numeric[1])}月`;
  return stored;
}

function joinMonthAndWeek(month, week) {
  return [month, week].filter(Boolean).join(" ") || week;
}
