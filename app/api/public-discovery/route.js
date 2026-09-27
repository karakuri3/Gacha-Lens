import { NextResponse } from "next/server";
import { categoryDiscoveryLookupCandidates } from "@/lib/domain/category-discovery";
import { normalizeDiscoveryFacetPage } from "@/lib/domain/discovery-facets";
import { getTargetedPublicCategorySeriesPage } from "@/lib/targeted-category-series-page";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const url = new URL(request.url);
  const type = String(url.searchParams.get("type") || "");
  const rawName = String(url.searchParams.get("name") || "").trim();
  const page = normalizeDiscoveryFacetPage(url.searchParams.get("page"));

  if (type !== "category" || !rawName || rawName.length > 120 || page > 5000) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  let result = null;
  for (const name of categoryDiscoveryLookupCandidates(rawName)) {
    result = await getTargetedPublicCategorySeriesPage(name, { page, pageSize: 60 });
    if (result) break;
  }

  if (!result) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      result: {
        facet: result.facet,
        items: result.items,
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        "Cloudflare-CDN-Cache-Control": "public, max-age=1800, stale-while-revalidate=60",
      },
    },
  );
}
