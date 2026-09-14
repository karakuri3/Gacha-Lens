import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import ProductImage from "@/components/ProductImage";
import FavoriteButton from "@/components/FavoriteButton";
import StructuredData from "@/components/StructuredData";
import { getParentSeriesBySlug } from "@/lib/series";
import { seriesHref, variantHref } from "@/lib/variant-url";
import { absoluteSiteUrl, buildPageMetadata } from "@/lib/site-metadata";
import { buildParentSeriesStructuredData } from "@/lib/domain/public-detail-structured-data";
import {
  formatSchedule,
  formatScore,
  formatYen,
  opportunityScore,
  stockStatusLabel,
  watchScore,
} from "@/lib/domain/public-display-clean";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const getParentSeriesDetail = cache((slug) => getParentSeriesBySlug(slug));

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const item = await getParentSeriesDetail(slug);
  if (!item) notFound();
  return buildPageMetadata({
    title: `${item.name} シリーズ | Gacha Lens`,
    description: item.summary ?? `${item.name}のラインナップ、定価、発売情報を確認できます。`,
    path: seriesHref(item),
    image: item.image_url,
  });
}

export default async function ParentSeriesDetailPage({ params }) {
  const { slug } = await params;
  const item = await getParentSeriesDetail(slug);
  if (!item) notFound();

  const released = Boolean(item.is_released);
  const variants = item.variants ?? [];
  const market = item.market_summary ?? {};
  const completeSetEvidence = market.type_stats?.complete_set ?? {};
  const completeSetReference = item.complete_set_reference;
  const heroEvidence = buildSeriesHeroEvidence({ released, item, variants, market, completeSetEvidence });
  const detailUrl = absoluteSiteUrl(seriesHref(item));
  const structuredData = buildParentSeriesStructuredData({
    name: item.name,
    description: item.summary || `${item.name}のガチャシリーズです。`,
    url: detailUrl,
    image: item.image_url ? absoluteSiteUrl(item.image_url) : undefined,
    siteUrl: absoluteSiteUrl("/"),
    items: variants.slice(0, 50).map((variant) => ({
      name: variant.variant_name || variant.name,
      url: absoluteSiteUrl(variantHref(variant)),
    })),
    breadcrumbs: [
      { name: "ホーム", url: absoluteSiteUrl("/") },
      { name: "シリーズ一覧", url: absoluteSiteUrl("/series?scope=series") },
      { name: item.name, url: detailUrl },
    ],
  });

  return (
    <main className="site-main">
      <StructuredData value={structuredData} />
      <div className="site-shell">
        <nav className="detail-breadcrumbs" aria-label="パンくずリスト">
          <Link href="/">ホーム</Link><span>/</span><Link href="/series?scope=series">シリーズ一覧</Link><span>/</span><strong>{item.name}</strong>
        </nav>

        <section className="detail-hero collector-detail-hero">
          <div className="detail-media">
            <div className="detail-image">
              <ProductImage src={item.image_url} alt={item.name} priority emptyLabel="シリーズ画像未取得" />
            </div>
          </div>
          <div className="detail-panel collector-detail-panel">
            <div className="tag-row collector-detail-status">
              <span className="tag">{released ? "発売中" : "発売予定"}</span>
              <span className="tag">シリーズ</span>
              {formatSchedule(item) !== "未定" ? <span className="tag">{formatSchedule(item)}</span> : null}
            </div>
            <h1 className="page-title detail-title">{item.name}</h1>
            <p className="page-lead collector-detail-byline">{item.brand || item.character || "公式商品"}</p>

            <dl className="detail-facts collector-detail-facts">
              <div><dt>メーカー</dt><dd>{item.brand || "未登録"}</dd></div>
              <div><dt>作品</dt><dd>{item.franchise || item.character || "未登録"}</dd></div>
              <div><dt>カテゴリ</dt><dd>{item.category || "未登録"}</dd></div>
              <div><dt>ラインナップ</dt><dd>{variants.length ? `${variants.length}種` : "確認中"}</dd></div>
              {formatSchedule(item) !== "未定" ? <div><dt>発売</dt><dd>{formatSchedule(item)}</dd></div> : null}
              {Number.isFinite(Number(item.price)) && Number(item.price) > 0 ? <div><dt>価格</dt><dd>{formatYen(Number(item.price))}</dd></div> : null}
            </dl>

            {heroEvidence.length ? (
              <dl className="detail-evidence-list" aria-label="市場・流通情報">
                {heroEvidence.map((metric) => <Metric key={metric.label} {...metric} />)}
              </dl>
            ) : null}

            <div className="detail-actions collector-detail-actions">
              <FavoriteButton item={{
                slug: `series-${item.slug}`,
                entity_type: "series",
                name: item.name,
                series_name: "シリーズ",
                image_url: item.image_url,
                is_released: released,
                primary_label: released && formatCompleteSetAggregate(completeSetEvidence) !== "データ不足" ? completeSetAggregateLabel(completeSetEvidence) : "発売",
                primary_value: released && formatCompleteSetAggregate(completeSetEvidence) !== "データ不足" ? formatCompleteSetAggregate(completeSetEvidence) : formatSchedule(item),
              }} />
              {item.official_url ? <Link href={item.official_url} className="button-link" target="_blank" rel="noreferrer">公式ページ</Link> : null}
            </div>
          </div>
        </section>

        {completeSetReference ? (
          <section className="collector-detail-section" aria-labelledby="complete-set-reference-title">
            <div className="section-head">
              <div>
                <p className="eyebrow">COMPLETE SET</p>
                <h2 id="complete-set-reference-title" className="section-title">コンプリートセット参考価格</h2>
                <p className="section-sub">{completeSetReference.note}</p>
              </div>
            </div>
            <dl className="detail-evidence-list detail-evidence-list--compact">
              <Metric label={completeSetReference.lineup_label} value={formatYen(completeSetReference.price)} tone="highlight" />
              <Metric label="出品先" value={completeSetReference.provider_label} />
            </dl>
            <div className="detail-actions collector-detail-actions">
              <a href={completeSetReference.source_url} className="button-link" target="_blank" rel="noopener noreferrer">出品ページを見る</a>
            </div>
          </section>
        ) : null}

        <section className="collector-detail-section collector-lineup-section">
          <div className="section-head">
            <div>
              <p className="eyebrow">LINEUP</p>
              <h2 className="section-title">単品ラインナップ</h2>
              <p className="section-sub">個別種が公式情報から確認できたものだけを表示します。</p>
              {item.has_provisional_variants ? (
                <p className="section-sub">{item.lineup_verification_status === "partial" ? "確認済みのラインナップを掲載しています。" : "ラインナップを確認中です。"}</p>
              ) : null}
            </div>
            <Link href={{ pathname: "/series", query: { scope: "variant", q: item.name } }} className="text-link">単品一覧で見る</Link>
          </div>
          {variants.length ? (
            <div className="lineup-grid collector-lineup-list">
              {variants.map((variant) => (
                <Link key={variant.variant_id || variant.id} href={variantHref(variant)}>
                  <span className="lineup-grid__image">
                    {variant.image_scope === "series_fallback"
                      ? <span className="lineup-grid__series-fallback">シリーズ</span>
                      : <ProductImage item={variant} alt={variant.variant_name || variant.name} emptyLabel="画像なし" />}
                  </span>
                  <span><strong>{variant.variant_name || variant.name}</strong><small>{variant.rarity || "通常"}</small></span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty collector-detail-empty">公式ラインナップを確認中です。シリーズ情報は先に利用できます。</div>
          )}
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value, tone = "", meta = "" }) {
  return (
    <div className="collector-evidence-row">
      <dt>{label}</dt>
      <dd className={tone ? `is-${tone}` : ""}>{value}</dd>
      {meta ? <small>{meta}</small> : null}
    </div>
  );
}

function buildSeriesHeroEvidence({ released, item, variants, market, completeSetEvidence }) {
  const metrics = [];
  if (released) {
    const completeValue = formatCompleteSetAggregate(completeSetEvidence);
    if (completeValue !== "データ不足") {
      metrics.push({ label: completeSetAggregateLabel(completeSetEvidence), value: completeValue, meta: completeSetEvidence.explanation, tone: "highlight" });
    }

    if (Number.isFinite(Number(market.partial_set)) && Number(market.partial_set) > 0) {
      metrics.push({ label: market.type_stats?.partial_set?.label || "セット参考価格", value: formatYen(Number(market.partial_set)) });
    }

    const sold = Number(market.sold_count);
    if (Number.isFinite(sold) && sold > 0) metrics.push({ label: "売れた数", value: `${sold.toLocaleString("ja-JP")}件` });

    const stock = stockStatusLabel(item.stock_summary);
    if (stock !== "未取得") metrics.push({ label: "在庫状況", value: stock });

    const attention = watchScore(item);
    if (Number.isFinite(attention) && attention > 0) metrics.push({ label: "注目度", value: formatScore(attention), tone: "highlight" });
    return metrics;
  }

  const price = Number(item.price);
  if (Number.isFinite(price) && price > 0) metrics.push({ label: "価格", value: formatYen(price) });

  const forecast = Number(item.forecast_score);
  if (Number.isFinite(forecast) && forecast > 0) metrics.push({ label: "先行注目度", value: formatScore(forecast), tone: "highlight" });

  const opportunity = opportunityScore(item);
  if (Number.isFinite(opportunity) && opportunity > 0) metrics.push({ label: "注目度", value: formatScore(opportunity), tone: "highlight" });
  if (variants.length) metrics.push({ label: "ラインナップ", value: `${variants.length}種` });

  const schedule = formatSchedule(item);
  if (schedule !== "未定") metrics.push({ label: "発売", value: schedule });
  return metrics;
}

function formatCompleteSetAggregate(evidence = {}) {
  return evidence.tier === "insufficient" ? "データ不足" : formatYen(evidence.primary_price);
}

function completeSetAggregateLabel(evidence = {}) {
  return evidence.tier === "insufficient" ? "セット価格データ不足" : evidence.label || "セット参考価格";
}
