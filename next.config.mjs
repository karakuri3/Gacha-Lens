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

const nextConfig = {
  turbopack: {
    root: import.meta.dirname,
  },
  images: {
    unoptimized: true,
  },
  outputFileTracingIncludes: {
    "/*": ingestionTraceIncludes,
    "/api/ingest/*": ingestionTraceIncludes,
    "/api/ingest/[task]": ingestionTraceIncludes,
  },
};

export default nextConfig;
