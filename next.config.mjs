/** @type {import('next').NextConfig} */
const nextConfig = {
  // Diagnostic: force blocking metadata on vinext/Workers to avoid streaming metadata path.
  htmlLimitedBots: /.*/,
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
