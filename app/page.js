import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import PriceTrendChart from "@/components/PriceTrendChart";
import { getRankingSeries } from "@/lib/series";
import { seriesHref, variantHref } from "@/lib/variant-url";
import { buildPageMetadata } from "@/lib/site-metadata";
import {
  customerTags,
  formatSchedule,
  formatScore,
  formatMarketEvidenceValue,
  formatYen,
  hasPriceRankingEvidence,
  isCirculatingItem,
  opportunityScore,
  releasedPriorityScore,
  sellThroughLabel,
  stockStatusLabel,
  watchScore,
} from "@/lib/domain/public-display-clean";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = buildPageMetadata({
  title: "Gacha Lens | ガチャの新作・価格・在庫情報",
  description: "発売中の価格動向、いま注目のガチャ、発売予定、在庫・再入荷情報をまとめて確認できます。",
  path: "/",
});

export default async function Home() {
  const [releasedVariants, upcomingSeries] = await Promise.all([
    getRankingSeries("released", "variant"),
    getRankingSeries("upcoming", "series"),
  ]);
  const hot = releasedVariants
    .filter(isCirculatingItem)
    .sort((a, b) => releasedPriorityScore(b) - releasedPriorityScore(a));
  const upcoming = upcomingSeries
    .filter((item) => !item.is_released && (item.forecast_score ?? 0) > 0)
    .sort((a, b) => upcomingPriority(b) - upcomingPriority(a));
  const spotlight = hot[0];
  const highPriceItems = [...hot]
    .filter(hasPriceRankingEvidence)
    .sort((a, b) => b.market_evidence.primaryPrice - a.market_evidence.primaryPrice)
    .slice(0, 5);
  const risingItems = hot
    .filter(hasPriceRankingEvidence)
    .map((item) => ({ item, change: priceChangePercent(item) }))
    .filter((entry) => Number.isFinite(entry.change) && entry.change > 0)
    .sort((a, b) => b.change - a.change)
    .slice(0, 5)
    .map((entry) => entry.item);
  const stockMoves = hot.filter(hasAvailabilitySignal).slice(0, 5);
  const movementItems = risingItems.length ? risingItems : hot.slice(0, 5);
  const hasRail = upcoming.length > 0 || stockMoves.length > 0;

  return (
    <main className="site-main dashboard-main">
      <div className="site-shell">
        <h1 className="sr-only">いま注目のガチャがすぐ分かる Gacha Lens</h1>

        <nav className="home-context-nav" aria-label="ガチャを探す">
          <Link href="/categories">カテゴリ</Link>
          <Link href="/series?release=upcoming">発売予定</Link>
          <Link href="/schedule">発売月</Link>
        </nav>

        <div className={`dashboard-layout ${hasRail ? "" : "dashboard-layout--single"}`.trim()}>
          <div className="dashboard-primary">
            {spotlight ? <DashboardSpotlight item={spotlight} /> : <MarketEmptyState />}

            {hot.length ? (
              <section className="dashboard-panel dashboard-ranking">
                <PanelHead title="注目ランキング" meta="価格・売れ行き・在庫を総合" href="/ranking" />
                <div className="dashboard-ranking__grid">
                  {hot.slice(0, 5).map((item, index) => (
                    <RankingTile key={item.slug} item={item} rank={index + 1} />
                  ))}
                </div>
              </section>
            ) : null}

            {movementItems.length ? (
              <div className={`dashboard-lower-grid ${highPriceItems.length ? "" : "dashboard-lower-grid--single"}`.trim()}>
                {highPriceItems.length ? (
                  <section className="dashboard-panel">
                    <PanelHead title="成約・参考価格 上位" meta="直近90日・成約3件以上" href="/series?scope=variant&filter=market&sort=market" />
                    <div className="dashboard-mini-table" role="list">
                      {highPriceItems.map((item, index) => (
                        <CompactMarketRow key={item.slug} item={item} rank={index + 1} mode="price" />
                      ))}
                    </div>
                  </section>
                ) : null}

                <section className="dashboard-panel">
                  <PanelHead title={risingItems.length ? "価格上昇中" : "売れ行き・流通の動き"} meta="実観測データ" href="/ranking" />
                  <div className="dashboard-mini-table" role="list">
                    {movementItems.map((item, index) => (
                      <CompactMarketRow key={item.slug} item={item} rank={index + 1} mode={risingItems.length ? "rising" : "movement"} />
                    ))}
                  </div>
                </section>
              </div>
            ) : null}
          </div>

          {hasRail ? (
            <aside className="dashboard-rail">
              {upcoming.length ? (
                <section className="dashboard-panel">
                  <PanelHead title="発売予定の注目作" meta="先行注目度順" href="/schedule" />
                  <div className="dashboard-compact-list">
                    {upcoming.slice(0, 6).map((item) => (
                      <UpcomingRow key={item.slug} item={item} />
                    ))}
                  </div>
                </section>
              ) : null}

              {stockMoves.length ? (
                <section className="dashboard-panel">
                  <PanelHead title="在庫・流通の動き" meta="直近の観測" href="/series?scope=variant&filter=circulating&sort=watch" />
                  <div className="dashboard-compact-list">
                    {stockMoves.map((item) => (
                      <AvailabilityRow key={item.slug} item={item} />
                    ))}
                  </div>
                </section>
              ) : null}
            </aside>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function PanelHead({ title, meta, href }) {
  return (
    <div className="dashboard-panel__head">
      <div><h2>{title}</h2><span>{meta}</span></div>
      <Link href={href} aria-label={`${title}をすべて見る`}>一覧 <span aria-hidden="true">→</span></Link>
    </div>
  );
}

function DashboardSpotlight({ item }) {
  const tags = customerTags(item, true);
  const metrics = spotlightMetrics(item);
  return (
    <section className="dashboard-panel dashboard-spotlight-panel">
      <PanelHead title="いま注目" meta="実データから見る注目商品" href={variantHref(item)} />
      <Link href={variantHref(item)} className="dashboard-spotlight">
        <div className="dashboard-spotlight__image">
          <ProductImage item={item} alt={item.name} priority />
          <span>1位</span>
        </div>
        <div className="dashboard-spotlight__copy">
          <h2>{item.name}</h2>
          <p>{item.series_name} / {item.rarity}</p>
          {metrics.length ? (
            <div className="dashboard-spotlight__metrics">
              {metrics.map((metric) => (
                <Metric key={metric.label} label={metric.label} value={metric.value} accent={metric.accent} />
              ))}
            </div>
          ) : null}
          {tags.length ? <div className="tag-row">{tags.slice(0, 3).map((tag) => <span key={tag} className="tag tag--signal">{tag}</span>)}</div> : null}
        </div>
        <div className="dashboard-spotlight__chart">
          <div className="dashboard-chart-title"><strong>価格の動き</strong><span>実データのみ</span></div>
          <PriceTrendChart item={item} compact />
        </div>
      </Link>
    </section>
  );
}

function Metric({ label, value, accent = false }) {
  return <div><span>{label}</span><strong className={accent ? "is-accent" : ""}>{value}</strong></div>;
}

function RankingTile({ item, rank }) {
  const change = priceChangePercent(item);
  const sold = item.sold_count ?? item.market_summary?.sold_count ?? 0;
  const hasMarketPrice = hasPriceRankingEvidence(item);
  const meta = Number.isFinite(change)
    ? `${formatChange(change)} ・ 売れた数 ${sold.toLocaleString("ja-JP")}件`
    : sold > 0
      ? `${sellThroughLabel(item.market_summary)} ・ 売れた数 ${sold.toLocaleString("ja-JP")}件`
      : item.series_name || formatSchedule(item);
  return (
    <Link href={variantHref(item)} className="dashboard-rank-tile">
      <span className={`dashboard-rank-tile__rank rank-${rank}`}>{rank}</span>
      <div className="dashboard-rank-tile__image"><ProductImage item={item} alt={item.name} priority={rank <= 3} /></div>
      <strong>{item.name}</strong>
      <span>{hasMarketPrice ? formatMarketEvidenceValue(item.market_evidence) : `定価 ${formatYen(item.price)}`}</span>
      <small>{meta}</small>
    </Link>
  );
}

function CompactMarketRow({ item, rank, mode }) {
  const active = item.active_listing_count ?? item.market_summary?.active_listing_count ?? 0;
  const sold = item.sold_count ?? item.market_summary?.sold_count ?? 0;
  return (
    <Link href={variantHref(item)} className="dashboard-mini-row" role="listitem">
      <span>{rank}</span>
      <div className="dashboard-table__image"><ProductImage item={item} alt={item.name} /></div>
      <div><strong>{item.name}</strong><small>{item.series_name}</small></div>
      <div className="dashboard-mini-row__value">
        <b>{mode === "price" ? formatMarketEvidenceValue(item.market_evidence) : mode === "rising" ? formatChange(priceChangePercent(item)) : formatScore(watchScore(item))}</b>
        <small>{mode === "price" ? item.market_evidence?.label : `出品 ${active} / 売れ ${sold}`}</small>
      </div>
    </Link>
  );
}

function UpcomingRow({ item }) {
  return (
    <Link href={seriesHref(item)} className="dashboard-compact-row">
      <div className="dashboard-compact-row__image"><ProductImage item={undefined} src={item.image_url || item.imageUrl} imageScope="series" alt={item.name} emptyLabel="画像なし" /></div>
      <div><strong>{item.name}</strong><span>{formatSchedule(item)} ・ {formatYen(item.price)}</span></div>
    </Link>
  );
}

function AvailabilityRow({ item }) {
  const summary = item.stock_summary ?? item.availability_summary ?? {};
  const status = stockStatusLabel(summary);
  return (
    <Link href={variantHref(item)} className="dashboard-compact-row dashboard-compact-row--stock">
      <div className="dashboard-compact-row__image"><ProductImage item={item} alt={item.name} /></div>
      <div><strong>{item.name}</strong><span>{sellThroughLabel(item.market_summary)}</span></div>
      <b>{status}</b>
    </Link>
  );
}

function MarketEmptyState() {
  return (
    <section className="market-empty-state" aria-labelledby="market-empty-title">
      <h2 id="market-empty-title">公開中の注目データを準備しています</h2>
      <p>商品データが揃い次第、ここに価格・発売・流通の情報を表示します。</p>
      <Link href="/series">ガチャ一覧を見る</Link>
    </section>
  );
}

function spotlightMetrics(item) {
  const metrics = [];
  if (hasPriceRankingEvidence(item)) {
    metrics.push({
      label: item.market_evidence?.label || "参考価格",
      value: formatMarketEvidenceValue(item.market_evidence),
      accent: true,
    });
  }

  const retailPrice = Number(item.price);
  if (Number.isFinite(retailPrice) && retailPrice > 0) {
    metrics.push({ label: "定価", value: formatYen(retailPrice), accent: false });
  }

  const change = priceChangePercent(item);
  if (Number.isFinite(change)) {
    metrics.push({ label: "直近変動", value: formatChange(change), accent: true });
  }

  const sold = item.sold_count ?? item.market_summary?.sold_count ?? 0;
  if (sold > 0) {
    metrics.push({ label: "売れた数", value: `${sold.toLocaleString("ja-JP")}件`, accent: false });
  }

  const active = item.active_listing_count ?? item.market_summary?.active_listing_count ?? 0;
  if (active > 0) {
    metrics.push({ label: "出品数", value: `${active.toLocaleString("ja-JP")}件`, accent: false });
  }

  const schedule = formatSchedule(item);
  if (schedule) {
    metrics.push({ label: "発売", value: schedule, accent: false });
  }
  return metrics;
}

function hasAvailabilitySignal(item) {
  const summary = item.stock_summary ?? item.availability_summary ?? {};
  return Boolean(summary.has_stock_signal || summary.has_restock_signal);
}

function upcomingPriority(item) {
  return opportunityScore(item) * 12 + (item.forecast_score ?? 0) * 3;
}

function priceChangePercent(item) {
  const groups = new Map();
  for (const observation of item.market_evidence?.completedEvidence ?? []) {
    const price = Number(observation.price);
    const time = new Date(observation.observedAt).getTime();
    if (!Number.isFinite(price) || !Number.isFinite(time)) continue;
    const date = new Date(time).toISOString().slice(0, 10);
    const values = groups.get(date) ?? [];
    values.push(price);
    groups.set(date, values);
  }
  const daily = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, values]) => median(values));
  if (daily.length < 2 || !daily.at(-2)) return null;
  return ((daily.at(-1) - daily.at(-2)) / daily.at(-2)) * 100;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function formatChange(value) {
  if (!Number.isFinite(value)) return "データ不足";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}
