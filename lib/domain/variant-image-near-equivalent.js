import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { buildVariantImagePresentation } from "./variant-image-presentation.js";

export const NEAR_EQUIVALENT_PARENT_IMAGE_CLEANUP_EXPECTATION = Object.freeze({
  candidate_count: 3982,
  candidate_set_sha256: "sha256:69eddb0b502ef4febcc2d0e56dcbd4da188b026255c827c700b44fa7261bcd5c",
  provider_buckets: Object.freeze({
    bandai: 3931,
    takaratomy_arts: 51,
  }),
  rejected_or_ambiguous: 3,
  raw_variant_image_missing_before: 7072,
  raw_variant_image_missing_after: 11054,
  exact_parent_conflicts: 0,
  series_image_missing: 0,
});

export function parseBandaiImageAsset(value) {
  const url = httpUrl(value);
  if (!url || url.hostname.toLowerCase() !== "bandai-a.akamaihd.net") return null;
  const match = url.pathname.match(/^\/bc\/img\/model\/(b|xl)\/([0-9]+)_([0-9]+)\.jpg$/i);
  if (!match) return null;
  const sizePath = match[1].toLowerCase();
  const assetId = match[2];
  const frame = match[3];
  return Object.freeze({
    provider: "bandai",
    host: "bandai-a.akamaihd.net",
    size_path: sizePath,
    asset_id: assetId,
    frame,
    extension: "jpg",
    canonical_asset_identity: `bandai|bandai-a.akamaihd.net|bc/img/model|${assetId}|${frame}|jpg`,
  });
}

export function parseTakaratomyArtsImageAsset(value) {
  const url = httpUrl(value);
  if (!url || url.hostname.toLowerCase() !== "www.takaratomy-arts.co.jp") return null;
  const match = url.pathname.match(/^\/upfiles\/products\/([^/?]+)_([sb])\.jpg$/i);
  if (!match) return null;
  const productCode = match[1];
  const sizeSuffix = match[2].toLowerCase();
  return Object.freeze({
    provider: "takaratomy_arts",
    host: "www.takaratomy-arts.co.jp",
    product_code: productCode,
    image_identity: productCode,
    size_suffix: sizeSuffix,
    extension: "jpg",
    canonical_asset_identity: `takaratomy_arts|www.takaratomy-arts.co.jp|upfiles/products|${productCode}|jpg`,
  });
}

export function classifyProviderImageRelationship(variantUrl, parentUrl) {
  const variantBandai = parseBandaiImageAsset(variantUrl);
  const parentBandai = parseBandaiImageAsset(parentUrl);
  if (variantBandai && parentBandai) {
    if (variantBandai.asset_id !== parentBandai.asset_id) {
      return failure("different_asset_id", "bandai");
    }
    if (variantBandai.frame !== parentBandai.frame) {
      return failure("same_asset_different_frame", "bandai");
    }
    if (variantBandai.size_path === parentBandai.size_path) {
      return failure("same_asset_same_size_path", "bandai");
    }
    return successRelationship(
      "bandai_exact_asset_size_derivative",
      "bandai",
      variantBandai.canonical_asset_identity,
      { variant_asset: variantBandai, parent_asset: parentBandai },
    );
  }

  const variantTta = parseTakaratomyArtsImageAsset(variantUrl);
  const parentTta = parseTakaratomyArtsImageAsset(parentUrl);
  if (variantTta && parentTta) {
    if (variantTta.product_code !== parentTta.product_code) {
      return failure("different_product_code", "takaratomy_arts");
    }
    if (variantTta.size_suffix === parentTta.size_suffix) {
      return failure("same_asset_same_size_suffix", "takaratomy_arts");
    }
    return successRelationship(
      "tarts_exact_asset_size_derivative",
      "takaratomy_arts",
      variantTta.canonical_asset_identity,
      { variant_asset: variantTta, parent_asset: parentTta },
    );
  }

  if (variantBandai || parentBandai || variantTta || parentTta) {
    return failure("provider_pattern_mismatch");
  }
  return failure("unrecognized_provider_pattern");
}

export function classifyNearEquivalentImageProvenance({
  variant = {},
  parent = {},
  siblingCount = 1,
  formalFallbackConfirmed = false,
  formalGenuineImageConfirmed = false,
} = {}) {
  const variantImage = cleanText(variant.image || variant.image_url || variant.imageUrl);
  const parentImage = cleanText(parent.image_url || parent.imageUrl);
  if (!isHttpUrl(variantImage) || !isHttpUrl(parentImage)) {
    return failure("invalid_or_blank_image_url");
  }
  if (variantImage === parentImage) return failure("exact_parent_image_copy");

  const relationship = classifyProviderImageRelationship(variantImage, parentImage);
  const variantType = cleanText(variant.variant_type);
  const explicitScope = cleanText(variant.image_scope || variant.raw?.image_scope);

  if (variantType === "provisional") {
    const semantics = validateSyntheticProvisionalSemantics({ variant, parent });
    if (!semantics.ok) return semantics;
    if (!relationship.ok) return relationship;

    const presentation = buildVariantImagePresentation({
      variant,
      parent,
      siblingCount: Number(siblingCount) || 1,
    });
    if (
      presentation.image_scope !== "series_fallback"
      || presentation.has_variant_image
      || presentation.variant_image_url
      || presentation.display_image_url !== parentImage
    ) {
      return failure("presentation_contract_mismatch", relationship.provider);
    }

    return Object.freeze({
      ok: true,
      candidate: true,
      reason: relationship.reason,
      provider: relationship.provider,
      canonical_asset_identity: relationship.canonical_asset_identity,
      provenance: "synthetic_provisional_placeholder",
    });
  }

  if (formalGenuineImageConfirmed) {
    return failure("formal_genuine_variant_image", relationship.provider);
  }
  if (!relationship.ok) return relationship;
  if (explicitScope === "variant") return failure("explicit_variant_scope", relationship.provider);
  if (!formalFallbackConfirmed) {
    return failure("formal_variant_ambiguous", relationship.provider);
  }
  if (cleanText(variant.source_type) !== "official_site") {
    return failure("non_official_source", relationship.provider);
  }

  return Object.freeze({
    ok: true,
    candidate: true,
    reason: "formal_parent_fallback_provenance_confirmed",
    provider: relationship.provider,
    canonical_asset_identity: relationship.canonical_asset_identity,
    provenance: relationship.reason,
  });
}

export function validateNearEquivalentCleanupPrecondition({
  candidate = {},
  variant = {},
  parent = {},
  siblingCount = 1,
} = {}) {
  if (!cleanText(candidate.variant_id) || cleanText(candidate.variant_id) !== cleanText(variant.id)) {
    return failure("variant_id_drift");
  }
  if (
    !cleanText(candidate.series_id)
    || cleanText(candidate.series_id) !== cleanText(variant.series_id)
    || cleanText(candidate.series_id) !== cleanText(parent.id)
  ) {
    return failure("series_identity_drift");
  }
  if (cleanText(candidate.before_url) !== cleanText(variant.image || variant.image_url)) {
    return failure("candidate_image_drift");
  }
  if (cleanText(candidate.parent_url) !== cleanText(parent.image_url || parent.imageUrl)) {
    return failure("parent_image_drift");
  }
  if (
    candidate.expected_updated_at != null
    && cleanText(candidate.expected_updated_at) !== cleanText(variant.updated_at)
  ) {
    return failure("variant_updated_at_drift");
  }
  if (
    candidate.parent_updated_at != null
    && cleanText(candidate.parent_updated_at) !== cleanText(parent.updated_at)
  ) {
    return failure("parent_updated_at_drift");
  }

  const classification = classifyNearEquivalentImageProvenance({ variant, parent, siblingCount });
  if (!classification.ok) return classification;
  if (classification.provider !== cleanText(candidate.provider)) return failure("provider_drift");
  if (classification.reason !== cleanText(candidate.reason)) return failure("reason_drift");
  if (classification.canonical_asset_identity !== cleanText(candidate.canonical_asset_identity)) {
    return failure("canonical_asset_identity_drift");
  }
  return classification;
}

export function buildNearEquivalentCleanupCandidate({ variant = {}, parent = {}, siblingCount = 1 } = {}) {
  const classification = classifyNearEquivalentImageProvenance({ variant, parent, siblingCount });
  if (!classification.ok) return null;
  return Object.freeze({
    variant_id: cleanText(variant.id),
    series_id: cleanText(variant.series_id),
    provider: classification.provider,
    reason: classification.reason,
    before_url: cleanText(variant.image || variant.image_url),
    parent_url: cleanText(parent.image_url || parent.imageUrl),
    canonical_asset_identity: classification.canonical_asset_identity,
    expected_updated_at: variant.updated_at ?? null,
    parent_updated_at: parent.updated_at ?? null,
  });
}

export function digestNearEquivalentCleanupCandidates(candidates = []) {
  const rows = candidates
    .map((candidate) => ({
      variant_id: cleanText(candidate.variant_id),
      provider: cleanText(candidate.provider),
      reason: cleanText(candidate.reason),
      before_url: cleanText(candidate.before_url),
      parent_url: cleanText(candidate.parent_url),
      canonical_asset_identity: cleanText(candidate.canonical_asset_identity),
    }))
    .sort((left, right) => Buffer.compare(
      Buffer.from(left.variant_id, "utf8"),
      Buffer.from(right.variant_id, "utf8"),
    ));
  const payload = rows.map((row) => JSON.stringify(row)).join("\n");
  return "sha256:" + createHash("sha256").update(Buffer.from(payload, "utf8")).digest("hex");
}

export function decideNearEquivalentCleanupState(input = {}) {
  const expected = NEAR_EQUIVALENT_PARENT_IMAGE_CLEANUP_EXPECTATION;
  const candidateCount = Number(input.candidate_count);
  const rejected = Number(input.rejected_or_ambiguous);
  const exact = Number(input.exact_parent_conflicts);
  const seriesMissing = Number(input.series_image_missing);
  const rawMissing = Number(input.raw_variant_image_missing);
  const providers = input.provider_buckets || {};

  if (
    candidateCount === 0
    && rejected === expected.rejected_or_ambiguous
    && exact === expected.exact_parent_conflicts
    && seriesMissing === expected.series_image_missing
    && rawMissing === expected.raw_variant_image_missing_after
  ) {
    return Object.freeze({
      state: "already_clean",
      write_count: 0,
      reason: "near_equivalent_safe_cohort_already_cleaned",
    });
  }

  if (candidateCount !== expected.candidate_count) throw cleanupError("expected_count_mismatch");
  if (String(input.candidate_set_sha256 || "") !== expected.candidate_set_sha256) {
    throw cleanupError("candidate_digest_mismatch");
  }
  if (Number(providers.bandai) !== expected.provider_buckets.bandai) {
    throw cleanupError("bandai_breakdown_mismatch");
  }
  if (Number(providers.takaratomy_arts) !== expected.provider_buckets.takaratomy_arts) {
    throw cleanupError("takaratomy_arts_breakdown_mismatch");
  }
  if (rejected !== expected.rejected_or_ambiguous) throw cleanupError("rejected_count_mismatch");
  if (exact !== expected.exact_parent_conflicts) throw cleanupError("exact_conflict_count_mismatch");
  if (seriesMissing !== expected.series_image_missing) throw cleanupError("series_image_missing_mismatch");
  if (rawMissing !== expected.raw_variant_image_missing_before) throw cleanupError("raw_missing_before_mismatch");

  return Object.freeze({
    state: "ready",
    write_count: expected.candidate_count,
    reason: "deterministic_provider_safe_near_equivalent_cohort_confirmed",
  });
}

function validateSyntheticProvisionalSemantics({ variant, parent }) {
  if (variant.raw?.provisional !== true) return failure("raw_provisional_not_true");
  if (cleanText(variant.raw?.reason) !== "official_lineup_not_fetched_yet") {
    return failure("wrong_provisional_reason");
  }
  if (!cleanText(variant.name) || cleanText(variant.name) !== cleanText(parent.name)) {
    return failure("name_not_parent_name");
  }
  if (cleanText(variant.source_type) !== "official_site") return failure("non_official_source");
  if (variant.review_required !== true) return failure("review_required_not_true");
  if (cleanText(variant.image_scope || variant.raw?.image_scope) === "variant") {
    return failure("explicit_variant_scope");
  }
  return Object.freeze({ ok: true });
}

function successRelationship(reason, provider, canonicalAssetIdentity, extra = {}) {
  return Object.freeze({
    ok: true,
    candidate: false,
    reason,
    provider,
    canonical_asset_identity: canonicalAssetIdentity,
    ...extra,
  });
}

function failure(reason, provider = "") {
  return Object.freeze({ ok: false, candidate: false, reason, provider });
}

function httpUrl(value) {
  try {
    const url = new URL(cleanText(value));
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

function isHttpUrl(value) {
  return Boolean(httpUrl(value));
}

function cleanText(value) {
  return value == null ? "" : String(value).trim();
}

function cleanupError(reason) {
  const error = new Error(reason);
  error.reason_code = reason;
  return error;
}
