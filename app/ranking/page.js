import Link from "next/link";
import { getSeriesList } from "@/lib/series";

export const metadata = {
  title: "ランキング | Gacha Lens",
  description: "発売中は単品利益、発売予定は予想スコアで並べる個別種ランキングです。",
};

const tabs = [
  { value: "released", label: "発売中", caption: "実績" },
  { value: "upcoming", label: "発売予定", caption: "期待値" },
];

export default async function RankingPage({ searchParams }) {
  const params = await searchParams;
  const tab = params?.tab === "upcoming" ? "upcoming" : "released";
  const series = await getSeriesList();

  const ranked = series
    .filter((item) => (tab === "released" ? item.is_released : !item.is_released))
    .sort((a, b) => {
      const primaryA = tab === "released" ? a.profit_estimate ?? -Infinity : a.forecast_score ?? -Infinity;
      const primaryB = tab === "released" ? b.profit_estimate ?? -Infinity : b.forecast_score ?? -Infinity;
      if (primaryB !== primaryA) return primaryB - primaryA;
      return a.name.localeCompare(b.name, "ja");
    })
    .map((item, index) => ({ ...item, rank: index + 1 }));

  const podium = arrangePodium(ranked.slice(0, 3));
  const rest = ranked.slice(3);

  return (
    <main className="site-main">
      <div className="site-shell">
        <section className="page-hero">
          <p className="eyebrow">RANKING</p>
          <h1 className="page-title">強い単品が一目で分かるランキング</h1>
          <p className="page-lead">
            中身の個別種ごとに評価。発売中と発売予定で見るべき指標を分けます。
          </p>
        </section>

        <div className="tabs">
          {tabs.map((item) => (
            <Link
              key={item.value}
              href={{ pathname: "/ranking", query: { tab: item.value } }}
              className={`pill-link ${tab === item.value ? "is-active" : ""}`}
            >
              {item.label}
              <span style={{ marginLeft: 8, opacity: 0.72, fontSize: 12 }}>{item.caption}</span>
            </Link>
          ))}
        </div>

        <section className="grid grid--3 podium">
          {podium.map((item) => (
            <RankingCard key={item.slug} item={item} mode={tab} large />
          ))}
        </section>

        <section className="grid">
          {rest.map((item) => (
            <RankingRow key={item.slug} item={item} mode={tab} />
          ))}
        </section>
      </div>
    </main>
  );
}

function RankingCard({ item, mode }) {
  const metrics = getMetrics(item, mode);

  return (
    <Link href={`/series/${item.slug}`} className={`card product-card rank-${item.rank}`}>
      <span className={`rank-medal rank-medal--${item.rank}`}>{item.rank}位</span>
      <div className="product-image">
        <ProductImage src={item.image_url} alt={item.name} />
      </div>
      <div>
        <h2 className="product-name">{item.name}</h2>
        <div className="product-meta">
          {item.series_name} / {item.rarity}
        </div>
      </div>
      {mode === "upcoming" ? <ForecastTags item={item} /> : null}
      {mode === "released" ? <StockSignal summary={item.stock_summary || item.availability_summary} /> : null}
      <MetricGrid metrics={metrics} />
    </Link>
  );
}

function RankingRow({ item, mode }) {
  return (
    <Link href={`/series/${item.slug}`} className="card rank-row">
      <div className="rank-number">#{item.rank}</div>
      <div className="product-image">
        <ProductImage src={item.image_url} alt={item.name} />
      </div>
      <div>
        <h2 className="product-name">{item.name}</h2>
        <div className="product-meta">
          {item.series_name} / {item.rarity}
        </div>
        {mode === "upcoming" ? <ForecastTags item={item} compact /> : null}
        {mode === "released" ? <StockSignal summary={item.stock_summary || item.availability_summary} /> : null}
      </div>
      <MetricGrid metrics={getMetrics(item, mode)} />
    </Link>
  );
}

function ProductImage({ src, alt }) {
  return src ? <img src={src} alt={alt} /> : <span className="image-placeholder">NO IMAGE</span>;
}

function ForecastTags({ item, compact = false }) {
  return (
    <div className="tag-row" style={{ marginTop: compact ? 10 : 0 }}>
      {(item.forecast_tags ?? []).slice(0, compact ? 3 : 4).map((tag) => (
        <span key={tag} className="tag">
          {tag}
        </span>
      ))}
    </div>
  );
}

function StockSignal({ summary }) {
  if (!summary?.has_stock_signal && !summary?.has_restock_signal) return null;
  return (
    <div className={`stock-signal stock-signal--${summary.latest_stock_status || "unknown"}`} style={{ marginTop: 10 }}>
      <strong>{stockSignalLabel(summary.latest_stock_status)}</strong>
      <span>{summary.latest_region || summary.latest_shop_name || "signal"} / {summary.source_strength ?? 0}</span>
    </div>
  );
}

function MetricGrid({ metrics }) {
  return (
    <div className="metric-grid">
      {metrics.map((metric) => (
        <div key={metric.label} className="metric">
          <div className="metric__label">{metric.label}</div>
          <div className={`metric__value ${metric.tone ? `is-${metric.tone}` : ""}`}>{metric.value}</div>
        </div>
      ))}
    </div>
  );
}

function getMetrics(item, mode) {
  if (mode === "released") {
    return [
      { label: "利益目安", value: formatDiff(item.profit_estimate), tone: getDiffTone(item.profit_estimate) },
      { label: "単品相場", value: formatYen(item.market_price_median) },
      { label: "価格", value: formatYen(item.price) },
      { label: "コンプ相場", value: formatYen(item.market_summary?.complete_set) },
    ];
  }

  return [
    { label: "予想スコア", value: formatScore(item.forecast_score), tone: "highlight" },
    { label: "コンプ需要", value: formatScore(item.complete_set_score) },
    { label: "当たり枠", value: formatScore(item.ace_character_score) },
    { label: "互換性", value: formatScore(item.compatibility_score) },
    { label: "限定性", value: formatScore(item.limitedness_score) },
    { label: "予約気配", value: formatScore(item.preorder_signal_score) },
  ];
}

function arrangePodium(items) {
  if (items.length < 3) return items;
  return [items[1], items[0], items[2]];
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

function stockSignalLabel(status) {
  if (status === "sold_out") return "売り切れ報告";
  if (status === "low") return "残り少なめ";
  if (status === "in_stock") return "在庫あり";
  if (status === "restocked") return "補充あり";
  return "在庫シグナル";
}
