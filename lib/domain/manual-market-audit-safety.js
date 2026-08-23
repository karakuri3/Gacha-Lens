import { validateMarketCandidateAudit } from "./market-candidate-audit.js";

export const MANUAL_MARKET_AUDIT_EXCLUDED_RUN_IDS = Object.freeze([
  "30532684353",
  "30565886734",
  "30572554031",
  "30655163177",
  "30688709185",
  "30694540362",
]);

export const STUCK_MARKET_AUDIT_RUN = Object.freeze({
  run_id: "30688709185",
  audit_source_authorized: false,
  canary_source_authorized: false,
  permanently_excluded_from_rollout: true,
  reason: "orphaned queued run with zero jobs and no artifact",
});

export const FAILED_MANUAL_MARKET_AUDIT_RUN = Object.freeze({
  run_id: "30694540362",
  audit_source_authorized: false,
  canary_source_authorized: false,
  permanently_excluded_from_rollout: true,
  reason: "failed before market dry-run and produced no artifact",
});

const CANDIDATE_KEY = /^[0-9a-f]{16}$/;
const SECRET_ENV_NAME = /(?:KEY|TOKEN|SECRET|PASSWORD|APPLICATION_ID|AFFILIATE_ID)$/i;
const PUBLIC_TRACKING_ENV_NAMES = new Set([
  "RAKUTEN_AFFILIATE_ID",
  "YAHOO_AFFILIATE_TRACKING_ID",
]);
const SECRET_PATTERNS = Object.freeze([
  /authorization\s*[:=]/i,
  /bearer\s+[a-z0-9._~-]{12,}/i,
  /\bgh[pousr]_[a-z0-9_]{12,}\b/i,
  /\bsb_secret_[a-z0-9._-]{12,}\b/i,
  /\beyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{10,}\b/,
]);

export function collectManualMarketAuditSecretValues(env = {}) {
  return [...new Set(Object.entries(env)
    .filter(([name]) => SECRET_ENV_NAME.test(name) && !PUBLIC_TRACKING_ENV_NAMES.has(name))
    .map(([, value]) => String(value ?? ""))
    .filter((value) => value.length >= 8))];
}

export function validateManualMarketAuditReport(report, options = {}) {
  validateMarketCandidateAudit(report);

  if (report.mode !== "dry-run") throw new Error("Manual market audit mode must be dry-run.");
  if (report.source_scope !== "planner-apis") throw new Error("Manual market audit source scope must be planner-apis.");
  if (report.workflow?.event_name !== "workflow_dispatch") throw new Error("Manual market audit must originate from workflow_dispatch.");
  if (String(report.workflow?.head_sha || "") !== String(options.expectedHeadSha || "")) {
    throw new Error("Manual market audit head SHA does not match the dispatched main SHA.");
  }
  if (String(report.workflow?.run_id || "") !== String(options.expectedRunId || "")) {
    throw new Error("Manual market audit Run ID does not match the artifact owner.");
  }
  if (MANUAL_MARKET_AUDIT_EXCLUDED_RUN_IDS.includes(String(report.workflow?.run_id || ""))) {
    throw new Error("This Run is permanently excluded as a manual market audit source.");
  }
  if (report.result?.report_complete !== true) throw new Error("Manual market audit report is incomplete.");
  if (Number(report.result?.truncated_count) !== 0) throw new Error("Manual market audit report is truncated.");

  const selected = report.selection?.selected_variants ?? [];
  if (selected.length < 1 || selected.length > 5) throw new Error("Manual market audit must select between one and five variants.");
  if (Number(report.selection?.selected_variant_count) !== selected.length) throw new Error("Manual market audit selection count is invalid.");
  if (Number(report.selection?.query_count) !== selected.length) throw new Error("Manual market audit query count is invalid.");
  if (new Set(selected.map((entry) => entry.variant_id)).size !== selected.length) throw new Error("Manual market audit variants must be unique.");
  if (new Set(selected.map((entry) => entry.query)).size !== selected.length || selected.some((entry) => !String(entry.query || "").trim())) {
    throw new Error("Manual market audit queries must be non-empty and unique.");
  }
  const seriesCounts = new Map();
  for (const entry of selected) seriesCounts.set(entry.series_id, (seriesCounts.get(entry.series_id) ?? 0) + 1);
  if ([...seriesCounts.values()].some((count) => count > 1)) throw new Error("Manual market audit exceeded one variant per series.");

  const profile = report.selection_profile;
  if (profile?.name !== "manual_canary_diversity" || Number(profile?.max_variants_per_series) !== 1) {
    throw new Error("Manual market audit selection profile is invalid.");
  }

  const blockedVariantIds = new Set((options.blockedVariantIds ?? []).map(String));
  if (selected.some((entry) => blockedVariantIds.has(String(entry.variant_id)))) {
    throw new Error("Manual market audit selected a blocked variant.");
  }

  const candidates = report.candidates ?? [];
  const candidateKeys = candidates.map((candidate) => String(candidate.candidate_key || ""));
  if (candidateKeys.some((key) => !CANDIDATE_KEY.test(key))) throw new Error("Manual market audit candidate key is invalid.");
  if (new Set(candidateKeys).size !== candidateKeys.length) throw new Error("Manual market audit candidate keys must be unique.");
  if (candidateKeys.includes("3908a16901a36053")) throw new Error("Gaspard is permanently excluded from manual market audits.");
  if (candidates.some((candidate) => blockedVariantIds.has(String(candidate.target?.variant_id)))) {
    throw new Error("Manual market audit produced a candidate for a blocked variant.");
  }
  if (Number(report.result?.accepted_count) !== candidates.filter((candidate) => candidate.assessment?.accepted === true).length) {
    throw new Error("Manual market audit accepted count is invalid.");
  }
  if (Number(report.result?.review_count) !== candidates.filter((candidate) => candidate.assessment?.review_required === true).length) {
    throw new Error("Manual market audit review count is invalid.");
  }
  if (Object.values(report.database_writes ?? {}).some((value) => Number(value) !== 0)) {
    throw new Error("Manual market audit recorded a Production database write.");
  }
  return true;
}

export function assertManualMarketAuditCountsUnchanged(before, after) {
  const keys = ["market_listings", "market_listing_observations", "import_issues", "ingestion_runs", "review_required"];
  for (const key of keys) {
    if (!Number.isInteger(before?.[key]) || !Number.isInteger(after?.[key])) throw new Error(`Manual market audit count is missing: ${key}.`);
    if (before[key] !== after[key]) throw new Error(`Manual market audit changed Production count: ${key}.`);
  }
  return true;
}

export function findManualMarketAuditSecretLeaks(files, secretValues = []) {
  const values = [...new Set(secretValues.map(String).filter((value) => value.length >= 8))];
  const findings = [];
  for (const file of files) {
    const text = String(file.text ?? "");
    if (SECRET_PATTERNS.some((pattern) => pattern.test(text)) || values.some((value) => text.includes(value))) {
      findings.push(String(file.name || "artifact"));
    }
  }
  return findings.sort((left, right) => left.localeCompare(right, "en"));
}
