import { notFound } from "next/navigation";
import { cache } from "react";
import { DiscoveryFacetLanding } from "@/components/DiscoveryFacetPages";
import { decodeDiscoveryFacetParam, discoveryFacetPageHref, normalizeDiscoveryFacetPage } from "@/lib/domain/discovery-facets";
import { getPublicDiscoveryFacetSeriesPage } from "@/lib/series";
import { buildPageMetadata } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const getBrandDiscoveryPage = cache((name, page) => getPublicDiscoveryFacetSeriesPage("brand", name, { page, pageSize: 60 }));

async function resolvePage(params, searchParams) {
  const name = decodeDiscoveryFacetParam((await params).name);
  const page = normalizeDiscoveryFacetPage((await searchParams)?.page);
  return getBrandDiscoveryPage(name, page);
}

export async function generateMetadata({ params, searchParams }) {
  const result = await resolvePage(params, searchParams);
  if (!result) notFound();
  const { facet, page } = result;
  return buildPageMetadata({
    title: `${facet.name}のガチャ一覧・発売情報 | Gacha Lens`,
    description: `${facet.name}のガチャをシリーズ単位で一覧。発売中・発売予定、定価、ラインナップ、相場・在庫情報を確認できます。`,
    path: discoveryFacetPageHref("brand", facet.name, page),
    noIndex: page > 1 || facet.series_count < 2,
  });
}

export default async function BrandPage({ params, searchParams }) {
  const result = await resolvePage(params, searchParams);
  if (!result) notFound();
  return <DiscoveryFacetLanding type="brand" facet={result.facet} items={result.items} page={result} />;
}
