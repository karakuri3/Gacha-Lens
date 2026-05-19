import Link from "next/link";

export default function SeriesCard({ series }) {
  const isReleased = Boolean(series.is_released ?? series.isReleased);
  const metrics = isReleased
    ? [
        { label: "利益目安", value: formatDiff(series.profit_estimate), tone: getDiffTone(series.profit_estimate) },
        { label: "単品相場", value: formatYen(series.market_price_median ?? series.marketPriceMedian) },
        { label: "流通", value: series.circulation_label ?? "未取得" },
        { label: "売れ行き", value: series.market_summary?.sell_through_signal?.label ?? "データ不足" },
      ]
    : [
        { label: "予想スコア", value: formatScore(series.forecast_score), tone: "highlight" },
        { label: "コンプ需要", value: formatScore(series.complete_set_score) },
        { label: "当たり枠", value: formatScore(series.ace_character_score) },
        { label: "互換性", value: formatScore(series.compatibility_score) },
      ];

  return (
    <Link href={`/series/${series.slug}`} className="card product-card">
      <div className="product-image">
        <ProductImage src={series.image_url || series.imageUrl} alt={series.name} />
      </div>
      <div>
        <div className="tag-row" style={{ marginBottom: 10 }}>
          <span className="tag">{isReleased ? "発売中" : "発売予定"}</span>
          <span className="tag">{series.rarity ?? series.category}</span>
        </div>
        <h3 className="product-name">{series.name}</h3>
        <div className="product-meta">
          {series.series_name ?? series.brand} / {series.role ?? series.character}
        </div>
      </div>
      <div className="metric-grid">
        {metrics.map((metric) => (
          <div key={metric.label} className="metric">
            <div className="metric__label">{metric.label}</div>
            <div className={`metric__value ${metric.tone ? `is-${metric.tone}` : ""}`}>
              {metric.value}
            </div>
          </div>
        ))}
      </div>
      {isReleased ? <MarketSnapshot series={series} /> : <SignalTags series={series} />}
      {isReleased ? <StockSignal summary={series.stock_summary || series.availability_summary} /> : null}
    </Link>
  );
}

function MarketSnapshot({ series }) {
  const summary = series.market_summary || {};
  return (
    <div className="market-snapshot">
      <span>出品 {summary.listing_count ?? 0}</span>
      <span>SOLD {summary.sold_count ?? 0}</span>
      <span>信頼度 {summary.price_confidence?.label ?? "未取得"}</span>
      <span>{formatDate(summary.last_observed_at)}</span>
    </div>
  );
}

function SignalTags({ series }) {
  const tags = [...(series.trend_tags ?? []), ...(series.forecast_tags ?? [])].slice(0, 3);
  if (!tags.length) return null;
  return (
    <div className="tag-row">
      {tags.map((tag) => (
        <span key={tag} className="tag tag--signal">{tag}</span>
      ))}
    </div>
  );
}

function ProductImage({ src, alt }) {
  return src ? <img src={src} alt={alt} /> : <span className="image-placeholder">NO IMAGE</span>;
}

function StockSignal({ summary }) {
  if (!summary?.has_stock_signal && !summary?.has_restock_signal) return null;
  return (
    <div className={`stock-signal stock-signal--${summary.latest_stock_status || "unknown"}`}>
      <strong>{stockSignalLabel(summary.latest_stock_status)}</strong>
      <span>{summary.latest_region || summary.latest_shop_name || "signal"} / {summary.source_strength ?? 0}</span>
    </div>
  );
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

function stockSignalLabel(status) {
  if (status === "sold_out") return "売り切れ報告";
  if (status === "low") return "残り少なめ";
  if (status === "in_stock") return "在庫あり";
  if (status === "restocked") return "補充あり";
  return "在庫シグナル";
}
