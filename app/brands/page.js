import { DiscoveryFacetIndex } from "@/components/DiscoveryFacetPages";
import { getPublicDiscoveryFacets } from "@/lib/series";
import { buildPageMetadata } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = buildPageMetadata({
  title: "メーカーからガチャを探す | Gacha Lens",
  description: "メーカー別にガチャのシリーズと公開中の単品ラインナップを探せます。",
  path: "/brands",
});

export default async function BrandsPage() {
  const { brands } = await getPublicDiscoveryFacets();
  return <DiscoveryFacetIndex type="brand" eyebrow="MAKERS" title="メーカーからガチャを探す" lead="公開シリーズが充実しているメーカーをまとめています。" facets={brands} />;
}
