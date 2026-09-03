/** @type {import('next').NextConfig} */
const ingestionTraceIncludes = [
  "./scripts/**/*",
  "./lib/data/**/*",
  "./lib/fetchers/**/*",
  "./lib/ingestion-runner.js",
  "./lib/repositories/**/*",
  "./data/**/*",
  "./node_modules/@supabase/**/*",
  "node_modules/@supabase/**/*",
  "node_modules/@supabase/supabase-js/**/*",
  "node_modules/@supabase/auth-js/**/*",
  "node_modules/@supabase/functions-js/**/*",
  "node_modules/@supabase/postgrest-js/**/*",
  "node_modules/@supabase/realtime-js/**/*",
  "node_modules/@supabase/storage-js/**/*",
];

const publicSharedCdnRoutes = [
  "/",
  "/series",
  "/series/:path*",
  "/ranking",
  "/schedule",
  "/restocks",
  "/stock",
  "/categories",
  "/categories/:path*",
  "/brands",
  "/brands/:path*",
  "/franchises",
  "/franchises/:path*",
  "/guides",
  "/guides/:path*",
];

const publicSharedCdnCacheControl = "public, max-age=300, stale-while-revalidate=3600, stale-if-error=86400";

const nextConfig = {
  turbopack: {
    root: import.meta.dirname,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return publicSharedCdnRoutes.map((source) => ({
      source,
      headers: [
        {
          key: "CDN-Cache-Control",
          value: publicSharedCdnCacheControl,
        },
      ],
    }));
  },
  outputFileTracingIncludes: {
    "/*": ingestionTraceIncludes,
    "/api/ingest/*": ingestionTraceIncludes,
    "/api/ingest/[task]": ingestionTraceIncludes,
  },
};

export default nextConfig;
