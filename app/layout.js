import "./globals.css";
import Header from "@/components/Header";
import AppSidebar from "@/components/AppSidebar";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Gacha Lens",
  description: "新作、話題の単品、価格の動き、在庫情報が分かるガチャトレンドガイドです。",
};

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
