import { getVariantObserverSitemapEntries } from "@/lib/series";
import { buildObserverSitemapXml } from "@/lib/domain/sitemap-publication";
import { absoluteSiteUrl } from "@/lib/site-metadata";
import { unstable_cache } from "next/cache";

export const dynamic = "force-dynamic";

const getDailyVariantObserverSitemapEntries = unstable_cache(
  (page) => getVariantObserverSitemapEntries(page),
  ["gacha-public-variant-observer-sitemap-shard-v1"],
  { revalidate: 86400 }
);

export async function GET(_request, { params }) {
  const { page: rawPage } = await params;
  const page = Number(rawPage);
  if (!Number.isInteger(page) || page < 1) {
    return new Response("Not found", { status: 404 });
  }

  const entries = await getDailyVariantObserverSitemapEntries(page);
  if (!entries.length && page > 1) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(buildObserverSitemapXml(entries, {
    siteUrl: absoluteSiteUrl("/"),
    pathPrefix: "/series/",
  }), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
