import { getReviewTokenFromRequest, REVIEW_COOKIE_NAME, verifyReviewSession, verifyReviewToken } from "@/lib/admin-auth";
import { buildOpsHealthReport } from "@/lib/data/ops-health";
import { getDataModel } from "@/lib/series";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request) {
  if (!isAuthorizedReviewRequest(request)) {
    return Response.json({ error: "Unauthorized ops health endpoint" }, { status: 401 });
  }

  const dataModel = await getDataModel();
  return Response.json(buildOpsHealthReport(dataModel));
}

function isAuthorizedReviewRequest(request) {
  const headerToken = getReviewTokenFromRequest(request);
  const cookieValue = request.cookies?.get(REVIEW_COOKIE_NAME)?.value;
  return verifyReviewToken(headerToken) || verifyReviewSession(cookieValue);
}
