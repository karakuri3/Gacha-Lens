import { getVariantObserverSitemapEntries } from "@/lib/series";
import { buildObserverSitemapXml } from "@/lib/domain/sitemap-publication";
import { absoluteSiteUrl } from "@/lib/site-metadata";
import { unstable_cache } from "next/cache";

export const dynamic = "force-static";
export const revalidate = 86400;

const getDailyVariantObserverSitemapEntries = unstable_cache(
  () => getVariantObserverSitemapEntries(),
  ["gacha-public-variant-observer-sitemap-v1"],
  { revalidate: 86400 }
);

export async function GET() {
  const entries = await getDailyVariantObserverSitemapEntries();
  return new Response(buildObserverSitemapXml(entries, {
    siteUrl: absoluteSiteUrl("/"),
    pathPrefix: "/series/",
  }), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
