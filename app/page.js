import Link from "next/link";
import { getSeriesList } from "@/lib/series";
import SeriesCard from "@/components/SeriesCard";
import { variantHref } from "@/lib/variant-url";
import { customerTags, isCirculatingItem, opportunityScore, releasedPriorityScore, trendPriorityScore } from "@/lib/domain/public-display-clean";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const series = await getSeriesList();
  const watchNow = series
    .filter(isCirculatingItem)
    .sort((a, b) => releasedPriorityScore(b) - releasedPriorityScore(a))
    .slice(0, 4);
  const releasedTop = watchNow.slice(0, 3);
  const upcomingTop = series
    .filter((item) => !item.is_released)
    .sort((a, b) => upcomingPriority(b) - upcomingPriority(a))
    .slice(0, 3);
  const trendTop = series
    .filter(isCirculatingItem)
    .sort((a, b) => trendPriorityScore(b) - trendPriorityScore(a))
    .slice(0, 3);

  return (
    <main className="site-main">
      <div className="site-shell">
        <section className="page-hero">
          <p className="eyebrow">GACHA MARKET INTELLIGENCE</p>
          <h1 className="page-title">今いちばん熱いガチャ単品が一目で分かる</h1>
          <p className="page-lead">
            相場、利益目安、在庫の動き、売れ行き、発売予定の期待値を単品ごとに整理。転売判断、買取チェック、欲しい商品の探索に必要な情報だけを前に出します。
          </p>
          <div className="tag-row">
            <Link href="/ranking" className="button-link">ランキングを見る</Link>
            <Link href="/trends" className="button-link">トレンドを見る</Link>
            <Link href="/schedule" className="button-link">発売予定を見る</Link>
            <Link href="/series" className="button-link">単品一覧で探す</Link>
          </div>
        </section>

        {watchNow.length > 0 ? (
          <section className="signal-strip" aria-label="今見るべき商品">
            {watchNow.map((item) => (
              <Link key={item.slug} href={variantHref(item)} className="signal-chip">
                <strong>{customerTags(item, true)[0] || "今見るべき"}</strong>
                <span>{item.variant_name || item.name}</span>
              </Link>
            ))}
          </section>
        ) : null}

        <section className="trend-board" style={{ marginBottom: 34 }}>
          <div className="card panel">
            <h2>今出回っている</h2>
            <p className="section-sub">出品、売れ行き、在庫報告、利益目安がある単品を優先します。</p>
            <div className="plain-list">
              {trendTop.map((item) => (
                <Link key={item.slug} href={variantHref(item)} className="signal-chip" style={{ marginBottom: 10 }}>
                  <strong>{customerTags(item, true)[0] || "流通あり"}</strong>
                  <span>{item.name}</span>
                </Link>
              ))}
            </div>
          </div>
          <div className="card panel">
            <h2>発売予定の狙い目</h2>
            <p className="section-sub">発売前は相場を出さず、期待値、価格上昇期待、流通少なめで見ます。</p>
            <div className="plain-list">
              {upcomingTop.map((item) => (
                <Link key={item.slug} href={variantHref(item)} className="signal-chip" style={{ marginBottom: 10 }}>
                  <strong>{customerTags(item, false)[0] || "期待値"}</strong>
                  <span>{item.name}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="section-head">
            <div>
              <h2 className="section-title">発売中で見るべき単品</h2>
              <p className="section-sub">単品相場、利益目安、コンプ相場、在庫、売れ行きで判断できます。</p>
            </div>
            <Link href="/ranking?tab=released" className="button-link">もっと見る</Link>
          </div>
          <div className="grid grid--cards">
            {releasedTop.map((item, index) => (
              <SeriesCard key={item.slug} series={item} priority={index === 0} />
            ))}
          </div>
        </section>

        <section style={{ marginTop: 34 }}>
          <div className="section-head">
            <div>
              <h2 className="section-title">これから狙い目の発売予定</h2>
              <p className="section-sub">発売前は利益を出さず、期待値、価格上昇期待、在庫/流通の少なさだけを見せます。</p>
            </div>
            <Link href="/ranking?tab=upcoming" className="button-link">もっと見る</Link>
          </div>
          <div className="grid grid--cards">
            {upcomingTop.map((item, index) => (
              <SeriesCard key={item.slug} series={item} priority={index === 0} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function upcomingPriority(item) {
  return opportunityScore(item) * 12 + (item.forecast_score ?? 0) * 3;
}
