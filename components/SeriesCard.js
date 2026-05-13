import Link from "next/link";

export default function SeriesCard({ series }) {
  const isReleased = Boolean(series.is_released ?? series.isReleased);
  const metrics = isReleased
    ? [
        { label: "利益目安", value: formatDiff(series.profit_estimate), tone: getDiffTone(series.profit_estimate) },
        { label: "単品相場", value: formatYen(series.market_price_median ?? series.marketPriceMedian) },
        { label: "価格", value: formatYen(series.price) },
        { label: "親シリーズ", value: series.series_name ?? formatMonthWeek(series) },
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
        <img src={series.image_url || series.imageUrl} alt={series.name} />
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
      {!isReleased && Array.isArray(series.forecast_tags) ? (
        <div className="tag-row">
          {series.forecast_tags.slice(0, 3).map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </Link>
  );
}

function formatYen(value) {
  return Number.isFinite(value) ? `${Math.round(value).toLocaleString("ja-JP")}円` : "未登録";
}

function formatDiff(value) {
  if (!Number.isFinite(value)) return "未登録";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("ja-JP")}円`;
}

function formatScore(value) {
  return Number.isFinite(value) ? `${Math.round(value)}点` : "未登録";
}

function getDiffTone(value) {
  if (!Number.isFinite(value)) return "";
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "";
}

function formatMonthWeek(series) {
  return `${series.schedule_month ?? ""} ${series.schedule_week ?? ""}`.trim() || "未定";
}
