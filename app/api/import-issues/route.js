import { getDataModel } from "@/lib/series";
import { buildImportIssueBreakdown, buildImportReviewCsv, buildImportReviewReport, buildMarketListingBreakdown, buildXIntentBreakdown } from "@/lib/data/import-review";

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
    marketListingBreakdown: buildMarketListingBreakdown(dataModel.marketListings ?? []),
    xIntentBreakdown: buildXIntentBreakdown(dataModel.xReactions ?? []),
    records: {
      series: dataModel.series?.length ?? 0,
      variants: dataModel.variants?.length ?? 0,
      marketListings: dataModel.marketListings?.length ?? 0,
      xReactions: dataModel.xReactions?.length ?? 0,
      restockEvents: dataModel.restockEvents?.length ?? 0,
      stockReports: dataModel.stockReports?.length ?? 0,
      linkedMarketListings: (dataModel.marketListings ?? []).filter((listing) => listing.variant_id).length,
      reviewRequiredMarketListings: (dataModel.marketListings ?? []).filter((listing) => listing.review_required).length,
      linkedXReactions: (dataModel.xReactions ?? []).filter((reaction) => reaction.variant_id).length,
      reviewRequiredXReactions: (dataModel.xReactions ?? []).filter((reaction) => reaction.review_required).length,
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
      marketSummary: variant.market_summary,
      marketPriceMedian: variant.market_price_median,
      profitEstimate: variant.profit_estimate,
      forecastScore: variant.forecast_score,
      forecastBreakdown: variant.forecast_breakdown,
      xReactionCount: variant.x_reactions?.length ?? 0,
      reviewRequired: Boolean(variant.review_required),
    })),
    issues: buildImportReviewReport(issues),
  });
}
