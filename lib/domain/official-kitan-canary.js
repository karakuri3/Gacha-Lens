import { createHash } from "node:crypto";
import {
  OFFICIAL_APPLY_CONTRACT_SCHEMA_VERSION,
  buildOfficialApplyOperation,
  buildOfficialSeriesWriteValues,
  buildOfficialVariantWriteValues,
  digestOfficialRow,
  officialCanonicalDigest,
  validateOfficialApplyOperation,
} from "./official-apply-contract.js";
import { executeOfficialBoundedTransaction } from "./official-bounded-write.js";

export const OFFICIAL_KITAN_CANARY_SCHEMA_VERSION = 1;
export const OFFICIAL_KITAN_CANARY_LIMITS = Object.freeze({ max_series: 1, max_variants: 12, max_restock_events: 0 });

const APPROVAL = /^APPROVE_OFFICIAL_KITAN_CANARY:([0-9a-f]{40}):(sha256:[0-9a-f]{64})$/;
const COUNTS = Object.freeze(["series", "variants", "restock_events", "import_issues", "review_required", "provisional_variants"]);

export function buildKitanStableIdentity(sourceProductId, variantName = null) {
  // Kitan's current detail markup exposes no URL-independent product key. The bounded
  // factual identity-drift guard below therefore blocks a changed slug rather than
  // treating it as an independently insertable product.
  const product = text(sourceProductId);
  if (!product) throw kitanError("kitan_source_product_id_missing");
  const digest = createHash("sha256").update(`kitan_club:${product}:${text(variantName).normalize("NFKC")}`).digest("hex").slice(0, 24);
  return variantName == null ? `official:kitan_club:series:${digest}` : `official:kitan_club:variant:${digest}`;
}

export function buildOfficialKitanReadinessAudit({ provider, catalog = {}, databaseBefore, databaseAfter, workflow = {} } = {}) {
  const blockers = [];
  const rejected = [];
  const candidates = [];
  const before = normalizeCounts(databaseBefore);
  const after = normalizeCounts(databaseAfter);
  const auditDate = auditDateJst(workflow.audit_date);
  if (!completeCounts(databaseBefore) || !completeCounts(databaseAfter)) blockers.push("production_database_snapshot_incomplete");
  if (!sameCounts(before, after)) blockers.push("production_database_delta_detected");
  if (catalog.complete === false) blockers.push("production_catalog_targeted_read_incomplete");
  if (text(provider?.source) !== "kitan_club" || provider?.parser_success !== true) blockers.push("kitan_source_unavailable");
  if (asArray(provider?.issue_codes).length) blockers.push("kitan_source_issues_present");

  const seriesRows = asArray(catalog.series);
  const seriesById = new Map(seriesRows.map((row) => [text(row.id), row]));
  const seriesByUrl = new Map(asArray(catalog.series).filter((row) => validKitanUrl(row.official_url)).map((row) => [canonicalUrl(row.official_url), row]));
  const variantsById = new Map(asArray(catalog.variants).map((row) => [text(row.id), row]));
  const seenSeries = new Set();
  const seenVariants = new Set();

  for (const record of asArray(provider?.records)) {
    const prepared = prepareKitanRecord(record, auditDate);
    if (!prepared.ok) { rejected.push({ source_product_id: text(record?.source_product_id) || null, reasons: prepared.reasons }); continue; }
    const canonical = prepared.record;
    if (seenSeries.has(canonical.id) || canonical.variants.some((variant) => seenVariants.has(variant.id))) {
      rejected.push({ source_product_id: canonical.source_product_id, reasons: ["kitan_identity_collision"] }); continue;
    }
    seenSeries.add(canonical.id);
    canonical.variants.forEach((variant) => seenVariants.add(variant.id));
    const existingSeries = seriesById.get(canonical.id);
    const urlOwner = seriesByUrl.get(canonical.official_url);
    const reasons = [];
    if (existingSeries && canonicalUrl(existingSeries.official_url) !== canonical.official_url) reasons.push("kitan_series_identity_url_drift");
    if (urlOwner && text(urlOwner.id) !== canonical.id) reasons.push("kitan_series_identity_collision");
    if (existingSeries && text(existingSeries.source_type) !== "official_site") reasons.push("kitan_series_source_ownership_conflict");
    const drift = findKitanIdentityDrift(canonical, seriesRows, catalog.variants);
    if (drift) reasons.push(drift);
    const seriesValues = buildOfficialSeriesWriteValues(canonical);
    const seriesOperation = existingSeries ? (digestOfficialRow("series", existingSeries) === digestOfficialRow("series", seriesValues) ? "none" : "update") : "insert";
    const seriesApply = buildOfficialApplyOperation({ table: "series", operation: seriesOperation, values: seriesValues, existing: existingSeries });
    const variantPlans = canonical.variants.map((variant) => {
      const existing = variantsById.get(variant.id);
      if (existing && text(existing.series_id) !== canonical.id) reasons.push("kitan_variant_parent_identity_collision");
      if (existing && text(existing.source_type) !== "official_site") reasons.push("kitan_variant_source_ownership_conflict");
      if (existing?.review_required === true) reasons.push("kitan_review_required_downgrade_blocked");
      const values = buildOfficialVariantWriteValues(variant, canonical);
      const operation = existing ? (digestOfficialRow("variants", existing) === digestOfficialRow("variants", values) ? "none" : "update") : "insert";
      return { id: variant.id, name: variant.name, operation, apply: buildOfficialApplyOperation({ table: "variants", operation, values, existing }) };
    });
    const contract = { schema_version: OFFICIAL_APPLY_CONTRACT_SCHEMA_VERSION, series: seriesApply, variants: variantPlans.map((item) => item.apply), restock_event: null, deletes: 0, cleanup_operations: 0, import_issue_writes: 0 };
    contract.canonical_digest = officialCanonicalDigest(contract);
    if (reasons.length) { rejected.push({ source_product_id: canonical.source_product_id, reasons: [...new Set(reasons)].sort() }); continue; }
    candidates.push({ series_id: canonical.id, source_product_id: canonical.source_product_id, series_name: canonical.name, official_url: canonical.official_url, operation: seriesOperation, variant_count: variantPlans.length, variants: variantPlans.map(({ apply, ...item }) => item), source_count_conflict: false, capability: canonical.capability, release_status: canonical.release_status, canonical_release: { release_date: canonical.release_date, release_month: canonical.release_month, release_week: null }, apply_contract: contract });
  }

  const selected = candidates.slice().sort(compareKitanCanaryCandidates).at(0) || null;
  if (!selected) blockers.push("kitan_no_safe_candidate");
  const reportComplete = completeCounts(databaseBefore) && completeCounts(databaseAfter) && sameCounts(before, after) && text(provider?.source) === "kitan_club";
  const report = {
    schema_version: OFFICIAL_KITAN_CANARY_SCHEMA_VERSION,
    report_type: "official_kitan_readiness_audit",
    provider: "kitan_club",
    production_integration_enabled: false,
    execution: { mode: "read-only", manual_only: true, deletes_allowed: false, cleanup_enabled: false },
    workflow: { run_id: numericId(workflow.run_id), head_sha: sha(workflow.head_sha), event_name: text(workflow.event_name) || "local", audit_date_jst: auditDate },
    source: { parser_success: provider?.parser_success === true, records: asArray(provider?.records).length, source_count_conflict_excluded_count: asArray(provider?.records).filter((record) => record?.source_count_conflict === true).length, issue_codes: [...new Set(asArray(provider?.issue_codes).map(text).filter(Boolean))].sort() },
    limits: { ...OFFICIAL_KITAN_CANARY_LIMITS },
    plan: { eligible_candidate_count: candidates.length, selected_candidate_count: selected ? 1 : 0, candidate_count: selected ? 1 : 0, selected_candidate: selected, eligible_candidates: candidates.map(summarizeEligibleCandidate), rejected_candidates: rejected, restock_events: 0, deletes: 0, cleanup_operations: 0, import_issue_writes: 0 },
    database: { before, after, delta: delta(before, after), writes: 0, deletes: 0, cleanup_operations: 0, import_issue_writes: 0 },
    report_complete: reportComplete,
    manual_canary_ready: reportComplete && blockers.length === 0 && selected != null,
    blockers: [...new Set(blockers)].sort(),
    final_verdict: reportComplete && blockers.length === 0 && selected != null ? "OFFICIAL_KITAN_READINESS_READY" : "OFFICIAL_KITAN_READINESS_BLOCKED",
  };
  report.canonical_digest = digest(report);
  return report;
}

export function authorizeOfficialKitanCanary({ report, auditRunId, auditDigest, approval, headSha, originMainSha } = {}) {
  validateOfficialKitanReadinessAudit(report);
  const current = sha(headSha);
  const origin = sha(originMainSha);
  const match = text(approval).match(APPROVAL);
  if (!current || current !== origin || current !== sha(report.workflow?.head_sha)) throw kitanError("kitan_canary_main_sha_mismatch");
  if (!numericId(auditRunId) || numericId(auditRunId) !== numericId(report.workflow?.run_id)) throw kitanError("kitan_canary_audit_run_mismatch");
  if (text(auditDigest) !== report.canonical_digest) throw kitanError("kitan_canary_audit_digest_mismatch");
  if (!match || match[1] !== current || match[2] !== report.canonical_digest) throw kitanError("kitan_canary_approval_mismatch");
  if (report.final_verdict !== "OFFICIAL_KITAN_READINESS_READY" || report.manual_canary_ready !== true || report.plan.selected_candidate_count !== 1 || report.plan.candidate_count !== 1 || report.provider !== "kitan_club" || report.plan.deletes !== 0 || report.plan.cleanup_operations !== 0 || report.plan.import_issue_writes !== 0) throw kitanError("kitan_canary_audit_not_ready");
  const candidate = report.plan.selected_candidate;
  if (!candidate || candidate.source_count_conflict === true || candidate.variant_count < 1 || candidate.variant_count > OFFICIAL_KITAN_CANARY_LIMITS.max_variants || candidate.apply_contract?.restock_event || candidate.apply_contract?.deletes !== 0 || candidate.apply_contract?.cleanup_operations !== 0 || candidate.apply_contract?.import_issue_writes !== 0) throw kitanError("kitan_canary_candidate_unsafe");
  validateKitanContract(candidate);
  return { ok: true, kind: "kitan_manual_canary", head_sha: current, audit_run_id: numericId(auditRunId), audit_digest: report.canonical_digest, approval_digest: match[2], candidate };
}

export async function executeOfficialKitanCanaryTransaction({ adapter, authorization, workflow = {} } = {}) {
  if (authorization?.kind !== "kitan_manual_canary") throw kitanError("kitan_canary_authorization_missing");
  return executeOfficialBoundedTransaction({ adapter, authorization, workflow });
}

export function validateOfficialKitanReadinessAudit(report) {
  if (report?.schema_version !== OFFICIAL_KITAN_CANARY_SCHEMA_VERSION || report?.report_type !== "official_kitan_readiness_audit" || report?.provider !== "kitan_club") throw new Error("Kitan readiness audit schema is invalid.");
  if (report.production_integration_enabled !== false || report.execution?.mode !== "read-only" || report.database?.writes !== 0 || report.database?.deletes !== 0 || report.plan?.deletes !== 0 || report.plan?.cleanup_operations !== 0 || report.plan?.import_issue_writes !== 0) throw new Error("Kitan readiness audit is not read-only.");
  if (report.limits?.max_series !== 1 || report.limits?.max_variants !== 12 || report.limits?.max_restock_events !== 0) throw new Error("Kitan readiness audit limits are invalid.");
  if (!Number.isInteger(report.plan?.eligible_candidate_count) || report.plan.eligible_candidate_count < 0 || report.plan?.selected_candidate_count !== (report.plan?.selected_candidate ? 1 : 0) || report.plan?.candidate_count !== report.plan?.selected_candidate_count || report.plan.candidate_count > 1 || asArray(report.plan?.eligible_candidates).length !== report.plan.eligible_candidate_count) throw new Error("Kitan readiness candidate selection is invalid.");
  if (report.plan?.selected_candidate) validateKitanContract(report.plan.selected_candidate);
  if (!/^sha256:[0-9a-f]{64}$/.test(text(report.canonical_digest)) || digest(report) !== report.canonical_digest) throw new Error("Kitan readiness audit digest is invalid.");
  if (!sameCounts(report.database.before, report.database.after)) throw new Error("Kitan readiness audit detected database drift.");
  return report;
}

export function formatOfficialKitanReadinessMarkdown(report) {
  return ["# Official Kitan readiness audit", "", `- Verdict: ${report.final_verdict}`, `- Provider: ${report.provider}`, `- Audit date (JST): ${report.workflow.audit_date_jst}`, `- Manual canary ready: ${report.manual_canary_ready}`, `- Eligible candidate count: ${report.plan.eligible_candidate_count}`, `- Selected candidate count: ${report.plan.selected_candidate_count}`, `- Selected candidate: ${report.plan.selected_candidate?.series_id || "none"}`, `- Source count conflicts excluded: ${report.source.source_count_conflict_excluded_count}`, `- Database writes: ${report.database.writes}`, "- Deletes: 0", "- Cleanup operations: 0", `- Canonical digest: ${report.canonical_digest}`, ""].join("\n");
}

function prepareKitanRecord(record, auditDate) {
  const reasons = [];
  if (text(record?.source) !== "kitan_club" || text(record?.manufacturer) !== "キタンクラブ") reasons.push("kitan_provider_invalid");
  if (record?.capability?.series_metadata_status !== "safe" || record?.capability?.variant_catalog_status !== "safe") reasons.push("kitan_capability_unsafe");
  if (record?.source_count_conflict === true || record?.capability?.source_count_conflict === true) reasons.push("kitan_source_count_conflict");
  if (!validKitanUrl(record?.official_url) || !text(record?.source_product_id) || !text(record?.series_name) || !Number.isFinite(record?.price) || (!text(record?.release_date) && !text(record?.release_month))) reasons.push("kitan_series_metadata_invalid");
  const names = asArray(record?.variants).map((variant) => text(variant?.name));
  if (!names.length || names.length > OFFICIAL_KITAN_CANARY_LIMITS.max_variants || names.some((name) => !name) || duplicate(names.map(normalize))) reasons.push("kitan_variant_catalog_invalid");
  if (reasons.length) return { ok: false, reasons: [...new Set(reasons)].sort() };
  const id = buildKitanStableIdentity(record.source_product_id);
  const releaseStatus = resolveKitanReleaseStatus(record, auditDate);
  const variants = record.variants.map((variant) => ({ id: buildKitanStableIdentity(record.source_product_id, variant.name), name: text(variant.name), image: validImage(variant.image_candidate) ? variant.image_candidate : null, released: releaseStatus.released, price: record.price, brand: "キタンクラブ", release_date: text(record.release_date) || null, release_month: text(record.release_month) || null, official_url: canonicalUrl(record.official_url), variant_type: "normal" }));
  return { ok: true, record: { id, slug: id, source_product_id: text(record.source_product_id), name: text(record.series_name), brand: "キタンクラブ", release_date: text(record.release_date) || null, release_month: text(record.release_month) || null, price: record.price, image_url: validImage(record.series_image_candidate) ? record.series_image_candidate : null, official_url: canonicalUrl(record.official_url), released: releaseStatus.released, release_status: releaseStatus, variants, capability: record.capability } };
}

function validateKitanContract(candidate) {
  const contract = candidate.apply_contract;
  if (contract?.schema_version !== OFFICIAL_APPLY_CONTRACT_SCHEMA_VERSION || contract?.restock_event || contract?.deletes !== 0 || contract?.cleanup_operations !== 0 || contract?.import_issue_writes !== 0) throw kitanError("kitan_canary_contract_invalid");
  validateOfficialApplyOperation(contract.series, "series");
  for (const operation of asArray(contract.variants)) validateOfficialApplyOperation(operation, "variants");
  if (contract.variants.length !== candidate.variant_count || duplicate(contract.variants.map((operation) => operation.id))) throw kitanError("kitan_canary_contract_identity_invalid");
  const clone = structuredClone(contract); delete clone.canonical_digest;
  if (contract.canonical_digest !== officialCanonicalDigest(clone)) throw kitanError("kitan_canary_contract_digest_invalid");
}

function compareKitanCanaryCandidates(left, right) {
  // Every entry here already passed the Kitan safety gates. Prefer the newest official
  // release evidence, then use the stable source identity only as a deterministic tie-break.
  return releaseEvidenceKey(right).localeCompare(releaseEvidenceKey(left))
    || left.source_product_id.localeCompare(right.source_product_id, "en")
    || left.series_id.localeCompare(right.series_id, "en");
}

function summarizeEligibleCandidate(candidate) {
  return {
    series_id: candidate.series_id,
    source_product_id: candidate.source_product_id,
    series_name: candidate.series_name,
    official_url: candidate.official_url,
    variant_count: candidate.variant_count,
    release_status: candidate.release_status,
    source_count_conflict: false,
  };
}

function releaseEvidenceKey(candidate) {
  return text(candidate?.canonical_release?.release_date)
    || text(candidate?.canonical_release?.release_month)
    || "0000-00-00";
}

function resolveKitanReleaseStatus(record, auditDate) {
  const releaseDate = text(record?.release_date);
  const releaseMonth = text(record?.release_month);
  if (/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) {
    return { audit_date_jst: auditDate, released: releaseDate <= auditDate, precision: "exact_date" };
  }
  if (/^\d{4}-\d{2}$/.test(releaseMonth)) {
    const auditMonth = auditDate.slice(0, 7);
    return { audit_date_jst: auditDate, released: releaseMonth < auditMonth, precision: releaseMonth === auditMonth ? "month_only_current_conservative" : "month_only" };
  }
  throw kitanError("kitan_release_evidence_invalid");
}

function findKitanIdentityDrift(incoming, seriesRows, variantRows) {
  const sameNameRows = asArray(seriesRows).filter((row) => text(row?.id) !== incoming.id && text(row?.brand) === "キタンクラブ" && text(row?.source_type) === "official_site" && normalize(row?.name) === normalize(incoming.name));
  for (const existing of sameNameRows) {
    if (!sameReleaseEvidence(existing, incoming) || Number(existing.price) !== Number(incoming.price)) continue;
    const existingVariants = asArray(variantRows).filter((variant) => text(variant?.series_id) === text(existing.id));
    const incomingNames = incoming.variants.map((variant) => normalize(variant.name)).sort();
    const existingNames = existingVariants.map((variant) => normalize(variant.name)).sort();
    if (!existingNames.length || existingNames.length !== incomingNames.length) return "kitan_identity_drift_ambiguous";
    if (JSON.stringify(existingNames) === JSON.stringify(incomingNames)) return "kitan_identity_drift_possible";
    return "kitan_identity_drift_ambiguous";
  }
  return null;
}

function sameReleaseEvidence(existing, incoming) {
  const existingDate = text(existing?.release_date);
  const incomingDate = text(incoming?.release_date);
  if (existingDate && incomingDate) return existingDate === incomingDate;
  return text(existing?.release_month) && text(existing?.release_month) === text(incoming?.release_month);
}

function auditDateJst(value) {
  const supplied = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(supplied)) return supplied;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date())
    .reduce((result, part) => part.type === "literal" ? result : { ...result, [part.type]: part.value }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function validKitanUrl(value) { try { const url = new URL(value); return url.protocol === "https:" && url.hostname === "kitan.jp" && /^\/products\/[^/?#]+\/$/.test(url.pathname) && !url.search; } catch { return false; } }
function validImage(value) { try { return new URL(value).protocol === "https:"; } catch { return false; } }
function canonicalUrl(value) { const url = new URL(value); url.hash = ""; return url.toString(); }
function digest(value) { const clone = structuredClone(value); delete clone.canonical_digest; return officialCanonicalDigest(clone); }
function normalize(value) { return text(value).normalize("NFKC"); }
function duplicate(values) { return new Set(values).size !== values.length; }
function delta(before, after) { return Object.fromEntries(COUNTS.map((key) => [key, after[key] - before[key]])); }
function sameCounts(before, after) { return COUNTS.every((key) => before[key] === after[key]); }
function normalizeCounts(value) { return Object.fromEntries(COUNTS.map((key) => [key, Number.isInteger(value?.[key]) && value[key] >= 0 ? value[key] : 0])); }
function completeCounts(value) { return COUNTS.every((key) => Number.isInteger(value?.[key]) && value[key] >= 0); }
function numericId(value) { const id = text(value); return /^\d+$/.test(id) ? id : null; }
function sha(value) { const result = text(value).toLowerCase(); return /^[0-9a-f]{40}$/.test(result) ? result : null; }
function asArray(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function text(value) { return value == null ? "" : String(value).trim(); }
function kitanError(reason_code) { const error = new Error(reason_code); error.reason_code = reason_code; return error; }
