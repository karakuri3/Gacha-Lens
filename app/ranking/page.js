import RankingPageContent from "@/components/RankingPageContent";
import { buildPageMetadata } from "@/lib/site-metadata";

export const dynamic = "force-static";
export const revalidate = 300;

export const metadata = buildPageMetadata({
  title: "成約価格ランキング（単品） | Gacha Lens",
  description: "直近90日で成約価格を3件以上確認できた発売中ガチャ単品だけを、成約価格中央値の高い順に掲載します。販売中の出品価格は別の出品価格ウォッチで表示します。",
  path: "/ranking",
});

export default function RankingPage() {
  return <RankingPageContent tab="released" scope="variant" />;
}
