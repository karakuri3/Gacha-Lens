import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import PriceTrendChart from "@/components/PriceTrendChart";
import { getRankingSeries, getSeriesCatalogCounts } from "@/lib/series";
import { variantHref } from "@/lib/variant-url";
import {
  customerTags,
  formatSchedule,
  formatScore,
  formatYen,
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
  const [releasedSeries, upcomingSeries, catalogCounts] = await Promise.all([
    getRankingSeries("released"),
    getRankingSeries("upcoming"),
    getSeriesCatalogCounts(),
  ]);
  const hot = releasedSeries
    .filter(isCirculatingItem)
    .sort((a, b) => releasedPriorityScore(b) - releasedPriorityScore(a));
  const upcoming = upcomingSeries
    .filter((item) => !item.is_released && item.variant_type !== "provisional" && (item.forecast_score ?? 0) > 0)
    .sort((a, b) => upcomingPriority(b) - upcomingPriority(a));
  const spotlight = hot[0];
  const stockMoves = hot.filter(hasAvailabilitySignal).slice(0, 5);
  const movementItems = (stockMoves.length ? stockMoves : hot.slice(0, 5));

  return (
    <main className="site-main dashboard-main">
      <div className="site-shell">
        <section className="dashboard-titlebar">
          <div>
            <p className="eyebrow">GACHA PULSE</p>
            <h1>いま注目のガチャが、すぐ分かる。</h1>
          </div>
          <div className="dashboard-counts" aria-label="掲載状況">
            <Count label="収録単品" value={catalogCounts?.all ?? 0} />
            <Count label="動きあり" value={hot.length} />
            <Count label="発売予定" value={catalogCounts?.upcoming ?? upcoming.length} />
          </div>
        </section>

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

            <section className="dashboard-panel">
              <PanelHead title="いま動きがある単品" meta="出品・売れ行きの観測順" href="/ranking" />
              <div className="dashboard-table" role="list">
                {hot.slice(0, 7).map((item, index) => (
                  <MovementRow key={item.slug} item={item} rank={index + 1} />
                ))}
              </div>
            </section>
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

function Count({ label, value }) {
  return <div><span>{label}</span><strong>{Number(value).toLocaleString("ja-JP")}</strong></div>;
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
    <Link href={variantHref(item)} className="dashboard-panel dashboard-spotlight">
      <div className="dashboard-spotlight__image">
        <ProductImage src={item.image_url} alt={item.name} priority />
        <span>注目 1位</span>
      </div>
      <div className="dashboard-spotlight__copy">
        <p className="eyebrow">TODAY&apos;S PICK</p>
        <h2>{item.name}</h2>
        <p>{item.series_name} / {item.rarity}</p>
        <div className="dashboard-spotlight__metrics">
          <Metric label="価格" value={formatYen(item.price)} />
          <Metric label="単品相場" value={formatYen(item.market_summary?.single)} accent />
          <Metric label="売れ行き" value={sellThroughLabel(item.market_summary)} />
          <Metric label="注目度" value={formatScore(watchScore(item))} accent />
        </div>
        {tags.length ? <div className="tag-row">{tags.slice(0, 3).map((tag) => <span key={tag} className="tag tag--signal">{tag}</span>)}</div> : null}
      </div>
      <div className="dashboard-spotlight__chart">
        <div className="dashboard-chart-title"><strong>価格の動き</strong><span>実データのみ</span></div>
        <PriceTrendChart item={item} />
      </div>
    </Link>
  );
}

function Metric({ label, value, accent = false }) {
  return <div><span>{label}</span><strong className={accent ? "is-accent" : ""}>{value}</strong></div>;
}

function RankingTile({ item, rank }) {
  return (
    <Link href={variantHref(item)} className="dashboard-rank-tile">
      <span className={`dashboard-rank-tile__rank rank-${rank}`}>{rank}</span>
      <div className="dashboard-rank-tile__image"><ProductImage src={item.image_url} alt={item.name} priority={rank <= 3} /></div>
      <strong>{item.name}</strong>
      <span>{formatYen(item.market_summary?.single)}</span>
      <small>{sellThroughLabel(item.market_summary)} ・ 注目 {formatScore(watchScore(item))}</small>
    </Link>
  );
}

function MovementRow({ item, rank }) {
  const active = item.active_listing_count ?? item.market_summary?.active_listing_count ?? 0;
  const sold = item.sold_count ?? item.market_summary?.sold_count ?? 0;
  return (
    <Link href={variantHref(item)} className="dashboard-table__row" role="listitem">
      <span>{rank}</span>
      <div className="dashboard-table__image"><ProductImage src={item.image_url} alt={item.name} /></div>
      <div><strong>{item.name}</strong><small>{item.series_name}</small></div>
      <b>{formatYen(item.market_summary?.single)}</b>
      <small>出品 {active} / 売れ {sold}</small>
      <em>{formatScore(watchScore(item))}</em>
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
  return (
    <Link href={variantHref(item)} className="dashboard-compact-row dashboard-compact-row--stock">
      <div className="dashboard-compact-row__image"><ProductImage src={item.image_url} alt={item.name} /></div>
      <div><strong>{item.name}</strong><span>{sellThroughLabel(item.market_summary)}</span></div>
      <b>{stockStatusLabel(summary)}</b>
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
