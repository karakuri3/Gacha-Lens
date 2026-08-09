import { notFound } from "next/navigation";
import { DiscoveryFacetLanding } from "@/components/DiscoveryFacetPages";
import { decodeDiscoveryFacetParam, discoveryFacetHref, findPublicDiscoveryFacet } from "@/lib/domain/discovery-facets";
import { getParentSeriesCatalogPage, getPublicDiscoveryFacets } from "@/lib/series";
import { buildPageMetadata } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function resolveFacet(params) {
  const name = decodeDiscoveryFacetParam((await params).name);
  const { brands } = await getPublicDiscoveryFacets();
  return findPublicDiscoveryFacet(brands, name);
}

export async function generateMetadata({ params }) {
  const facet = await resolveFacet(params);
  if (!facet) notFound();
  return buildPageMetadata({
    title: `${facet.name}のガチャ一覧・発売情報 | Gacha Lens`,
    description: `${facet.name}のガチャをシリーズ単位で一覧。発売中・発売予定、定価、ラインナップ、相場・在庫情報を確認できます。`,
    path: discoveryFacetHref("brand", facet.name),
  });
}

export default async function BrandPage({ params }) {
  const facet = await resolveFacet(params);
  if (!facet) notFound();
  const page = await getParentSeriesCatalogPage({ brand: facet.name, page: 1, pageSize: 60, sort: "newest" });
  const items = page.items.filter((item) => Number(item.variant_count) > 0);
  if (!items.length) notFound();
  return <DiscoveryFacetLanding type="brand" facet={facet} items={items} />;
}
