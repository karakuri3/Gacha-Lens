import { DiscoveryFacetIndex } from "@/components/DiscoveryFacetPages";
import { getPublicDiscoveryFacets } from "@/lib/series";
import { buildPageMetadata } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = buildPageMetadata({
  title: "作品からガチャを探す | Gacha Lens",
  description: "作品・キャラクターシリーズ別に、公開中のガチャ、発売予定、ラインナップを探せます。",
  path: "/franchises",
});

export default async function FranchisesPage() {
  const { franchises } = await getPublicDiscoveryFacets();
  return <DiscoveryFacetIndex type="franchise" eyebrow="TITLES" title="作品からガチャを探す" lead="公開シリーズが充実している作品をまとめています。" facets={franchises} />;
}
