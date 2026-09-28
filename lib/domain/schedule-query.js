import { normalizeCatalogMonth } from "./catalog-query.js";

export const SCHEDULE_PAGE_SIZE = 60;
export const MAX_SCHEDULE_PAGE = 1000;

export function currentScheduleMonth(now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function normalizeSchedulePage(value) {
  const scalar = Array.isArray(value) ? value[0] : value;
  const text = String(scalar ?? "").trim();
  if (!/^[1-9]\d*$/.test(text)) return 1;
  return Math.min(MAX_SCHEDULE_PAGE, Number(text));
}

export function isCanonicalSchedulePageValue(value) {
  if (value === undefined || value === null || value === "") return true;
  const scalar = Array.isArray(value) ? value[0] : value;
  const text = String(scalar).trim();
  return /^[1-9]\d*$/.test(text) && Number(text) <= MAX_SCHEDULE_PAGE;
}

export function scheduleHref(month, page = 1) {
  const normalizedMonth = normalizeCatalogMonth(month);
  if (!normalizedMonth) return "/schedule";
  const normalizedPage = normalizeSchedulePage(page);
  const params = new URLSearchParams({ month: normalizedMonth });
  if (normalizedPage > 1) params.set("page", String(normalizedPage));
  return `/schedule?${params.toString()}`;
}

export function schedulePageWindow(page, totalPages) {
  const safeTotal = Math.max(1, Number(totalPages) || 1);
  const safePage = Math.min(Math.max(1, Number(page) || 1), safeTotal);
  const start = Math.max(1, Math.min(safePage - 2, safeTotal - 4));
  const end = Math.min(safeTotal, start + 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function scheduleArchiveNeighbors(month, months = []) {
  const selected = normalizeCatalogMonth(month);
  const available = [...new Set(months.map(normalizeCatalogMonth).filter(Boolean))].sort();
  return {
    previous: [...available].reverse().find((candidate) => candidate < selected) || "",
    next: available.find((candidate) => candidate > selected) || "",
  };
}

export function groupScheduleArchiveMonths(months = []) {
  const groups = new Map();
  for (const month of [...new Set(months.map(normalizeCatalogMonth).filter(Boolean))].sort().reverse()) {
    const year = month.slice(0, 4);
    const values = groups.get(year) ?? [];
    values.push(month);
    groups.set(year, values);
  }
  return [...groups.entries()].map(([year, values]) => ({ year, months: values }));
}
