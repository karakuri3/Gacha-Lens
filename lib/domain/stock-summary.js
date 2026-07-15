import { SOURCE_WEIGHTS, STOCK_STATUSES } from "./gacha-schema";

export function buildAvailabilitySummary(_variant, restockEvents = [], stockReports = []) {
  const allEvents = sortByReportedAt(restockEvents);
  const allReports = sortByReportedAt(stockReports);
  const sortedEvents = allEvents.filter((entry) => isFreshStockSignal(entry, 45));
  const sortedReports = allReports.filter((entry) => isFreshStockSignal(entry, 21));
  const latestReport = sortedReports[0] ?? null;
  const latestRestock = sortedEvents[0] ?? null;
  const statusCounts = countBy(sortedReports, "status");
  const eventCounts = countBy(sortedEvents, "event_type");
  const sourceStrength = [...sortedEvents, ...sortedReports].reduce((total, entry) => {
    return total + (Number(entry.confidence) || SOURCE_WEIGHTS[entry.source_type] || 0);
  }, 0);

  return {
    restock_event_count: sortedEvents.length,
    stock_report_count: sortedReports.length,
    latest_restock_at: latestRestock?.reported_at || "",
    latest_stock_report_at: latestReport?.reported_at || "",
    latest_stock_status: latestReport?.status || STOCK_STATUSES.UNKNOWN,
    latest_stock_label: latestReport?.status_label || "",
    latest_shop_name: latestReport?.shop_name || latestRestock?.shop_name || "",
    latest_region: latestReport?.region || latestRestock?.region || "",
    status_counts: statusCounts,
    event_counts: eventCounts,
    source_strength: Math.round(sourceStrength * 100) / 100,
    has_stock_signal: sortedReports.length > 0,
    has_restock_signal: sortedEvents.length > 0,
    stale_signal_count: (allEvents.length - sortedEvents.length) + (allReports.length - sortedReports.length),
    last_observed_at: allReports[0]?.reported_at || allEvents[0]?.reported_at || "",
  };
}

function sortByReportedAt(items = []) {
  return [...items].sort((a, b) => new Date(b.reported_at || 0) - new Date(a.reported_at || 0));
}

function countBy(items = [], key) {
  return items.reduce((counts, item) => {
    const value = item?.[key] || "unknown";
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function isFreshStockSignal(entry, maxAgeDays) {
  const value = entry?.reported_at;
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp <= maxAgeDays * 24 * 60 * 60 * 1000;
}
