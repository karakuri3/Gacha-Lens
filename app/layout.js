import "./globals.css";
import Header from "@/components/Header";
import AppSidebar from "@/components/AppSidebar";
import Footer from "@/components/Footer";
import StructuredData from "@/components/StructuredData";
import {
  DEFAULT_OG_IMAGE,
  SITE_DESCRIPTION,
  SITE_NAME,
  absoluteSiteUrl,
  getSiteUrl,
  metadataOther,
  metadataVerification,
} from "@/lib/site-metadata";

export const metadata = {
  title: `${SITE_NAME} | ガチャの新作・価格・在庫情報`,
  description: SITE_DESCRIPTION,
  metadataBase: getSiteUrl(),
  applicationName: SITE_NAME,
  authors: [{ name: `${SITE_NAME} 運営事務局` }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "ガチャ・カプセルトイ",
  keywords: ["ガチャ", "カプセルトイ", "ガチャガチャ", "発売予定", "相場", "在庫", "再入荷"],
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  icons: {
    icon: DEFAULT_OG_IMAGE,
    apple: DEFAULT_OG_IMAGE,
  },
  openGraph: {
    title: `${SITE_NAME} | ガチャの新作・価格・在庫情報`,
    description: SITE_DESCRIPTION,
    url: "/",
    siteName: SITE_NAME,
    images: [{ url: DEFAULT_OG_IMAGE, alt: SITE_NAME }],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} | ガチャの新作・価格・在庫情報`,
    description: SITE_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
  verification: metadataVerification(),
  other: metadataOther(),
};

export default function RootLayout({ children }) {
  const homeUrl = absoluteSiteUrl("/");
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${homeUrl}#organization`,
        name: SITE_NAME,
        url: homeUrl,
        logo: absoluteSiteUrl(DEFAULT_OG_IMAGE),
      },
      {
        "@type": "WebSite",
        "@id": `${homeUrl}#website`,
        name: SITE_NAME,
        url: homeUrl,
        description: SITE_DESCRIPTION,
        inLanguage: "ja-JP",
        publisher: { "@id": `${homeUrl}#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: `${absoluteSiteUrl("/series")}?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };

  return (
    <html lang="ja">
      <body>
        <StructuredData value={websiteJsonLd} />
        <Header />
        <div className="app-frame">
          <AppSidebar />
          <div className="app-content">
            {children}
            <Footer />
          </div>
        </div>
      </body>
    </html>
  );
}
