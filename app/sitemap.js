import { getPublicSitemapIdentifiers } from "@/lib/series";
import { absoluteSiteUrl } from "@/lib/site-metadata";

const MAX_SITEMAP_URLS = 50000;

export default async function sitemap() {
  const staticPages = [
    { path: "/", frequency: "daily", priority: 1 },
    { path: "/ranking", frequency: "daily", priority: 0.9 },
    { path: "/schedule", frequency: "daily", priority: 0.9 },
    { path: "/series", frequency: "daily", priority: 0.9 },
    { path: "/categories", frequency: "weekly", priority: 0.8 },
    { path: "/restocks", frequency: "daily", priority: 0.8 },
    { path: "/stock", frequency: "daily", priority: 0.8 },
    { path: "/privacy", frequency: "yearly", priority: 0.3 },
    { path: "/terms", frequency: "yearly", priority: 0.3 },
    { path: "/disclaimer", frequency: "yearly", priority: 0.3 },
    { path: "/affiliate-disclosure", frequency: "yearly", priority: 0.3 },
    { path: "/operator", frequency: "yearly", priority: 0.3 },
    { path: "/contact", frequency: "yearly", priority: 0.3 },
  ];
  const { variantSlugs, parentSeriesSlugs } = await getPublicSitemapIdentifiers();

  const entries = [
    ...staticPages.map((page) => ({
      url: absoluteSiteUrl(page.path),
      changeFrequency: page.frequency,
      priority: page.priority,
    })),
    ...variantSlugs.map((slug) => ({
      url: absoluteSiteUrl(`/series/${encodeURIComponent(slug)}`),
      changeFrequency: "daily",
      priority: 0.8,
    })),
    ...parentSeriesSlugs.map((slug) => ({
      url: absoluteSiteUrl(`/series/group/${encodeURIComponent(slug)}`),
      changeFrequency: "daily",
      priority: 0.8,
    })),
  ];

  if (entries.length > MAX_SITEMAP_URLS) {
    throw new Error(`Public sitemap exceeds ${MAX_SITEMAP_URLS} URLs`);
  }
  return entries;
}
