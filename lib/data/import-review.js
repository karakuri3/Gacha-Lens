import { MARKET_REVIEW_TYPES } from "../domain/gacha-schema";
import { X_INTENT_LABELS } from "../domain/source-normalizers";

export function buildImportReviewReport(importIssues = []) {
  return importIssues.map((issue) => ({
    id: issue.id,
    issueType: issue.issue_type,
    table: issue.table_name,
    group: getIssueGroup(issue),
    priority: getIssuePriority(issue),
    recordId: issue.record_id || "",
    source: issue.source || "",
    sourceUrl: issue.source_url || "",
    resolved: Boolean(issue.resolved),
    note: issue.note || "",
    suggestedAction: getSuggestedAction(issue),
    rawTitle: issue.raw?.title || issue.raw?.name || issue.raw?.product_name || issue.raw?.text || issue.raw?.body || "",
    rawVariantId: issue.raw?.variant_id || issue.raw?.variantId || "",
  }));
}

export function buildImportIssueBreakdown(importIssues = []) {
  return importIssues.reduce((breakdown, issue) => {
    const key = issue.issue_type || "unknown";
    return {
      ...breakdown,
      [key]: (breakdown[key] ?? 0) + 1,
    };
  }, {});
}

export function buildMarketListingBreakdown(marketListings = []) {
  const base = {
    [MARKET_REVIEW_TYPES.SINGLE]: 0,
    [MARKET_REVIEW_TYPES.RARE_OR_SECRET]: 0,
    [MARKET_REVIEW_TYPES.FULL_SET]: 0,
    [MARKET_REVIEW_TYPES.PARTIAL_SET]: 0,
    [MARKET_REVIEW_TYPES.UNKNOWN]: 0,
  };

  return marketListings.reduce((breakdown, listing) => {
    const key = listing.market_review_type || MARKET_REVIEW_TYPES.UNKNOWN;
    return {
      ...breakdown,
      [key]: (breakdown[key] ?? 0) + 1,
    };
  }, base);
}

export function buildXIntentBreakdown(xReactions = []) {
  return xReactions.reduce((breakdown, reaction) => {
    for (const tag of reaction.intent_tags ?? []) {
      const label = X_INTENT_LABELS[tag] || tag;
      breakdown[label] = (breakdown[label] ?? 0) + 1;
    }
    return breakdown;
  }, {});
}

export function buildImportReviewCsv(importIssues = []) {
  const rows = buildImportReviewReport(importIssues);
  const headers = [
    "id",
    "issueType",
    "table",
    "group",
    "priority",
    "recordId",
    "source",
    "sourceUrl",
    "resolved",
    "note",
    "suggestedAction",
    "rawTitle",
    "rawVariantId",
  ];
  const body = rows.map((row) => headers.map((header) => csvCell(row[header])).join(","));
  return [headers.join(","), ...body].join("\n");
}

function getSuggestedAction(issue) {
  if (issue.issue_type === "missing_variants") return "公式ラインナップを variants に追加する";
  if (issue.issue_type === "unknown_variant") return "正しい variant_id を確認して raw を修正する";
  if (issue.issue_type === "unknown_listing_type") return "単品 / セット / レア / unknown の分類を確認する";
  if (issue.issue_type === "invalid_record") return "id / name / url / source を確認する";
  return "内容を確認して resolved または修正対象にする";
}

function getIssueGroup(issue) {
  const tableName = issue.table_name || "";
  if (tableName === "market_listings") return "Market";
  if (tableName === "x_reactions") return "X reactions";
  if (tableName === "restock_events" || tableName === "stock_reports") return "Stock";
  if (tableName === "series" || tableName === "variants") return "Official master";
  return "Other";
}

function getIssuePriority(issue) {
  if (issue.issue_type === "missing_variants" || issue.table_name === "variants") return "high";
  if (issue.issue_type === "unknown_variant") return "medium";
  return "low";
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}
