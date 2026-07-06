import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import { getSeriesList } from "@/lib/series";
import { variantHref } from "@/lib/variant-url";
import {
  buildReleasedCustomerMetrics,
  buildUpcomingCustomerMetrics,
  isCirculatingItem,
  opportunityScore,
  publicTrendTags,
  trendPriorityScore,
} from "@/lib/domain/public-display-clean";

export const metadata = {
  title: "トレンド | Gacha Lens",
  description: "今出回っている単品と、これから動きそうな発売予定を確認できます。",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TrendsPage() {
  const series = await getSeriesList();
  const circulatingAll = series
    .filter(isCirculatingItem)
    .sort((a, b) => trendPriorityScore(b) - trendPriorityScore(a));
  const stockMovesAll = circulatingAll
    .filter((item) => hasStockMovement(item))
    .sort((a, b) => trendPriorityScore(b) - trendPriorityScore(a));
  const circulating = circulatingAll.slice(0, 6);
  const circulatingSlugs = new Set(circulating.map((item) => item.slug));
  const stockMoves = stockMovesAll.filter((item) => !circulatingSlugs.has(item.slug)).slice(0, 6);
  const upcoming = series
    .filter((item) => !item.is_released)
    .sort((a, b) => upcomingPriority(b) - upcomingPriority(a))
    .slice(0, 8);
  const trendStats = [
    { label: "確認できる単品", value: series.length },
    { label: "今出回っている", value: circulatingAll.length },
    { label: "発売予定", value: series.filter((item) => !item.is_released).length },
    { label: "在庫動きあり", value: stockMovesAll.length },
  ];

  return (
    <main className="site-main">
      <div className="site-shell">
        <section className="page-hero">
          <p className="eyebrow">TREND</p>
          <h1 className="page-title">今動いているガチャを確認</h1>
          <p className="page-lead">
            出品、売れ行き、在庫報告、SNS反応、発売直後のシグナルをまとめて、今探す価値が高い単品を上に出します。
          </p>
          <div className="tag-row">
            <Link href="/ranking?tab=released" className="button-link">発売中ランキング</Link>
            <Link href="/series?filter=circulating&sort=watch" className="button-link">今出回っている単品</Link>
          </div>
        </section>

        <section className="stats-strip" aria-label="トレンド概要">
          {trendStats.map((stat) => (
            <div key={stat.label} className="stat-pill">
              <span>{stat.label}</span>
              <strong>{stat.value.toLocaleString("ja-JP")}</strong>
            </div>
          ))}
        </section>

        <section className="trend-board">
          <TrendSection
            title="急上昇・流通中"
            subtitle="出品や売れ行き、在庫報告がある単品を優先しています。"
            items={circulating}
            mode="released"
          />
          {stockMoves.length > 0 ? (
            <TrendSection
              title="在庫動きあり"
              subtitle="再入荷や在庫報告が入り、探しに行く理由がある単品です。"
              items={stockMoves}
              mode="released"
              compact
            />
          ) : null}
          <TrendSection
            title="これから狙い目"
            subtitle="発売前は相場を出さず、期待値と流通少なめだけで見せます。"
            items={upcoming}
            mode="upcoming"
          />
        </section>
      </div>
    </main>
  );
}

function TrendSection({ title, subtitle, items, mode, compact = false }) {
  return (
    <section>
      <div className="section-head">
        <div>
          <h2 className="section-title">{title}</h2>
          <p className="section-sub">{subtitle}</p>
        </div>
      </div>
      {items.length ? (
        <div className={`trend-list ${compact ? "trend-list--compact" : ""}`}>
          {items.map((item) => (
            <TrendCard key={item.slug} item={item} mode={mode} compact={compact} />
          ))}
        </div>
      ) : (
        <div className="card empty">まだ十分なトレンドシグナルがありません。</div>
      )}
    </section>
  );
}

function TrendCard({ item, mode, compact }) {
  const tags = publicTrendTags(item);
  const metrics = visibleTrendMetrics(
    mode === "released" ? buildReleasedCustomerMetrics(item) : buildUpcomingCustomerMetrics(item),
    mode,
    compact
  );
  const rawScore = mode === "released" ? trendPriorityScore(item) / 10 : opportunityScore(item);
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  return (
    <Link href={variantHref(item)} className={`card trend-card ${compact ? "trend-card--compact" : ""}`}>
      <div className="product-image">
        <ProductImage src={item.image_url} alt={item.name} />
      </div>
      <div className="trend-card__body">
        <div className="trend-card__top">
          <span className="trend-score">{score.toLocaleString("ja-JP")}点</span>
          <span className="product-meta">{mode === "released" ? publicFlowLabel(item) : publicScheduleLabel(item)}</span>
        </div>
        <h3 className="product-name">{item.name}</h3>
        <div className="product-meta">{item.series_name} / {item.rarity}</div>
        {tags.length ? (
          <div className="tag-row">
            {tags.slice(0, 3).map((tag) => (
              <span key={tag} className="tag tag--signal">{tag}</span>
            ))}
          </div>
        ) : null}
        <div className="metric-grid">
          {metrics.map((metric) => (
            <div key={metric.label} className="metric">
              <div className="metric__label">{metric.label}</div>
              <div className={`metric__value ${metric.tone ? `is-${metric.tone}` : ""}`}>{metric.value}</div>
            </div>
          ))}
        </div>
      </div>
    </Link>
  );
}

function publicFlowLabel(item) {
  const active = item.active_listing_count ?? item.market_summary?.active_listing_count ?? 0;
  const sold = item.sold_count ?? item.market_summary?.sold_count ?? 0;
  if (!active && !sold) return "流通信号あり";
  return `出品 ${active.toLocaleString("ja-JP")} / 売れ ${sold.toLocaleString("ja-JP")}`;
}

function publicScheduleLabel(item) {
  return [item.schedule_month, item.schedule_week ? `${item.schedule_week}より順次` : ""].filter(Boolean).join(" ") || "発売予定";
}

function visibleTrendMetrics(metrics = [], mode, compact) {
  const unavailable = new Set(["未取得", "データ不足"]);
  return metrics
    .filter((metric) => mode !== "released" || !unavailable.has(metric.value))
    .slice(0, compact ? 3 : 4);
}

function hasStockMovement(item) {
  const stock = item.stock_summary ?? item.availability_summary ?? {};
  return Boolean(stock.has_stock_signal || stock.has_restock_signal);
}

function upcomingPriority(item) {
  return opportunityScore(item) * 12 + (item.forecast_score ?? 0) * 3 + (item.trend_score ?? 0) * 2;
}
