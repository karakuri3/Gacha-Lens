import { notFound } from "next/navigation";
import { cache } from "react";
import { CategoryDiscoveryLanding } from "@/components/DiscoveryFacetPages";
import { categoryDiscoveryLookupCandidates, categoryDiscoveryPageHref } from "@/lib/domain/category-discovery";
import { normalizeDiscoveryFacetPage } from "@/lib/domain/discovery-facets";
import { buildPageMetadata } from "@/lib/site-metadata";
import { getTargetedPublicCategorySeriesPage } from "@/lib/targeted-category-series-page";

export const revalidate = 300;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

const getCategoryDiscoveryPage = cache((name, page) => getTargetedPublicCategorySeriesPage(name, { page, pageSize: 60, bypassDataCache: true }));

async function resolvePage(params, searchParams) {
  const names = categoryDiscoveryLookupCandidates((await params).name);
  const page = normalizeDiscoveryFacetPage((await searchParams)?.page);
  for (const name of names) {
    const result = await getCategoryDiscoveryPage(name, page);
    if (result) return result;
  }
  return null;
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
