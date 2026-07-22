import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import PriceTrendChart from "@/components/PriceTrendChart";
import { getRankingSeries } from "@/lib/series";
import { variantHref } from "@/lib/variant-url";
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

export default async function Home() {
  const [releasedSeries, upcomingSeries] = await Promise.all([
    getRankingSeries("released"),
    getRankingSeries("upcoming"),
  ]);
  const hot = releasedSeries
    .filter(isCirculatingItem)
    .sort((a, b) => releasedPriorityScore(b) - releasedPriorityScore(a));
  const upcoming = upcomingSeries
    .filter((item) => !item.is_released && item.variant_type !== "provisional" && (item.forecast_score ?? 0) > 0)
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
  const movementItems = (stockMoves.length ? stockMoves : hot.slice(0, 5));

  return (
    <main className="site-main dashboard-main">
      <div className="site-shell">
        <h1 className="sr-only">いま注目のガチャがすぐ分かる Gacha Lens</h1>

        <div className="dashboard-layout">
          <div className="dashboard-primary">
            {spotlight ? <DashboardSpotlight item={spotlight} /> : null}

            <section className="dashboard-panel dashboard-ranking">
              <PanelHead title="注目ランキング" meta="価格・売れ行き・在庫を総合" href="/ranking" />
              <div className="dashboard-ranking__grid">
                {hot.slice(0, 5).map((item, index) => (
                  <RankingTile key={item.slug} item={item} rank={index + 1} />
                ))}
              </div>
            </section>

            <div className="dashboard-lower-grid">
              <section className="dashboard-panel">
                <PanelHead title="成約・参考価格 上位" meta="直近90日・成約3件以上" href="/series?filter=market&sort=market" />
                <div className="dashboard-mini-table" role="list">
                  {highPriceItems.map((item, index) => (
                    <CompactMarketRow key={item.slug} item={item} rank={index + 1} mode="price" />
                  ))}
                </div>
              </section>

              <section className="dashboard-panel">
                <PanelHead title={risingItems.length ? "価格上昇中" : "売れ行き・流通の動き"} meta="実観測データ" href="/ranking" />
                <div className="dashboard-mini-table" role="list">
                  {(risingItems.length ? risingItems : hot.slice(0, 5)).map((item, index) => (
                    <CompactMarketRow key={item.slug} item={item} rank={index + 1} mode={risingItems.length ? "rising" : "movement"} />
                  ))}
                </div>
              </section>
            </div>
          </div>

          <aside className="dashboard-rail">
            <section className="dashboard-panel">
              <PanelHead title="発売予定の注目作" meta="先行注目度順" href="/schedule" />
              <div className="dashboard-compact-list">
                {upcoming.slice(0, 6).map((item) => (
                  <UpcomingRow key={item.slug} item={item} />
                ))}
              </div>
            </section>

            <section className="dashboard-panel">
              <PanelHead title="在庫・流通の動き" meta="直近の観測" href="/series?filter=circulating&sort=watch" />
              <div className="dashboard-compact-list">
                {movementItems.map((item) => (
                  <AvailabilityRow key={item.slug} item={item} />
                ))}
              </div>
            </section>
          </aside>
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
  return (
    <section className="dashboard-panel dashboard-spotlight-panel">
      <PanelHead title="いま一番注目の商品" meta="価格・売れ行き・在庫を総合" href={variantHref(item)} />
      <Link href={variantHref(item)} className="dashboard-spotlight">
        <div className="dashboard-spotlight__image">
          <ProductImage src={item.image_url} alt={item.name} priority />
          <span>注目 1位</span>
        </div>
        <div className="dashboard-spotlight__copy">
          <p className="eyebrow">TODAY&apos;S PICK</p>
          <h2>{item.name}</h2>
          <p>{item.series_name} / {item.rarity}</p>
          <div className="dashboard-spotlight__metrics">
            <Metric label={item.market_evidence?.label || "データ不足"} value={formatMarketEvidenceValue(item.market_evidence)} accent />
            <Metric label="定価" value={formatYen(item.price)} />
            <Metric label="直近変動" value={formatChange(priceChangePercent(item))} accent />
            <Metric label="売れた数" value={`${(item.sold_count ?? item.market_summary?.sold_count ?? 0).toLocaleString("ja-JP")}件`} />
            <Metric label="出品数" value={`${(item.active_listing_count ?? item.market_summary?.active_listing_count ?? 0).toLocaleString("ja-JP")}件`} />
            <Metric label="発売" value={formatSchedule(item)} />
          </div>
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
  return (
    <Link href={variantHref(item)} className="dashboard-rank-tile">
      <span className={`dashboard-rank-tile__rank rank-${rank}`}>{rank}</span>
      <div className="dashboard-rank-tile__image"><ProductImage src={item.image_url} alt={item.name} priority={rank <= 3} /></div>
      <strong>{item.name}</strong>
      <span>{formatMarketEvidenceValue(item.market_evidence)}</span>
      <small>{Number.isFinite(change) ? formatChange(change) : sellThroughLabel(item.market_summary)} ・ 売れた数 {(item.sold_count ?? 0).toLocaleString("ja-JP")}件</small>
    </Link>
  );
}

function CompactMarketRow({ item, rank, mode }) {
  const active = item.active_listing_count ?? item.market_summary?.active_listing_count ?? 0;
  const sold = item.sold_count ?? item.market_summary?.sold_count ?? 0;
  return (
    <Link href={variantHref(item)} className="dashboard-mini-row" role="listitem">
      <span>{rank}</span>
      <div className="dashboard-table__image"><ProductImage src={item.image_url} alt={item.name} /></div>
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
    <Link href={variantHref(item)} className="dashboard-compact-row">
      <div className="dashboard-compact-row__image"><ProductImage src={item.image_url} alt={item.name} /></div>
      <div><strong>{item.name}</strong><span>{formatSchedule(item)} ・ {formatYen(item.price)}</span></div>
      <b>{formatScore(opportunityScore(item))}</b>
    </Link>
  );
}

function AvailabilityRow({ item }) {
  const summary = item.stock_summary ?? item.availability_summary ?? {};
  const status = summary.has_stock_signal || summary.has_restock_signal ? stockStatusLabel(summary) : "流通あり";
  return (
    <Link href={variantHref(item)} className="dashboard-compact-row dashboard-compact-row--stock">
      <div className="dashboard-compact-row__image"><ProductImage src={item.image_url} alt={item.name} /></div>
      <div><strong>{item.name}</strong><span>{sellThroughLabel(item.market_summary)}</span></div>
      <b>{status}</b>
    </Link>
  );
}

function hasAvailabilitySignal(item) {
  const summary = item.stock_summary ?? item.availability_summary ?? {};
  return Boolean(summary.has_stock_signal || summary.has_restock_signal || summary.latest_status);
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
