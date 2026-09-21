import { getTargetedPublicCategorySeriesPage } from "@/lib/targeted-category-series-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request) {
  const url = new URL(request.url);
  const category = String(url.searchParams.get("category") || "ガシャポン").trim().slice(0, 120);
  const startedAt = performance.now();

  try {
    const result = await getTargetedPublicCategorySeriesPage(category, { page: 1, pageSize: 60 });
    return Response.json({
      ok: Boolean(result),
      category,
      helper_ms: roundMs(performance.now() - startedAt),
      total: result?.total ?? null,
      item_count: result?.items?.length ?? null,
      total_pages: result?.totalPages ?? null,
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return Response.json({
      ok: false,
      category,
      helper_ms: roundMs(performance.now() - startedAt),
      error: {
        name: String(error?.name || ""),
        message: String(error?.message || "").slice(0, 240),
      },
    }, { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}

function roundMs(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}
