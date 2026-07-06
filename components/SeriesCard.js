import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import { variantHref } from "@/lib/variant-url";
import {
  buildReleasedCustomerMetrics,
  buildUpcomingCustomerMetrics,
  customerTags,
} from "@/lib/domain/public-display-clean";

export default function SeriesCard({ series, priority = false }) {
  const isReleased = Boolean(series.is_released ?? series.isReleased);
  const metrics = visibleCardMetrics(
    isReleased ? buildReleasedCustomerMetrics(series) : buildUpcomingCustomerMetrics(series),
    isReleased
  );
  const tags = customerTags(series, isReleased);

  return (
    <Link href={variantHref(series)} className="card product-card">
      <div className="product-image">
        <ProductImage src={series.image_url || series.imageUrl} alt={series.name} priority={priority} />
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
      {tags.length > 0 ? (
        <div className="tag-row">
          {tags.map((tag) => (
            <span key={tag} className="tag tag--signal">{tag}</span>
          ))}
        </div>
      ) : null}
    </Link>
  );
}

function visibleCardMetrics(metrics = [], isReleased) {
  const unavailable = new Set(["未取得", "データ不足"]);
  const filtered = metrics.filter((metric) => !unavailable.has(metric.value));
  return (filtered.length ? filtered : metrics).slice(0, isReleased ? 4 : 3);
}
