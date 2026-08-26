import { notFound } from "next/navigation";
import { cache } from "react";
import { CategoryDiscoveryLanding } from "@/components/DiscoveryFacetPages";
import { categoryDiscoveryPageHref, decodeCategoryDiscoveryParam } from "@/lib/domain/category-discovery";
import { normalizeDiscoveryFacetPage } from "@/lib/domain/discovery-facets";
import { getPublicCategorySeriesPage } from "@/lib/series";
import { buildPageMetadata } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const getCategoryDiscoveryPage = cache((name, page) => getPublicCategorySeriesPage(name, { page, pageSize: 60 }));

async function resolvePage(params, searchParams) {
  const name = decodeCategoryDiscoveryParam((await params).name);
  const page = normalizeDiscoveryFacetPage((await searchParams)?.page);
  return getCategoryDiscoveryPage(name, page);
}

export async function generateMetadata({ params, searchParams }) {
  const result = await resolvePage(params, searchParams);
  if (!result) notFound();
  const { facet, page } = result;
  return buildPageMetadata({
    title: `${facet.name}のガチャシリーズ一覧・発売情報 | Gacha Lens`,
    description: `${facet.name}カテゴリのガチャシリーズを一覧。発売中・発売予定、定価、ラインナップを確認できます。`,
    path: categoryDiscoveryPageHref(facet.name, page),
    noIndex: page > 1 || facet.series_count < 2,
  });
}

export default async function CategoryDiscoveryPage({ params, searchParams }) {
  const result = await resolvePage(params, searchParams);
  if (!result) notFound();
  return <CategoryDiscoveryLanding facet={result.facet} items={result.items} page={result} />;
}
