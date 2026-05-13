import Link from "next/link";
import SeriesCard from "@/components/SeriesCard";
import { getSeriesList } from "@/lib/series";

export const metadata = {
  title: "単品一覧 | Gacha Lens",
  description: "発売中、発売予定のガチャ個別種を検索、絞り込みできます。",
};

const filters = [
  { value: "all", label: "すべて" },
  { value: "released", label: "発売中" },
  { value: "upcoming", label: "発売予定" },
  { value: "profitable", label: "利益あり" },
];

const sorts = [
  { value: "recommended", label: "おすすめ順" },
  { value: "forecast", label: "予想スコア順" },
  { value: "profit", label: "利益目安順" },
  { value: "release", label: "発売月順" },
];

export default async function SeriesPage({ searchParams }) {
  const params = await searchParams;
  const q = String(params?.q ?? "").trim();
  const filter = filters.some((item) => item.value === params?.filter) ? params.filter : "all";
  const sort = sorts.some((item) => item.value === params?.sort) ? params.sort : "recommended";
  const series = await getSeriesList();

  const filtered = series
    .filter((item) => matchesFilter(item, filter))
    .filter((item) => matchesKeyword(item, q))
    .sort((a, b) => compareSeries(a, b, sort));

  const counts = {
    all: series.length,
    released: series.filter((item) => item.is_released).length,
    upcoming: series.filter((item) => !item.is_released).length,
    profitable: series.filter((item) => item.is_released && (item.profit_estimate ?? 0) > 0).length,
  };

  return (
    <main className="site-main">
      <div className="site-shell">
        <section className="page-hero">
          <p className="eyebrow">SEARCH</p>
          <h1 className="page-title">単品を探す</h1>
          <p className="page-lead">キャラ、レア、シークレット、限定カラーを個別に比較できます。</p>
        </section>

        <form className="card form-panel" action="/series" method="get">
          <div className="form-grid">
            <div className="field">
              <label htmlFor="q">キーワード</label>
              <input id="q" name="q" defaultValue={q} placeholder="単品名 / 親シリーズ / レア種別" />
            </div>
            <div className="field">
              <label htmlFor="filter">表示</label>
              <select id="filter" name="filter" defaultValue={filter}>
                {filters.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="sort">並び替え</label>
              <select id="sort" name="sort" defaultValue={sort}>
                {sorts.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="tag-row">
            <button className="button-link button-link--dark" type="submit">この条件で見る</button>
            <Link href="/series" className="button-link">リセット</Link>
          </div>
        </form>

        <div className="tabs">
          {filters.map((item) => (
            <Link
              key={item.value}
              className={`pill-link ${filter === item.value ? "is-active" : ""}`}
              href={{ pathname: "/series", query: { q: q || undefined, sort, filter: item.value } }}
            >
              {item.label}
              <span style={{ marginLeft: 8, opacity: 0.72 }}>{counts[item.value]}</span>
            </Link>
          ))}
        </div>

        <div className="section-head">
          <div>
            <h2 className="section-title">{filtered.length}件</h2>
            <p className="section-sub">カード全体をクリックすると単品詳細へ移動します。</p>
          </div>
        </div>

        {filtered.length > 0 ? (
          <section className="grid grid--cards">
            {filtered.map((item) => (
              <SeriesCard key={item.slug} series={item} />
            ))}
          </section>
        ) : (
          <div className="card empty">条件に合う商品がありません。</div>
        )}
      </div>
    </main>
  );
}

function matchesFilter(item, filter) {
  if (filter === "released") return item.is_released;
  if (filter === "upcoming") return !item.is_released;
  if (filter === "profitable") return item.is_released && (item.profit_estimate ?? 0) > 0;
  return true;
}

function matchesKeyword(item, q) {
  if (!q) return true;
  const target = [item.name, item.variant_name, item.series_name, item.brand, item.character, item.category, item.rarity, item.role].join(" ").toLowerCase();
  return target.includes(q.toLowerCase());
}

function compareSeries(a, b, sort) {
  if (sort === "forecast") return (b.forecast_score ?? 0) - (a.forecast_score ?? 0);
  if (sort === "profit") return (b.profit_estimate ?? -Infinity) - (a.profit_estimate ?? -Infinity);
  if (sort === "release") return getReleaseSortValue(a) - getReleaseSortValue(b);

  const scoreA = a.is_released ? a.profit_estimate ?? 0 : a.forecast_score ?? 0;
  const scoreB = b.is_released ? b.profit_estimate ?? 0 : b.forecast_score ?? 0;
  return scoreB - scoreA;
}

function getReleaseSortValue(item) {
  if (item.release_date) return new Date(item.release_date).getTime();
  const order = ["10月", "11月", "12月", "1月", "2月", "3月"].indexOf(item.schedule_month);
  return order >= 0 ? order : 999;
}
