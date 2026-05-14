import { SOURCE_WEIGHTS, STOCK_STATUSES } from "./gacha-schema";

export function buildAvailabilitySummary(_variant, restockEvents = [], stockReports = []) {
  const sortedEvents = sortByReportedAt(restockEvents);
  const sortedReports = sortByReportedAt(stockReports);
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
