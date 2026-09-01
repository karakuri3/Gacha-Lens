export function buildVariantImagePresentation({ variant = {}, parent = {}, siblingCount = 0 } = {}) {
  const variantImageUrl = resolveTrustedVariantImage({ variant, parent, siblingCount });
  const seriesImageUrl = text(parent.image_url || parent.imageUrl);
  const displayImageUrl = variantImageUrl || seriesImageUrl;

  return {
    variant_image_url: variantImageUrl,
    series_image_url: seriesImageUrl,
    display_image_url: displayImageUrl,
    has_variant_image: Boolean(variantImageUrl),
    image_scope: variantImageUrl ? "variant" : seriesImageUrl ? "series_fallback" : "missing",
  };
}

export function resolveTrustedVariantImage({ variant = {}, parent = {}, siblingCount = 0 } = {}) {
  const candidate = text(variant.image || variant.image_url || variant.imageUrl);
  if (!candidate || isGeneratedImagePlaceholder(candidate) || variant.variant_type === "provisional") return "";

  const explicitScope = variant.image_scope || variant.raw?.image_scope;
  if (explicitScope === "series") return "";
  if (String(variant.id || "").startsWith("tarts-")) return "";
  if (/タカラトミーアーツ/.test(String(parent.brand || "")) && siblingCount > 1) return "";

  const parentImage = text(parent.image_url || parent.imageUrl);
  if (parentImage && normalizeImageUrl(candidate) === normalizeImageUrl(parentImage) && siblingCount > 1) return "";
  return candidate;
}

export function isGeneratedImagePlaceholder(value) {
  return /^data:image\/svg\+xml(?:;|,)/i.test(text(value));
}

export function resolvePresentationImage({ primarySrc, fallbackSrc, imageScope, primaryFailed = false, fallbackFailed = false } = {}) {
  const primary = text(primarySrc);
  const fallback = text(fallbackSrc);
  const canFallback = Boolean(primary && fallback && normalizeImageUrl(primary) !== normalizeImageUrl(fallback));
  const usesFallback = (!primary && Boolean(fallback)) || (primaryFailed && canFallback);
  const src = usesFallback
    ? (fallbackFailed ? "" : fallback)
    : (primaryFailed ? "" : primary);
  const isSeriesFallback = Boolean(src)
    && (imageScope === "series_fallback" || usesFallback);

  return { src, can_fallback: canFallback, uses_fallback: usesFallback, is_series_fallback: isSeriesFallback };
}

export function normalizeImageUrl(value) {
  return text(value).replace(/^http:/, "https:").replace(/[?#].*$/, "").replace(/\/$/, "");
}

function text(value) {
  return value == null ? "" : String(value).trim();
}
