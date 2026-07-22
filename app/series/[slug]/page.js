import Link from "next/link";
import { notFound } from "next/navigation";
import ProductImage from "@/components/ProductImage";
import { getRelatedSeries, getSeriesBySlug } from "@/lib/series";
import SeriesCard from "@/components/SeriesCard";
import MarketplaceLinks from "@/components/MarketplaceLinks";
import CommunityReportForm from "@/components/CommunityReportForm";
import PriceTrendChart from "@/components/PriceTrendChart";
import FavoriteButton from "@/components/FavoriteButton";
import { variantHref } from "@/lib/variant-url";
import {
  buildReleasedCustomerMetrics,
  buildUpcomingCustomerMetrics,
  customerTags,
  formatMarketEvidenceValue,
  formatSchedule,
  formatScore,
  formatYen,
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
  if (!item) notFound();
  return {
    title: `${item.name} | Gacha Lens`,
    description: item.summary ?? "ガチャ単品の価格、話題度、在庫、発売情報を確認できます。",
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
  const siblingImages = (item.sibling_variants ?? []).filter((entry) => entry.image).slice(0, 5);

  return (
    <main className="site-main">
      <div className="site-shell">
        <nav className="detail-breadcrumbs" aria-label="パンくずリスト">
          <Link href="/">ホーム</Link><span>/</span><Link href="/series">ガチャ一覧</Link><span>/</span><strong>{item.name}</strong>
        </nav>

        <section className="detail-hero">
          <div className="detail-media">
            <div className="detail-image">
              <ProductImage src={item.image_url} alt={item.name} priority emptyLabel="単品画像未取得" />
            </div>
            {siblingImages.length > 1 ? (
              <div className="detail-thumbnails" aria-label="同じシリーズの画像">
                {siblingImages.map((entry) => (
                  <Link key={entry.id} href={variantHref(entry)} title={entry.name}>
                    <ProductImage src={entry.image} alt={entry.name} />
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          <div className="detail-panel">
            <div className="tag-row">
              <span className="tag">{isReleased ? "発売中" : "発売予定"}</span>
              <span className="tag">{item.rarity}</span>
              <span className="tag">{formatSchedule(item)}</span>
            </div>
            <h1 className="page-title detail-title">{item.name}</h1>
            <p className="page-lead" style={{ marginTop: 12 }}>{item.series_name}</p>

            <dl className="detail-facts">
              <div><dt>メーカー</dt><dd>{item.brand || "未登録"}</dd></div>
              <div><dt>カテゴリ</dt><dd>{item.category || "未登録"}</dd></div>
              <div><dt>発売</dt><dd>{formatSchedule(item)}</dd></div>
              <div><dt>定価</dt><dd>{formatYen(item.price)}</dd></div>
            </dl>

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
            <div className="detail-actions">
              <FavoriteButton item={{
                slug: item.slug,
                name: item.name,
                series_name: item.series_name,
                image_url: item.image_url,
                is_released: isReleased,
                primary_label: isReleased ? item.market_evidence?.label : "発売",
                primary_value: isReleased ? formatMarketEvidenceValue(item.market_evidence) : `${formatSchedule(item)}・${formatYen(item.price)}`,
              }} />
              <MarketplaceLinks item={item} />
            </div>
          </div>
        </section>

        <nav className="detail-section-nav" aria-label="商品詳細メニュー">
          <a href="#overview">基本情報</a>
          {isReleased ? <a href="#price">価格の動き</a> : null}
          <a href="#lineup">ラインナップ</a>
          {(item.restock_events ?? []).length ? <a href="#restock">再販・再入荷</a> : null}
          <a href="#stock">在庫情報</a>
          <a href="#report">情報を報告</a>
        </nav>

        {isReleased ? (
          <section id="price" className="card panel price-history-panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">PRICE PULSE</p>
                <h2 className="section-title">価格の動き</h2>
              </div>
              <span className="data-note">{item.market_evidence?.label || "データ不足"}</span>
            </div>
            <PriceTrendChart item={item} />
          </section>
        ) : null}

        <section id="overview" className="detail-sections">
          <div className="card panel">
            <h2>{isReleased ? "判断ポイント" : "発売前の見方"}</h2>
            {isReleased ? <ReleasedSummary item={item} /> : <UpcomingSummary item={item} />}
          </div>

          <div id="lineup" className="card panel">
            <h2>同じシリーズの単品</h2>
            <div className="lineup-grid">
              {(item.sibling_variants ?? []).map((entry) => (
                <Link key={entry.id} href={variantHref(entry)}>
                  <span className="lineup-grid__image"><ProductImage src={entry.image} alt={entry.name} emptyLabel="単品画像未取得" /></span>
                  <span><strong>{entry.name}</strong><small>{entry.rarity} / {entry.role}</small></span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <details id="report" className="card panel community-panel community-disclosure">
          <summary>
            <span>価格・在庫を報告</span>
            <small>確認後に反映</small>
          </summary>
          <CommunityReportForm item={{ variant_id: item.variant_id, is_released: isReleased }} />
        </details>

        <section className="detail-sections">
          <StockPanel item={item} />
          {(item.restock_events ?? []).length ? <RestockPanel item={item} /> : null}
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
  return buildReleasedCustomerMetrics(item).map((metric) => <Metric key={metric.label} {...metric} />);
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
      <Metric label="先行注目度" value={formatScore(item.forecast_score)} tone="highlight" />
      <Metric label="話題化期待" value={formatScore(priceUpsideScore(item))} />
      <Metric label="入手難度" value={formatScore(scarcityScore(item))} />
      <Metric label="注目度" value={formatScore(opportunityScore(item))} tone="highlight" />
      <Metric label="発売" value={formatSchedule(item)} />
      <Metric label="価格" value={formatYen(item.price)} />
    </div>
  );
}

function MarketBreakdown({ item }) {
  const summary = item.market_summary || {};
  const evidence = item.market_evidence || summary.evidence || {};
  return (
    <div className="metric-grid">
      <Metric label={evidence.label || "データ不足"} value={formatMarketEvidenceValue(evidence)} meta={evidence.explanation} tone="highlight" />
      <EvidenceMetric stats={summary.type_stats?.rare_single} fallbackLabel="レア単品" />
      <EvidenceMetric stats={summary.type_stats?.secret_single} fallbackLabel="シークレット" />
      <Metric label="出品数" value={(summary.active_listing_count ?? 0).toLocaleString("ja-JP")} />
      <Metric label="売れた数" value={(summary.sold_count ?? 0).toLocaleString("ja-JP")} />
      <Metric label="信頼度" value={summary.price_confidence?.label ?? "データ不足"} />
      <Metric label="直近更新" value={formatObservedAt(summary.last_observed_at)} />
    </div>
  );
}

function UpcomingNotice({ item }) {
  return (
    <div>
      <p className="section-sub">
        発売前の商品は成約相場や利益を表示しません。予約・出品価格は3件以上確認できた場合だけ、参考情報として区別して表示します。
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
    <div id="stock" className="card panel">
      <h2>在庫状況</h2>
      <div className={`stock-signal stock-signal--${summary?.latest_stock_status || "unknown"}`} style={{ marginBottom: 12 }}>
        <strong>{label}</strong>
        <span>{label === "未取得" ? "データ不足" : "動きあり"}</span>
      </div>
      <p className="section-sub">
        店頭やオンラインで確認できた在庫の動きを表示します。
      </p>
      {(item.stock_reports ?? []).length ? (
        <div className="detail-signal-list">
          {(item.stock_reports ?? []).slice(0, 5).map((report) => (
            <div key={report.id || report.reported_at}>
              <strong>{report.status_label || stockStatusLabel({ latest_stock_status: report.status })}</strong>
              <span>{[report.region, report.shop_name].filter(Boolean).join(" / ") || "場所未登録"}</span>
              <time>{formatObservedAt(report.reported_at)}</time>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RestockPanel({ item }) {
  return (
    <div id="restock" className="card panel">
      <h2>再販・再入荷</h2>
      <div className="detail-signal-list">
        {(item.restock_events ?? []).slice(0, 5).map((event) => (
          <div key={event.id || event.reported_at}>
            <strong>{event.event_label || (event.event_type === "refill" ? "補充" : "再入荷")}</strong>
            <span>{[event.region, event.shop_name].filter(Boolean).join(" / ") || "場所未登録"}</span>
            <time>{formatObservedAt(event.reported_at)}</time>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "", meta = "" }) {
  return (
    <div className="metric">
      <div className="metric__label">{label}</div>
      <div className={`metric__value ${tone ? `is-${tone}` : ""}`}>{value}</div>
      {meta ? <small>{meta}</small> : null}
    </div>
  );
}

function EvidenceMetric({ stats, fallbackLabel }) {
  if (!stats || (!Number.isFinite(stats.primary_price) && stats.listing_count === 0)) return null;
  return <Metric label={stats.label || fallbackLabel} value={formatYen(stats.primary_price)} meta={stats.explanation} />;
}

function formatObservedAt(value) {
  if (!value) return "未取得";
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" }).format(new Date(value));
}
