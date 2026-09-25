import RankingPageContent from "@/components/RankingPageContent";
import { buildPageMetadata } from "@/lib/site-metadata";

export const dynamic = "force-static";
export const revalidate = 86400;

export const metadata = buildPageMetadata({
  title: "発売予定の単品ランキング | Gacha Lens",
  description: "発売予定のガチャ単品を、注目度・入手難度・ラインナップの期待からランキングします。",
  path: "/ranking/upcoming",
});

export default function UpcomingRankingPage() {
  return <RankingPageContent tab="upcoming" scope="variant" />;
}
