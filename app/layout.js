import "./globals.css";
import Header from "@/components/Header";
import AppSidebar from "@/components/AppSidebar";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Gacha Lens",
  description: "新作、話題の単品、価格の動き、在庫情報が分かるガチャトレンドガイドです。",
  metadataBase: getMetadataBase(),
  icons: {
    icon: "/brand/gacha-lens-logo.png",
    apple: "/brand/gacha-lens-logo.png",
  },
  openGraph: {
    title: "Gacha Lens",
    description: "ガチャの相場・発売予定・在庫の動きを単品ごとに確認できます。",
    images: ["/brand/gacha-lens-logo.png"],
    locale: "ja_JP",
    type: "website",
  },
};

function getMetadataBase() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || "http://localhost:3000";
  return new URL(configured.startsWith("http") ? configured : `https://${configured}`);
}

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>
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
