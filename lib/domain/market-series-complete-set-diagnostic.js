import { summarizeSeriesCompleteSetDiagnostic } from "./market-series-complete-set.js";

export function buildSeriesCompleteSetDiagnostic({ workflow = {}, selection = {}, records = [], evaluations = [], retrieval = {}, productionCountsBefore = null, productionCountsAfter = null } = {}) {
  const summary = summarizeSeriesCompleteSetDiagnostic({ records, evaluations });
  const zeroDelta = productionCountsBefore && productionCountsAfter && JSON.stringify(productionCountsBefore) === JSON.stringify(productionCountsAfter);
  return {
    schema_version: 1,
    kind: "series_complete_set_read_only_diagnostic",
    workflow: { run_id: safe(workflow.run_id, 40), head_sha: safeHead(workflow.head_sha), event_name: "workflow_dispatch" },
    selection: {
      selected_variant_count: selection.selected?.length ?? 0,
      selected_series_count: new Set((selection.selected ?? []).map((entry) => entry.seriesId)).size,
      priority: 3,
      release: "released",
      max_variants_per_series: 1,
      selected: (selection.selected ?? []).map((entry) => ({
        series_id: safeIdentifier(entry.seriesId),
        variant_id: safeIdentifier(entry.variantId),
        series_name: safeText(entry.seriesName, 500),
        variant_name: safeText(entry.variantName, 500),
      })),
    },
    retrieval: {
      provider_request_counts: {
        rakuten_ichiba: safeCount(retrieval.provider_request_counts?.rakuten_ichiba),
        yahoo_shopping: safeCount(retrieval.provider_request_counts?.yahoo_shopping),
      },
      results_returned: safeCount(retrieval.results_returned),
      normalized_records: safeCount(retrieval.normalized_records ?? records.length),
    },
    ...summary,
    production_counts_before: productionCountsBefore,
    production_counts_after: productionCountsAfter,
    zero_delta_verified: zeroDelta === true,
    database_writes: 0,
    canary_eligible: false,
    write_eligible: false,
  };
}

export function renderSeriesCompleteSetDiagnosticMarkdown(report = {}) {
  const lines = ["# Series Complete-Set Market Evidence Read-Only Diagnostic", `- Run ID: ${report.workflow?.run_id || "unknown"}`, `- Head SHA: ${report.workflow?.head_sha || "unknown"}`, `- Selected variants: ${report.selection?.selected_variant_count ?? 0}`, `- Selected series: ${report.selection?.selected_series_count ?? 0}`, `- Rakuten requests: ${report.retrieval?.provider_request_counts?.rakuten_ichiba ?? 0}`, `- Yahoo requests: ${report.retrieval?.provider_request_counts?.yahoo_shopping ?? 0}`, `- Results returned: ${report.retrieval?.results_returned ?? 0}`, `- Normalized records: ${report.retrieval?.normalized_records ?? 0}`, `- Marketplace candidates: ${report.marketplace_raw_candidate_count ?? 0}`, `- Existing single accepted: ${report.existing_single_accepted_count ?? 0}`, `- Existing not_single_item: ${report.existing_not_single_item_count ?? 0}`, `- Complete-set accepted: ${report.complete_set_accepted_count ?? 0}`, `- Unique series: ${report.unique_series_with_complete_set_evidence ?? 0}`, `- Database writes: 0`, `- Zero delta verified: ${report.zero_delta_verified === true}`, "", "## Accepted preview", "| Series | Source | Price | Status | Lineup | Detected | Reason |", "|---|---|---:|---|---:|---:|---|"];
  for (const entry of report.accepted_preview ?? []) lines.push(`| ${cell(entry.series_name)} | ${cell(entry.source)} | ${entry.price} | ${cell(entry.status)} | ${entry.formal_lineup_count} | ${entry.detected_complete_count ?? "-"} | ${cell(entry.reason)} |`);
  lines.push("", "## Rejection reasons", ...Object.entries(report.reject_reason_counts ?? {}).map(([reason, count]) => `- ${cell(reason)}: ${count}`));
  return `${lines.join("\n")}\n`;
}
function safe(value, max) { return String(value ?? "").replace(/[^0-9A-Za-z_-]/g, "").slice(0, max); }
function safeHead(value) { const text = String(value ?? ""); return /^[0-9a-f]{40}$/.test(text) ? text : null; }
function safeIdentifier(value) { return String(value ?? "").replace(/[^0-9A-Za-z:_-]/g, "").slice(0, 200); }
function safeText(value, max) { return String(value ?? "").replace(/[\r\n]/g, " ").slice(0, max); }
function safeCount(value) { return Number.isInteger(value) && value >= 0 ? value : 0; }
function cell(value) { return String(value ?? "").replace(/[|\r\n]/g, " ").slice(0, 500); }
