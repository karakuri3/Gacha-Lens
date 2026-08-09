import { notFound } from "next/navigation";
import { CategoryDiscoveryLanding } from "@/components/DiscoveryFacetPages";
import { categoryDiscoveryPageHref, decodeCategoryDiscoveryParam } from "@/lib/domain/category-discovery";
import { normalizeDiscoveryFacetPage } from "@/lib/domain/discovery-facets";
import { getPublicCategoryCatalogPage } from "@/lib/series";
import { buildPageMetadata } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function resolvePage(params, searchParams) {
  const name = decodeCategoryDiscoveryParam((await params).name);
  const page = normalizeDiscoveryFacetPage((await searchParams)?.page);
  return getPublicCategoryCatalogPage(name, { page, pageSize: 60 });
}

export async function generateMetadata({ params, searchParams }) {
  const result = await resolvePage(params, searchParams);
  if (!result) notFound();
  const { facet, page } = result;
  return buildPageMetadata({
    title: `${facet.name}のガチャ一覧・発売情報 | Gacha Lens`,
    description: `${facet.name}カテゴリのガチャを単品で一覧。発売中・発売予定、定価、ラインナップ、相場・在庫情報を確認できます。`,
    path: categoryDiscoveryPageHref(facet.name, page),
    noIndex: page > 1,
  });
}

export default async function CategoryDiscoveryPage({ params, searchParams }) {
  const result = await resolvePage(params, searchParams);
  if (!result) notFound();
  return <CategoryDiscoveryLanding facet={result.facet} items={result.items} page={result} />;
}
