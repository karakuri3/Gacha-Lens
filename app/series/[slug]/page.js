import Link from "next/link";
import { notFound } from "next/navigation";
import ProductImage from "@/components/ProductImage";
import { getRelatedSeries, getSeriesBySlug } from "@/lib/series";
import SeriesCard from "@/components/SeriesCard";
import {
  buildReleasedCustomerMetrics,
  buildUpcomingCustomerMetrics,
  customerTags,
  formatDiff,
  formatSchedule,
  formatScore,
  formatYen,
  getDiffTone,
  opportunityScore,
  priceUpsideScore,
  scarcityScore,
  stockStatusLabel,
  watchScore,
} from "@/lib/domain/public-display-clean";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }) {
  const resolvedParams = await params;
  const item = await getSeriesBySlug(resolvedParams.slug);
  return {
    title: item ? `${item.name} | Gacha Lens` : "単品詳細 | Gacha Lens",
    description: item?.summary ?? "ガチャ単品の価格、相場、利益、在庫、期待値を確認できます。",
  };
}

export default async function VariantDetailPage({ params }) {
  const resolvedParams = await params;
  const item = await getSeriesBySlug(resolvedParams.slug);
  if (!item) notFound();

  const isReleased = Boolean(item.is_released);
  const related = (await getRelatedSeries(item.slug, 8))
    .filter((entry) => Boolean(entry.is_released) === isReleased)
    .slice(0, 3);
  const tags = customerTags(item, isReleased);

  return (
    <main className="site-main">
      <div className="site-shell">
        <div className="tag-row" style={{ marginBottom: 18 }}>
          <Link href="/series" className="pill-link">単品一覧</Link>
          <Link href={isReleased ? "/ranking?tab=released" : "/ranking?tab=upcoming"} className="pill-link">
            {isReleased ? "発売中ランキング" : "発売予定ランキング"}
          </Link>
        </div>

        <section className="detail-hero">
          <div className="detail-image">
            <ProductImage src={item.image_url} alt={item.name} priority />
          </div>
          <div className="card detail-panel">
            <div className="tag-row">
              <span className="tag">{isReleased ? "発売中" : "発売予定"}</span>
              <span className="tag">{item.rarity}</span>
              <span className="tag">{formatSchedule(item)}</span>
            </div>
            <h1 className="page-title" style={{ marginTop: 18, fontSize: "clamp(30px, 4vw, 48px)" }}>{item.name}</h1>
            <p className="page-lead" style={{ marginTop: 12 }}>{item.series_name}</p>

            <div className="metric-grid" style={{ marginTop: 22 }}>
              {isReleased ? <ReleasedHeroMetrics item={item} /> : <UpcomingHeroMetrics item={item} />}
            </div>

            {tags.length > 0 ? (
              <div className="tag-row" style={{ marginTop: 18 }}>
                {tags.map((tag) => (
                  <span key={tag} className="tag tag--signal">{tag}</span>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="detail-sections">
          <div className="card panel">
            <h2>{isReleased ? "判断ポイント" : "発売前の見方"}</h2>
            {isReleased ? <ReleasedSummary item={item} /> : <UpcomingSummary item={item} />}
          </div>

          <div className="card panel">
            <h2>同じシリーズの単品</h2>
            <ul className="plain-list">
              {(item.sibling_variants ?? []).map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.name}</strong>
                  <br />
                  <span style={{ color: "var(--muted)" }}>{entry.rarity} / {entry.role}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="detail-sections">
          <StockPanel item={item} />
          <div className="card panel">
            <h2>{isReleased ? "相場の内訳" : "発売前の注意"}</h2>
            {isReleased ? <MarketBreakdown item={item} /> : <UpcomingNotice item={item} />}
          </div>
        </section>

        <section style={{ marginTop: 28 }}>
          <div className="section-head">
            <div>
              <h2 className="section-title">関連単品</h2>
              <p className="section-sub">同じ発売状態の単品だけを比較できます。</p>
            </div>
          </div>
          <div className="grid grid--cards">
            {related.map((entry) => (
              <SeriesCard key={entry.slug} series={entry} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function ReleasedHeroMetrics({ item }) {
  return (
    <>
      <Metric label="価格" value={formatYen(item.price)} />
      <Metric label="単品相場" value={formatYen(item.market_summary?.single)} tone="highlight" />
      <Metric label="利益目安" value={formatDiff(item.profit_estimate)} tone={getDiffTone(item.profit_estimate)} />
      <Metric label="コンプ相場" value={formatYen(item.market_summary?.complete_set)} />
      <Metric label="在庫状況" value={stockStatusLabel(item.stock_summary || item.availability_summary)} />
      <Metric label="売れ行き" value={item.market_summary?.sell_through_signal?.label ?? "データ不足"} />
      <Metric label="今見るべき度" value={formatScore(watchScore(item))} tone="highlight" />
    </>
  );
}

function UpcomingHeroMetrics({ item }) {
  return buildUpcomingCustomerMetrics(item).map((metric) => <Metric key={metric.label} {...metric} />);
}

function ReleasedSummary({ item }) {
  return (
    <div className="metric-grid">
      {buildReleasedCustomerMetrics(item).map((metric) => (
        <Metric key={metric.label} {...metric} />
      ))}
    </div>
  );
}

function UpcomingSummary({ item }) {
  return (
    <div className="metric-grid">
      <Metric label="期待値" value={formatScore(item.forecast_score)} tone="highlight" />
      <Metric label="価格上昇期待" value={formatScore(priceUpsideScore(item))} />
      <Metric label="流通少なめ" value={formatScore(scarcityScore(item))} />
      <Metric label="狙い目度" value={formatScore(opportunityScore(item))} tone="highlight" />
      <Metric label="発売" value={formatSchedule(item)} />
      <Metric label="価格" value={formatYen(item.price)} />
    </div>
  );
}

function MarketBreakdown({ item }) {
  const summary = item.market_summary || {};
  return (
    <div className="metric-grid">
      <Metric label="単品相場" value={formatYen(summary.single)} tone="highlight" />
      <Metric label="レア単品" value={formatYen(summary.rare_single)} />
      <Metric label="シークレット" value={formatYen(summary.secret_single)} />
      <Metric label="コンプ相場" value={formatYen(summary.complete_set)} />
      <Metric label="一部セット" value={formatYen(summary.partial_set)} />
      <Metric label="人気セット" value={formatYen(summary.popular_set)} />
      <Metric label="出品数" value={(summary.active_listing_count ?? 0).toLocaleString("ja-JP")} />
      <Metric label="売れた数" value={(summary.sold_count ?? 0).toLocaleString("ja-JP")} />
      <Metric label="信頼度" value={summary.price_confidence?.label ?? "データ不足"} />
    </div>
  );
}

function UpcomingNotice({ item }) {
  return (
    <div>
      <p className="section-sub">
        発売前の商品は、相場や利益を確定情報として表示しません。期待値、価格上昇期待、流通少なめ、狙い目度で判断してください。
      </p>
      {item.official_url ? (
        <div className="tag-row" style={{ marginTop: 14 }}>
          <Link href={item.official_url} className="button-link" target="_blank" rel="noreferrer">公式ページ</Link>
        </div>
      ) : null}
    </div>
  );
}

function StockPanel({ item }) {
  const summary = item.stock_summary || item.availability_summary;
  const label = stockStatusLabel(summary);
  return (
    <div className="card panel">
      <h2>在庫状況</h2>
      <div className={`stock-signal stock-signal--${summary?.latest_stock_status || "unknown"}`} style={{ marginBottom: 12 }}>
        <strong>{label}</strong>
        <span>{label === "未取得" ? "データ不足" : "動きあり"}</span>
      </div>
      <p className="section-sub">
        今見るべき判断に必要な在庫の動きだけを表示します。
      </p>
    </div>
  );
}

function Metric({ label, value, tone = "" }) {
  return (
    <div className="metric">
      <div className="metric__label">{label}</div>
      <div className={`metric__value ${tone ? `is-${tone}` : ""}`}>{value}</div>
    </div>
  );
}
