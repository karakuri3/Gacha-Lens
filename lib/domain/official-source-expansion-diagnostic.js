import { buildOfficialSourceExpansionMetrics } from "../fetchers/official-sources/registry.js";

export function buildOfficialSourceExpansionReport({ snapshot, workflow = {}, database = {} } = {}) {
  const providers = (snapshot?.providers || []).map((provider) => ({
    source: provider.source,
    manufacturer: provider.manufacturer,
    parser_success: provider.parser_success === true,
    parser_complete: provider.parser_complete === true,
    issue_codes: [...new Set(provider.issue_codes || [])].sort(),
    capability_profile: sanitizeCapabilityProfile(provider.capability_profile),
    metrics: buildOfficialSourceExpansionMetrics(provider),
    records: (provider.records || []).map(sanitizeRecord),
    metadata_records: (provider.metadata_records || []).map(sanitizeMetadataRecord),
    formal_lineup_evidence: (provider.formal_lineup_evidence || []).map(sanitizeFormalLineupEvidence),
  }));
  return {
    schema_version: 1,
    diagnostic_only: true,
    production_integration_enabled: false,
    database_writes: 0,
    workflow: { run_id: text(workflow.run_id) || null, head_sha: text(workflow.head_sha) || null, event_name: text(workflow.event_name) || null },
    cursor: snapshot?.cursor || { next: null, full_backfill_executed: false },
    database: {
      database_accessed: false,
      zero_delta_verified: null,
      structural_write_isolation: true,
      write_path_present: false,
    },
    providers,
    final_verdict: providers.every((provider) => provider.parser_complete)
      ? "OFFICIAL_SOURCE_EXPANSION_DIAGNOSTIC_COMPLETE"
      : providers.some((provider) => provider.parser_success)
        ? "OFFICIAL_SOURCE_EXPANSION_DIAGNOSTIC_PARTIAL"
        : "OFFICIAL_SOURCE_EXPANSION_DIAGNOSTIC_BLOCKED",
  };
}

export function formatOfficialSourceExpansionMarkdown(report) {
  const lines = ["# Official Source Expansion Diagnostic", "", `Run ID: ${report.workflow.run_id || "unknown"}`, `Head SHA: ${report.workflow.head_sha || "unknown"}`, `Diagnostic only: ${report.diagnostic_only}`, `Production integration enabled: ${report.production_integration_enabled}`, `Database accessed: ${report.database.database_accessed}`, `Database writes: ${report.database_writes}`, `Structural write isolation: ${report.database.structural_write_isolation}`, `Write path present: ${report.database.write_path_present}`, "", "## Providers"];
  for (const provider of report.providers) {
    const metrics = provider.metrics;
    const capability = provider.capability_profile;
    lines.push("", `### ${provider.source}`, `Parser success: ${provider.parser_success}`, `Parser complete: ${provider.parser_complete}`, `Series metadata capability: ${capability.capability_support.SERIES_METADATA || "unavailable"}`, `Variant catalog capability: ${capability.capability_support.VARIANT_CATALOG || "unavailable"}`, `Production integration enabled: ${capability.production_integration_enabled}`, `Products discovered: ${metrics.products_discovered}`, `Detail success: ${metrics.detail_success}/${metrics.detail_attempted}`, `Successful records: ${metrics.successful_records}`, `Metadata-only records: ${metrics.metadata_only_records}`, `Metadata-only reasons: ${formatReasons(metrics.metadata_only_reasons)}`, `Rejected records: ${metrics.rejected_records}`, `Rejection reasons: ${formatReasons(metrics.rejection_reasons)}`, `Formal Lineup archive pages: ${metrics.lineup_archive_pages_fetched}/${metrics.lineup_archive_page_limit}`, `Formal Lineups: ${metrics.lineup_success}/${metrics.lineup_attempted} (limit ${metrics.lineup_fetch_limit})`, `Total variants: ${metrics.total_variants}`, `Requests: ${metrics.request_count}`, `Request failures: ${metrics.request_failures}`, `Distinct variant-image products: ${metrics.products_with_distinct_variant_images}`, `Series-only image products: ${metrics.products_with_series_only_image}`, `Issues: ${provider.issue_codes.join(", ") || "none"}`);
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
    source_count_evidence: sanitizeCountEvidence(record.source_count_evidence), source_count_conflict: record.source_count_conflict === true,
    capability: sanitizeCapabilityStatus(record.capability),
  };
}
function sanitizeMetadataRecord(record) { return { source: text(record.source), source_product_id: text(record.source_product_id) || null, official_url: text(record.official_url) || null, series_name: text(record.series_name) || null, release_date: text(record.release_date) || null, release_month: text(record.release_month) || null, price: Number.isFinite(record.price) ? record.price : null, source_parser_version: text(record.source_parser_version) || null, formal_lineup: false, capability: sanitizeCapabilityStatus(record.capability) }; }
function sanitizeFormalLineupEvidence(record) { return { official_url: text(record.official_url) || null, series_name: text(record.series_name) || null, release_month: text(record.release_month) || null, price: Number.isFinite(record.price) ? record.price : null, variant_count: Number(record.variant_count || 0) }; }
function sanitizeCountEvidence(value) { return { detail_field_count: Number.isInteger(value?.detail_field_count) ? value.detail_field_count : null, formal_lineup_prose_count: Number.isInteger(value?.formal_lineup_prose_count) ? value.formal_lineup_prose_count : null, concrete_named_variant_count: Number.isInteger(value?.concrete_named_variant_count) ? value.concrete_named_variant_count : null }; }
function sanitizeCapabilityProfile(value) { return { source: text(value?.source) || null, capability_levels: Array.isArray(value?.capability_levels) ? value.capability_levels.map(text).filter(Boolean) : [], capability_support: { ...(value?.capability_support || {}) }, integration_mode: text(value?.integration_mode) || null, series_metadata_candidate_count: Number(value?.series_metadata_candidate_count || 0), variant_catalog_candidate_count: Number(value?.variant_catalog_candidate_count || 0), source_count_conflict_excluded_count: Number(value?.source_count_conflict_excluded_count || 0), production_integration_enabled: false, automatic_production_eligible: false, database_writes: 0 }; }
function sanitizeCapabilityStatus(value) { return { series_metadata_status: text(value?.series_metadata_status) || "unavailable", variant_catalog_status: text(value?.variant_catalog_status) || "unavailable", source_count_conflict: value?.source_count_conflict === true, automatic_production_eligible: false, production_integration_enabled: false }; }
function formatReasons(reasons) { return Object.entries(reasons || {}).map(([reason, count]) => `${reason} (${count})`).join(", ") || "none"; }
function text(value) { return value == null ? "" : String(value).trim(); }
