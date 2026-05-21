import Link from "next/link";
import { getSeriesList } from "@/lib/series";
import SeriesCard from "@/components/SeriesCard";
import { customerTags, opportunityScore, watchScore } from "@/lib/domain/public-display";

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
          <h1 className="page-title">仕入れ判断に使える単品だけをすばやく見る</h1>
          <p className="page-lead">
            発売中は相場・利益・在庫・売れ行き、発売予定は期待値・品薄予想・狙い目度に絞っています。
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
                <strong>{customerTags(item, true)[0] || "今見るべき"}</strong>
                <span>{item.variant_name || item.name}</span>
              </Link>
            ))}
          </section>
        ) : null}

        <section>
          <div className="section-head">
            <div>
              <h2 className="section-title">発売中で見るべき単品</h2>
              <p className="section-sub">価格、単品相場、利益目安、在庫状況だけで判断できます。</p>
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
              <p className="section-sub">相場は出さず、期待値・価格上昇期待・品薄予想で見ます。</p>
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
  return watchScore(item) * 12 + Math.max(0, item.profit_estimate ?? 0) * 0.7;
}

function upcomingPriority(item) {
  return opportunityScore(item) * 12 + (item.forecast_score ?? 0) * 3;
}
