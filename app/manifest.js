import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site-metadata";

export default function manifest() {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "ja",
    icons: [{ src: "/brand/gacha-lens-logo.png", sizes: "1254x1254", type: "image/png" }],
  };
}
