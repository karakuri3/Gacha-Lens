import { permanentRedirect } from "next/navigation";
import CategoryDiscoveryClientLanding from "@/components/CategoryDiscoveryClientLanding";
import { categoryDiscoveryPageHref, decodeCategoryDiscoveryParam } from "@/lib/domain/category-discovery";
import { normalizeDiscoveryFacetPage } from "@/lib/domain/discovery-facets";
import { buildPageMetadata } from "@/lib/site-metadata";
import { getStaticCategoryPaginationParams } from "@/lib/domain/category-static-manifest";

export const dynamic = "force-static";
export const revalidate = 86400;

export function generateStaticParams() {
  return getStaticCategoryPaginationParams();
}

export async function generateMetadata({ params }) {
  const resolved = await params;
  const name = decodeCategoryDiscoveryParam(resolved.name);
  const page = normalizeDiscoveryFacetPage(resolved.page);
  if (page <= 1) permanentRedirect(categoryDiscoveryPageHref(name, 1));
  return buildPageMetadata({
    title: `${name}のガチャシリーズ一覧・発売情報 | Gacha Lens`,
    description: `${name}カテゴリのガチャシリーズを一覧。発売中・発売予定、定価、ラインナップを確認できます。`,
    path: categoryDiscoveryPageHref(name, page),
    noIndex: true,
  });
}

export default async function CategoryDiscoveryPaginationPage({ params }) {
  const resolved = await params;
  const name = decodeCategoryDiscoveryParam(resolved.name);
  const page = normalizeDiscoveryFacetPage(resolved.page);
  if (page <= 1) permanentRedirect(categoryDiscoveryPageHref(name, 1));
  return <CategoryDiscoveryClientLanding name={name} page={page} />;
}
