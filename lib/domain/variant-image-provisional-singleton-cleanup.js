import { buildVariantImagePresentation } from "./variant-image-presentation.js";
import { digestCandidateIds } from "./variant-image-parent-conflict-cleanup.js";

export const PROVISIONAL_SINGLETON_PARENT_IMAGE_CLEANUP_EXPECTATION = Object.freeze({
  candidate_count: 1187,
  candidate_set_sha256: "sha256:c94cee7575ed3383c6a03e95c3b1440976e25af1a28803337236dae4a226d9b3",
  exact_valid_parent_conflicts: 1187,
  singleton_conflicts: 1187,
  provider_buckets: Object.freeze({
    bandai: 983,
    takaratomy_arts: 204,
  }),
});

export function decideProvisionalSingletonParentImageCleanupState(input = {}) {
  const expected = PROVISIONAL_SINGLETON_PARENT_IMAGE_CLEANUP_EXPECTATION;
  const candidateCount = Number(input.candidate_count);
  const exactConflicts = Number(input.exact_valid_parent_conflicts);
  const singletonConflicts = Number(input.singleton_conflicts);
  const digest = String(input.candidate_set_sha256 || "");
  const providers = normalizeProviders(input.provider_buckets);

  if (candidateCount === 0 && exactConflicts === 0 && singletonConflicts === 0) {
    return Object.freeze({
      state: "already_clean",
      write_count: 0,
      reason: "provisional_singleton_cohort_already_cleaned",
    });
  }

  if (candidateCount !== expected.candidate_count) throw cleanupError("expected_count_mismatch");
  if (exactConflicts !== expected.exact_valid_parent_conflicts) throw cleanupError("exact_conflict_count_mismatch");
  if (singletonConflicts !== expected.singleton_conflicts) throw cleanupError("singleton_count_mismatch");
  if (digest !== expected.candidate_set_sha256) throw cleanupError("candidate_digest_mismatch");
  for (const [key, value] of Object.entries(expected.provider_buckets)) {
    if (Number(providers[key]) !== value) throw cleanupError("provider_breakdown_mismatch");
  }

  return Object.freeze({
    state: "ready",
    write_count: expected.candidate_count,
    reason: "deterministic_provisional_singleton_cohort_confirmed",
  });
}

export function classifyProvisionalSingletonParentImageCleanup({
  variant = {},
  parent = {},
  siblingCount = 0,
} = {}) {
  const variantImage = cleanText(variant.image || variant.image_url || variant.imageUrl);
  const parentImage = cleanText(parent.image_url || parent.imageUrl);
  const explicitScope = cleanText(variant.image_scope || variant.raw?.image_scope);

  if (Number(siblingCount) !== 1) return failure("not_singleton");
  if (cleanText(variant.variant_type) !== "provisional") return failure("not_provisional");
  if (variant.raw?.provisional !== true) return failure("raw_provisional_not_true");
  if (cleanText(variant.raw?.reason) !== "official_lineup_not_fetched_yet") return failure("wrong_provisional_reason");
  if (!cleanText(variant.name) || cleanText(variant.name) !== cleanText(parent.name)) return failure("name_not_parent_name");
  if (cleanText(variant.source_type) !== "official_site") return failure("non_official_source");
  if (explicitScope === "variant") return failure("explicit_variant_scope");
  if (!isHttpUrl(variantImage) || !isHttpUrl(parentImage)) return failure("invalid_or_blank_image_url");
  if (variantImage !== parentImage) return failure("parent_image_mismatch");

  const presentation = buildVariantImagePresentation({ variant, parent, siblingCount: 1 });
  if (
    presentation.image_scope !== "series_fallback"
    || presentation.has_variant_image
    || presentation.variant_image_url
    || presentation.display_image_url !== parentImage
  ) {
    return failure("presentation_contract_mismatch");
  }

  return Object.freeze({
    ok: true,
    reason: "synthetic_provisional_singleton_parent_copy",
    provider: providerBucket(parent.brand),
  });
}

export function validateProvisionalSingletonParentImageCleanupPrecondition({
  candidate = {},
  variant = {},
  parent = {},
  siblingCount = 0,
} = {}) {
  const expectedVariantId = cleanText(candidate.variant_id);
  const expectedSeriesId = cleanText(candidate.series_id);
  if (!expectedVariantId || cleanText(variant.id) !== expectedVariantId) return failure("variant_id_drift");
  if (
    !expectedSeriesId
    || cleanText(variant.series_id) !== expectedSeriesId
    || cleanText(parent.id) !== expectedSeriesId
  ) return failure("series_identity_drift");

  return classifyProvisionalSingletonParentImageCleanup({ variant, parent, siblingCount });
}

export function digestProvisionalSingletonCandidateIds(ids = []) {
  return digestCandidateIds(ids);
}

export function providerBucket(value) {
  const brand = cleanText(value);
  if (brand === "バンダイ") return "bandai";
  if (brand === "タカラトミーアーツ") return "takaratomy_arts";
  return "other";
}

function normalizeProviders(value = {}) {
  return {
    bandai: Number(value.bandai || 0),
    takaratomy_arts: Number(value.takaratomy_arts || 0),
    other: Number(value.other || 0),
  };
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
