import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import { seriesHref, variantHref } from "@/lib/variant-url";
import {
  buildReleasedCustomerMetrics,
  buildUpcomingCustomerMetrics,
  customerTags,
} from "@/lib/domain/public-display-clean";

export default function SeriesCard({ series, priority = false, scope = "variant" }) {
  const isReleased = Boolean(series.is_released ?? series.isReleased);
  const isSeries = scope === "series" || series.entity_type === "series";
  const metrics = visibleCardMetrics(
    isReleased ? buildReleasedCustomerMetrics(series) : buildUpcomingCustomerMetrics(series),
    isReleased
  );
  const tags = customerTags(series, isReleased);

  return (
    <Link
      href={isSeries ? seriesHref(series) : variantHref(series)}
      className="card product-card"
      prefetch={false}
    >
      <div className="product-image">
        <ProductImage
          item={isSeries ? undefined : series}
          src={series.image_url || series.imageUrl}
          fallbackSrc={isSeries ? "" : series.series_image_url}
          imageScope={isSeries ? "series" : series.image_scope}
          alt={series.name}
          priority={priority}
          emptyLabel="画像なし"
        />
      </div>
      <div className="product-card__identity">
        <div className="tag-row product-card__status">
          <span className="tag">{isReleased ? "発売中" : "発売予定"}</span>
          <span className="tag">{isSeries ? "シリーズ" : (series.rarity || series.category || "単品")}</span>
        </div>
        <h3 className="product-name">{series.name}</h3>
        <div className="product-meta">
          {isSeries
            ? `${series.brand || series.character || "公式商品"} / ${series.variant_count ? `${series.variant_count}種` : "ラインナップ確認中"}`
            : `${series.series_name ?? series.brand} / ${series.role ?? series.character}`}
        </div>
      </div>
      {metrics.length > 0 ? (
        <dl className="product-evidence" aria-label="商品データ">
          {metrics.map((metric) => (
            <div key={metric.label} className="product-evidence__row">
              <dt>{metric.label}</dt>
              <dd className={metric.tone ? `is-${metric.tone}` : ""}>{metric.value}</dd>
              {metric.meta ? <small>{metric.meta}</small> : null}
            </div>
          ))}
        </dl>
      ) : null}
      {tags.length > 0 ? (
        <div className="tag-row product-card__signals">
          {tags.slice(0, 3).map((tag) => (
            <span key={tag} className="tag tag--signal">{tag}</span>
          ))}
        </div>
      ) : null}
    </Link>
  );
}

function visibleCardMetrics(metrics = [], isReleased) {
  const unavailable = new Set(["未取得", "データ不足", "算出待ち", "0点"]);
  return metrics
    .filter((metric) => {
      const value = String(metric?.value ?? "").trim();
      return Boolean(value) && !unavailable.has(value) && !value.includes("データ不足");
    })
    .slice(0, isReleased ? 3 : 3);
}
