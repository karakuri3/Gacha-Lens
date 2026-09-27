import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { DiscoveryFacetLanding } from "@/components/DiscoveryFacetPages";
import { discoveryFacetPageHref, normalizeDiscoveryFacetPage } from "@/lib/domain/discovery-facets";
import { buildPageMetadata } from "@/lib/site-metadata";
import {
  getDiscoveryFacetPaginatedStaticParams,
  resolveDiscoveryFacetStaticPage,
} from "@/lib/static-discovery-facets";

export const dynamic = "force-static";
export const revalidate = 86400;

const getPage = cache((name, page) => resolveDiscoveryFacetStaticPage("franchise", name, page));

export async function generateStaticParams() {
  return getDiscoveryFacetPaginatedStaticParams("franchise");
}

async function resolvePage(params) {
  const resolved = await params;
  const page = normalizeDiscoveryFacetPage(resolved.page);
  if (page <= 1) permanentRedirect(discoveryFacetPageHref("franchise", resolved.name, 1));
  return getPage(resolved.name, page);
}

export async function generateMetadata({ params }) {
  const result = await resolvePage(params);
  if (!result) notFound();
  const { facet, page } = result;
  return buildPageMetadata({
    title: `${facet.name}のガチャ一覧・発売情報 | Gacha Lens`,
    description: `${facet.name}のガチャをシリーズ単位で一覧。発売中・発売予定、定価、ラインナップ、相場・在庫情報を確認できます。`,
    path: discoveryFacetPageHref("franchise", facet.name, page),
    noIndex: true,
  });
}

export default async function FranchisePaginationPage({ params }) {
  const result = await resolvePage(params);
  if (!result) notFound();
  return <DiscoveryFacetLanding type="franchise" facet={result.facet} items={result.items} page={result} />;
}
