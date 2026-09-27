import { NextResponse } from "next/server";
import { categoryDiscoveryLookupCandidates } from "@/lib/domain/category-discovery";
import { discoveryFacetLookupCandidates, isMeaningfulDiscoveryFacetName, normalizeDiscoveryFacetPage } from "@/lib/domain/discovery-facets";
import { getPublicDiscoveryFacetSeriesPage } from "@/lib/series";
import { getTargetedPublicCategorySeriesPage } from "@/lib/targeted-category-series-page";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const url = new URL(request.url);
  const type = String(url.searchParams.get("type") || "");
  const rawName = String(url.searchParams.get("name") || "").trim();
  const page = normalizeDiscoveryFacetPage(url.searchParams.get("page"));

  if (!["category", "brand"].includes(type) || !rawName || rawName.length > 120 || page > 5000) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  let result = null;
  if (type === "category") {
    for (const name of categoryDiscoveryLookupCandidates(rawName)) {
      result = await getTargetedPublicCategorySeriesPage(name, { page, pageSize: 60 });
      if (result) break;
    }
  } else {
    const candidates = discoveryFacetLookupCandidates(rawName).filter(isMeaningfulDiscoveryFacetName);
    for (const name of candidates) {
      result = await getPublicDiscoveryFacetSeriesPage("brand", name, { page, pageSize: 60 });
      if (result) break;
    }
  }

  if (!result) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      result: {
        facet: result.facet,
        items: result.items.map(toPublicSeriesCard),
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


function toPublicSeriesCard(item = {}) {
  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    franchise: item.franchise,
    brand: item.brand,
    category: item.category,
    release_month: item.release_month,
    release_week: item.release_week,
    release_date: item.release_date,
    price: item.price,
    image_url: item.image_url,
    series_id: item.series_id,
    series_slug: item.series_slug,
    series_name: item.series_name,
    entity_type: item.entity_type,
    variant_type: item.variant_type,
    variant_count: item.variant_count,
    lineup_count: item.lineup_count,
    imageUrl: item.imageUrl,
    image_scope: item.image_scope,
    schedule_month: item.schedule_month,
    schedule_week: item.schedule_week,
    releaseDate: item.releaseDate,
    is_released: item.is_released,
    isReleased: item.isReleased,
  };
}
