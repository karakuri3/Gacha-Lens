export function variantHref(itemOrSlug) {
  const slug = typeof itemOrSlug === "string" ? itemOrSlug : itemOrSlug?.slug;
  if (!slug) return "/series";
  return `/series/${encodeURIComponent(String(slug))}`;
}

export function seriesHref(itemOrSlug) {
  const slug = typeof itemOrSlug === "string" ? itemOrSlug : itemOrSlug?.series_slug || itemOrSlug?.slug;
  if (!slug) return "/series?scope=series";
  return `/series/group/${encodeURIComponent(String(slug))}`;
}
