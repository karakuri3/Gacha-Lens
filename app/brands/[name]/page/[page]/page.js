import { permanentRedirect } from "next/navigation";
import BrandDiscoveryClientLanding from "@/components/BrandDiscoveryClientLanding";
import { brandDiscoveryPageHref } from "@/lib/domain/brand-discovery";
import { normalizeDiscoveryFacetName, normalizeDiscoveryFacetPage } from "@/lib/domain/discovery-facets";
import { getStaticBrandPaginationParams } from "@/lib/domain/brand-static-manifest";
import { buildPageMetadata } from "@/lib/site-metadata";

export const dynamic = "force-static";
export const revalidate = 86400;

export function generateStaticParams() {
  return getStaticBrandPaginationParams();
}

export async function generateMetadata({ params }) {
  const resolved = await params;
  const name = normalizeDiscoveryFacetName(resolved.name);
  const page = normalizeDiscoveryFacetPage(resolved.page);
  if (page <= 1) permanentRedirect(brandDiscoveryPageHref(name, 1));
  return buildPageMetadata({
    title: `${name}のガチャ一覧・発売情報 | Gacha Lens`,
    description: `${name}のガチャをシリーズ単位で一覧。発売中・発売予定、定価、ラインナップ、相場・在庫情報を確認できます。`,
    path: brandDiscoveryPageHref(name, page),
    noIndex: true,
  });
}

export default async function BrandPaginationPage({ params }) {
  const resolved = await params;
  const name = normalizeDiscoveryFacetName(resolved.name);
  const page = normalizeDiscoveryFacetPage(resolved.page);
  if (page <= 1) permanentRedirect(brandDiscoveryPageHref(name, 1));
  return <BrandDiscoveryClientLanding name={name} page={page} />;
}
