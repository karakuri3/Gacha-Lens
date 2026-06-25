import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import {
  buildReleasedCustomerMetrics,
  buildUpcomingCustomerMetrics,
  customerTags,
} from "@/lib/domain/public-display";

export default function SeriesCard({ series }) {
  const isReleased = Boolean(series.is_released ?? series.isReleased);
  const metrics = isReleased ? buildReleasedCustomerMetrics(series).slice(0, 4) : buildUpcomingCustomerMetrics(series).slice(0, 4);
  const tags = customerTags(series, isReleased);

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
