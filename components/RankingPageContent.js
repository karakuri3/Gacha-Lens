import DocumentLink from "@/components/DocumentLink";
import ProductImage from "@/components/ProductImage";
import { getRankingSeries } from "@/lib/series";
import { seriesHref, variantHref } from "@/lib/variant-url";
import { rankingPath } from "@/lib/domain/ranking-routes";
import { buildActiveListingWatch, formatAskingPrice } from "@/lib/domain/ranking-market-watch";
import {
  buildReleasedCustomerMetrics,
  buildUpcomingCustomerMetrics,
  customerTags,
  hasPriceRankingEvidence,
  opportunityScore,
  releasedPriorityScore,
} from "@/lib/domain/public-display-clean";

const tabs = [
  { value: "released", label: "成約価格", caption: "確認済み成約" },
  { value: "upcoming", label: "発売予定", caption: "先行注目" },
];

export default async function RankingPageContent({ tab = "released", scope = "variant" }) {
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
  const listingWatch = tab === "released" ? buildActiveListingWatch(series, { scope }).slice(0, 30) : [];
  const showPodium = ranked.length >= 3;
  const podium = showPodium ? arrangePodium(ranked.slice(0, 3)) : [];
  const rest = showPodium ? ranked.slice(3) : ranked;

  return (
    <main className="site-main">
      <div className="site-shell">
        <section className="page-hero">
          <p className="eyebrow">RANKING</p>
          <h1 className="page-title">{tab === "released" ? "成約価格ランキング" : "発売予定ランキング"}</h1>
          <p className="page-lead">{tab === "released"
            ? (scope === "variant"
              ? "確認できた成約価格が3件以上ある単品だけを比較します。出品中の価格は別のウォッチ欄に分けています。"
              : "確認できたコンプセットの成約価格が3件以上あるシリーズだけを比較します。単品価格は混ぜません。")
            : (scope === "variant" ? "発売前の単品を先行注目度で確認できます。" : "発売前のシリーズを先行注目度で確認できます。")}</p>
          <DocumentLink className="context-guide-link" href="/guides/forecast-ranking">ランキングの見方</DocumentLink>
        </section>

        <nav className="entity-scope-tabs" aria-label="ランキング単位">
          <DocumentLink href={rankingPath({ scope: "variant", tab })} className={scope === "variant" ? "is-active" : ""}>
            <strong>単品ランキング</strong><span>キャラクター・レア別</span>
          </DocumentLink>
          <DocumentLink href={rankingPath({ scope: "series", tab })} className={scope === "series" ? "is-active" : ""}>
            <strong>シリーズランキング</strong><span>ラインナップ・コンプ別</span>
          </DocumentLink>
        </nav>

        <div className="ranking-toolbar">
          <div className="tabs">
            {tabs.map((item) => (
              <DocumentLink
                key={item.value}
                href={rankingPath({ scope, tab: item.value })}
                className={`pill-link ${tab === item.value ? "is-active" : ""}`}
              >
                {item.label}
                <span style={{ marginLeft: 8, opacity: 0.72, fontSize: 12 }}>{item.caption}</span>
              </DocumentLink>
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
          <div className="card empty">
            {tab === "released"
              ? `現在、成約価格として確認できるデータが基準を満たしていません。成約3件以上を確認できる${scope === "variant" ? "単品" : "コンプセット"}がないため、順位は表示していません。`
              : `現在、発売予定として確認できる${scope === "variant" ? "単品" : "シリーズ"}がありません。`}
          </div>
        ) : null}

        {tab === "released" && ranked.length > 0 && ranked.length < 3 ? (
          <div className="card empty">
            成約基準を満たす比較対象が3件未満のため、表彰台表示はしていません。
          </div>
        ) : null}

        {listingWatch.length ? (
          <section aria-labelledby="listing-watch-title" style={{ marginTop: 28 }}>
            <div className="section-head">
              <div>
                <p className="eyebrow">ACTIVE ASKING PRICES</p>
                <h2 id="listing-watch-title" className="section-title">{scope === "series" ? "コンプセット出品価格ウォッチ" : "出品価格ウォッチ"}</h2>
                <p className="section-sub">直近30日以内に確認できた販売中の出品価格です。売れた価格・成約相場ではありません。</p>
              </div>
              <span>{listingWatch.length.toLocaleString("ja-JP")}件表示</span>
            </div>
            <div className="grid grid--3">
              {listingWatch.map((entry) => (
                <ListingWatchCard key={entry.item.slug || entry.item.id} entry={entry} scope={scope} />
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
    <DocumentLink href={scope === "series" ? seriesHref(item) : variantHref(item)} className={`card product-card rank-${item.rank}`}>
      <span className={`rank-medal rank-medal--${item.rank}`}>{item.rank}位</span>
      <div className="product-image">
        <ProductImage item={scope === "series" ? undefined : item} src={item.image_url} fallbackSrc={scope === "series" ? "" : item.series_image_url} imageScope={scope === "series" ? "series" : item.image_scope} alt={item.name} priority={item.rank <= 3} emptyLabel={scope === "series" ? "シリーズ画像なし" : "画像なし"} />
      </div>
      <div className="ranking-card__info">
        <ProductTitle item={item} scope={scope} />
        <PublicTags item={item} isReleased={mode === "released"} />
        <MetricGrid metrics={getMetrics(item, mode)} />
      </div>
    </DocumentLink>
  );
}

function RankingRow({ item, mode, scope }) {
  return (
    <DocumentLink href={scope === "series" ? seriesHref(item) : variantHref(item)} className="card rank-row">
      <div className="rank-number">#{item.rank}</div>
      <div className="product-image">
        <ProductImage item={scope === "series" ? undefined : item} src={item.image_url} fallbackSrc={scope === "series" ? "" : item.series_image_url} imageScope={scope === "series" ? "series" : item.image_scope} alt={item.name} emptyLabel={scope === "series" ? "シリーズ画像なし" : "画像なし"} />
      </div>
      <div>
        <ProductTitle item={item} scope={scope} />
        <PublicTags item={item} isReleased={mode === "released"} compact />
      </div>
      <MetricGrid metrics={getMetrics(item, mode)} />
    </DocumentLink>
  );
}

function ListingWatchCard({ entry, scope }) {
  const { item, listingCount, providerCount, observedAt } = entry;
  const metrics = [
    { label: "出品価格", value: formatAskingPrice(entry), meta: listingCount === 1 ? "1件の観測値" : `${listingCount}件の最小〜最大` },
    { label: "確認数", value: `${listingCount.toLocaleString("ja-JP")}件` },
    { label: "掲載元", value: providerCount ? `${providerCount.toLocaleString("ja-JP")}社` : "未取得" },
    { label: "最終確認", value: formatObservedAt(observedAt) },
  ];

  return (
    <DocumentLink href={scope === "series" ? seriesHref(item) : variantHref(item)} className="card product-card">
      <div className="product-image">
        <ProductImage item={scope === "series" ? undefined : item} src={item.image_url} fallbackSrc={scope === "series" ? "" : item.series_image_url} imageScope={scope === "series" ? "series" : item.image_scope} alt={item.name} emptyLabel={scope === "series" ? "シリーズ画像なし" : "画像なし"} />
      </div>
      <div className="ranking-card__info">
        <ProductTitle item={item} scope={scope} />
        <MetricGrid metrics={metrics} />
      </div>
    </DocumentLink>
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
  if (scope === "series") return item.market_summary?.type_stats?.complete_set?.eligible_for_price_ranking === true;
  return item.variant_type !== "provisional" && hasPriceRankingEvidence(item);
}

function formatObservedAt(value) {
  const time = new Date(value || "").getTime();
  if (!Number.isFinite(time)) return "日時未取得";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time));
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
