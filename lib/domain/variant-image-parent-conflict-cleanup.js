import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { buildVariantImagePresentation } from "./variant-image-presentation.js";

export const VARIANT_PARENT_IMAGE_CLEANUP_EXPECTATION = Object.freeze({
  candidate_count: 5885,
  candidate_set_sha256: "sha256:5f5ce212e4e8518df554b16c3342a3cea6fa154c35238e344586715f14fdf4c9",
  exact_valid_parent_conflicts: 7072,
  singleton_ambiguous: 1187,
  candidate_type_buckets: Object.freeze({
    provisional: 2383,
    normal: 3492,
    rare: 5,
    secret: 5,
    other: 0,
  }),
});

export function decideVariantParentImageCleanupState(input = {}) {
  const expected = VARIANT_PARENT_IMAGE_CLEANUP_EXPECTATION;
  const candidateCount = Number(input.candidate_count);
  const exactConflicts = Number(input.exact_valid_parent_conflicts);
  const singleton = Number(input.singleton_ambiguous);
  const digest = String(input.candidate_set_sha256 || "");
  const buckets = normalizeBuckets(input.candidate_type_buckets);

  if (candidateCount === 0
    && exactConflicts === expected.singleton_ambiguous
    && singleton === expected.singleton_ambiguous) {
    return Object.freeze({
      state: "already_clean",
      write_count: 0,
      reason: "safe_cohort_already_cleaned",
    });
  }

  if (candidateCount !== expected.candidate_count) throw cleanupError("expected_count_mismatch");
  if (exactConflicts !== expected.exact_valid_parent_conflicts) throw cleanupError("exact_conflict_count_mismatch");
  if (singleton !== expected.singleton_ambiguous) throw cleanupError("singleton_count_mismatch");
  if (digest !== expected.candidate_set_sha256) throw cleanupError("candidate_digest_mismatch");

  for (const [key, value] of Object.entries(expected.candidate_type_buckets)) {
    if (Number(buckets[key]) !== value) throw cleanupError("candidate_type_breakdown_mismatch");
  }

  return Object.freeze({
    state: "ready",
    write_count: expected.candidate_count,
    reason: "deterministic_safe_cohort_confirmed",
  });
}

export function validateVariantParentImageCleanupPrecondition({
  candidate = {},
  variant = {},
  parent = {},
  siblingCount = 0,
} = {}) {
  const variantId = cleanText(variant.id);
  const seriesId = cleanText(variant.series_id);
  const parentId = cleanText(parent.id);
  const expectedVariantId = cleanText(candidate.variant_id);
  const expectedSeriesId = cleanText(candidate.series_id);
  const variantImage = cleanText(variant.image);
  const parentImage = cleanText(parent.image_url);
  const explicitScope = cleanText(variant.image_scope || variant.raw?.image_scope);

  if (!expectedVariantId || variantId !== expectedVariantId) return failure("variant_id_drift");
  if (!expectedSeriesId || seriesId !== expectedSeriesId || parentId !== expectedSeriesId) return failure("series_identity_drift");
  if (cleanText(variant.source_type) !== "official_site") return failure("source_type_drift");
  if (!isHttpUrl(variantImage) || !isHttpUrl(parentImage)) return failure("invalid_or_blank_image_url");
  if (variantImage !== parentImage) return failure("image_drift");
  if (explicitScope === "variant") return failure("explicit_variant_scope");
  if (!Number.isSafeInteger(Number(siblingCount)) || Number(siblingCount) <= 1) return failure("singleton_or_invalid_sibling_count");

  const presentation = buildVariantImagePresentation({ variant, parent, siblingCount: Number(siblingCount) });
  if (presentation.image_scope !== "series_fallback" || presentation.has_variant_image) {
    return failure("presentation_drift");
  }

  return Object.freeze({ ok: true, reason: "precondition_confirmed" });
}

export function partitionVariantParentImageCleanupCandidates(candidates = [], {
  batchSize = 250,
  expectedCount = candidates.length,
  expectedDigest = digestCandidateIds(candidates.map((item) => item.variant_id)),
} = {}) {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
    throw cleanupError("invalid_batch_size");
  }
  if (!Array.isArray(candidates) || candidates.length !== Number(expectedCount)) {
    throw cleanupError("expected_count_mismatch");
  }

  const sorted = [...candidates].sort((left, right) => compareUtf8(cleanText(left.variant_id), cleanText(right.variant_id)));
  const ids = sorted.map((item) => cleanText(item.variant_id));
  if (ids.some((id) => !id)) throw cleanupError("invalid_candidate_id");
  if (new Set(ids).size !== ids.length) throw cleanupError("duplicate_candidate_id");

  const digest = digestCandidateIds(ids);
  if (digest !== expectedDigest) throw cleanupError("candidate_digest_mismatch");

  const batches = [];
  for (let index = 0; index < sorted.length; index += batchSize) {
    batches.push(Object.freeze(sorted.slice(index, index + batchSize)));
  }
  return Object.freeze({
    candidate_count: sorted.length,
    candidate_set_sha256: digest,
    batch_size: batchSize,
    batch_count: batches.length,
    batches: Object.freeze(batches),
  });
}

export function digestCandidateIds(ids = []) {
  const normalized = [...ids].map(cleanText).sort(compareUtf8);
  return `sha256:${createHash("sha256").update(JSON.stringify(normalized)).digest("hex")}`;
}

function normalizeBuckets(value = {}) {
  return {
    provisional: Number(value.provisional || 0),
    normal: Number(value.normal || 0),
    rare: Number(value.rare || 0),
    secret: Number(value.secret || 0),
    other: Number(value.other || 0),
  };
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function cleanText(value) {
  return value == null ? "" : String(value).trim();
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function failure(reason) {
  return Object.freeze({ ok: false, reason });
}

function cleanupError(reason) {
  const error = new Error(reason);
  error.reason_code = reason;
  return error;
}
