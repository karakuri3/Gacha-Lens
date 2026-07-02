import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import { getSeriesList } from "@/lib/series";
import {
  RELEASED_METRIC_LABELS,
  UPCOMING_METRIC_LABELS,
  buildReleasedCustomerMetrics,
  buildUpcomingCustomerMetrics,
  customerTags,
  isCirculatingItem,
  opportunityScore,
  releasedPriorityScore,
} from "@/lib/domain/public-display-clean";

export const metadata = {
  title: "ランキング | Gacha Lens",
  description: "発売中と発売予定を分けて、今見るべきガチャ単品をランキングします。",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

const tabs = [
  { value: "released", label: "発売中", caption: "相場・利益" },
  { value: "upcoming", label: "発売予定", caption: "期待値" },
];

const releasedMetricLabels = [
  RELEASED_METRIC_LABELS.price,
  RELEASED_METRIC_LABELS.singleMarket,
  RELEASED_METRIC_LABELS.profit,
  RELEASED_METRIC_LABELS.completeSet,
  RELEASED_METRIC_LABELS.stock,
  RELEASED_METRIC_LABELS.sellThrough,
  RELEASED_METRIC_LABELS.watch,
];

const upcomingMetricLabels = [
  UPCOMING_METRIC_LABELS.price,
  UPCOMING_METRIC_LABELS.forecast,
  UPCOMING_METRIC_LABELS.upside,
  UPCOMING_METRIC_LABELS.scarcity,
  UPCOMING_METRIC_LABELS.opportunity,
  UPCOMING_METRIC_LABELS.release,
];

export default async function RankingPage({ searchParams }) {
  const params = await searchParams;
  const tab = params?.tab === "upcoming" ? "upcoming" : "released";
  const series = await getSeriesList();

  const ranked = series
    .filter((item) => (tab === "released" ? isCirculatingItem(item) : !item.is_released))
    .sort((a, b) => {
      const primaryA = tab === "released" ? releasedPriority(a) : upcomingPriority(a);
      const primaryB = tab === "released" ? releasedPriority(b) : upcomingPriority(b);
      if (primaryB !== primaryA) return primaryB - primaryA;
      return a.name.localeCompare(b.name, "ja");
    })
    .map((item, index) => ({ ...item, rank: index + 1 }));

  const signalItems = ranked.filter((item) => customerTags(item, tab === "released").length > 0).slice(0, 4);
  const podium = arrangePodium(ranked.slice(0, 3));
  const rest = ranked.slice(3);

  return (
    <main className="site-main">
      <div className="site-shell">
        <section className="page-hero">
          <p className="eyebrow">RANKING</p>
          <h1 className="page-title">今見るべきガチャ単品ランキング</h1>
          <p className="page-lead">
            発売中は相場・利益・在庫・売れ行きで、発売予定は期待値・価格上昇期待・流通少なめで並べます。
          </p>
        </section>

        <div className="tabs">
          {tabs.map((item) => (
            <Link
              key={item.value}
              href={{ pathname: "/ranking", query: { tab: item.value } }}
              className={`pill-link ${tab === item.value ? "is-active" : ""}`}
            >
              {item.label}
              <span style={{ marginLeft: 8, opacity: 0.72, fontSize: 12 }}>{item.caption}</span>
            </Link>
          ))}
        </div>

        {signalItems.length > 0 ? (
          <section className="signal-strip" aria-label="今見るべき商品">
            {signalItems.map((item) => (
              <Link key={item.slug} href={`/series/${item.slug}`} className="signal-chip">
                <strong>{customerTags(item, tab === "released")[0]}</strong>
                <span>{item.variant_name || item.name}</span>
              </Link>
            ))}
          </section>
        ) : null}

        <section className="grid grid--3 podium">
          {podium.map((item) => (
            <RankingCard key={item.slug} item={item} mode={tab} />
          ))}
        </section>

        <section className="grid">
          {rest.map((item) => (
            <RankingRow key={item.slug} item={item} mode={tab} />
          ))}
        </section>
      </div>
    </main>
  );
}

function RankingCard({ item, mode }) {
  return (
    <Link href={`/series/${item.slug}`} className={`card product-card rank-${item.rank}`}>
      <span className={`rank-medal rank-medal--${item.rank}`}>{item.rank}位</span>
      <div className="product-image">
        <ProductImage src={item.image_url} alt={item.name} priority={item.rank <= 3} />
      </div>
      <ProductTitle item={item} />
      <PublicTags item={item} isReleased={mode === "released"} />
      <MetricGrid metrics={getMetrics(item, mode)} />
    </Link>
  );
}

function RankingRow({ item, mode }) {
  return (
    <Link href={`/series/${item.slug}`} className="card rank-row">
      <div className="rank-number">#{item.rank}</div>
      <div className="product-image">
        <ProductImage src={item.image_url} alt={item.name} />
      </div>
      <div>
        <ProductTitle item={item} />
        <PublicTags item={item} isReleased={mode === "released"} compact />
      </div>
      <MetricGrid metrics={getMetrics(item, mode)} />
    </Link>
  );
}

function ProductTitle({ item }) {
  return (
    <div>
      <h2 className="product-name">{item.name}</h2>
      <div className="product-meta">
        {item.series_name} / {item.rarity}
      </div>
    </div>
  );
}

function PublicTags({ item, isReleased, compact = false }) {
  const tags = customerTags(item, isReleased);
  if (!tags.length) return null;
  return (
    <div className="tag-row" style={{ marginTop: compact ? 10 : 0 }}>
      {tags.slice(0, compact ? 3 : 4).map((tag) => (
        <span key={tag} className="tag tag--signal">{tag}</span>
      ))}
    </div>
  );
}

function MetricGrid({ metrics }) {
  return (
    <div className="metric-grid">
      {metrics.map((metric) => (
        <div key={metric.label} className="metric">
          <div className="metric__label">{metric.label}</div>
          <div className={`metric__value ${metric.tone ? `is-${metric.tone}` : ""}`}>{metric.value}</div>
        </div>
      ))}
    </div>
  );
}

function getMetrics(item, mode) {
  const metrics = mode === "released" ? buildReleasedCustomerMetrics(item) : buildUpcomingCustomerMetrics(item);
  const allowed = mode === "released" ? releasedMetricLabels : upcomingMetricLabels;
  return metrics.filter((metric) => allowed.includes(metric.label));
}

function arrangePodium(items) {
  if (items.length < 3) return items;
  return [items[1], items[0], items[2]];
}

function releasedPriority(item) {
  return releasedPriorityScore(item);
}

function upcomingPriority(item) {
  return opportunityScore(item) * 12 + (item.forecast_score ?? 0) * 3;
}
