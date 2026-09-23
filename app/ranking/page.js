import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import { getRankingSeries } from "@/lib/series";
import { seriesHref, variantHref } from "@/lib/variant-url";
import { buildPageMetadata } from "@/lib/site-metadata";
import {
  buildReleasedCustomerMetrics,
  buildUpcomingCustomerMetrics,
  customerTags,
  formatYen,
  hasPriceRankingEvidence,
  opportunityScore,
  releasedPriorityScore,
} from "@/lib/domain/public-display-clean";

export async function generateMetadata({ searchParams }) {
  const params = await searchParams;
  const tab = params?.tab === "upcoming" ? "upcoming" : "released";
  const scope = params?.scope === "series" ? "series" : "variant";
  const title = `${tab === "upcoming" ? "発売予定" : "発売中"}の${scope === "series" ? "シリーズ" : "単品"}ランキング | Gacha Lens`;
  const query = new URLSearchParams();
  if (scope !== "variant") query.set("scope", scope);
  if (tab !== "released") query.set("tab", tab);
  const path = query.size ? `/ranking?${query.toString()}` : "/ranking";
  return buildPageMetadata({
    title,
    description: tab === "released"
      ? "発売中のガチャを、確認できた価格・流通・在庫の動きからランキングします。"
      : "発売予定のガチャを、注目度・入手難度・ラインナップの期待からランキングします。",
    path,
  });
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

const tabs = [
  { value: "released", label: "発売中", caption: "成約データ" },
  { value: "upcoming", label: "発売予定", caption: "先行注目" },
];

export default async function RankingPage({ searchParams }) {
  const params = await searchParams;
  const tab = params?.tab === "upcoming" ? "upcoming" : "released";
  const scope = params?.scope === "series" ? "series" : "variant";
  const series = await getRankingSeries(tab, scope);

  const sorted = series
    .filter((item) => (tab === "released"
      ? isReleasedRankingCandidate(item, scope)
      : !item.is_released && (scope === "series" || item.variant_type !== "provisional") && (item.forecast_score ?? 0) > 0))
    .sort((a, b) => {
      const primaryA = tab === "released" ? (scope === "series" ? releasedSeriesPriority(a) : releasedPriority(a)) : upcomingPriority(a);
      const primaryB = tab === "released" ? (scope === "series" ? releasedSeriesPriority(b) : releasedPriority(b)) : upcomingPriority(b);
      if (primaryB !== primaryA) return primaryB - primaryA;
      return a.name.localeCompare(b.name, "ja");
    });

  const ranked = (tab === "upcoming" && scope === "variant" ? diversifyUpcomingPodium(sorted) : sorted)
    .map((item, index) => ({ ...item, rank: index + 1 }));
  const summary = buildRankingSummary(ranked, tab);

  const podium = arrangePodium(ranked.slice(0, 3));
  const rest = ranked.slice(3);
  const listingWatch = tab === "released" && ranked.length === 0
    ? buildListingWatch(series, scope).slice(0, 30)
    : [];

  return (
    <main className="site-main">
      <div className="site-shell">
        <section className="page-hero">
          <p className="eyebrow">RANKING</p>
          <h1 className="page-title">相場ランキング</h1>
          <p className="page-lead">{scope === "variant" ? "キャラクターやレア種ごとの動きを順位で確認できます。" : "親シリーズ全体の流通、コンプ需要、発売前の注目度を順位で確認できます。"}</p>
          <Link className="context-guide-link" href="/guides/forecast-ranking">ランキングの見方</Link>
        </section>

        <nav className="entity-scope-tabs" aria-label="ランキング単位">
          <Link href={{ pathname: "/ranking", query: { scope: "variant", tab } }} className={scope === "variant" ? "is-active" : ""}>
            <strong>単品ランキング</strong><span>キャラクター・レア別</span>
          </Link>
          <Link href={{ pathname: "/ranking", query: { scope: "series", tab } }} className={scope === "series" ? "is-active" : ""}>
            <strong>シリーズランキング</strong><span>ラインナップ・コンプ別</span>
          </Link>
        </nav>

        <div className="ranking-toolbar">
          <div className="tabs">
            {tabs.map((item) => (
              <Link
                key={item.value}
                href={{ pathname: "/ranking", query: { scope, tab: item.value } }}
                className={`pill-link ${tab === item.value ? "is-active" : ""}`}
              >
                {item.label}
                <span style={{ marginLeft: 8, opacity: 0.72, fontSize: 12 }}>{item.caption}</span>
              </Link>
            ))}
          </div>
          <div className="ranking-summary" aria-label="ランキング概要">
            {summary.map((entry) => (
              <div key={entry.label}><span>{entry.label}</span><strong>{entry.value}</strong></div>
            ))}
          </div>
        </div>

        <section className="grid grid--3 podium">
          {podium.map((item) => (
            <RankingCard key={item.slug} item={item} mode={tab} scope={scope} />
          ))}
        </section>

        <section className="grid">
          {rest.map((item) => (
            <RankingRow key={item.slug} item={item} mode={tab} scope={scope} />
          ))}
        </section>
        {ranked.length === 0 ? (
          <div className="card empty ranking-empty-state">
            {tab === "released"
              ? "成約価格が3件以上確認できた商品だけを相場ランキングに掲載します。現在は条件を満たす商品がないため、順位は表示していません。"
              : `現在、発売予定として確認できる${scope === "variant" ? "単品" : "シリーズ"}がありません。`}
          </div>
        ) : null}

        {listingWatch.length ? (
          <section className="listing-watch" aria-labelledby="listing-watch-title">
            <div className="section-head">
              <div>
                <p className="eyebrow">CURRENT LISTINGS</p>
                <h2 id="listing-watch-title" className="section-title">出品価格ウォッチ</h2>
                <p className="section-sub">現在確認できる出品価格です。売れた価格ではないため、相場ランキングとは分けて表示しています。</p>
              </div>
              <span className="listing-watch__count">{listingWatch.length.toLocaleString("ja-JP")}件表示</span>
            </div>
            <div className="listing-watch__list">
              {listingWatch.map((entry) => (
                <ListingWatchRow key={entry.item.slug || entry.item.id} entry={entry} scope={scope} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function RankingCard({ item, mode, scope }) {
  return (
    <Link href={scope === "series" ? seriesHref(item) : variantHref(item)} className={`card product-card rank-${item.rank}`}>
      <span className={`rank-medal rank-medal--${item.rank}`}>{item.rank}位</span>
      <div className="product-image">
        <ProductImage item={scope === "series" ? undefined : item} src={item.image_url} fallbackSrc={scope === "series" ? "" : item.series_image_url} imageScope={scope === "series" ? "series" : item.image_scope} alt={item.name} priority={item.rank <= 3} emptyLabel={scope === "series" ? "シリーズ画像なし" : "画像なし"} />
      </div>
      <div className="ranking-card__info">
        <ProductTitle item={item} scope={scope} />
        <PublicTags item={item} isReleased={mode === "released"} />
        <MetricGrid metrics={getMetrics(item, mode)} />
      </div>
    </Link>
  );
}

function RankingRow({ item, mode, scope }) {
  return (
    <Link href={scope === "series" ? seriesHref(item) : variantHref(item)} className="card rank-row">
      <div className="rank-number">#{item.rank}</div>
      <div className="product-image">
        <ProductImage item={scope === "series" ? undefined : item} src={item.image_url} fallbackSrc={scope === "series" ? "" : item.series_image_url} imageScope={scope === "series" ? "series" : item.image_scope} alt={item.name} emptyLabel={scope === "series" ? "シリーズ画像なし" : "画像なし"} />
      </div>
      <div>
        <ProductTitle item={item} scope={scope} />
        <PublicTags item={item} isReleased={mode === "released"} compact />
      </div>
      <MetricGrid metrics={getMetrics(item, mode)} />
    </Link>
  );
}

function ListingWatchRow({ entry, scope }) {
  const { item, prices, listingCount, observedAt } = entry;
  const priceText = prices.length > 1 && prices[0] !== prices[prices.length - 1]
    ? `${formatYen(prices[0])}〜${formatYen(prices[prices.length - 1])}`
    : formatYen(prices[0]);

  return (
    <Link href={scope === "series" ? seriesHref(item) : variantHref(item)} className="card listing-watch-row">
      <div className="product-image">
        <ProductImage
          item={scope === "series" ? undefined : item}
          src={item.image_url}
          fallbackSrc={scope === "series" ? "" : item.series_image_url}
          imageScope={scope === "series" ? "series" : item.image_scope}
          alt={item.name}
          emptyLabel={scope === "series" ? "シリーズ画像なし" : "画像なし"}
        />
      </div>
      <ProductTitle item={item} scope={scope} />
      <dl className="listing-watch-row__facts">
        <div><dt>出品価格</dt><dd>{priceText}</dd></div>
        <div><dt>確認数</dt><dd>{listingCount}件</dd></div>
        <div><dt>最終確認</dt><dd>{formatObservedDate(observedAt)}</dd></div>
      </dl>
    </Link>
  );
}

function ProductTitle({ item, scope }) {
  return (
    <div>
      <h2 className="product-name">{item.name}</h2>
      <div className="product-meta">
        {scope === "series" ? `${item.brand || item.character || "公式商品"} / ${item.variant_count ? `${item.variant_count}種` : "ラインナップ確認中"}` : `${item.series_name} / ${item.rarity || "通常"}`}
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
          {metric.meta ? <small>{metric.meta}</small> : null}
        </div>
      ))}
    </div>
  );
}

function getMetrics(item, mode) {
  const metrics = mode === "released" ? buildReleasedCustomerMetrics(item) : buildUpcomingCustomerMetrics(item);
  return metrics
    .filter((metric) => mode !== "released" || !["未取得", "データ不足"].includes(metric.value))
    .slice(0, 6);
}

function buildListingWatch(items = [], scope = "variant") {
  return items
    .map((item) => {
      const active = (item.market_listings ?? [])
        .filter((listing) => listing?.status === "active" && Number.isFinite(Number(listing?.price)) && Number(listing.price) > 0);
      if (!active.length) return null;
      const prices = [...new Set(active.map((listing) => Number(listing.price)))].sort((a, b) => a - b);
      const observedAt = active
        .map((listing) => listing.last_observed_at || listing.listed_at || listing.updated_at || listing.created_at || "")
        .filter(Boolean)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || "";
      return { item, prices, listingCount: active.length, observedAt, scope };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const recency = new Date(b.observedAt || 0).getTime() - new Date(a.observedAt || 0).getTime();
      if (recency !== 0) return recency;
      if (b.listingCount !== a.listingCount) return b.listingCount - a.listingCount;
      return a.item.name.localeCompare(b.item.name, "ja");
    });
}

function formatObservedDate(value) {
  const time = new Date(value || "").getTime();
  if (!Number.isFinite(time)) return "日時未取得";
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "numeric", day: "numeric" }).format(new Date(time));
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

function releasedSeriesPriority(item) {
  const market = item.market_summary ?? {};
  const complete = market.type_stats?.complete_set ?? {};
  const partial = market.type_stats?.partial_set ?? {};
  const stock = item.stock_summary ?? item.availability_summary ?? {};
  const stockMoves = (stock.restock_event_count ?? 0) + (stock.stock_report_count ?? 0);
  return (
    (complete.sold_count ?? 0) * 90 +
    (complete.active_listing_count ?? 0) * 28 +
    (partial.sold_count ?? 0) * 32 +
    (market.listing_count ?? 0) * 8 +
    stockMoves * 24 +
    (item.trend_score ?? 0) * 6
  );
}

function isReleasedRankingCandidate(item, scope = "variant") {
  if (!item?.is_released) return false;
  if (scope === "series") return hasPriceRankingEvidence(item);
  return item.variant_type !== "provisional" && hasPriceRankingEvidence(item);
}

function upcomingPriority(item) {
  return opportunityScore(item) * 12 + (item.forecast_score ?? 0) * 3;
}

function buildRankingSummary(items, mode) {
  if (mode === "upcoming") {
    return [
      { label: "掲載", value: `${items.length.toLocaleString("ja-JP")}件` },
      { label: "注目度70以上", value: `${items.filter((item) => opportunityScore(item) >= 70).length.toLocaleString("ja-JP")}件` },
      { label: "発売月", value: `${new Set(items.map((item) => item.schedule_month).filter(Boolean)).size}か月` },
    ];
  }
  return [
    { label: "掲載", value: `${items.length.toLocaleString("ja-JP")}件` },
    { label: "売れ行きあり", value: `${items.filter((item) => (item.sold_count ?? item.market_summary?.sold_count ?? 0) > 0).length.toLocaleString("ja-JP")}件` },
    { label: "在庫情報あり", value: `${items.filter((item) => Boolean((item.stock_summary ?? item.availability_summary)?.has_stock_signal)).length.toLocaleString("ja-JP")}件` },
  ];
}
