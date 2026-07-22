export const PROVISIONAL_VARIANT_TYPE = "provisional";

export function isProvisionalVariant(variant) {
  return String(variant?.variant_type || "").trim().toLowerCase() === PROVISIONAL_VARIANT_TYPE;
}

export function isPublicVariant(variant, options = {}) {
  if (!variant || isProvisionalVariant(variant)) return false;

  const seriesId = String(variant.series_id || "").trim();
  const slug = String(variant.slug || "").trim();
  const name = String(variant.name || "").trim();
  if (!seriesId || !slug || !name) return false;

  const seriesIds = options.seriesIds;
  return !(seriesIds instanceof Set) || seriesIds.has(seriesId);
}

export function buildLineupPublicationState(allVariants = [], publicVariants = []) {
  const provisionalCount = allVariants.filter(isProvisionalVariant).length;
  const verifiedCount = publicVariants.length;
  const status = provisionalCount === 0 ? "verified" : verifiedCount > 0 ? "partial" : "pending";

  return {
    lineup_verification_status: status,
    has_provisional_variants: provisionalCount > 0,
    provisional_variant_count: provisionalCount,
    verified_variant_count: verifiedCount,
    lineup_verification_label:
      status === "verified"
        ? "確認済み"
        : status === "partial"
          ? "ラインナップ確認中"
          : "ラインナップを確認中です",
  };
}

export function signalIsPublic(entry, publicVariantIds) {
  const variantId = String(entry?.matched_variant_id || entry?.variant_id || "").trim();
  return !variantId || publicVariantIds.has(variantId);
}
