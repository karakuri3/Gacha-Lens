import RankingPageContent from "@/components/RankingPageContent";
import { buildPageMetadata } from "@/lib/site-metadata";

export const dynamic = "force-static";
export const revalidate = 300;

export const metadata = buildPageMetadata({
  title: "単品の成約価格ランキング | Gacha Lens",
  description: "確認できた成約価格が3件以上ある発売中のガチャ単品だけを比較します。販売中の出品価格は成約価格と分けて表示します。",
  path: "/ranking",
});

export default function RankingPage() {
  return <RankingPageContent tab="released" scope="variant" />;
}
