import { getDataModel } from "@/lib/series";
import { getReviewTokenFromRequest, REVIEW_COOKIE_NAME, verifyReviewSession, verifyReviewToken } from "@/lib/admin-auth";
import { buildImportIssueBreakdown, buildImportReviewCsv, buildImportReviewReport, buildMarketListingBreakdown, buildXIntentBreakdown } from "@/lib/data/import-review";

export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!isAuthorizedReviewRequest(request)) {
    return Response.json({ error: "Unauthorized review endpoint" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");
  const dataModel = await getDataModel();
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
      linkedRestockEvents: (dataModel.restockEvents ?? []).filter((event) => event.variant_id).length,
      reviewRequiredRestockEvents: (dataModel.restockEvents ?? []).filter((event) => event.review_required).length,
      linkedStockReports: (dataModel.stockReports ?? []).filter((report) => report.variant_id).length,
      reviewRequiredStockReports: (dataModel.stockReports ?? []).filter((report) => report.review_required).length,
    },
    restockEvents: (dataModel.restockEvents ?? []).map((event) => ({
      id: event.id,
      variantId: event.variant_id,
      seriesId: event.series_id,
      sourceType: event.source_type,
      sourceWeight: event.source_weight,
      eventType: event.event_type,
      reason: event.classification_reason,
      keywords: event.classification_keywords,
      confidence: event.confidence,
      reviewRequired: Boolean(event.review_required),
    })),
    stockReports: (dataModel.stockReports ?? []).map((report) => ({
      id: report.id,
      variantId: report.variant_id,
      seriesId: report.series_id,
      sourceType: report.source_type,
      sourceWeight: report.source_weight,
      status: report.status,
      reason: report.classification_reason,
      keywords: report.classification_keywords,
      confidence: report.confidence,
      reviewRequired: Boolean(report.review_required),
    })),
    marketListings: (dataModel.marketListings ?? []).map((listing) => ({
      id: listing.id,
      title: listing.title,
      listingType: listing.listing_type,
      reviewType: listing.market_review_type,
      variantId: listing.variant_id,
      seriesId: listing.series_id,
      reason: listing.classification_reason,
      confidence: listing.classification_confidence,
      details: listing.classification_details,
      reviewRequired: Boolean(listing.review_required),
    })),
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
      stockSummary: variant.stock_summary,
      xReactionCount: variant.x_reactions?.length ?? 0,
      reviewRequired: Boolean(variant.review_required),
    })),
    issues: buildImportReviewReport(issues),
  });
}

function isAuthorizedReviewRequest(request) {
  const headerToken = getReviewTokenFromRequest(request);
  const cookieValue = request.cookies?.get(REVIEW_COOKIE_NAME)?.value;
  return verifyReviewToken(headerToken) || verifyReviewSession(cookieValue);
}
