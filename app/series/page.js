import Link from "next/link";
import SeriesCard from "@/components/SeriesCard";
import { getSeriesList } from "@/lib/series";
import { isCirculatingItem, opportunityScore, watchScore } from "@/lib/domain/public-display-clean";

export const metadata = {
  title: "単品一覧 | Gacha Lens",
  description: "発売中と発売予定のガチャ単品を、価格・相場・利益・在庫・期待値で探せます。",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

const filters = [
  { value: "all", label: "すべて" },
  { value: "released", label: "発売中" },
  { value: "circulating", label: "今出回っている" },
  { value: "profitable", label: "利益目安あり" },
  { value: "upcoming", label: "発売予定" },
  { value: "opportunity", label: "狙い目" },
];

const sorts = [
  { value: "recommended", label: "おすすめ順" },
  { value: "watch", label: "今見るべき順" },
  { value: "profit", label: "利益順" },
  { value: "opportunity", label: "狙い目順" },
  { value: "release", label: "発売月順" },
];

const PAGE_SIZE = 120;

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

  const counts = Object.fromEntries(filters.map((item) => [item.value, series.filter((entry) => matchesFilter(entry, item.value)).length]));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = clampPage(params?.page, totalPages);
  const startIndex = (page - 1) * PAGE_SIZE;
  const visibleItems = filtered.slice(startIndex, startIndex + PAGE_SIZE);
  const hasPagination = filtered.length > PAGE_SIZE;
  const displayStart = filtered.length ? startIndex + 1 : 0;
  const displayEnd = startIndex + visibleItems.length;

  return (
    <main className="site-main">
      <div className="site-shell">
        <section className="page-hero">
          <p className="eyebrow">SEARCH</p>
          <h1 className="page-title">ガチャ単品を探す</h1>
          <p className="page-lead">過去商品も含めて、価格・相場・利益・在庫・期待値で絞り込めます。</p>
        </section>

        <form className="card form-panel" action="/series" method="get">
          <div className="form-grid">
            <div className="field">
              <label htmlFor="q">キーワード</label>
              <input id="q" name="q" defaultValue={q} placeholder="単品名 / シリーズ名 / レア種別" />
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
            <h2 className="section-title">
              {filtered.length
                ? `全${filtered.length.toLocaleString("ja-JP")}件中 ${displayStart.toLocaleString("ja-JP")}-${displayEnd.toLocaleString("ja-JP")}件`
                : "0件"}
            </h2>
            <p className="section-sub">過去商品もページを切り替えて確認できます。カード全体をクリックすると詳細へ移動します。</p>
          </div>
        </div>

        {filtered.length > 0 ? (
          <>
            <section className="grid grid--cards">
              {visibleItems.map((item) => (
                <SeriesCard key={item.slug} series={item} />
              ))}
            </section>
            {hasPagination ? (
              <Pagination page={page} totalPages={totalPages} q={q} filter={filter} sort={sort} />
            ) : null}
          </>
        ) : (
          <div className="card empty">条件に合う単品がありません。</div>
        )}
      </div>
    </main>
  );
}

function matchesFilter(item, filter) {
  if (filter === "released") return item.is_released;
  if (filter === "upcoming") return !item.is_released;
  if (filter === "profitable") return item.is_released && Number.isFinite(item.profit_estimate) && item.profit_estimate > 0;
  if (filter === "circulating") return isCirculatingItem(item);
  if (filter === "opportunity") return !item.is_released && opportunityScore(item) >= 60;
  return true;
}

function matchesKeyword(item, q) {
  if (!q) return true;
  const target = [item.name, item.variant_name, item.series_name, item.brand, item.character, item.category, item.rarity, item.role].join(" ").toLowerCase();
  return target.includes(q.toLowerCase());
}

function compareSeries(a, b, sort) {
  if (sort === "profit") return (b.profit_estimate ?? -Infinity) - (a.profit_estimate ?? -Infinity);
  if (sort === "watch") return watchScore(b) - watchScore(a);
  if (sort === "opportunity") return opportunityScore(b) - opportunityScore(a);
  if (sort === "release") return getReleaseSortValue(a) - getReleaseSortValue(b);
  return displayPriority(b) - displayPriority(a);
}

function displayPriority(item) {
  if (!item.is_released) return opportunityScore(item) * 12 + (item.forecast_score ?? 0) * 3;
  return watchScore(item) * 12 + Math.max(0, item.profit_estimate ?? 0) * 0.7;
}

function getReleaseSortValue(item) {
  if (item.release_date) return new Date(item.release_date).getTime();
  const matched = String(item.schedule_month || "").match(/\d+/);
  return matched ? Number(matched[0]) : 999;
}

function Pagination({ page, totalPages, q, filter, sort }) {
  const pages = buildPageWindow(page, totalPages);
  return (
    <nav className="pagination" aria-label="ページ">
      <Link
        className={`pill-link ${page <= 1 ? "is-disabled" : ""}`}
        href={pageHref({ q, filter, sort, page: Math.max(1, page - 1) })}
        aria-disabled={page <= 1}
      >
        前へ
      </Link>
      <div className="pagination__pages">
        {pages.map((item) => (
          <Link
            key={item}
            className={`pill-link ${item === page ? "is-active" : ""}`}
            href={pageHref({ q, filter, sort, page: item })}
          >
            {item.toLocaleString("ja-JP")}
          </Link>
        ))}
      </div>
      <Link
        className={`pill-link ${page >= totalPages ? "is-disabled" : ""}`}
        href={pageHref({ q, filter, sort, page: Math.min(totalPages, page + 1) })}
        aria-disabled={page >= totalPages}
      >
        次へ
      </Link>
    </nav>
  );
}

function pageHref({ q, filter, sort, page }) {
  return {
    pathname: "/series",
    query: {
      q: q || undefined,
      filter,
      sort,
      page: page > 1 ? page : undefined,
    },
  };
}

function buildPageWindow(page, totalPages) {
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function clampPage(value, totalPages) {
  const page = Number.parseInt(String(value ?? "1"), 10);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(page, totalPages);
}
