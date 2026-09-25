import RankingPageContent from "@/components/RankingPageContent";
import { buildPageMetadata } from "@/lib/site-metadata";

export const dynamic = "force-static";
export const revalidate = 86400;

export const metadata = buildPageMetadata({
  title: "発売中のシリーズランキング | Gacha Lens",
  description: "発売中のガチャシリーズを、確認できた価格・流通・在庫の動きからランキングします。",
  path: "/ranking/series",
});

export default function RankingSeriesPage() {
  return <RankingPageContent tab="released" scope="series" />;
}
