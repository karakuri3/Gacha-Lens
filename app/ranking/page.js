import RankingPageContent from "@/components/RankingPageContent";
import { buildPageMetadata } from "@/lib/site-metadata";

export const dynamic = "force-static";
export const revalidate = 86400;

export const metadata = buildPageMetadata({
  title: "発売中の単品ランキング | Gacha Lens",
  description: "発売中のガチャ単品を、確認できた価格・流通・在庫の動きからランキングします。",
  path: "/ranking",
});

export default function RankingPage() {
  return <RankingPageContent tab="released" scope="variant" />;
}
