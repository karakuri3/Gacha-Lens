import { getSeriesObserverSitemapEntries } from "@/lib/series";
import { buildObserverSitemapXml } from "@/lib/domain/sitemap-publication";
import { absoluteSiteUrl } from "@/lib/site-metadata";
import { unstable_cache } from "next/cache";

export const dynamic = "force-static";
export const revalidate = 86400;

const getDailySeriesObserverSitemapEntries = unstable_cache(
  () => getSeriesObserverSitemapEntries(),
  ["gacha-public-series-observer-sitemap-v1"],
  { revalidate: 86400 }
);

export async function GET() {
  const entries = await getDailySeriesObserverSitemapEntries();
  return new Response(buildObserverSitemapXml(entries, {
    siteUrl: absoluteSiteUrl("/"),
    pathPrefix: "/series/group/",
  }), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
