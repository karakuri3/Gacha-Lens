import "./globals.css";
import Header from "@/components/Header";

export const metadata = {
  title: "ガチャ相場ナビ",
  description: "ガチャの発売予定、ランキング、相場感を判断するためのサイトです。",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>
        <Header />
        {children}
      </body>
    </html>
  );
}
