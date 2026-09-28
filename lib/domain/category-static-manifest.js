export const STATIC_CATEGORY_FACETS = Object.freeze([
  { name: "ガシャポン", series_count: 6854 },
  { name: "ガチャ", series_count: 2447 },
  { name: "フラット", series_count: 64 },
  { name: "プレミアム", series_count: 33 },
  { name: "めじるしアクセサリー", series_count: 2 },
]);

export function getStaticCategoryFacet(name) {
  const identifier = String(name ?? "");
  return STATIC_CATEGORY_FACETS.find((facet) => facet.name === identifier) ?? null;
}

export function getStaticCategoryParams(pageSize = 60) {
  return STATIC_CATEGORY_FACETS.map(({ name }) => ({ name }));
}

export function getStaticCategoryPaginationParams(pageSize = 60) {
  const size = Math.max(1, Number(pageSize) || 60);
  return STATIC_CATEGORY_FACETS.flatMap(({ name, series_count }) => {
    const totalPages = Math.max(1, Math.ceil(series_count / size));
    return Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => ({
      name,
      page: String(index + 2),
    }));
  });
}
