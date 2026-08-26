import { getVariantObserverSitemapEntries } from "@/lib/series";
import { buildObserverSitemapXml } from "@/lib/domain/sitemap-publication";
import { absoluteSiteUrl } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";

export async function GET() {
  const entries = await getVariantObserverSitemapEntries();
  return new Response(buildObserverSitemapXml(entries, {
    siteUrl: absoluteSiteUrl("/"),
    pathPrefix: "/series/",
  }), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
