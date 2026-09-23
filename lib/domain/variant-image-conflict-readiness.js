import { isGeneratedImagePlaceholder, normalizeImageUrl } from "./variant-image-presentation.js";

export const VARIANT_IMAGE_CONFLICT_CLASSIFICATIONS = Object.freeze([
  "safe_clear_parent_copy",
  "safe_clear_provisional_parent_copy",
  "manual_review_explicit_variant_scope",
  "manual_review_singleton",
  "manual_review_unknown_sibling_count",
  "not_parent_copy",
]);

export function classifyVariantImageConflict({ variant = {}, parent = {}, siblingCount = 0 } = {}) {
  const variantImage = text(variant.image || variant.image_url || variant.imageUrl);
  const parentImage = text(parent.image_url || parent.imageUrl);
  const explicitScope = text(variant.image_scope || variant.raw?.image_scope);
  const normalizedSiblingCount = Number.isSafeInteger(siblingCount) && siblingCount >= 0 ? siblingCount : 0;

  if (
    !variantImage
    || !parentImage
    || normalizeImageUrl(variantImage) !== normalizeImageUrl(parentImage)
  ) {
    return result("not_parent_copy", "none");
  }

  if (normalizedSiblingCount === 0) {
    return result("manual_review_unknown_sibling_count", "review");
  }

  if (explicitScope === "variant") {
    return result("manual_review_explicit_variant_scope", "review");
  }

  if (normalizedSiblingCount === 1) {
    return result("manual_review_singleton", "review");
  }

  if (variant.variant_type === "provisional" || isGeneratedImagePlaceholder(variantImage)) {
    return result("safe_clear_provisional_parent_copy", "clear_variant_image");
  }

  return result("safe_clear_parent_copy", "clear_variant_image");
}

export function buildVariantImageConflictReadiness(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || input.schema_version !== 1 || !Array.isArray(input.records)) {
    throw new Error("invalid_input_schema");
  }

  const counts = Object.fromEntries(VARIANT_IMAGE_CONFLICT_CLASSIFICATIONS.map((classification) => [classification, 0]));
  const records = input.records.map((record, index) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("invalid_input_schema");
    const classification = classifyVariantImageConflict({
      variant: record.variant,
      parent: record.parent,
      siblingCount: record.sibling_count,
    });
    counts[classification.classification] += 1;
    return {
      index,
      classification: classification.classification,
      action: classification.action,
    };
  });

  return {
    schema_version: 1,
    mode: "offline",
    record_count: records.length,
    classification_counts: counts,
    safe_clear_count: records.filter((record) => record.action === "clear_variant_image").length,
    manual_review_count: records.filter((record) => record.action === "review").length,
    no_action_count: records.filter((record) => record.action === "none").length,
    records,
    safety: {
      network_requests: 0,
      credential_reads: 0,
      production_reads: 0,
      database_writes: 0,
    },
  };
}

function result(classification, action) {
  return {
    classification,
    action,
    eligible_for_clear: action === "clear_variant_image",
    review_required: action === "review",
  };
}

function text(value) {
  return value == null ? "" : String(value).trim();
}
