import { createHash } from "node:crypto";
import { validateMarketCandidateAudit } from "./market-candidate-audit.js";
import { isNonAuthoritativeManualMarketAudit } from "./manual-market-audit-diagnostic.js";

const PLAN_SCHEMA_VERSION = 1;
const MAX_BATCH_SIZE = 4;
const CANDIDATE_KEY = /^[0-9a-f]{16}$/;
const ACCEPTED_REASON = "variant_and_parent_evidence_confirmed";

export function buildSanitizedMarketRolloutPlan(report, options = {}) {
  validateRolloutAudit(report);
  const generatedAt = validIso(options.generatedAt) ?? new Date().toISOString();
  const eligible = report.candidates
    .filter(isEligibleCandidate)
    .sort((left, right) => left.candidate_key.localeCompare(right.candidate_key, "en"))
    .map(sanitizePlanCandidate);
  const batches = chunk(eligible, MAX_BATCH_SIZE).map((candidates, index) => ({
    batch_number: index + 1,
    candidate_count: candidates.length,
    candidate_keys: candidates.map((candidate) => candidate.candidate_key),
    candidates,
    batch_digest: digestBatch({
      source_audit_run_id: String(report.workflow.run_id),
      audit_head_sha: String(report.workflow.head_sha),
      batch_number: index + 1,
      candidates,
    }),
  }));

  return {
    schema_version: PLAN_SCHEMA_VERSION,
    source_audit_run_id: String(report.workflow.run_id),
    audit_head_sha: String(report.workflow.head_sha),
    generated_at: generatedAt,
    accepted_candidate_count: eligible.length,
    review_required_count: Number(report.result.review_count),
    excluded_candidate_count: report.candidates.length - eligible.length,
    batch_count: batches.length,
    max_batch_size: MAX_BATCH_SIZE,
    database_writes: 0,
    batches,
  };
}

export function validateRolloutAudit(report) {
  validateMarketCandidateAudit(report);
  if (isNonAuthoritativeManualMarketAudit(report)) {
    throw new Error("Diagnostic-only manual market audits cannot produce a rollout plan.");
  }
  if (report.mode !== "dry-run") throw new Error("Rollout plan requires a dry-run audit.");
  if (report.source_scope !== "planner-apis") throw new Error("Rollout plan requires planner-apis.");
  if (report.result?.report_complete !== true) throw new Error("Rollout audit is incomplete.");
  if (Number(report.result?.truncated_count) !== 0) throw new Error("Rollout audit is truncated.");
  if (!/^\d+$/.test(String(report.workflow?.run_id ?? ""))) throw new Error("Rollout audit run ID is invalid.");
  if (!/^[0-9a-f]{7,40}$/i.test(String(report.workflow?.head_sha ?? ""))) throw new Error("Rollout audit head SHA is invalid.");
  if (Number(report.selection?.selected_variant_count) !== report.selection?.selected_variants?.length) {
    throw new Error("Rollout audit selected variant total does not match.");
  }
  if (Number(report.selection?.query_count) !== report.selection?.selected_variants?.length) {
    throw new Error("Rollout audit query total does not match.");
  }

  const candidates = report.candidates;
  const keys = candidates.map((candidate) => candidate.candidate_key);
  if (keys.some((key) => !CANDIDATE_KEY.test(String(key)))) throw new Error("Rollout audit candidate key is invalid.");
  if (new Set(keys).size !== keys.length) throw new Error("Rollout audit contains duplicate candidate keys.");

  const accepted = candidates.filter((candidate) => candidate.assessment?.accepted === true);
  const review = candidates.filter((candidate) => candidate.assessment?.review_required === true);
  if (accepted.some((candidate) => candidate.assessment?.review_required !== false)) {
    throw new Error("Rollout audit has an accepted review-required candidate.");
  }
  if (candidates.some((candidate) => (
    candidate.assessment?.accepted !== true
    && candidate.assessment?.review_required !== true
  ))) {
    throw new Error("Rollout audit has an unclassified candidate.");
  }
  if (
    Number(report.result.candidate_count) !== candidates.length
    || Number(report.result.accepted_count) !== accepted.length
    || Number(report.result.review_count) !== review.length
    || accepted.length + review.length !== candidates.length
  ) {
    throw new Error("Rollout audit totals do not match.");
  }
  return true;
}

export function renderMarketRolloutPlanMarkdown(plan = {}) {
  const lines = [
    "# Market Guarded Rollout Plan",
    "",
    `- Source audit run: ${plan.source_audit_run_id ?? ""}`,
    `- Audit head SHA: ${plan.audit_head_sha ?? ""}`,
    `- Accepted candidates: ${Number(plan.accepted_candidate_count) || 0}`,
    `- Review required: ${Number(plan.review_required_count) || 0}`,
    `- Batches: ${Number(plan.batch_count) || 0}`,
    `- Database writes: ${Number(plan.database_writes) || 0}`,
    "",
  ];
  for (const batch of plan.batches ?? []) {
    lines.push(
      `## Batch ${batch.batch_number}`,
      "",
      `- Digest: ${batch.batch_digest}`,
      "",
      "| Key | Provider | Target variant | Status | Price |",
      "|---|---|---|---|---:|",
      ...batch.candidates.map((candidate) => `| ${candidate.candidate_key} | ${candidate.provider} | ${escapeMarkdown(candidate.target_variant_name)} | ${candidate.status} | ${candidate.price} |`),
      "",
    );
  }
  return lines.join("\n");
}

function isEligibleCandidate(candidate) {
  return candidate.assessment?.accepted === true
    && candidate.assessment?.review_required === false
    && candidate.assessment?.reason === ACCEPTED_REASON
    && Number(candidate.assessment?.confidence) >= 0.8;
}

function sanitizePlanCandidate(candidate) {
  const provider = String(candidate.source?.provider ?? "").trim();
  const targetVariantId = String(candidate.target?.variant_id ?? "").trim();
  const targetVariantName = String(candidate.target?.variant_name ?? "").trim();
  const status = String(candidate.listing?.status ?? "").trim();
  const price = Number(candidate.listing?.price);
  if (!provider || !targetVariantId || !targetVariantName || !status || !Number.isFinite(price) || price <= 0) {
    throw new Error(`Eligible rollout candidate ${candidate.candidate_key} is incomplete.`);
  }
  return {
    candidate_key: candidate.candidate_key,
    provider,
    target_variant_id: targetVariantId,
    target_variant_name: targetVariantName,
    status,
    price,
  };
}

function digestBatch(value) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function chunk(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function validIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function escapeMarkdown(value) {
  return String(value ?? "").replace(/[\\|`*_[\]{}()<>#+\-.!~]/g, "\\$&");
}
