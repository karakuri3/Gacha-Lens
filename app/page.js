import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import { getSeriesList } from "@/lib/series";
import { variantHref } from "@/lib/variant-url";
import {
  customerTags,
  formatDiff,
  formatScore,
  formatYen,
  isCirculatingItem,
  opportunityScore,
  releasedPriorityScore,
  stockStatusLabel,
  trendPriorityScore,
  watchScore,
} from "@/lib/domain/public-display-clean";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const series = await getSeriesList();
  const circulating = series
    .filter(isCirculatingItem)
    .sort((a, b) => releasedPriorityScore(b) - releasedPriorityScore(a));
  const hotItem = circulating[0] ?? null;
  const ranking = circulating.slice(0, 5);
  const upcoming = series
    .filter((item) => !item.is_released)
    .sort((a, b) => upcomingPriority(b) - upcomingPriority(a))
    .slice(0, 5);
  const movers = circulating
    .sort((a, b) => trendPriorityScore(b) - trendPriorityScore(a))
    .slice(0, 4);
  const highValue = [...circulating]
    .filter((item) => Number.isFinite(item.market_summary?.single ?? item.market_price_median))
    .sort((a, b) => (b.market_summary?.single ?? b.market_price_median ?? 0) - (a.market_summary?.single ?? a.market_price_median ?? 0))
    .slice(0, 5);
  const stats = [
    { label: "確認できる単品", value: series.length.toLocaleString("ja-JP") },
    { label: "今出回っている", value: circulating.length.toLocaleString("ja-JP") },
    { label: "発売予定", value: upcoming.length.toLocaleString("ja-JP") },
    { label: "市場データ", value: countMarketListings(circulating).toLocaleString("ja-JP") },
  ];

  return (
    <main className="market-dashboard">
      <aside className="dashboard-rail" aria-label="データ収集元">
        <div className="rail-brand">
          <span className="brand-mark">相</span>
          <div>
            <strong>ガチャ相場ナビ</strong>
            <small>GACHA MARKET WATCH</small>
          </div>
        </div>
        <nav className="rail-nav">
          <Link href="/" className="is-active">ホーム</Link>
          <Link href="/ranking">相場ランキング</Link>
          <Link href="/schedule">新作・発売予定</Link>
          <Link href="/series">ガチャ一覧</Link>
          <Link href="/trends">トレンド</Link>
        </nav>
        <div className="rail-panel">
          <p>データ収集元</p>
          <ul>
            <li>gashapon.jp</li>
            <li>タカラトミーアーツ</li>
            <li>market CSV / JSON</li>
            <li>stock CSV / JSON</li>
            <li>Rakuten API ready</li>
          </ul>
        </div>
        <div className="rail-status">
          <span>全システム稼働中</span>
          <strong>{new Date().toLocaleDateString("ja-JP", { month: "2-digit", day: "2-digit" })} 更新</strong>
        </div>
      </aside>

      <section className="dashboard-main">
        <div className="dashboard-topbar">
          <div className="live-badge">全データ自動収集・DB優先表示</div>
          <div className="dashboard-search">ガチャ名・キャラクター名で検索</div>
          <Link href="/series" className="dashboard-link-button">探す</Link>
        </div>

        <section className="dashboard-grid">
          <div className="dashboard-center" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
            {hotItem ? <HotProduct item={hotItem} /> : <EmptyPanel title="今一番熱い商品" />}
            <RankingStrip items={ranking} />
            <div className="dashboard-two-col">
              <HighValueList items={highValue} />
              <MoverList items={movers} />
            </div>
          </div>

          <aside className="dashboard-side">
            <StatsPanel stats={stats} />
            <UpcomingPanel items={upcoming} />
            <TrendSignalPanel items={movers} />
          </aside>
        </section>
      </section>
    </main>
  );
}

function HotProduct({ item }) {
  const tags = customerTags(item, true);
  const singlePrice = item.market_summary?.single ?? item.market_price_median;

  return (
    <Link href={variantHref(item)} className="hot-panel" style={{ width: "100%", maxWidth: "100%" }}>
      <div className="dashboard-section-title">
        <span>今一番熱い商品</span>
        <strong>{tags[0] || "注目中"}</strong>
      </div>
      <div className="hot-product">
        <div className="hot-image">
          <span className="rank-pin">1</span>
          <ProductImage src={item.image_url} alt={item.name} priority />
        </div>
        <div className="hot-body">
          <h1>{item.name}</h1>
          <p>{item.series_name}</p>
          <div className="hot-price">{formatYen(singlePrice)}</div>
          <div className="hot-diff">利益目安 {formatDiff(item.profit_estimate)}</div>
          <div className="dashboard-metrics">
            <Metric label="売れ行き" value={item.market_summary?.sell_through_signal?.label ?? "動きあり"} />
            <Metric label="在庫状況" value={stockStatusLabel(item.stock_summary || item.availability_summary)} />
            <Metric label="狙い目" value={formatScore(watchScore(item))} />
          </div>
        </div>
        <Sparkline item={item} />
      </div>
    </Link>
  );
}

function RankingStrip({ items }) {
  return (
    <section className="dashboard-card">
      <div className="dashboard-section-title">
        <span>リアルタイムランキング</span>
        <Link href="/ranking">ランキングをもっと見る</Link>
      </div>
      <div className="dashboard-rank-grid">
        {items.map((item, index) => (
          <Link key={item.slug} href={variantHref(item)} className="dashboard-rank-card">
            <span className="rank-pin">{index + 1}</span>
            <div className="rank-thumb">
              <ProductImage src={item.image_url} alt={item.name} />
            </div>
            <strong>{item.name}</strong>
            <span>{formatYen(item.market_summary?.single ?? item.market_price_median)}</span>
            <small>{formatScore(watchScore(item))}</small>
          </Link>
        ))}
      </div>
    </section>
  );
}

function HighValueList({ items }) {
  return (
    <section className="dashboard-card">
      <div className="dashboard-section-title">
        <span>高額買取リスト TOP5</span>
        <Link href="/series?filter=circulating&sort=profit">もっと見る</Link>
      </div>
      <div className="dashboard-list">
        {items.map((item, index) => (
          <Link key={item.slug} href={variantHref(item)} className="dashboard-list-row">
            <span>{index + 1}</span>
            <strong>{item.name}</strong>
            <em>{formatYen(item.market_summary?.single ?? item.market_price_median)}</em>
          </Link>
        ))}
      </div>
    </section>
  );
}

function MoverList({ items }) {
  return (
    <section className="dashboard-card">
      <div className="dashboard-section-title">
        <span>価格変動アラート</span>
        <Link href="/trends">トレンドを見る</Link>
      </div>
      <div className="dashboard-list">
        {items.map((item) => (
          <Link key={item.slug} href={variantHref(item)} className="dashboard-list-row mover-row">
            <div className="mini-thumb">
              <ProductImage src={item.image_url} alt={item.name} />
            </div>
            <strong>{item.name}</strong>
            <em>{formatScore(trendPriorityScore(item) / 10)}</em>
          </Link>
        ))}
      </div>
    </section>
  );
}

function StatsPanel({ stats }) {
  return (
    <section className="dashboard-card">
      <div className="dashboard-section-title">
        <span>データ状況</span>
      </div>
      <div className="dashboard-stat-grid">
        {stats.map((stat) => (
          <div key={stat.label} className="dashboard-stat">
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function UpcomingPanel({ items }) {
  return (
    <section className="dashboard-card">
      <div className="dashboard-section-title">
        <span>発売予定の注目ガチャ</span>
        <Link href="/schedule">もっと見る</Link>
      </div>
      <div className="side-product-list">
        {items.map((item) => (
          <Link key={item.slug} href={variantHref(item)} className="side-product">
            <div className="side-thumb">
              <ProductImage src={item.image_url} alt={item.name} />
            </div>
            <span>{Math.round(opportunityScore(item))}</span>
            <div>
              <strong>{item.name}</strong>
              <small>{item.schedule_month} {item.schedule_week ? `${item.schedule_week}より順次` : ""}</small>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function TrendSignalPanel({ items }) {
  return (
    <section className="dashboard-card">
      <div className="dashboard-section-title">
        <span>SNS・口コミ急上昇</span>
        <Link href="/trends">分析を見る</Link>
      </div>
      <div className="side-product-list">
        {items.slice(0, 3).map((item, index) => (
          <Link key={item.slug} href={variantHref(item)} className="side-product">
            <span className="side-rank">{index + 1}</span>
            <div className="side-thumb">
              <ProductImage src={item.image_url} alt={item.name} />
            </div>
            <div>
              <strong>{item.name}</strong>
              <small>{stockStatusLabel(item.stock_summary || item.availability_summary)}</small>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Sparkline({ item }) {
  const score = Math.max(20, Math.min(98, Math.round(trendPriorityScore(item) / 12)));
  const bars = [52, 48, 54, 58, 62, 70, 66, 74, 82, score];
  return (
    <div className="sparkline-panel" aria-label="相場推移イメージ">
      <div className="sparkline-bars">
        {bars.map((height, index) => (
          <span key={index} style={{ height: `${height}%` }} />
        ))}
      </div>
      <strong>{formatYen(item.market_summary?.single ?? item.market_price_median)}</strong>
    </div>
  );
}

function EmptyPanel({ title }) {
  return <section className="dashboard-card empty">{title}はまだ十分なデータがありません。</section>;
}

function countMarketListings(items = []) {
  return items.reduce((total, item) => total + (item.market_listings?.length ?? 0), 0);
}

function upcomingPriority(item) {
  return opportunityScore(item) * 12 + (item.forecast_score ?? 0) * 3;
}
