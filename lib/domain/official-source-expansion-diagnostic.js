import { buildOfficialSourceExpansionMetrics } from "../fetchers/official-sources/registry.js";

export function buildOfficialSourceExpansionReport({ snapshot, workflow = {}, database = {} } = {}) {
  const providers = (snapshot?.providers || []).map((provider) => ({
    source: provider.source,
    manufacturer: provider.manufacturer,
    parser_success: provider.parser_success === true,
    issue_codes: [...new Set(provider.issue_codes || [])].sort(),
    metrics: buildOfficialSourceExpansionMetrics(provider),
    records: (provider.records || []).map(sanitizeRecord),
  }));
  return {
    schema_version: 1,
    diagnostic_only: true,
    production_integration_enabled: false,
    database_writes: 0,
    workflow: { run_id: text(workflow.run_id) || null, head_sha: text(workflow.head_sha) || null, event_name: text(workflow.event_name) || null },
    cursor: snapshot?.cursor || { next: null, full_backfill_executed: false },
    database: { before: database.before || null, after: database.after || null, zero_delta_verified: database.zero_delta_verified === true },
    providers,
    final_verdict: providers.every((provider) => provider.parser_success) ? "OFFICIAL_SOURCE_EXPANSION_DIAGNOSTIC_COMPLETE" : "OFFICIAL_SOURCE_EXPANSION_DIAGNOSTIC_BLOCKED",
  };
}

export function formatOfficialSourceExpansionMarkdown(report) {
  const lines = ["# Official Source Expansion Diagnostic", "", `Run ID: ${report.workflow.run_id || "unknown"}`, `Head SHA: ${report.workflow.head_sha || "unknown"}`, `Diagnostic only: ${report.diagnostic_only}`, `Production integration enabled: ${report.production_integration_enabled}`, `Database writes: ${report.database_writes}`, `Zero database delta verified: ${report.database.zero_delta_verified}`, "", "## Providers"];
  for (const provider of report.providers) {
    const metrics = provider.metrics;
    lines.push("", `### ${provider.source}`, `Parser success: ${provider.parser_success}`, `Products discovered: ${metrics.products_discovered}`, `Detail success: ${metrics.detail_success}/${metrics.detail_attempted}`, `Total variants: ${metrics.total_variants}`, `Requests: ${metrics.request_count}`, `Request failures: ${metrics.request_failures}`, `Distinct variant-image products: ${metrics.products_with_distinct_variant_images}`, `Series-only image products: ${metrics.products_with_series_only_image}`, `Issues: ${provider.issue_codes.join(", ") || "none"}`);
  }
  return `${lines.join("\n")}\n`;
}

export function findOfficialSourceExpansionLeaks(files, explicitSecrets = []) {
  const forbidden = /(?:authorization|cookie|service_role|access[_-]?key|api[_-]?key|raw_response|set-cookie)/i;
  const matches = [];
  for (const file of files || []) {
    const content = String(file.text || "");
    if (forbidden.test(content)) matches.push(`${file.name}:forbidden_fields`);
    if (explicitSecrets.some((secret) => secret && content.includes(secret))) matches.push(`${file.name}:explicit_secret_value`);
  }
  return matches;
}

function sanitizeRecord(record) {
  return {
    source: text(record.source), source_product_id: text(record.source_product_id) || null, official_url: text(record.official_url) || null,
    manufacturer: text(record.manufacturer) || null, series_name: text(record.series_name) || null, release_date: text(record.release_date) || null,
    release_month: text(record.release_month) || null, price: Number.isFinite(record.price) ? record.price : null, variant_count: Number(record.variant_count || 0),
    variants: (record.variants || []).map((variant) => ({ name: text(variant.name), image_candidate: text(variant.image_candidate) || null })),
    series_image_candidate: text(record.series_image_candidate) || null, image_scope_candidate: text(record.image_scope_candidate) || "unknown", copyright_text: text(record.copyright_text) || null,
    source_parser_version: text(record.source_parser_version) || null,
  };
}
function text(value) { return value == null ? "" : String(value).trim(); }
