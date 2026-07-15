import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import { getRankingSeries } from "@/lib/series";
import { variantHref } from "@/lib/variant-url";
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
  title: "注目ランキング | Gacha Lens",
  description: "発売中と発売予定を分けて、いま話題のガチャ単品をランキングします。",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

const tabs = [
  { value: "released", label: "発売中", caption: "話題・流通" },
  { value: "upcoming", label: "発売予定", caption: "先行注目" },
];

const releasedMetricLabels = [
  RELEASED_METRIC_LABELS.price,
  RELEASED_METRIC_LABELS.singleMarket,
  RELEASED_METRIC_LABELS.estimatedResale,
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
  const series = await getRankingSeries(tab);

  const sorted = series
    .filter((item) => (tab === "released"
      ? isReleasedRankingCandidate(item)
      : !item.is_released && item.variant_type !== "provisional" && (item.forecast_score ?? 0) > 0))
    .sort((a, b) => {
      const primaryA = tab === "released" ? releasedPriority(a) : upcomingPriority(a);
      const primaryB = tab === "released" ? releasedPriority(b) : upcomingPriority(b);
      if (primaryB !== primaryA) return primaryB - primaryA;
      return a.name.localeCompare(b.name, "ja");
    });

  const ranked = (tab === "upcoming" ? diversifyUpcomingPodium(sorted) : sorted)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  const podium = arrangePodium(ranked.slice(0, 3));
  const rest = ranked.slice(3);

  return (
    <main className="site-main">
      <div className="site-shell">
        <section className="page-hero">
          <p className="eyebrow">RANKING</p>
          <h1 className="page-title">いま熱いガチャ単品ランキング</h1>
          <p className="page-lead">
            発売中は価格の動き・売れ行き・在庫、発売予定は先行反応・話題化期待・入手難度で並べます。
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
        {ranked.length === 0 ? (
          <div className="card empty">
            {tab === "released"
              ? "価格や在庫の動きを確認できる単品がまだありません。観測データが入り次第更新します。"
              : "現在、発売予定として確認できる単品がありません。"}
          </div>
        ) : null}
      </div>
    </main>
  );
}

function RankingCard({ item, mode }) {
  return (
    <Link href={variantHref(item)} className={`card product-card rank-${item.rank}`}>
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
    <Link href={variantHref(item)} className="card rank-row">
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
  return metrics
    .filter((metric) => allowed.includes(metric.label))
    .filter((metric) => mode !== "released" || !["未取得", "データ不足"].includes(metric.value))
    .slice(0, 6);
}

function arrangePodium(items) {
  if (items.length < 3) return items;
  return [items[1], items[0], items[2]];
}

function diversifyUpcomingPodium(items) {
  const featured = [];
  const featuredIds = new Set();
  const seriesIds = new Set();

  for (const item of items) {
    if (featured.length >= 3) break;
    const seriesId = item.series_id || item.series_slug || item.series_name;
    if (seriesIds.has(seriesId)) continue;
    featured.push(item);
    featuredIds.add(item.variant_id);
    seriesIds.add(seriesId);
  }

  if (featured.length < 3) {
    for (const item of items) {
      if (featured.length >= 3) break;
      if (featuredIds.has(item.variant_id)) continue;
      featured.push(item);
      featuredIds.add(item.variant_id);
    }
  }

  return [...featured, ...items.filter((item) => !featuredIds.has(item.variant_id))];
}

function releasedPriority(item) {
  return releasedPriorityScore(item);
}

function isReleasedRankingCandidate(item) {
  if (!item?.is_released) return false;
  const market = item.market_summary ?? {};
  return isCirculatingItem(item) || [market.single, market.rare_single, market.secret_single].some(Number.isFinite);
}

function upcomingPriority(item) {
  return opportunityScore(item) * 12 + (item.forecast_score ?? 0) * 3;
}
