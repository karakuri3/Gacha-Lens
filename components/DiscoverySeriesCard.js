import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import {
  formatMarketEvidenceValue,
  formatSchedule,
  formatYen,
  hasPriceRankingEvidence,
} from "@/lib/domain/public-display-clean";
import { seriesHref } from "@/lib/variant-url";

export default function DiscoverySeriesCard({ item, priority = false }) {
  const maker = [item?.brand, item?.franchise].filter(Boolean).join(" / ") || item?.category || "ガチャ";
  const lineupCount = Number(item?.lineup_count ?? item?.variant_count ?? item?.variants?.length ?? 0);
  const schedule = formatSchedule(item);
  const price = Number(item?.price);
  const hasPrice = Number.isFinite(price) && price > 0;
  const marketEvidence = hasPriceRankingEvidence(item) ? formatMarketEvidenceValue(item.market_evidence) : "";

  return (
    <Link href={seriesHref(item)} className="consumer-discovery-card">
      <div className="consumer-discovery-card__media">
        <ProductImage
          item={undefined}
          src={item?.image_url || item?.imageUrl}
          imageScope="series"
          alt={item?.name || "ガチャ商品"}
          priority={priority}
          sizes="(max-width: 720px) 50vw, (max-width: 1100px) 33vw, 25vw"
          emptyLabel="商品画像なし"
        />
      </div>
      <div className="consumer-discovery-card__body">
        <p className="consumer-discovery-card__maker">{maker}</p>
        <h3>{item?.name}</h3>
        <div className="consumer-discovery-card__facts">
          {hasPrice ? <strong>{formatYen(price)}</strong> : <strong>価格未確認</strong>}
          {schedule !== "未定" ? <span>{schedule}</span> : <span>発売時期 未定</span>}
        </div>
        {lineupCount > 0 ? <p className="consumer-discovery-card__lineup">全{lineupCount.toLocaleString("ja-JP")}種</p> : null}
        <p className={`consumer-discovery-card__market ${marketEvidence ? "has-evidence" : "is-collecting"}`}>
          {marketEvidence ? `相場 ${marketEvidence}` : "相場データ収集中"}
        </p>
      </div>
    </Link>
  );
}
