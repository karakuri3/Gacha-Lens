import DocumentLink from "@/components/DocumentLink";
import ProductImage from "@/components/ProductImage";
import { getRankingSeries, getReleasedVariantRankingSeries } from "@/lib/series";
import { seriesHref, variantHref } from "@/lib/variant-url";
import { buildActiveListingWatchEvidence } from "@/lib/domain/market-evidence";
import { rankingPath } from "@/lib/domain/ranking-routes";
import {
  buildUpcomingCustomerMetrics,
  customerTags,
  formatYen,
  hasPriceRankingEvidence,
  opportunityScore,
} from "@/lib/domain/public-display-clean";

const tabs = [
  { value: "released", label: "発売中", caption: "成約価格" },
  { value: "upcoming", label: "発売予定", caption: "先行注目" },
];

export default async function RankingPageContent({ tab = "released", scope = "variant" }) {
  const series = tab === "released" && scope === "variant"
    ? await getReleasedVariantRankingSeries()
    : await getRankingSeries(tab, scope);
  const now = new Date();

  const sorted = series
    .filter((item) => (tab === "released"
      ? isReleasedRankingCandidate(item, scope)
      : !item.is_released && (scope === "series" || item.variant_type !== "provisional") && (item.forecast_score ?? 0) > 0))
    .sort((a, b) => {
      if (tab === "released") return compareCompletedSaleEvidence(a, b, scope);
      const primaryA = upcomingPriority(a);
      const primaryB = upcomingPriority(b);
      if (primaryB !== primaryA) return primaryB - primaryA;
      return a.name.localeCompare(b.name, "ja");
    });

  const ranked = (tab === "upcoming" && scope === "variant" ? diversifyUpcomingPodium(sorted) : sorted)
    .map((item, index) => ({ ...item, rank: index + 1 }));
  const summary = buildRankingSummary(ranked, tab, scope);
  const completedEvidenceCount = tab === "released"
    ? series.reduce((sum, item) => sum + Number(completedEvidenceForItem(item, scope).completedCount || 0), 0)
    : 0;
  const listingWatchAll = tab === "released"
    ? buildListingWatch(series, scope, now)
    : [];
  const listingWatch = listingWatchAll.slice(0, 30);

  const showReleasedPodium = tab === "released" && ranked.length >= 3;
  const podium = tab === "upcoming"
    ? arrangePodium(ranked.slice(0, 3))
    : showReleasedPodium
      ? arrangePodium(ranked.slice(0, 3))
      : [];
  const rest = tab === "released" && !showReleasedPodium ? ranked : ranked.slice(3);

  return (
    <main className="site-main">
      <div className="site-shell">
        <section className="page-hero">
          <p className="eyebrow">RANKING</p>
          <h1 className="page-title">{tab === "released" ? "成約価格ランキング" : "発売前注目ランキング"}</h1>
          <p className="page-lead">
            {tab === "released"
              ? scope === "variant"
                ? "直近90日で確認できた単品の成約価格が3件以上ある場合だけ、中央値の高い順に掲載します。出品中の価格は順位に使いません。"
                : "直近90日で確認できたセットの成約価格が3件以上あるシリーズだけ、中央値の高い順に掲載します。単品価格や出品中の価格は順位に使いません。"
              : scope === "variant"
                ? "発売前の単品を、確認できる先行シグナルから注目度順に表示します。成約価格ランキングとは別の指標です。"
                : "発売前のシリーズを、確認できる先行シグナルから注目度順に表示します。成約価格ランキングとは別の指標です。"}
          </p>
          <DocumentLink className="context-guide-link" href="/guides/forecast-ranking">ランキングの見方</DocumentLink>
        </section>

        <nav className="entity-scope-tabs" aria-label="ランキング単位">
          <DocumentLink href={rankingPath({ scope: "variant", tab })} className={scope === "variant" ? "is-active" : ""}>
            <strong>単品ランキング</strong><span>キャラクター・レア別</span>
          </DocumentLink>
          <DocumentLink href={rankingPath({ scope: "series", tab })} className={scope === "series" ? "is-active" : ""}>
            <strong>シリーズランキング</strong><span>ラインナップ・セット別</span>
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
              ? completedEvidenceCount === 0
                ? "現在、成約価格として確認できるデータがありません。出品中の価格だけでは成約価格ランキングを作らないため、順位は表示していません。"
                : `成約価格の確認は${completedEvidenceCount.toLocaleString("ja-JP")}件ありますが、同じ対象で直近90日・3件以上という掲載条件を満たしていません。データ不足のため順位は表示していません。`
              : `現在、発売予定として確認できる${scope === "variant" ? "単品" : "シリーズ"}がありません。`}
          </div>
        ) : null}

        {listingWatch.length ? (
          <section aria-labelledby="listing-watch-title" style={{ marginTop: 28 }}>
            <div className="section-head">
              <div>
                <p className="eyebrow">CURRENT ASKING PRICES</p>
                <h2 id="listing-watch-title" className="section-title">出品価格ウォッチ</h2>
                <p className="section-sub">
                  直近30日以内に販売中として確認できた出品価格です。売れた価格・成約価格ではなく、成約価格ランキングの順位にも使いません。
                </p>
              </div>
              <span className="section-sub">
                {listingWatchAll.length > listingWatch.length
                  ? `${listingWatchAll.length.toLocaleString("ja-JP")}対象のうち最新${listingWatch.length}件`
                  : `${listingWatchAll.length.toLocaleString("ja-JP")}対象`}
              </span>
            </div>
            <div className="grid grid--3">
              {listingWatch.map((entry) => (
                <ListingWatchCard key={entry.item.slug || entry.item.id} entry={entry} scope={scope} now={now} />
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
        {mode === "upcoming" ? <PublicTags item={item} compact={false} /> : null}
        <MetricGrid metrics={getMetrics(item, mode, scope)} />
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
        {mode === "upcoming" ? <PublicTags item={item} compact /> : null}
      </div>
      <MetricGrid metrics={getMetrics(item, mode, scope)} />
    </DocumentLink>
  );
}

function ListingWatchCard({ entry, scope, now }) {
  const { item, listingCount, providerCount, minimumPrice, maximumPrice, lastObservedAt } = entry;
  return (
    <DocumentLink href={scope === "series" ? seriesHref(item) : variantHref(item)} className="card product-card">
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
      <div className="ranking-card__info">
        <ProductTitle item={item} scope={scope} />
        <div className="tag-row"><span className="tag tag--signal">出品中</span></div>
        <MetricGrid metrics={[
          { label: "出品価格", value: formatAskingPrice({ listingCount, minimumPrice, maximumPrice }) },
          { label: "出品確認", value: `${listingCount.toLocaleString("ja-JP")}件` },
          { label: "確認元", value: providerCount > 0 ? `${providerCount.toLocaleString("ja-JP")}サービス` : "未取得" },
          { label: "最終確認", value: formatObservedFreshness(lastObservedAt, now) },
        ]} />
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

function PublicTags({ item, compact = false }) {
  const tags = customerTags(item, false);
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

function getMetrics(item, mode, scope = "variant") {
  if (mode !== "released") return buildUpcomingCustomerMetrics(item).slice(0, 6);
  const evidence = completedEvidenceForItem(item, scope);
  const range = Number.isFinite(evidence.minimumPrice) && Number.isFinite(evidence.maximumPrice) && evidence.minimumPrice !== evidence.maximumPrice
    ? `${formatYen(evidence.minimumPrice)}〜${formatYen(evidence.maximumPrice)}`
    : null;
  return [
    { label: "成約価格中央値", value: formatYen(evidence.primaryPrice), meta: `直近90日・成約${Number(evidence.completedCount || 0)}件`, tone: "highlight" },
    ...(range ? [{ label: "確認範囲", value: range }] : []),
    { label: "成約確認", value: `${Number(evidence.completedCount || 0).toLocaleString("ja-JP")}件` },
    { label: "最終成約確認", value: formatObservedDate(evidence.lastCompletedObservedAt) },
  ];
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

function completedEvidenceForItem(item, scope = "variant") {
  if (scope === "series") {
    const stats = item.market_summary?.type_stats?.complete_set ?? {};
    return {
      primaryPrice: stats.primary_price ?? stats.median_sold ?? null,
      minimumPrice: stats.minimum_sold ?? null,
      maximumPrice: stats.maximum_sold ?? null,
      completedCount: Number(stats.sold_count || 0),
      lastCompletedObservedAt: stats.last_completed_observed_at ?? null,
    };
  }
  return item.market_evidence ?? item.market_summary?.evidence ?? {};
}

function compareCompletedSaleEvidence(a, b, scope = "variant") {
  const evidenceA = completedEvidenceForItem(a, scope);
  const evidenceB = completedEvidenceForItem(b, scope);
  const priceA = Number(evidenceA.primaryPrice || 0);
  const priceB = Number(evidenceB.primaryPrice || 0);
  if (priceB !== priceA) return priceB - priceA;
  const countA = Number(evidenceA.completedCount || 0);
  const countB = Number(evidenceB.completedCount || 0);
  if (countB !== countA) return countB - countA;
  const timeA = new Date(evidenceA.lastCompletedObservedAt || 0).getTime() || 0;
  const timeB = new Date(evidenceB.lastCompletedObservedAt || 0).getTime() || 0;
  if (timeB !== timeA) return timeB - timeA;
  return a.name.localeCompare(b.name, "ja");
}

function isReleasedRankingCandidate(item, scope = "variant") {
  if (!item?.is_released) return false;
  if (scope === "series") return item.market_summary?.type_stats?.complete_set?.eligible_for_price_ranking === true;
  return item.variant_type !== "provisional" && hasPriceRankingEvidence(item);
}

function upcomingPriority(item) {
  return opportunityScore(item) * 12 + (item.forecast_score ?? 0) * 3;
}

function buildListingWatch(items = [], scope = "variant", now = new Date()) {
  return items
    .map((item) => {
      const evidence = buildActiveListingWatchEvidence({
        subject: item,
        listings: item.market_listings ?? [],
        scope,
        now,
      });
      return evidence.listingCount > 0 ? { item, ...evidence } : null;
    })
    .filter(Boolean)
    .sort((a, b) => {
      const recency = new Date(b.lastObservedAt || 0).getTime() - new Date(a.lastObservedAt || 0).getTime();
      if (recency !== 0) return recency;
      if (b.listingCount !== a.listingCount) return b.listingCount - a.listingCount;
      return a.item.name.localeCompare(b.item.name, "ja");
    });
}

function formatAskingPrice({ listingCount, minimumPrice, maximumPrice }) {
  if (!Number.isFinite(minimumPrice)) return "未取得";
  if (listingCount > 1 && Number.isFinite(maximumPrice) && maximumPrice !== minimumPrice) {
    return `${formatYen(minimumPrice)}〜${formatYen(maximumPrice)}`;
  }
  return formatYen(minimumPrice);
}

function formatObservedDate(value) {
  const time = new Date(value || "").getTime();
  if (!Number.isFinite(time)) return "日時未取得";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(new Date(time));
}

function formatObservedFreshness(value, now = new Date()) {
  const time = new Date(value || "").getTime();
  const nowTime = new Date(now).getTime();
  if (!Number.isFinite(time) || !Number.isFinite(nowTime)) return "日時未取得";
  const days = Math.max(0, Math.floor((nowTime - time) / 86400000));
  const freshness = days === 0 ? "24時間以内" : `${days}日前`;
  return `${formatObservedDate(value)}（${freshness}）`;
}

function buildRankingSummary(items, mode, scope = "variant") {
  if (mode === "upcoming") {
    return [
      { label: "掲載", value: `${items.length.toLocaleString("ja-JP")}件` },
      { label: "注目度70以上", value: `${items.filter((item) => opportunityScore(item) >= 70).length.toLocaleString("ja-JP")}件` },
      { label: "発売月", value: `${new Set(items.map((item) => item.schedule_month).filter(Boolean)).size}か月` },
    ];
  }
  return [
    { label: "掲載", value: `${items.length.toLocaleString("ja-JP")}件` },
    { label: "成約確認", value: `${items.reduce((sum, item) => sum + Number(completedEvidenceForItem(item, scope).completedCount || 0), 0).toLocaleString("ja-JP")}件` },
    { label: "掲載条件", value: "3件以上" },
  ];
}
