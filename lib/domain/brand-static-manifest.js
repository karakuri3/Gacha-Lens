export const STATIC_BRAND_FACETS = Object.freeze([
  { name: "タカラトミーアーツ", series_count: 2447 },
  { name: "バンダイ", series_count: 6962 },
]);

export function getStaticBrandParams() {
  return STATIC_BRAND_FACETS.map(({ name }) => ({ name }));
}

export function getStaticBrandPaginationParams(pageSize = 60) {
  const size = Math.max(1, Number(pageSize) || 60);
  return STATIC_BRAND_FACETS.flatMap(({ name, series_count }) => {
    const totalPages = Math.max(1, Math.ceil(series_count / size));
    return Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => ({
      name,
      page: String(index + 2),
    }));
  });
}
