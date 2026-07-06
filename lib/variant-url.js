export function variantHref(itemOrSlug) {
  const slug = typeof itemOrSlug === "string" ? itemOrSlug : itemOrSlug?.slug;
  if (!slug) return "/series";
  return `/series/${encodeURIComponent(String(slug))}`;
}
