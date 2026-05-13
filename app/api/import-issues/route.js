import { getDataModel } from "@/lib/series";
import { buildImportReviewCsv, buildImportReviewReport } from "@/lib/data/import-review";

export function GET(request) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");
  const issues = getDataModel().importIssues ?? [];

  if (format === "csv") {
    return new Response(buildImportReviewCsv(issues), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
      },
    });
  }

  return Response.json({
    count: issues.length,
    issues: buildImportReviewReport(issues),
  });
}
