export const SITE_NAME = "Gacha Lens";
export const SITE_DESCRIPTION = "ガチャの新作、発売予定、価格の動き、在庫・再入荷情報を単品ごとに確認できるガチャ情報サービスです。";
export const DEFAULT_OG_IMAGE = "/brand/gacha-lens-logo.png";

export function getSiteUrl(env = process.env) {
  const configured = env.NEXT_PUBLIC_SITE_URL || env.VERCEL_PROJECT_PRODUCTION_URL || "http://localhost:3000";
  const value = configured.startsWith("http") ? configured : `https://${configured}`;
  return new URL(value.endsWith("/") ? value : `${value}/`);
}

export function absoluteSiteUrl(path = "/", env = process.env) {
  return new URL(path, getSiteUrl(env)).toString();
}

export function buildPageMetadata({
  title,
  description = SITE_DESCRIPTION,
  path = "/",
  image = DEFAULT_OG_IMAGE,
  type = "website",
  noIndex = false,
} = {}) {
  const canonical = path || "/";
  return {
    title,
    description,
    alternates: { canonical },
    robots: noIndex ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      locale: "ja_JP",
      type,
      images: image ? [{ url: image, alt: title || SITE_NAME }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export function metadataVerification(env = process.env) {
  const google = String(env.GOOGLE_SITE_VERIFICATION || "").trim();
  return google ? { google } : undefined;
}

export function metadataOther(env = process.env) {
  const adsenseAccount = String(env.NEXT_PUBLIC_GOOGLE_ADSENSE_ACCOUNT || "").trim();
  return adsenseAccount ? { "google-adsense-account": adsenseAccount } : undefined;
}
