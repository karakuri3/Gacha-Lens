import RankingPageContent from "@/components/RankingPageContent";
import { buildPageMetadata } from "@/lib/site-metadata";

export const dynamic = "force-static";
export const revalidate = 300;

export const metadata = buildPageMetadata({
  title: "シリーズの成約価格ランキング | Gacha Lens",
  description: "確認できたコンプセットの成約価格が3件以上ある発売中シリーズだけを比較します。出品価格や単品価格は成約価格と分けて扱います。",
  path: "/ranking/series",
});

export default function RankingSeriesPage() {
  return <RankingPageContent tab="released" scope="series" />;
}
