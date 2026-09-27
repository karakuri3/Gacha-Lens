import BrandDiscoveryClientLanding from "@/components/BrandDiscoveryClientLanding";
import { normalizeDiscoveryFacetName } from "@/lib/domain/discovery-facets";
import { getStaticBrandParams } from "@/lib/domain/brand-static-manifest";
import { buildPageMetadata } from "@/lib/site-metadata";

export const dynamic = "force-static";
export const revalidate = 86400;

export function generateStaticParams() {
  return getStaticBrandParams();
}

export async function generateMetadata({ params }) {
  const name = normalizeDiscoveryFacetName((await params).name);
  return buildPageMetadata({
    title: `${name}のガチャ一覧・発売情報 | Gacha Lens`,
    description: `${name}のガチャをシリーズ単位で一覧。発売中・発売予定、定価、ラインナップ、相場・在庫情報を確認できます。`,
    path: `/brands/${encodeURIComponent(name)}`,
  });
}

export default async function BrandPage({ params }) {
  const name = normalizeDiscoveryFacetName((await params).name);
  return <BrandDiscoveryClientLanding name={name} page={1} />;
}
