export default function PriceHistoryTable({ observations = [] }) {
  const rows = buildRows(observations);
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

function buildRows(observations) {
  const groups = new Map();
  for (const observation of observations) {
    const price = Number(observation.price);
    const timestamp = new Date(observation.observed_at || observation.created_at).getTime();
    if (!Number.isFinite(price) || !Number.isFinite(timestamp)) continue;
    const date = new Date(timestamp).toISOString().slice(0, 10);
    const current = groups.get(date) ?? { prices: [], sold: 0 };
    current.prices.push(price);
    if (String(observation.status || "").toLowerCase() === "sold") current.sold += 1;
    groups.set(date, current);
  }
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 30).map(([date, group]) => ({
    date,
    average: Math.round(group.prices.reduce((total, value) => total + value, 0) / group.prices.length),
    high: Math.max(...group.prices),
    low: Math.min(...group.prices),
    count: group.prices.length,
    sold: group.sold,
  }));
}

function formatYen(value) {
  return Number.isFinite(value) ? `${Math.round(value).toLocaleString("ja-JP")}円` : "未取得";
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Tokyo" }).format(new Date(`${value}T00:00:00Z`));
}
