import { createHash } from "node:crypto";

const SCHEMA_VERSION = 1;
const DEFAULT_CANDIDATE_LIMIT = 200;
const FORBIDDEN_KEY = /(application.?id|access.?key|app.?id|affiliate.?id|api.?key|authorization|token|secret|password|cookie|headers?|environment|service.?role|raw)/i;
const C0_CONTROL = /[\u0000-\u001f\u007f]/g;
const DISPLAY_CONTROL = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
const MARKDOWN_SPECIAL = /[\\`*_[\]{}()<>#+\-.!|~]/g;

export function buildSanitizedMarketCandidateAudit({ records = [], queryPlan = [], catalog = {}, runContext = {}, summary = {} } = {}) {
  const variantById = mapById(catalog.variantById, catalog.variants);
  const seriesById = mapById(catalog.seriesById, catalog.series);
  const queries = queryPlan.map((query) => ({ ...query, query: sanitizeText(query.query, 160) }));
  const queryByText = new Map(queries.map((query) => [normalizeQuery(query.query), query]));
  const assessedRecords = records.filter((record) => record.market_safety_assessed === true);
  const limit = clampInteger(runContext.candidate_limit, 1, DEFAULT_CANDIDATE_LIMIT, DEFAULT_CANDIDATE_LIMIT);
  const candidates = assessedRecords.map((record) => buildCandidate(record, queryByText, variantById, seriesById))
    .sort((left, right) => left.candidate_key.localeCompare(right.candidate_key, "en"));
  const visibleCandidates = candidates.slice(0, limit);
  const truncatedCount = Math.max(0, candidates.length - visibleCandidates.length);
  const expectedCount = number(summary.safety_assessed_records, candidates.length);
  const reportComplete = truncatedCount === 0 && candidates.length === expectedCount;
  const selectedVariants = buildSelectedVariants(queries, variantById, seriesById);

  const report = {
    schema_version: SCHEMA_VERSION,
    generated_at: validIso(runContext.generated_at) ?? new Date().toISOString(),
    mode: sanitizeText(runContext.mode || "dry-run", 24),
    source_scope: sanitizeText(runContext.source_scope || "planner-apis", 32),
    workflow: {
      run_id: sanitizeText(runContext.run_id, 80),
      run_attempt: sanitizeText(runContext.run_attempt, 24),
      head_sha: sanitizeText(runContext.head_sha, 80),
      event_name: sanitizeText(runContext.event_name, 80),
    },
    selection: {
      selected_variant_count: selectedVariants.length,
      selected_variants: selectedVariants,
      query_count: queries.length,
    },
    result: {
      candidate_count: visibleCandidates.length,
      accepted_count: visibleCandidates.filter((candidate) => candidate.assessment.accepted).length,
      review_count: visibleCandidates.filter((candidate) => candidate.assessment.review_required).length,
      no_result_variant_count: number(summary.no_result_variants, 0),
      report_complete: reportComplete,
      truncated_count: truncatedCount,
    },
    database_writes: {
      listings: number(summary.listing_upserts, 0),
      observations: number(summary.observations_created, 0),
      ingestion_runs: number(summary.ingestion_runs_written, 0),
    },
    candidates: visibleCandidates,
  };

  validateMarketCandidateAudit(report);
  return report;
}

export function validateMarketCandidateAudit(report) {
  if (!report || report.schema_version !== SCHEMA_VERSION) throw new Error("Unsupported market candidate audit schema.");
  if (!Array.isArray(report.selection?.selected_variants) || !Array.isArray(report.candidates)) throw new Error("Audit report arrays are missing.");
  if (report.result?.candidate_count !== report.candidates.length) throw new Error("Audit candidate count does not match the report body.");
  if (report.result?.truncated_count > 0 && report.result?.report_complete) throw new Error("A truncated audit report cannot be complete.");
  if (Object.values(report.database_writes ?? {}).some((value) => Number(value) !== 0)) throw new Error("Dry-run audit reports must declare zero database writes.");
  inspectAllowedObject(report);
  for (const candidate of report.candidates) {
    const url = candidate.source?.public_url;
    if (url && sanitizePublicUrl(url) !== url) throw new Error("Audit report contains an unsafe public URL.");
  }
  return true;
}

export function renderMarketCandidateAuditMarkdown(report) {
  validateMarketCandidateAudit(report);
  const lines = [
    "# Market Candidate Audit",
    "",
    "## Run",
    "",
    `- Mode: ${md(report.mode)}`,
    `- Source scope: ${md(report.source_scope)}`,
    `- Run ID: ${md(report.workflow.run_id || "local")}`,
    `- Head SHA: ${md(report.workflow.head_sha || "local")}`,
    "",
    "## Selection",
    "",
    `- Selected variants: ${report.selection.selected_variant_count}`,
    `- Queries: ${report.selection.query_count}`,
    "",
    "## Summary",
    "",
    `- Candidates: ${report.result.candidate_count}`,
    `- Accepted: ${report.result.accepted_count}`,
    `- Review: ${report.result.review_count}`,
    `- No result variants: ${report.result.no_result_variant_count}`,
    `- Complete: ${report.result.report_complete}`,
    `- Truncated: ${report.result.truncated_count}`,
    "",
    "## Candidates",
    "",
    "| Key | Source | Title | Target variant | Target series | Result | Reason | Confidence |",
    "|---|---|---|---|---|---|---|---:|",
    ...report.candidates.map((candidate) => [
      candidate.candidate_key,
      candidate.source.provider,
      candidate.listing.title,
      candidate.target.variant_name || candidate.target.variant_id,
      candidate.target.series_name || candidate.target.series_id,
      candidate.assessment.accepted ? "accepted" : "review",
      candidate.assessment.reason,
      candidate.assessment.confidence.toFixed(2),
    ].map(md).join(" | ").replace(/^/, "| ").replace(/$/, " |")),
    "",
    "## Safety checklist",
    "",
    "- Allowlisted fields only",
    "- Public URLs have credentials, query strings and fragments removed",
    "- Raw API responses, request metadata and seller details are excluded",
    `- Report complete: ${report.result.report_complete}`,
    "",
    "## Write protection",
    "",
    `- Listing writes: ${report.database_writes.listings}`,
    `- Observation writes: ${report.database_writes.observations}`,
    `- Ingestion run writes: ${report.database_writes.ingestion_runs}`,
    "",
  ];
  return lines.join("\n");
}

function buildCandidate(record, queryByText, variantById, seriesById) {
  const safety = record.market_safety ?? {};
  const rawQuery = record.raw?.query;
  const queryText = typeof rawQuery === "string" ? rawQuery : rawQuery?.query || record.raw?.keyword;
  const query = queryByText.get(normalizeQuery(queryText)) ?? {};
  const targetVariant = publicVariant(variantById.get(query.variant_id));
  const targetSeries = seriesById.get(query.series_id || targetVariant?.series_id);
  const matchedIds = [...new Set((safety.matched_variant_ids ?? []).map(String))];
  const resolvedMatches = matchedIds.map((id) => publicVariant(variantById.get(id))).filter(Boolean);
  const visibleMatches = resolvedMatches.slice(0, 5);
  const provider = sanitizeText(record.raw?.provider || record.source || "unknown", 60);
  const listingId = sanitizeText(record.raw?.itemCode || record.raw?.code || record.id, 140);
  const publicUrl = sanitizePublicUrl(provider === "rakuten_ichiba" ? record.raw?.public_item_url : record.source_url);

  return {
    candidate_key: createHash("sha256").update([provider, listingId, publicUrl || ""].join("\n")).digest("hex").slice(0, 16),
    source: {
      provider,
      listing_id: listingId,
      public_url: publicUrl,
      public_url_host: publicUrl ? new URL(publicUrl).hostname : "",
    },
    listing: {
      title: sanitizeText(record.title || record.name, 300),
      price: nullableNumber(record.price),
      status: sanitizeText(record.status, 40),
      listing_type: sanitizeText(safety.listing_type || record.listing_type || "unknown", 40),
    },
    target: {
      variant_id: sanitizeText(targetVariant?.id || query.variant_id, 140),
      variant_slug: sanitizeText(targetVariant?.slug, 160),
      variant_name: sanitizeText(targetVariant?.name, 160),
      series_id: sanitizeText(targetSeries?.id || query.series_id, 140),
      series_slug: sanitizeText(targetSeries?.slug, 160),
      series_name: sanitizeText(targetSeries?.name, 200),
      search_query: sanitizeText(query.query || queryText, 160),
    },
    assessment: {
      accepted: safety.accepted === true,
      review_required: safety.review_required !== false,
      reason: sanitizeText(safety.reason || "market_safety_missing", 100),
      confidence: confidence(safety.confidence),
      matched_variant_ids: visibleMatches.map((variant) => sanitizeText(variant.id, 140)),
      matched_variant_names: visibleMatches.map((variant) => sanitizeText(variant.name, 160)),
      matched_variant_overflow: Math.max(0, resolvedMatches.length - visibleMatches.length),
    },
    checks: {
      variant_evidence_present: safety.checks?.variant_evidence_present === true,
      parent_series_evidence_present: safety.checks?.parent_series_evidence_present === true,
      set_signal_detected: safety.checks?.set_signal_detected === true,
      multiple_variant_candidates: safety.checks?.multiple_variant_candidates === true,
      explicit_variant_conflict: safety.checks?.explicit_variant_conflict === true,
      query_context_present: safety.checks?.query_context_present === true,
    },
  };
}

function buildSelectedVariants(queries, variantById, seriesById) {
  const selected = new Map();
  for (const query of queries) {
    if (selected.has(query.variant_id)) continue;
    const variant = publicVariant(variantById.get(query.variant_id));
    if (!variant) continue;
    const series = seriesById.get(query.series_id || variant.series_id);
    selected.set(query.variant_id, {
      variant_id: sanitizeText(variant.id, 140),
      variant_slug: sanitizeText(variant.slug, 160),
      variant_name: sanitizeText(variant.name, 160),
      series_id: sanitizeText(series?.id || query.series_id, 140),
      series_slug: sanitizeText(series?.slug, 160),
      series_name: sanitizeText(series?.name, 200),
      priority: nullableNumber(query.priority),
      priority_reason: sanitizeText(query.priority_reason, 100),
      query: sanitizeText(query.query, 160),
    });
  }
  return [...selected.values()];
}

function sanitizePublicUrl(value) {
  try {
    const url = new URL(String(value ?? "").replace(C0_CONTROL, "").replace(DISPLAY_CONTROL, ""));
    if (!/^https?:$/.test(url.protocol)) return null;
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().slice(0, 500);
  } catch {
    return null;
  }
}

function sanitizeText(value, maxLength) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(DISPLAY_CONTROL, "")
    .replace(C0_CONTROL, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function publicVariant(variant) {
  return variant && String(variant.variant_type || "").toLowerCase() !== "provisional" ? variant : null;
}

function mapById(existing, values = []) {
  return existing instanceof Map ? existing : new Map(values.map((entry) => [entry.id, entry]));
}

function inspectAllowedObject(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) throw new Error(`Forbidden audit field: ${key}`);
    inspectAllowedObject(child);
  }
}

function md(value) {
  return String(value ?? "")
    .replace(DISPLAY_CONTROL, "")
    .replace(C0_CONTROL, " ")
    .replace(/\s+/g, " ")
    .replace(MARKDOWN_SPECIAL, "\\$&");
}

function normalizeQuery(value) {
  return sanitizeText(value, 160).toLowerCase();
}

function nullableNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function confidence(value) {
  return Math.min(1, Math.max(0, number(value, 0)));
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(parsed) ? Math.trunc(parsed) : fallback));
}

function validIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
