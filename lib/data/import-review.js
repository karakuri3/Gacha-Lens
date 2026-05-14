import { MARKET_REVIEW_TYPES } from "../domain/gacha-schema";
import { X_INTENT_LABELS } from "../domain/source-normalizers";

export function buildImportReviewReport(importIssues = []) {
  return importIssues.map((issue) => ({
    id: issue.id,
    issueType: issue.issue_type,
    table: issue.table_name,
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
  const headers = ["id", "issueType", "table", "recordId", "source", "sourceUrl", "resolved", "note", "suggestedAction", "rawTitle", "rawVariantId"];
  const body = rows.map((row) => headers.map((header) => csvCell(row[header])).join(","));
  return [headers.join(","), ...body].join("\n");
}

function getSuggestedAction(issue) {
  if (issue.issue_type === "missing_variants") return "公式ページのラインナップをvariantsへ追加";
  if (issue.issue_type === "unknown_variant") return "正しいvariant_idを付与";
  if (issue.issue_type === "unknown_listing_type") return "listing_typeを単品/セット/レア等から選択";
  if (issue.issue_type === "invalid_record") return "必須項目のid/name/urlを確認";
  return "内容確認";
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}
