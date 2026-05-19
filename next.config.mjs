/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: import.meta.dirname,
  },
  outputFileTracingIncludes: {
    "/api/ingest/[task]": [
      "./scripts/**/*",
      "./lib/**/*",
      "./data/**/*",
      "./node_modules/@supabase/**/*",
      "node_modules/@supabase/**/*",
      "node_modules/@supabase/supabase-js/**/*",
      "node_modules/@supabase/auth-js/**/*",
      "node_modules/@supabase/functions-js/**/*",
      "node_modules/@supabase/postgrest-js/**/*",
      "node_modules/@supabase/realtime-js/**/*",
      "node_modules/@supabase/storage-js/**/*",
    ],
  },
};

export default nextConfig;
