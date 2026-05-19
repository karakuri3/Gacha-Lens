import Link from "next/link";
import { notFound } from "next/navigation";
import { getRelatedSeries, getSeriesBySlug } from "@/lib/series";
import SeriesCard from "@/components/SeriesCard";

export async function generateMetadata({ params }) {
  const resolvedParams = await params;
  const item = await getSeriesBySlug(resolvedParams.slug);
  return {
    title: item ? `${item.name} | Gacha Lens` : "単品詳細 | Gacha Lens",
    description: item?.summary ?? "ガチャ単品の相場・予想・在庫シグナルを確認できます。",
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

  return (
    <main className="site-main">
      <div className="site-shell">
        <div className="tag-row" style={{ marginBottom: 18 }}>
          <Link href="/series" className="pill-link">単品一覧</Link>
          <Link href={isReleased ? "/ranking?tab=released" : "/ranking?tab=upcoming"} className="pill-link">
            {isReleased ? "発売中ランキング" : "発売予定ランキング"}
          </Link>
          {item.official_url ? <Link href={item.official_url} className="pill-link">公式</Link> : null}
        </div>

        <section className="detail-hero">
          <div className="detail-image">
            <ProductImage src={item.image_url} alt={item.name} />
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
              {isReleased ? (
                <>
                  <Metric label="単品相場" value={formatYen(item.market_summary?.single)} tone="highlight" />
                  <Metric label="利益目安" value={formatDiff(item.profit_estimate)} tone={getDiffTone(item.profit_estimate)} />
                  <Metric label="レア単品" value={formatYen(item.market_summary?.rare_single)} />
                  <Metric label="シークレット" value={formatYen(item.market_summary?.secret_single)} />
                  <Metric label="コンプセット" value={formatYen(item.market_summary?.complete_set)} />
                  <Metric label="一部セット" value={formatYen(item.market_summary?.partial_set)} />
                  <Metric label="人気セット" value={formatYen(item.market_summary?.popular_set)} />
                  <Metric label="信頼度" value={item.market_summary?.price_confidence?.label ?? "未取得"} />
                </>
              ) : (
                <>
                  <Metric label="予想スコア" value={formatScore(item.forecast_score)} tone="highlight" />
                  <Metric label="コンプ需要" value={formatScore(item.complete_set_score)} />
                  <Metric label="当たり枠需要" value={formatScore(item.ace_character_score)} />
                  <Metric label="互換性" value={formatScore(item.compatibility_score)} />
                  <Metric label="限定性" value={formatScore(item.limitedness_score)} />
                  <Metric label="X反応" value={formatScore(item.x_signal_score)} />
                  <Metric label="価格" value={formatYen(item.price)} />
                  <Metric label="発売" value={formatSchedule(item)} />
                </>
              )}
            </div>

            <div className="tag-row" style={{ marginTop: 18 }}>
              {[...(item.trend_tags ?? []), ...(item.forecast_tags ?? [])].slice(0, 6).map((tag) => (
                <span key={tag} className="tag tag--signal">{tag}</span>
              ))}
            </div>
          </div>
        </section>

        <section className="detail-sections">
          <div className="card panel">
            <h2>{isReleased ? "市場サマリー" : "発売前の根拠"}</h2>
            {isReleased ? <MarketSummaryPanel item={item} /> : <ForecastSummaryPanel item={item} />}
          </div>

          <div className="card panel">
            <h2>親シリーズ内の単品</h2>
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

        {isReleased ? (
          <section className="detail-sections">
            <div className="card panel">
              <h2>分類済み市場データ</h2>
              <ul className="plain-list">
                {(item.market_listings ?? []).map((listing) => (
                  <li key={listing.id}>
                    <strong>{listingTypeLabel(listing.listing_type)}</strong> {formatYen(listing.price)}
                    <br />
                    <span style={{ color: "var(--muted)" }}>
                      {listing.source} / {listing.status} / 信頼度 {Math.round((listing.confidence ?? 0) * 100)}%
                    </span>
                  </li>
                ))}
                {(item.market_listings ?? []).length === 0 ? <li>相場データは未取得です。</li> : null}
              </ul>
            </div>
            <StockPanel item={item} />
          </section>
        ) : (
          <section className="detail-sections">
            <div className="card panel">
              <h2>発売前シグナル</h2>
              <p className="section-sub">
                発売前のため相場と利益は表示しません。X反応、予約・事前出品、公式情報を予想根拠として扱います。
              </p>
              <ForecastSummaryPanel item={item} />
            </div>
            <StockPanel item={item} />
          </section>
        )}

        <section style={{ marginTop: 28 }}>
          <div className="section-head">
            <div>
              <h2 className="section-title">関連単品</h2>
              <p className="section-sub">同じ状態の商品だけを比較できます。</p>
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

function MarketSummaryPanel({ item }) {
  const summary = item.market_summary || {};
  return (
    <div className="metric-grid">
      <Metric label="出品数" value={`${summary.listing_count ?? 0}件`} />
      <Metric label="売れた数" value={`${summary.sold_count ?? 0}件`} />
      <Metric label="出品中" value={`${summary.active_listing_count ?? 0}件`} />
      <Metric label="直近更新" value={formatDate(summary.last_observed_at)} />
      <Metric label="直近売れ価格" value={formatYen(summary.recent_sold_price)} />
      <Metric label="最安出品" value={formatYen(summary.lowest_active_price)} />
      <Metric label="売れ行き" value={summary.sell_through_signal?.label ?? "データ不足"} />
      <Metric label="流通" value={item.circulation_label ?? "未取得"} />
    </div>
  );
}

function ForecastSummaryPanel({ item }) {
  const forecast = item.forecast_breakdown || {};
  return (
    <div className="metric-grid">
      <Metric label="コンプ需要" value={formatScore(forecast.complete)} />
      <Metric label="当たり枠需要" value={formatScore(forecast.ace)} />
      <Metric label="ミニチュア互換性" value={formatScore(forecast.compatibility)} />
      <Metric label="限定性" value={formatScore(forecast.limited)} />
      <Metric label="事前出品気配" value={formatScore(forecast.preorder)} />
      <Metric label="X反応強度" value={formatScore(forecast.x)} />
      <Metric label="トレンド" value={formatScore(item.trend_score)} />
      <Metric label="発売週" value={formatSchedule(item)} />
    </div>
  );
}

function StockPanel({ item }) {
  const reports = item.stock_reports ?? [];
  const events = item.restock_events ?? [];
  const summary = item.stock_summary || item.availability_summary;
  return (
    <div className="card panel">
      <h2>再入荷・在庫</h2>
      {summary?.has_stock_signal || summary?.has_restock_signal ? (
        <div className={`stock-signal stock-signal--${summary.latest_stock_status || "unknown"}`} style={{ marginBottom: 12 }}>
          <strong>{stockSignalLabel(summary.latest_stock_status)}</strong>
          <span>{summary.latest_region || summary.latest_shop_name || "signal"} / {summary.source_strength ?? 0}</span>
        </div>
      ) : null}
      <ul className="plain-list">
        {events.map((event) => (
          <li key={event.id}>
            <strong>{event.event_label || event.event_type}</strong>
            <br />
            {event.region} / {event.shop_name} / {sourceLabel(event.source_type)}
          </li>
        ))}
        {reports.map((report) => (
          <li key={report.id}>
            <strong>{report.status_label || report.status}</strong>
            <br />
            {report.region} / {report.shop_name} / {sourceLabel(report.source_type)}
          </li>
        ))}
        {events.length + reports.length === 0 ? <li>在庫シグナルは未取得です。</li> : null}
      </ul>
    </div>
  );
}

function ProductImage({ src, alt }) {
  return src ? <img src={src} alt={alt} /> : <span className="image-placeholder">NO IMAGE</span>;
}

function Metric({ label, value, tone = "" }) {
  return (
    <div className="metric">
      <div className="metric__label">{label}</div>
      <div className={`metric__value ${tone ? `is-${tone}` : ""}`}>{value}</div>
    </div>
  );
}

function formatSchedule(item) {
  const month = item.schedule_month || "";
  const week = item.schedule_week || "";
  return `${month} ${week ? `${week}より順次` : ""}`.trim() || "未定";
}

function stockSignalLabel(status) {
  if (status === "sold_out") return "売り切れ報告";
  if (status === "low") return "残り少なめ";
  if (status === "in_stock") return "在庫あり";
  if (status === "restocked") return "補充あり";
  return "在庫シグナル";
}

function listingTypeLabel(type) {
  const labels = {
    single: "単品",
    rare_single: "レア単品",
    secret_single: "シークレット",
    complete_set: "コンプセット",
    partial_set: "一部セット",
    popular_set: "人気キャラセット",
    sealed_bulk: "未開封まとめ",
    loose_bulk: "バラまとめ",
  };
  return labels[type] ?? type;
}

function sourceLabel(type) {
  const labels = {
    official: "公式",
    official_site: "公式",
    official_x: "公式X",
    shop_x: "店舗X",
    user_x: "一般報告",
  };
  return labels[type] ?? type;
}

function formatYen(value) {
  return Number.isFinite(value) ? `${Math.round(value).toLocaleString("ja-JP")}円` : "未取得";
}

function formatDiff(value) {
  if (!Number.isFinite(value)) return "データ不足";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("ja-JP")}円`;
}

function formatScore(value) {
  return Number.isFinite(value) ? `${Math.round(value)}点` : "データ不足";
}

function formatDate(value) {
  if (!value) return "未更新";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "未更新";
  return `${date.getMonth() + 1}/${date.getDate()}更新`;
}

function getDiffTone(value) {
  if (!Number.isFinite(value)) return "";
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "";
}
