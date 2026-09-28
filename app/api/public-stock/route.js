import { NextResponse } from "next/server";
import { createGachaRepository, getRankingSeries } from "@/lib/series";
import { getReleasedStockFeedRecords } from "@/lib/data/public-stock-feed";
import { getPublicStockSummaryRows } from "@/lib/public-stock-summary";

export const dynamic = "force-dynamic";

export async function GET() {
  const optimized = await getPublicStockSummaryRows();
  const rows = optimized ?? await getFallbackRows();

  return NextResponse.json(
    { rows },
    {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=60",
        "Cloudflare-CDN-Cache-Control": "public, max-age=300, stale-while-revalidate=60",
      },
    },
  );
}

async function getFallbackRows() {
  const optimizedRecords = await getReleasedStockFeedRecords();
  const items = optimizedRecords
    ? createGachaRepository(optimizedRecords).listVariants()
    : await getRankingSeries("released");

  return dedupeReports(
    items.flatMap((item) => (item.stock_reports ?? [])
      .filter((report) => !report.review_required)
      .map((report) => ({
        item: toPublicItem(item),
        report: toPublicReport(report),
      }))),
  ).sort((a, b) => dateValue(b.report.reported_at) - dateValue(a.report.reported_at));
}

function toPublicItem(item = {}) {
  return {
    variant_id: item.variant_id ?? item.id,
    slug: item.slug,
    name: item.name,
    rarity: item.rarity,
    role: item.role,
    image: item.image,
    image_url: item.image_url ?? item.image,
    price: item.price,
    brand: item.brand,
    release_month: item.release_month,
    release_week: item.release_week,
    release_date: item.release_date,
    is_released: item.is_released ?? item.isReleased,
    series_id: item.series_id,
    series_slug: item.series_slug,
    series_name: item.series_name,
    series_image_url: item.series_image_url,
    image_scope: item.image_scope,
  };
}

function toPublicReport(report = {}) {
  return {
    id: report.id,
    status: report.status,
    status_label: report.status_label,
    region: report.region,
    shop_name: report.shop_name,
    reported_at: report.reported_at,
  };
}

function dedupeReports(rows) {
  return [...new Map(rows.map((row) => [
    row.report.id || `${row.item.variant_id}-${row.report.reported_at}-${row.report.shop_name}`,
    row,
  ])).values()];
}

function dateValue(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}
