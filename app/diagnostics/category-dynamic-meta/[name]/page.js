import { CategoryDiscoveryLanding } from "@/components/DiscoveryFacetPages";
import { categoryDiscoveryLookupCandidates, categoryDiscoveryPageHref } from "@/lib/domain/category-discovery";
import { buildPageMetadata } from "@/lib/site-metadata";
import { getTargetedPublicCategorySeriesPage } from "@/lib/targeted-category-series-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }) {
  const names = categoryDiscoveryLookupCandidates((await params).name);
  const name = names.at(-1) || "カテゴリ";
  return buildPageMetadata({
    title: `${name}のガチャシリーズ一覧・発売情報 | Gacha Lens`,
    description: `${name}カテゴリのガチャシリーズを一覧。発売中・発売予定、定価、ラインナップを確認できます。`,
    path: categoryDiscoveryPageHref(name, 1),
    noIndex: true,
  });
}

export default async function DiagnosticDynamicCategoryMetaPage({ params }) {
  const names = categoryDiscoveryLookupCandidates((await params).name);
  for (const name of names) {
    const result = await getTargetedPublicCategorySeriesPage(name, { page: 1, pageSize: 60 });
    if (result) return <CategoryDiscoveryLanding facet={result.facet} items={result.items} page={result} />;
  }
  return <main><h1>Dynamic category meta diagnostic missing</h1></main>;
}
