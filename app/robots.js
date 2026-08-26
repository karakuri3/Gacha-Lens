import { absoluteSiteUrl } from "@/lib/site-metadata";

export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/review/", "/supabase-series"],
    },
    sitemap: [
      absoluteSiteUrl("/sitemap.xml"),
      absoluteSiteUrl("/series-sitemap.xml"),
      absoluteSiteUrl("/variant-sitemap.xml"),
    ],
    host: absoluteSiteUrl("/"),
  };
}
