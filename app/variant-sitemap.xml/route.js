import { getVariantObserverSitemapShardCount } from "@/lib/series";
import { buildSitemapIndexXml } from "@/lib/domain/sitemap-publication";
import { absoluteSiteUrl } from "@/lib/site-metadata";
import { unstable_cache } from "next/cache";

export const dynamic = "force-static";
export const revalidate = 86400;

const getDailyVariantObserverSitemapShardCount = unstable_cache(
  () => getVariantObserverSitemapShardCount(),
  ["gacha-public-variant-observer-sitemap-index-v1"],
  { revalidate: 86400 }
);

export async function GET() {
  const shardCount = await getDailyVariantObserverSitemapShardCount();
  const paths = Array.from({ length: shardCount }, (_, index) => `/variant-sitemap/${index + 1}`);
  return new Response(buildSitemapIndexXml(paths, {
    siteUrl: absoluteSiteUrl("/"),
  }), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
