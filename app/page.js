import Link from "next/link";
import { getSeriesList } from "@/lib/series";
import SeriesCard from "@/components/SeriesCard";

export default async function Home() {
  const series = await getSeriesList();
  const watchNow = series
    .filter((item) => item.is_released)
    .sort((a, b) => releasedPriority(b) - releasedPriority(a))
    .slice(0, 4);
  const releasedTop = watchNow.slice(0, 3);
  const upcomingTop = series
    .filter((item) => !item.is_released)
    .sort((a, b) => upcomingPriority(b) - upcomingPriority(a))
    .slice(0, 3);

  return (
    <main className="site-main">
      <div className="site-shell">
        <section className="page-hero">
          <p className="eyebrow">GACHA DECISION BOARD</p>
          <h1 className="page-title">今出回っている単品と、次に狙う単品をすぐ判断</h1>
          <p className="page-lead">
            発売中は相場・利益・売れ行き・在庫、発売予定は予想スコアとX反応で見るサイトです。
          </p>
          <div className="tag-row">
            <Link href="/ranking" className="button-link button-link--dark">ランキングを見る</Link>
            <Link href="/schedule" className="button-link">発売予定を見る</Link>
            <Link href="/series" className="button-link">単品一覧で探す</Link>
          </div>
        </section>

        {watchNow.length > 0 ? (
          <section className="signal-strip" aria-label="今見るべき商品">
            {watchNow.map((item) => (
              <Link key={item.slug} href={`/series/${item.slug}`} className="signal-chip">
                <strong>{item.circulation_label || "流通シグナル"}</strong>
                <span>{item.variant_name || item.name}</span>
              </Link>
            ))}
          </section>
        ) : null}

        <section>
          <div className="section-head">
            <div>
              <h2 className="section-title">発売中で動きがある単品</h2>
              <p className="section-sub">利益だけでなく、出品数・SOLD・再入荷・在庫報告を加味しています。</p>
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
              <h2 className="section-title">これから狙い目の発売予定</h2>
              <p className="section-sub">相場は出さず、コンプ需要・当たり枠・互換性・限定性・X反応で判断します。</p>
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

function releasedPriority(item) {
  return Math.max(0, item.profit_estimate ?? 0) * 0.8 + (item.circulation_score ?? 0) * 18 + (item.trend_score ?? 0) * 12 + (item.sold_count ?? 0) * 45;
}

function upcomingPriority(item) {
  return (item.forecast_score ?? 0) * 10 + (item.trend_score ?? 0) * 4 + (item.x_signal_score ?? 0) * 3;
}
