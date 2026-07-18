import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import { getRankingSeries } from "@/lib/series";
import { variantHref } from "@/lib/variant-url";

export const metadata = {
  title: "在庫目撃情報 | Gacha Lens",
  description: "店舗や地域ごとに確認されたガチャの在庫目撃情報を探せます。",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StockPage({ searchParams }) {
  const params = await searchParams;
  const q = String(params?.q || "").trim().toLowerCase();
  const region = String(params?.region || "").trim();
  const status = String(params?.status || "").trim();
  const items = await getRankingSeries("released");
  const allRows = dedupeReports(items.flatMap((item) => (item.stock_reports ?? []).map((report) => ({ item, report }))))
    .filter(({ report }) => !report.review_required)
    .sort((a, b) => dateValue(b.report.reported_at) - dateValue(a.report.reported_at));
  const regions = [...new Set(allRows.map(({ report }) => report.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja"));
  const statuses = [...new Set(allRows.map(({ report }) => report.status).filter((value) => value && value !== "unknown"))];
  const rows = allRows.filter(({ item, report }) => {
    const searchText = [item.name, item.series_name, report.shop_name, report.region].join(" ").toLowerCase();
    return (!q || searchText.includes(q)) && (!region || report.region === region) && (!status || report.status === status);
  });

  return (
    <main className="site-main">
      <div className="site-shell">
        <section className="page-hero">
          <p className="eyebrow">STOCK SIGHTING</p>
          <h1 className="page-title">在庫目撃情報</h1>
          <p className="page-lead">商品名や地域から、直近に確認された店頭在庫の動きを探せます。</p>
        </section>

        <form className="card stock-filter" action="/stock" method="get">
          <label><span>商品・店舗</span><input name="q" defaultValue={params?.q || ""} placeholder="商品名や店舗名" /></label>
          <label><span>地域</span><select name="region" defaultValue={region}><option value="">すべて</option>{regions.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>在庫状況</span><select name="status" defaultValue={status}><option value="">すべて</option>{statuses.map((value) => <option key={value} value={value}>{stockLabel(value)}</option>)}</select></label>
          <button className="button-link button-link--accent" type="submit">絞り込む</button>
        </form>

        <p className="stock-caution">目撃時点の情報であり、現在の在庫を保証するものではありません。</p>

        {rows.length ? (
          <section className="signal-list" aria-label="在庫目撃一覧">
            {rows.map(({ item, report }, index) => (
              <Link key={report.id || `${item.variant_id}-${report.reported_at}`} href={variantHref(item)} className="signal-row">
                <div className="signal-row__image"><ProductImage src={item.image_url} alt={item.name} priority={index < 4} /></div>
                <div className="signal-row__main">
                  <span className={`signal-row__badge stock-${report.status || "unknown"}`}>{report.status_label || stockLabel(report.status)}</span>
                  <h2>{item.name}</h2>
                  <p>{item.series_name}</p>
                </div>
                <dl className="signal-row__facts">
                  <div><dt>店舗</dt><dd>{report.shop_name || "店舗未登録"}</dd></div>
                  <div><dt>地域</dt><dd>{report.region || "地域未登録"}</dd></div>
                  <div><dt>目撃日時</dt><dd>{formatDateTime(report.reported_at)}</dd></div>
                  <div><dt>状況</dt><dd>{report.status_label || stockLabel(report.status)}</dd></div>
                </dl>
              </Link>
            ))}
          </section>
        ) : (
          <div className="card empty">
            <strong>条件に合う在庫目撃情報はありません</strong>
            <span>条件を変えるか、商品一覧から探してください。</span>
            <Link href="/stock" className="button-link">条件をリセット</Link>
          </div>
        )}
      </div>
    </main>
  );
}

function dedupeReports(rows) {
  return [...new Map(rows.map((row) => [row.report.id || `${row.item.variant_id}-${row.report.reported_at}-${row.report.shop_name}`, row])).values()];
}

function stockLabel(value) {
  if (value === "in_stock") return "在庫あり";
  if (value === "low_stock") return "残りわずか";
  if (value === "sold_out") return "売り切れ";
  if (value === "refilled") return "補充確認";
  return "状況確認中";
}

function dateValue(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatDateTime(value) {
  const time = dateValue(value);
  if (!time) return "日時未登録";
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" }).format(new Date(time));
}
