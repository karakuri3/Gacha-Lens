import { isPublicVariant } from "./variant-publication.js";

function parentOf(row) {
  const parent = Array.isArray(row?.parent) ? row.parent[0] : row?.parent;
  return parent && typeof parent === "object" ? parent : null;
}

function publicRows(rows = []) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const seriesIds = new Set(
    sourceRows
      .map((row) => String(parentOf(row)?.id || "").trim())
      .filter(Boolean),
  );

  return sourceRows.filter((row) => {
    const parent = parentOf(row);
    return Boolean(
      parent
      && String(row?.series_id || "").trim() === String(parent.id || "").trim()
      && isPublicVariant(row, { seriesIds }),
    );
  });
}

export function collectPublicVariantSlugs(rows = []) {
  return [...new Set(
    publicRows(rows)
      .map((row) => String(row?.slug || "").trim())
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b, "ja"));
}

export function collectPublicParentSeriesSlugs(rows = []) {
  return [...new Set(
    publicRows(rows)
      .map((row) => String(parentOf(row)?.slug || "").trim())
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b, "ja"));
}

export function collectPublicSitemapIdentifiers(rows = []) {
  return {
    variantSlugs: collectPublicVariantSlugs(rows),
    parentSeriesSlugs: collectPublicParentSeriesSlugs(rows),
  };
}
