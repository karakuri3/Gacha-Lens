import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import ProductImage from "@/components/ProductImage";
import { getRelatedSeries, getSeriesBySlug } from "@/lib/series";
import SeriesCard from "@/components/SeriesCard";
import MarketplaceLinks from "@/components/MarketplaceLinks";
import CommunityReportForm from "@/components/CommunityReportForm";
import PriceTrendChart from "@/components/PriceTrendChart";
import FavoriteButton from "@/components/FavoriteButton";
import StructuredData from "@/components/StructuredData";
import { variantHref } from "@/lib/variant-url";
import { absoluteSiteUrl, buildPageMetadata } from "@/lib/site-metadata";
import { buildVariantDetailStructuredData } from "@/lib/domain/public-detail-structured-data";
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

// The Cloudflare POC is built with vinext's Workers Cache CDN adapter and no
// data-cache adapter. Keep the cache at the public page boundary so a warm hit
// bypasses the Worker/Supabase read path entirely. The page contains no
// request-specific server state; favorites and reports remain client/action
// concerns. Thirty minutes bounds staleness to the ingestion operating window.
export const dynamic = "force-static";
export const revalidate = 1800;

const getVariantDetail = cache((slug) => getSeriesBySlug(slug));

export async function generateMetadata({ params }) {
  const resolvedParams = await params;
  const item = await getVariantDetail(resolvedParams.slug);
  if (!item) notFound();
  const path = variantHref(item);
  const description = item.summary
    ?? `${item.name}の定価、発売時期、${item.is_released ? "価格の動きと在庫情報" : "発売前の注目度と入手情報"}を確認できます。`;
  return buildPageMetadata({
    title: `${item.name} | Gacha Lens`,
    description,
    path,
    image: item.image_url,
  });
}

export default async function VariantDetailPage({ params }) {
  const resolvedParams = await params;
  const item = await getVariantDetail(resolvedParams.slug);
  if (!item) notFound();

  const isReleased = Boolean(item.is_released);
  const relatedRecords = await getRelatedSeries(item.slug, 8);
  const related = relatedRecords
    .filter((entry) => Boolean(entry.is_released) === isReleased)
    .slice(0, 3);
  const tags = customerTags(item, isReleased);
  const siblingImages = (item.sibling_variants ?? []).filter((entry) => entry.has_variant_image).slice(0, 5);
  const detailUrl = absoluteSiteUrl(variantHref(item));
  const pageDescription = item.summary || `${item.series_name}のラインナップ商品です。`;
  const structuredData = buildVariantDetailStructuredData({
    name: item.name,
    description: pageDescription,
    url: detailUrl,
    image: item.variant_image_url ? absoluteSiteUrl(item.variant_image_url) : undefined,
    siteUrl: absoluteSiteUrl("/"),
    breadcrumbs: [
      { name: "ホーム", url: absoluteSiteUrl("/") },
      { name: "ガチャ一覧", url: absoluteSiteUrl("/series") },
      { name: item.name, url: detailUrl },
    ],
  });

  return (
    <main className="site-main">
      <StructuredData value={structuredData} />
      <div className="site-shell">
        <nav className="detail-breadcrumbs" aria-label="パンくずリスト">
          <Link href="/">ホーム</Link><span>/</span><Link href="/series">ガチャ一覧</Link><span>/</span><strong>{item.name}</strong>
        </nav>

        <section className="detail-hero">
          <div className="detail-media">
            <div className="detail-image">
              <ProductImage item={item} alt={item.name} priority emptyLabel="画像なし" />
            </div>
            {siblingImages.length > 1 ? (
              <div className="detail-thumbnails" aria-label="同じシリーズの画像">
                {siblingImages.map((entry) => (
                  <Link key={entry.id} href={variantHref(entry)} title={entry.name}>
                    <ProductImage item={entry} alt={entry.name} />
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
              <div><dt>作品</dt><dd>{item.parent_series?.franchise || item.character || "未登録"}</dd></div>
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
                display_image_url: item.display_image_url,
                series_image_url: item.series_image_url,
                image_scope: item.image_scope,
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
                  <span className="lineup-grid__image">
                    {entry.image_scope === "series_fallback"
                      ? <span className="lineup-grid__series-fallback">シリーズ</span>
                      : <ProductImage item={entry} alt={entry.name} emptyLabel="画像なし" />}
                  </span>
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
    <div className="market-breakdown">
      <p>{evidence.summary || "観測データが増えると相場の内訳が表示されます。"}</p>
      <dl className="detail-facts">
        <div><dt>観測件数</dt><dd>{summary.observed_count ?? 0}</dd></div>
        <div><dt>出品中</dt><dd>{summary.active_count ?? 0}</dd></div>
        <div><dt>売れた数</dt><dd>{summary.sold_count ?? 0}</dd></div>
        <div><dt>参考相場</dt><dd>{formatMarketEvidenceValue(evidence)}</dd></div>
      </dl>
    </div>
  );
}

function UpcomingNotice({ item }) {
  return (
    <div className="market-breakdown">
      <p>発売前スコアは注目度・入手難度などを比較するための参考指標です。価格や入手可否を保証するものではありません。</p>
      <dl className="detail-facts">
        <div><dt>先行注目度</dt><dd>{formatScore(item.forecast_score)}</dd></div>
        <div><dt>入手難度</dt><dd>{formatScore(scarcityScore(item))}</dd></div>
        <div><dt>ウォッチ</dt><dd>{formatScore(watchScore(item))}</dd></div>
        <div><dt>発売</dt><dd>{formatSchedule(item)}</dd></div>
      </dl>
    </div>
  );
}

function StockPanel({ item }) {
  const reports = item.stock_reports ?? [];
  return (
    <div id="stock" className="card panel">
      <h2>在庫状況</h2>
      {reports.length ? (
        <div className="stack-list">
          {reports.slice(0, 8).map((report) => (
            <div key={report.id} className="stack-list__item">
              <strong>{stockStatusLabel(report.status)}</strong>
              <span>{report.shop_name || report.region || "場所未登録"}</span>
              <small>{report.reported_at ? new Date(report.reported_at).toLocaleString("ja-JP") : "時刻未登録"}</small>
            </div>
          ))}
        </div>
      ) : <p className="empty">在庫報告はまだありません。</p>}
    </div>
  );
}

function RestockPanel({ item }) {
  const events = item.restock_events ?? [];
  return (
    <div id="restock" className="card panel">
      <h2>再販・再入荷</h2>
      <div className="stack-list">
        {events.slice(0, 8).map((event) => (
          <div key={event.id} className="stack-list__item">
            <strong>{event.event_label || event.event_type || "再入荷情報"}</strong>
            <span>{event.shop_name || event.region || "場所未登録"}</span>
            <small>{event.reported_at ? new Date(event.reported_at).toLocaleString("ja-JP") : "時刻未登録"}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "" }) {
  return (
    <div className={`metric ${tone ? `metric--${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
