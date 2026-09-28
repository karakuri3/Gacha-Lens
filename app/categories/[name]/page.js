import { categoryDiscoveryHref, decodeCategoryDiscoveryParam } from "@/lib/domain/category-discovery";
import CategoryDiscoveryClientLanding from "@/components/CategoryDiscoveryClientLanding";
import { buildPageMetadata } from "@/lib/site-metadata";
import { getStaticCategoryParams } from "@/lib/domain/category-static-manifest";

export const dynamic = "force-static";
export const revalidate = 86400;

export function generateStaticParams() {
  return getStaticCategoryParams();
}

export async function generateMetadata({ params }) {
  const name = decodeCategoryDiscoveryParam((await params).name);
  return buildPageMetadata({
    title: `${name}のガチャシリーズ一覧・発売情報 | Gacha Lens`,
    description: `${name}カテゴリのガチャシリーズを一覧。発売中・発売予定、定価、ラインナップを確認できます。`,
    path: categoryDiscoveryHref(name),
  });
}

export default async function CategoryDiscoveryPage({ params }) {
  const name = normalizeDiscoveryFacetName((await params).name);
  return <CategoryDiscoveryClientLanding name={name} page={1} />;
}
