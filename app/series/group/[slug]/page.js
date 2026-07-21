import Link from "next/link";
import { notFound } from "next/navigation";
import ProductImage from "@/components/ProductImage";
import FavoriteButton from "@/components/FavoriteButton";
import { getParentSeriesBySlug } from "@/lib/series";
import { variantHref } from "@/lib/variant-url";
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

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const item = await getParentSeriesBySlug(slug);
  if (!item) notFound();
  return {
    title: `${item.name} シリーズ | Gacha Lens`,
    description: item.summary ?? "ガチャシリーズのラインナップ、発売情報、セット相場を確認できます。",
  };
}

export default async function ParentSeriesDetailPage({ params }) {
  const { slug } = await params;
  const item = await getParentSeriesBySlug(slug);
  if (!item) notFound();

  const released = Boolean(item.is_released);
  const variants = item.variants ?? [];
  const market = item.market_summary ?? {};

  return (
    <main className="site-main">
      <div className="site-shell">
        <nav className="detail-breadcrumbs" aria-label="パンくずリスト">
          <Link href="/">ホーム</Link><span>/</span><Link href="/series?scope=series">シリーズ一覧</Link><span>/</span><strong>{item.name}</strong>
        </nav>

        <section className="detail-hero">
          <div className="detail-media">
            <div className="detail-image">
              <ProductImage src={item.image_url} alt={item.name} priority emptyLabel="シリーズ画像未取得" />
            </div>
          </div>
          <div className="detail-panel">
            <div className="tag-row">
              <span className="tag">{released ? "発売中" : "発売予定"}</span>
              <span className="tag">シリーズ</span>
              <span className="tag">{formatSchedule(item)}</span>
            </div>
            <h1 className="page-title detail-title">{item.name}</h1>
            <p className="page-lead" style={{ marginTop: 12 }}>{item.brand || item.character || "公式商品"}</p>

            <dl className="detail-facts">
              <div><dt>メーカー</dt><dd>{item.brand || "未登録"}</dd></div>
              <div><dt>ラインナップ</dt><dd>{variants.length ? `${variants.length}種` : "確認中"}</dd></div>
              <div><dt>発売</dt><dd>{formatSchedule(item)}</dd></div>
              <div><dt>価格</dt><dd>{formatYen(item.price)}</dd></div>
            </dl>

            <div className="metric-grid" style={{ marginTop: 22 }}>
              {released ? (
                <>
                  <Metric label="単品中央値" value={formatYen(market.single)} />
                  <Metric label="コンプ相場" value={formatYen(market.complete_set)} tone="highlight" />
                  <Metric label="一部セット" value={formatYen(market.partial_set)} />
                  <Metric label="売れた数" value={`${market.sold_count ?? 0}件`} />
                  <Metric label="在庫状況" value={stockStatusLabel(item.stock_summary)} />
                  <Metric label="注目度" value={formatScore(watchScore(item))} tone="highlight" />
                </>
              ) : (
                <>
                  <Metric label="価格" value={formatYen(item.price)} />
                  <Metric label="先行注目度" value={formatScore(item.forecast_score)} tone="highlight" />
                  <Metric label="注目度" value={formatScore(opportunityScore(item))} tone="highlight" />
                  <Metric label="ラインナップ" value={variants.length ? `${variants.length}種` : "確認中"} />
                  <Metric label="発売" value={formatSchedule(item)} />
                </>
              )}
            </div>

            <div className="detail-actions">
              <FavoriteButton item={{
                slug: `series-${item.slug}`,
                name: item.name,
                series_name: "シリーズ",
                image_url: item.image_url,
                is_released: released,
                primary_value: released ? formatYen(market.complete_set) : formatSchedule(item),
              }} />
              {item.official_url ? <Link href={item.official_url} className="button-link" target="_blank" rel="noreferrer">公式ページ</Link> : null}
            </div>
          </div>
        </section>

        <section className="card panel" style={{ marginTop: 24 }}>
          <div className="section-head">
            <div>
              <p className="eyebrow">LINEUP</p>
              <h2 className="section-title">単品ラインナップ</h2>
              <p className="section-sub">個別種が公式情報から確認できたものだけを表示します。</p>
            </div>
            <Link href={{ pathname: "/series", query: { scope: "variant", q: item.name } }} className="text-link">単品一覧で見る</Link>
          </div>
          {variants.length ? (
            <div className="lineup-grid">
              {variants.map((variant) => (
                <Link key={variant.variant_id || variant.id} href={variantHref(variant)}>
                  <span className="lineup-grid__image">
                    <ProductImage src={variant.image_url} alt={variant.variant_name || variant.name} emptyLabel="単品画像未取得" />
                  </span>
                  <span><strong>{variant.variant_name || variant.name}</strong><small>{variant.rarity || "通常"}</small></span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty">公式ラインナップを確認中です。シリーズ情報は先に利用できます。</div>
          )}
        </section>
      </div>
    </main>
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
