import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import { getRankingSeries } from "@/lib/series";
import { formatYen } from "@/lib/domain/public-display-clean";
import { variantHref } from "@/lib/variant-url";

export const metadata = {
  title: "再販・再入荷情報 | Gacha Lens",
  description: "確認できたガチャの再販・再入荷情報を商品ごとに掲載します。",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RestocksPage() {
  const items = await getRankingSeries("released");
  const rows = dedupeEvents(items.flatMap((item) => (item.restock_events ?? []).map((event) => ({ item, event }))))
    .filter(({ event }) => !event.review_required)
    .sort((a, b) => dateValue(b.event.reported_at) - dateValue(a.event.reported_at));

  return (
    <main className="site-main">
      <div className="site-shell">
        <section className="page-hero">
          <p className="eyebrow">RESTOCK</p>
          <h1 className="page-title">再販・再入荷情報</h1>
          <p className="page-lead">確認できた再販・補充の動きを、新しい情報から掲載しています。</p>
        </section>

        {rows.length ? (
          <section className="signal-list" aria-label="再販・再入荷一覧">
            {rows.map(({ item, event }, index) => (
              <Link key={event.id || `${item.variant_id}-${event.reported_at}`} href={variantHref(item)} className="signal-row">
                <div className="signal-row__image"><ProductImage src={item.image_url} alt={item.name} priority={index < 4} /></div>
                <div className="signal-row__main">
                  <span className="signal-row__badge">{event.event_label || restockLabel(event.event_type)}</span>
                  <h2>{item.name}</h2>
                  <p>{item.series_name}</p>
                </div>
                <dl className="signal-row__facts">
                  <div><dt>確認日</dt><dd>{formatDate(event.reported_at)}</dd></div>
                  <div><dt>場所</dt><dd>{placeLabel(event)}</dd></div>
                  <div><dt>定価</dt><dd>{formatYen(item.price)}</dd></div>
                  <div><dt>メーカー</dt><dd>{item.brand || "未登録"}</dd></div>
                </dl>
              </Link>
            ))}
          </section>
        ) : (
          <div className="card empty">
            <strong>確認できる再販・再入荷情報はまだありません</strong>
            <span>情報が確認でき次第、このページに追加されます。</span>
            <Link href="/schedule" className="button-link">発売予定を見る</Link>
          </div>
        )}
      </div>
    </main>
  );
}

function dedupeEvents(rows) {
  return [...new Map(rows.map((row) => [row.event.id || `${row.item.variant_id}-${row.event.reported_at}-${row.event.shop_name}`, row])).values()];
}

function restockLabel(type) {
  if (type === "refill") return "補充";
  if (type === "restock") return "再入荷";
  return "再販・再入荷";
}

function placeLabel(event) {
  return [event.region, event.shop_name].filter(Boolean).join(" / ") || "場所未登録";
}

function dateValue(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatDate(value) {
  const time = dateValue(value);
  if (!time) return "時期未定";
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "numeric", day: "numeric", timeZone: "Asia/Tokyo" }).format(new Date(time));
}
