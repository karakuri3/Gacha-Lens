import { notFound } from "next/navigation";
import { DiscoveryFacetLanding } from "@/components/DiscoveryFacetPages";
import { decodeDiscoveryFacetParam, discoveryFacetPageHref, normalizeDiscoveryFacetPage } from "@/lib/domain/discovery-facets";
import { getPublicDiscoveryFacetSeriesPage } from "@/lib/series";
import { buildPageMetadata } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function resolvePage(params, searchParams) {
  const name = decodeDiscoveryFacetParam((await params).name);
  const page = normalizeDiscoveryFacetPage((await searchParams)?.page);
  return getPublicDiscoveryFacetSeriesPage("franchise", name, { page, pageSize: 60 });
}

export async function generateMetadata({ params, searchParams }) {
  const result = await resolvePage(params, searchParams);
  if (!result) notFound();
  const { facet, page } = result;
  return buildPageMetadata({
    title: `${facet.name}のガチャ一覧・発売情報 | Gacha Lens`,
    description: `${facet.name}のガチャをシリーズ単位で一覧。発売中・発売予定、定価、ラインナップ、相場・在庫情報を確認できます。`,
    path: discoveryFacetPageHref("franchise", facet.name, page),
    noIndex: page > 1,
  });
}

export default async function FranchisePage({ params, searchParams }) {
  const result = await resolvePage(params, searchParams);
  if (!result || !result.items.length) notFound();
  return <DiscoveryFacetLanding type="franchise" facet={result.facet} items={result.items} page={result} />;
}
