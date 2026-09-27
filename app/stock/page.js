import StockClientPage from "@/components/StockClientPage";
import { buildPageMetadata } from "@/lib/site-metadata";

export const metadata = buildPageMetadata({
  title: "在庫目撃情報 | Gacha Lens",
  description: "店舗や地域ごとに確認されたガチャの在庫目撃情報を探せます。",
  path: "/stock",
});

export const dynamic = "force-static";
export const revalidate = 86400;

export default function StockPage() {
  return <StockClientPage />;
}
