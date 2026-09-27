import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { CategoryDiscoveryLanding } from "@/components/DiscoveryFacetPages";
import { categoryDiscoveryPageHref } from "@/lib/domain/category-discovery";
import { normalizeDiscoveryFacetPage } from "@/lib/domain/discovery-facets";
import { buildPageMetadata } from "@/lib/site-metadata";
import {
  getDiscoveryFacetPaginatedStaticParams,
  resolveDiscoveryFacetStaticPage,
} from "@/lib/static-discovery-facets";

export const dynamic = "force-static";
export const revalidate = 86400;

const getPage = cache((name, page) => resolveDiscoveryFacetStaticPage("category", name, page));

export async function generateStaticParams() {
  return getDiscoveryFacetPaginatedStaticParams("category");
}

async function resolvePage(params) {
  const resolved = await params;
  const page = normalizeDiscoveryFacetPage(resolved.page);
  if (page <= 1) permanentRedirect(categoryDiscoveryPageHref(resolved.name, 1));
  return getPage(resolved.name, page);
}

export async function generateMetadata({ params }) {
  const result = await resolvePage(params);
  if (!result) notFound();
  const { facet, page } = result;
  return buildPageMetadata({
    title: `${facet.name}のガチャシリーズ一覧・発売情報 | Gacha Lens`,
    description: `${facet.name}カテゴリのガチャシリーズを一覧。発売中・発売予定、定価、ラインナップを確認できます。`,
    path: categoryDiscoveryPageHref(facet.name, page),
    noIndex: true,
  });
}

export default async function CategoryDiscoveryPaginationPage({ params }) {
  const result = await resolvePage(params);
  if (!result) notFound();
  return <CategoryDiscoveryLanding facet={result.facet} items={result.items} page={result} />;
}
