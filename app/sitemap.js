import { getSeriesSlugs } from "@/lib/series";

export default async function sitemap() {
  const baseUrl = String(process.env.NEXT_PUBLIC_SITE_URL || "https://gacha-lens.vercel.app").replace(/\/$/, "");
  const staticPaths = ["", "/ranking", "/schedule", "/series", "/categories"];
  const variantSlugs = await getSeriesSlugs();

  return [
    ...staticPaths.map((path) => ({ url: `${baseUrl}${path}`, changeFrequency: "daily", priority: path ? 0.8 : 1 })),
    ...variantSlugs.map((slug) => ({
      url: `${baseUrl}/series/${encodeURIComponent(slug)}`,
      changeFrequency: "daily",
      priority: 0.7,
    })),
  ];
}
