import { fetchRows } from "./supabase-rest.mjs";

export async function loadOfficialCatalog(fallbackRows = []) {
  try {
    const [series, variants] = await Promise.all([
      fetchRows("series", { select: "id,slug,name,franchise,brand,category,official_url,release_date,release_month,is_released,updated_at" }),
      fetchRows("variants", { select: "id,slug,series_id,name,variant_type,release_date,released,brand,updated_at" }),
    ]);
    if (series.length && variants.length) return catalogShape(series, variants);
  } catch (error) {
    console.warn(`[catalog] Supabase official master unavailable: ${error.message}`);
  }
  return catalogFromRaw(fallbackRows);
}

function catalogFromRaw(rows) {
  const series = rows.map((raw) => ({
    id: text(raw.series_id || raw.id || raw.slug),
    slug: text(raw.slug || raw.series_slug || raw.id),
    name: text(raw.name || raw.title || raw.product_name),
    franchise: text(raw.franchise || raw.character || raw.work_name || raw.ip),
    brand: text(raw.brand || raw.maker || raw.manufacturer),
    release_date: text(raw.release_date || raw.releaseDate),
    release_month: text(raw.release_month || raw.releaseMonth),
    is_released: Boolean(raw.is_released ?? raw.released),
  }));
  const variants = rows.flatMap((row) => asArray(row.variants || row.items || row.lineup || row.line_up).map((variant) => ({
    id: text(variant.id || variant.variant_id),
    slug: text(variant.slug || variant.id || variant.variant_id),
    series_id: text(row.series_id || row.id || row.slug),
    name: text(variant.name || variant.title || variant.variant_name),
    variant_type: text(variant.variant_type) || "normal",
    release_date: text(variant.release_date || variant.releaseDate || row.release_date || row.releaseDate),
    released: Boolean(variant.released ?? row.is_released ?? row.released),
  })));
  return catalogShape(series, variants);
}

function catalogShape(series, variants) {
  return {
    series,
    variants,
    seriesById: new Map(series.map((entry) => [entry.id, entry])),
    variantById: new Map(variants.map((entry) => [entry.id, entry])),
  };
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return value == null ? "" : String(value).trim();
}
