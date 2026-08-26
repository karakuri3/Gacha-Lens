import { getSeriesObserverSitemapEntries } from "@/lib/series";
import { buildObserverSitemapXml } from "@/lib/domain/sitemap-publication";
import { absoluteSiteUrl } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";

export async function GET() {
  const entries = await getSeriesObserverSitemapEntries();
  return new Response(buildObserverSitemapXml(entries, {
    siteUrl: absoluteSiteUrl("/"),
    pathPrefix: "/series/group/",
  }), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
