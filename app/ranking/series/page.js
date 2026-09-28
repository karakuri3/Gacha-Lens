import RankingPageContent from "@/components/RankingPageContent";
import { buildPageMetadata } from "@/lib/site-metadata";

export const dynamic = "force-static";
export const revalidate = 300;

export const metadata = buildPageMetadata({
  title: "成約価格ランキング（シリーズ） | Gacha Lens",
  description: "直近90日でセット成約価格を3件以上確認できた発売中シリーズだけを、成約価格中央値の高い順に掲載します。単品価格や販売中の出品価格は順位に使いません。",
  path: "/ranking/series",
});

export default function RankingSeriesPage() {
  return <RankingPageContent tab="released" scope="series" />;
}
