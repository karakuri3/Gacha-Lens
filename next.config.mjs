/** @type {import('next').NextConfig} */
const nextConfig = {
  // vinext/Cloudflare Workers: keep metadata blocking until upstream streaming
  // metadata parity is stable. Category discovery otherwise intermittently stalls
  // during streamed metadata + SSR and can return a transient 503 on a cold route.
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
