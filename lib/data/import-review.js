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
    rawTitle: issue.raw?.title || issue.raw?.name || issue.raw?.product_name || "",
    rawVariantId: issue.raw?.variant_id || issue.raw?.variantId || "",
  }));
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
