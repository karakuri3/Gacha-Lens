import { normalizeCatalogMonth } from "./catalog-query.js";

export const SCHEDULE_PAGE_SIZE = 60;
export const MAX_SCHEDULE_PAGE = 1000;

export function parseSchedulePage(value) {
  const raw = firstValue(value).trim();
  if (!raw) return { page: 1, valid: true };
  if (!/^[1-9]\d*$/.test(raw)) return { page: 1, valid: false };
  const page = Number(raw);
  if (!Number.isSafeInteger(page) || page > MAX_SCHEDULE_PAGE) return { page: 1, valid: false };
  return { page, valid: true };
}

export function scheduleTotalPages(total, pageSize = SCHEDULE_PAGE_SIZE) {
  const size = positivePageSize(pageSize);
  const count = Math.max(0, Number(total) || 0);
  return Math.max(1, Math.ceil(count / size));
}

export function schedulePageRange(page, pageSize = SCHEDULE_PAGE_SIZE) {
  const normalizedPage = Math.max(1, Number(page) || 1);
  const size = positivePageSize(pageSize);
  const from = (normalizedPage - 1) * size;
  return { from, to: from + size - 1 };
}

export function isSchedulePageOutOfRange(page, total, pageSize = SCHEDULE_PAGE_SIZE) {
  const normalizedPage = Math.max(1, Number(page) || 1);
  const count = Math.max(0, Number(total) || 0);
  if (count === 0) return normalizedPage > 1;
  return normalizedPage > scheduleTotalPages(count, pageSize);
}

export function buildScheduleHref(month, page = 1) {
  const normalizedMonth = normalizeCatalogMonth(month);
  if (!normalizedMonth) return "/schedule";
  const normalizedPage = Math.max(1, Number(page) || 1);
  const params = new URLSearchParams({ month: normalizedMonth });
  if (normalizedPage > 1) params.set("page", String(normalizedPage));
  return `/schedule?${params.toString()}`;
}

export function currentJstCatalogMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  })
    .formatToParts(now)
    .reduce((result, part) => part.type === "literal" ? result : { ...result, [part.type]: part.value }, {});
  return `${parts.year}-${parts.month}`;
}

export function adjacentScheduleMonths(months = [], selectedMonth = "") {
  const normalized = normalizeCatalogMonth(selectedMonth);
  const available = [...new Set((months ?? []).map(normalizeCatalogMonth).filter(Boolean))].sort();
  if (!normalized) return { previous: "", next: "" };
  let previous = "";
  let next = "";
  for (const month of available) {
    if (month < normalized) previous = month;
    if (month > normalized) {
      next = month;
      break;
    }
  }
  return { previous, next };
}

export function groupScheduleMonthsByYear(months = []) {
  const groups = new Map();
  for (const month of [...new Set((months ?? []).map(normalizeCatalogMonth).filter(Boolean))].sort().reverse()) {
    const year = month.slice(0, 4);
    const values = groups.get(year) ?? [];
    values.push(month);
    groups.set(year, values);
  }
  return [...groups.entries()].map(([year, values]) => ({ year, months: values }));
}

function positivePageSize(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : SCHEDULE_PAGE_SIZE;
}

function firstValue(value) {
  if (Array.isArray(value)) return String(value[0] ?? "");
  return String(value ?? "");
}
