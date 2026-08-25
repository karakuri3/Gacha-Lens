import { seriesHref, variantHref } from "../variant-url.js";

export function isSeriesLevelRestockEvent(event) {
  return Boolean(event?.series_id && !event?.variant_id && !event?.matched_variant_id);
}

export function resolveRestockEventPresentation(series, event) {
  if (isSeriesLevelRestockEvent(event)) {
    return {
      scope: "series",
      href: seriesHref(series),
      name: text(series?.name || series?.series_name),
      subtitle: "シリーズ公式再販",
      image_url: text(series?.image_url || series?.imageUrl),
      display_image_url: text(series?.image_url || series?.imageUrl),
      series_image_url: "",
      image_scope: "series",
      price: series?.price ?? null,
      brand: text(series?.brand),
      rerelease_schedule: rereleaseScheduleLabel(event),
    };
  }

  const targetId = text(event?.variant_id || event?.matched_variant_id);
  const variant = asArray(series?.variants).find((item) => item.id === targetId) || null;
  const item = variant || series;
  return {
    scope: variant ? "variant" : "series",
    href: variant ? variantHref(variant) : seriesHref(series),
    name: text(item?.name || series?.name),
    subtitle: variant ? text(series?.name || series?.series_name) : "シリーズ情報",
    image_url: text(item?.image_url || item?.image || series?.image_url),
    display_image_url: text(item?.display_image_url || item?.image_url || item?.image || series?.image_url),
    series_image_url: text(item?.series_image_url),
    image_scope: text(item?.image_scope) || "series",
    price: item?.price ?? series?.price ?? null,
    brand: text(item?.brand || series?.brand),
    rerelease_schedule: rereleaseScheduleLabel(event),
  };
}

export function rereleaseScheduleLabel(event) {
  const schedule = event?.raw?.rerelease_schedule || event?.raw?.current_schedule || event?.rerelease_schedule;
  if (!schedule || typeof schedule !== "object") return "時期未定";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text(schedule.release_date))) {
    const date = new Date(`${schedule.release_date}T00:00:00+09:00`);
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      timeZone: "Asia/Tokyo",
    }).format(date);
  }
  return [schedule.year ? `${schedule.year}年` : "", text(schedule.release_month), text(schedule.release_week)].filter(Boolean).join(" ") || "時期未定";
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return value == null ? "" : String(value).trim();
}
