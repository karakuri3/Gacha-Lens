import Link from "next/link";
import SeriesCard from "@/components/SeriesCard";
import { getRankingSeries, getSeriesCatalogCounts, getSeriesCatalogPage } from "@/lib/series";
import { isCirculatingItem, opportunityScore, watchScore } from "@/lib/domain/public-display-clean";

export const metadata = {
  title: "ガチャ図鑑 | Gacha Lens",
  description: "発売中と発売予定のガチャ単品を、価格・話題度・在庫・発売情報で探せます。",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

const filters = [
  { value: "all", label: "すべて" },
  { value: "released", label: "発売中" },
  { value: "circulating", label: "今出回っている" },
  { value: "market", label: "相場データあり" },
  { value: "upcoming", label: "発売予定" },
  { value: "opportunity", label: "先行注目" },
];

const sorts = [
  { value: "recommended", label: "おすすめ順" },
  { value: "watch", label: "注目度順" },
  { value: "market", label: "参考相場順" },
  { value: "opportunity", label: "先行注目順" },
  { value: "release", label: "発売月順" },
];

const PAGE_SIZE = 120;

export default async function SeriesPage({ searchParams }) {
  const params = await searchParams;
  const q = String(params?.q ?? "").trim();
  const filter = filters.some((item) => item.value === params?.filter) ? params.filter : "all";
  const sort = sorts.some((item) => item.value === params?.sort) ? params.sort : "recommended";
  const requestedPage = Math.max(1, Number.parseInt(String(params?.page ?? "1"), 10) || 1);
  const useDatabaseCatalog = ["all", "released", "upcoming"].includes(filter) && ["recommended", "release"].includes(sort);
  const signalMode = ["circulating", "market", "released"].includes(filter) || ["watch", "market"].includes(sort)
    ? "released"
    : "upcoming";
  const [series, catalogPage, catalogCounts] = await Promise.all([
    useDatabaseCatalog ? Promise.resolve([]) : getRankingSeries(signalMode),
    useDatabaseCatalog
      ? getSeriesCatalogPage({ q, filter, sort, page: requestedPage, pageSize: PAGE_SIZE })
      : Promise.resolve(null),
    getSeriesCatalogCounts(),
  ]);

  const filtered = catalogPage
    ? catalogPage.items
    : series
        .filter((item) => matchesFilter(item, filter))
        .filter((item) => matchesKeyword(item, q))
        .sort((a, b) => compareSeries(a, b, sort));

  const counts = Object.fromEntries(filters.map((item) => [item.value, series.filter((entry) => matchesFilter(entry, item.value)).length]));
  if (useDatabaseCatalog) {
    counts.circulating = null;
    counts.market = null;
    counts.opportunity = null;
  }
  if (catalogCounts) Object.assign(counts, catalogCounts);
  const totalCount = catalogPage?.total ?? filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const page = catalogPage?.page ?? clampPage(params?.page, totalPages);
  const startIndex = (page - 1) * PAGE_SIZE;
  const visibleItems = catalogPage ? filtered : filtered.slice(startIndex, startIndex + PAGE_SIZE);
  const hasPagination = totalCount > PAGE_SIZE;
  const displayStart = totalCount ? startIndex + 1 : 0;
  const displayEnd = startIndex + visibleItems.length;

  return (
    <main className="site-main">
      <div className="site-shell">
        <section className="page-hero">
          <p className="eyebrow">SEARCH</p>
          <h1 className="page-title">ガチャ図鑑</h1>
          <p className="page-lead">過去商品からこれからの新作まで、キャラクター名やシリーズ名で探せます。</p>
        </section>

        <form className="card form-panel catalog-filter-form" action="/series" method="get">
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
            <button className="button-link button-link--accent" type="submit">この条件で見る</button>
            <Link href="/series" className="button-link">リセット</Link>
          </div>
        </form>

        <div className="tabs catalog-filter-tabs">
          {filters.map((item) => (
            <Link
              key={item.value}
              className={`pill-link ${filter === item.value ? "is-active" : ""}`}
              href={{ pathname: "/series", query: { q: q || undefined, sort, filter: item.value } }}
            >
              {item.label}
              {Number.isFinite(counts[item.value]) ? (
                <span style={{ marginLeft: 8, opacity: 0.72 }}>{counts[item.value]}</span>
              ) : null}
            </Link>
          ))}
        </div>

        <div className="section-head catalog-results-head">
          <div>
            <h2 className="section-title">
              {totalCount
                ? `全${totalCount.toLocaleString("ja-JP")}件中 ${displayStart.toLocaleString("ja-JP")}-${displayEnd.toLocaleString("ja-JP")}件`
                : "0件"}
            </h2>
            <p className="section-sub">過去商品もページを切り替えて確認できます。カード全体をクリックすると詳細へ移動します。</p>
          </div>
        </div>

        {totalCount > 0 ? (
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
  if (filter === "market") return item.is_released && Number.isFinite(item.market_summary?.single);
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
  if (sort === "market") return (b.market_summary?.single ?? -Infinity) - (a.market_summary?.single ?? -Infinity);
  if (sort === "watch") return watchScore(b) - watchScore(a);
  if (sort === "opportunity") return opportunityScore(b) - opportunityScore(a);
  if (sort === "release") return getReleaseSortValue(a) - getReleaseSortValue(b);
  return displayPriority(b) - displayPriority(a);
}

function displayPriority(item) {
  if (!item.is_released) return opportunityScore(item) * 12 + (item.forecast_score ?? 0) * 3;
  return watchScore(item) * 12 + (item.circulation_score ?? 0) * 4;
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
