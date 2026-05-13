import { getDataModel } from "@/lib/series";
import { buildImportIssueBreakdown, buildImportReviewCsv, buildImportReviewReport } from "@/lib/data/import-review";

export function GET(request) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");
  const dataModel = getDataModel();
  const issues = dataModel.importIssues ?? [];

  if (format === "csv") {
    return new Response(buildImportReviewCsv(issues), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
      },
    });
  }

  return Response.json({
    count: issues.length,
    breakdown: buildImportIssueBreakdown(issues),
    records: {
      series: dataModel.series?.length ?? 0,
      variants: dataModel.variants?.length ?? 0,
      marketListings: dataModel.marketListings?.length ?? 0,
      xReactions: dataModel.xReactions?.length ?? 0,
      restockEvents: dataModel.restockEvents?.length ?? 0,
      stockReports: dataModel.stockReports?.length ?? 0,
    },
    sampleVariants: (dataModel.variants ?? []).slice(0, 5).map((variant) => ({
      id: variant.id,
      slug: variant.slug,
      name: variant.variant_name,
      seriesName: variant.series_name,
      brand: variant.brand,
      price: variant.price,
      releaseMonth: variant.schedule_month,
      releaseWeek: variant.schedule_week,
      officialUrl: variant.official_url,
      imageUrl: variant.image_url,
      reviewRequired: Boolean(variant.review_required),
    })),
    issues: buildImportReviewReport(issues),
  });
}
