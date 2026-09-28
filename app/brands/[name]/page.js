import DiscoveryFacetClientLanding from "@/components/DiscoveryFacetClientLanding";
import { decodeDiscoveryFacetParam, discoveryFacetHref } from "@/lib/domain/discovery-facets";
import { getStaticDiscoveryFacetParams } from "@/lib/domain/discovery-static-manifest";
import { buildPageMetadata } from "@/lib/site-metadata";

export const dynamic = "force-static";
export const revalidate = 86400;

export function generateStaticParams() {
  return getStaticDiscoveryFacetParams("brand");
}

export async function generateMetadata({ params }) {
  const name = decodeDiscoveryFacetParam((await params).name);
  return buildPageMetadata({
    title: `${name}のガチャ一覧・発売情報 | Gacha Lens`,
    description: `${name}のガチャをシリーズ単位で一覧。発売中・発売予定、定価、ラインナップ、相場・在庫情報を確認できます。`,
    path: discoveryFacetHref("brand", name),
  });
}

export default async function BrandPage({ params }) {
  const name = normalizeDiscoveryFacetName((await params).name);
  return <DiscoveryFacetClientLanding type="brand" name={name} page={1} />;
}
