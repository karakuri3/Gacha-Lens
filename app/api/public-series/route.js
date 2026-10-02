import { NextResponse } from "next/server";
import {
  getParentSeriesCatalogPage,
  getRankingSeries,
  getSeriesCatalogPage,
} from "@/lib/series";
import {
  parseCatalogQuery,
  recordMatchesCatalogQuery,
} from "@/lib/domain/catalog-query";
import {
  isCirculatingItem,
  opportunityScore,
  watchScore,
} from "@/lib/domain/public-display-clean";
import { STATIC_CATEGORY_FACETS } from "@/lib/domain/category-static-manifest";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;
const MAX_PAGE = 1000;

export async function GET(request) {
  const url = new URL(request.url);
  const input = Object.fromEntries(url.searchParams.entries());
  const query = parseCatalogQuery(input);
  if (query.page > MAX_PAGE) {
    return NextResponse.json({ error: "invalid_page" }, { status: 400 });
  }

  try {
    const result = query.legacyMode
      ? await legacyCatalogPage(query)
      : await standardCatalogPage(query);

    return NextResponse.json(
      {
        result: {
          ...result,
          query,
          categories: STATIC_CATEGORY_FACETS.map(({ name }) => name),
        },
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=60",
          "Cloudflare-CDN-Cache-Control": "public, max-age=300, stale-while-revalidate=60",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: "public_series_unavailable", detail: String(error?.message || error) },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

async function standardCatalogPage(query) {
  const loader = query.scope === "series"
    ? getParentSeriesCatalogPage
    : getSeriesCatalogPage;
  const page = await loader({ ...query, pageSize: PAGE_SIZE });
  return {
    items: page.items,
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    totalPages: Math.max(1, Math.ceil(page.total / page.pageSize)),
  };
}

async function legacyCatalogPage(query) {
  const mode = query.release === "upcoming" ? "upcoming" : "released";
  const signalItems = await getRankingSeries(mode, query.scope);
  const filtered = signalItems
    .filter((item) => matchesLegacyMode(item, query.legacyMode))
    .filter((item) => recordMatchesCatalogQuery(item, query, query.scope))
    .sort((a, b) => compareSignalItems(a, b, query.legacyMode));

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(query.page, totalPages);
  const start = (page - 1) * PAGE_SIZE;
  return {
    items: filtered.slice(start, start + PAGE_SIZE),
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages,
  };
}

function matchesLegacyMode(item, mode) {
  if (mode === "market") return item.is_released && item.market_evidence?.tier !== "insufficient";
  if (mode === "circulating") return isCirculatingItem(item);
  if (mode === "opportunity") return !item.is_released && opportunityScore(item) >= 60;
  return true;
}

function compareSignalItems(a, b, mode) {
  if (mode === "market") return (b.market_evidence?.primaryPrice ?? -Infinity) - (a.market_evidence?.primaryPrice ?? -Infinity);
  if (mode === "opportunity") return opportunityScore(b) - opportunityScore(a);
  return watchScore(b) - watchScore(a);
}
