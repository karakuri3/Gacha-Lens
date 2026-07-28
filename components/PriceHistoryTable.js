import { buildPriceHistoryRows } from "@/lib/domain/market-observation-history";

export default function PriceHistoryTable({ observations = [] }) {
  const rows = buildPriceHistoryRows(observations);
  if (!rows.length) return null;

  return (
    <div className="price-history-table-wrap">
      <table className="price-history-table">
        <thead>
          <tr><th>日付</th><th>平均価格</th><th>最高価格</th><th>最安価格</th><th>観測件数</th><th>売れた数</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.date}>
              <td>{formatDate(row.date)}</td>
              <td>{formatYen(row.average)}</td>
              <td>{formatYen(row.high)}</td>
              <td>{formatYen(row.low)}</td>
              <td>{row.count.toLocaleString("ja-JP")}件</td>
              <td>{row.sold.toLocaleString("ja-JP")}件</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatYen(value) {
  return Number.isFinite(value) ? `${Math.round(value).toLocaleString("ja-JP")}円` : "未取得";
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Tokyo" }).format(new Date(`${value}T00:00:00Z`));
}
