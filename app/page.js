import Link from "next/link";
import { getSeriesList } from "@/lib/series";
import SeriesCard from "@/components/SeriesCard";

export default async function Home() {
  const series = await getSeriesList();
  const releasedTop = series
    .filter((item) => item.is_released)
    .sort((a, b) => (b.profit_estimate ?? 0) - (a.profit_estimate ?? 0))
    .slice(0, 3);
  const upcomingTop = series
    .filter((item) => !item.is_released)
    .sort((a, b) => (b.forecast_score ?? 0) - (a.forecast_score ?? 0))
    .slice(0, 3);

  return (
    <main className="site-main">
      <div className="site-shell">
        <section className="page-hero">
          <p className="eyebrow">GACHA DECISION BOARD</p>
          <h1 className="page-title">強い単品だけを、すぐ判断する</h1>
          <p className="page-lead">
            シリーズではなく中身の個別種を主役に、発売中は単品相場、発売予定は根拠付き期待値で整理します。
          </p>
          <div className="tag-row">
            <Link href="/ranking" className="button-link button-link--dark">ランキングを見る</Link>
            <Link href="/schedule" className="button-link">発売予定を見る</Link>
            <Link href="/series" className="button-link">一覧で探す</Link>
          </div>
        </section>

        <section>
          <div className="section-head">
            <div>
              <h2 className="section-title">発売中で強い単品</h2>
              <p className="section-sub">単品相場と価格差を先に見せます。</p>
            </div>
            <Link href="/ranking?tab=released" className="button-link">もっと見る</Link>
          </div>
          <div className="grid grid--cards">
            {releasedTop.map((item) => (
              <SeriesCard key={item.slug} series={item} />
            ))}
          </div>
        </section>

        <section style={{ marginTop: 34 }}>
          <div className="section-head">
            <div>
              <h2 className="section-title">これから狙い目の単品</h2>
              <p className="section-sub">発売前はコンプ需要・当たり枠・互換性・限定性・予約気配・X反応で判断します。</p>
            </div>
            <Link href="/ranking?tab=upcoming" className="button-link">もっと見る</Link>
          </div>
          <div className="grid grid--cards">
            {upcomingTop.map((item) => (
              <SeriesCard key={item.slug} series={item} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
