/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    GACHA_RELEASE_SOURCE_SHA:
      process.env.WORKERS_CI_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "",
  },
  turbopack: {
    root: import.meta.dirname,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
