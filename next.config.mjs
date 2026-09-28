const releaseSourceSha = [process.env.WORKERS_CI_COMMIT_SHA, process.env.GITHUB_SHA]
  .map((value) => String(value ?? "").trim().toLowerCase())
  .find((value) => /^[0-9a-f]{40}$/.test(value)) ?? "unknown";

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: import.meta.dirname,
  },
  env: {
    GACHA_RELEASE_SOURCE_SHA: releaseSourceSha,
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
