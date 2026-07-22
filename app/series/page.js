import Link from "next/link";
import SeriesCard from "@/components/SeriesCard";
import { getCategoryCatalog, getParentSeriesCatalogPage, getRankingSeries, getSeriesCatalogCounts, getSeriesCatalogPage } from "@/lib/series";
import { isCirculatingItem, opportunityScore, watchScore } from "@/lib/domain/public-display-clean";
import {
  buildCatalogHref,
  formatCatalogMonth,
  hasActiveCatalogFilters,
  parseCatalogQuery,
  recordMatchesCatalogQuery,
} from "@/lib/domain/catalog-query";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_SIZE = 60;
const releaseOptions = [
  { value: "all", label: "すべて" },
  { value: "released", label: "発売中" },
  { value: "upcoming", label: "発売予定" },
];
const sortOptions = [
  { value: "relevance", label: "関連度順" },
  { value: "newest", label: "新着順" },
  { value: "price_asc", label: "定価が安い順" },
  { value: "price_desc", label: "定価が高い順" },
];

export async function generateMetadata({ searchParams }) {
  const query = parseCatalogQuery(await searchParams);
  const canonical = buildCatalogHref({
    scope: query.scope,
    release: query.release,
    category: query.category,
    month: query.month,
  });
  return {
    title: query.q ? `「${query.q}」の検索結果 | Gacha Lens` : "ガチャ一覧 | Gacha Lens",
    description: "商品名・作品名・シリーズ名・カテゴリ・発売月から、公開中のガチャを探せます。",
    alternates: { canonical },
    robots: query.q ? { index: false, follow: true } : { index: true, follow: true },
  };
}

export default async function SeriesPage({ searchParams }) {
  const query = parseCatalogQuery(await searchParams);
  const useSignalCatalog = Boolean(query.legacyMode);
  const signalMode = query.release === "upcoming" ? "upcoming" : "released";
  const [signalItems, catalogPage, catalogCounts, categories] = await Promise.all([
    useSignalCatalog ? getRankingSeries(signalMode, query.scope) : Promise.resolve([]),
    useSignalCatalog
      ? Promise.resolve(null)
      : (query.scope === "series" ? getParentSeriesCatalogPage : getSeriesCatalogPage)({ ...query, pageSize: PAGE_SIZE }),
    getSeriesCatalogCounts(),
    getCategoryCatalog(),
  ]);

  const filtered = catalogPage
    ? catalogPage.items
    : signalItems
        .filter((item) => matchesLegacyMode(item, query.legacyMode))
        .filter((item) => recordMatchesCatalogQuery(item, query, query.scope))
        .sort((a, b) => compareSignalItems(a, b, query.legacyMode));
  const totalCount = catalogPage?.total ?? filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const page = catalogPage?.page ?? Math.min(query.page, totalPages);
  const startIndex = (page - 1) * PAGE_SIZE;
  const visibleItems = catalogPage ? filtered : filtered.slice(startIndex, startIndex + PAGE_SIZE);
  const displayStart = totalCount ? startIndex + 1 : 0;
  const displayEnd = startIndex + visibleItems.length;
  const showGlobalCounts = query.scope === "variant" && !query.q && !query.category && !query.month && !query.legacyMode;

  return (
    <main className="site-main">
      <div className="site-shell">
        <section className="page-hero">
          <p className="eyebrow">SEARCH</p>
          <h1 className="page-title">ガチャを探す</h1>
          <p className="page-lead">商品名、作品名、キャラクター名、カテゴリ、発売月から探せます。</p>
        </section>

        <nav className="entity-scope-tabs" aria-label="検索単位">
          <Link href={buildCatalogHref(query, { scope: "variant" })} className={query.scope === "variant" ? "is-active" : ""} aria-current={query.scope === "variant" ? "page" : undefined}>
            <strong>単品から探す</strong><span>キャラクター・レア・シークレット</span>
          </Link>
          <Link href={buildCatalogHref(query, { scope: "series" })} className={query.scope === "series" ? "is-active" : ""} aria-current={query.scope === "series" ? "page" : undefined}>
            <strong>シリーズから探す</strong><span>ラインナップ・コンプ・発売情報</span>
          </Link>
        </nav>

        <form className="card form-panel catalog-filter-form" action="/series" method="get" role="search">
          <input type="hidden" name="scope" value={query.scope} />
          <div className="form-grid catalog-filter-grid">
            <div className="field catalog-keyword-field">
              <label htmlFor="catalog-q">キーワード</label>
              <input id="catalog-q" name="q" type="search" defaultValue={query.q} placeholder="商品名、作品名、キャラクター名で検索" />
            </div>
            <div className="field">
              <label htmlFor="catalog-release">発売状態</label>
              <select id="catalog-release" name="release" defaultValue={query.release}>
                {releaseOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="catalog-category">カテゴリ</label>
              <select id="catalog-category" name="category" defaultValue={query.category}>
                <option value="">すべて</option>
                {categories.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="catalog-month">発売月</label>
              <input id="catalog-month" name="month" type="month" defaultValue={query.month} />
            </div>
            <div className="field">
              <label htmlFor="catalog-sort">並び替え</label>
              <select id="catalog-sort" name="sort" defaultValue={query.sort}>
                {sortOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
          </div>
          <div className="catalog-filter-actions">
            <button className="button-link button-link--accent" type="submit">この条件で見る</button>
            <Link href="/series" className="button-link">条件をクリア</Link>
          </div>
        </form>

        <nav className="tabs catalog-filter-tabs" aria-label="発売状態">
          {releaseOptions.map((item) => (
            <Link
              key={item.value}
              className={`pill-link ${query.release === item.value ? "is-active" : ""}`}
              href={buildCatalogHref(query, { release: item.value, legacyMode: "", filter: "" })}
              aria-current={query.release === item.value ? "page" : undefined}
            >
              {item.label}
              {showGlobalCounts && Number.isFinite(catalogCounts?.[item.value]) ? <span>{catalogCounts[item.value].toLocaleString("ja-JP")}</span> : null}
            </Link>
          ))}
        </nav>

        {hasActiveCatalogFilters(query) ? <ActiveFilters query={query} /> : null}

        <div className="section-head catalog-results-head">
          <div>
            <h2 className="section-title">
              {query.q
                ? `「${query.q}」の検索結果 ${totalCount.toLocaleString("ja-JP")}件`
                : totalCount
                  ? `全${totalCount.toLocaleString("ja-JP")}件中 ${displayStart.toLocaleString("ja-JP")}-${displayEnd.toLocaleString("ja-JP")}件`
                  : "検索結果 0件"}
            </h2>
            <p className="section-sub">{query.scope === "variant" ? "正式公開された単品だけを表示しています。" : "親シリーズ単位で表示しています。"}</p>
          </div>
        </div>

        {totalCount > 0 ? (
          <>
            <section className="grid grid--cards">
              {visibleItems.map((item, index) => <SeriesCard key={item.slug} series={item} priority={index < 6} scope={query.scope} />)}
            </section>
            {totalCount > PAGE_SIZE ? <Pagination page={page} totalPages={totalPages} query={query} /> : null}
          </>
        ) : (
          <div className="card empty catalog-empty">
            <strong>条件に一致する商品が見つかりませんでした</strong>
            <span>キーワードを短くするか、カテゴリ・発売状態・発売月を解除してください。</span>
            <Link href="/series" className="button-link button-link--accent">条件をすべてクリア</Link>
          </div>
        )}
      </div>
    </main>
  );
}

function ActiveFilters({ query }) {
  const values = [
    query.q ? `検索: ${query.q}` : "",
    query.scope === "series" ? "シリーズ" : "",
    query.release === "released" ? "発売中" : query.release === "upcoming" ? "発売予定" : "",
    query.category ? `カテゴリ: ${query.category}` : "",
    query.month ? `発売月: ${formatCatalogMonth(query.month)}` : "",
  ].filter(Boolean);
  return (
    <div className="active-filter-row" aria-label="適用中の条件">
      <strong>適用中</strong>
      {values.map((value) => <span key={value}>{value}</span>)}
      <Link href="/series">すべて解除</Link>
    </div>
  );
}

function matchesLegacyMode(item, mode) {
  if (mode === "market") return item.is_released && item.market_evidence?.tier !== "insufficient";
  if (mode === "circulating") return isCirculatingItem(item);
  if (mode === "opportunity") return !item.is_released && opportunityScore(item) >= 60;
  return true;
}

function compareSignalItems(a, b, mode) {
  if (mode === "market") return (b.market_evidence?.primaryPrice ?? -Infinity) - (a.market_evidence?.primaryPrice ?? -Infinity);
  if (mode === "opportunity") return opportunityScore(b) - opportunityScore(a);
  return watchScore(b) - watchScore(a);
}

function Pagination({ page, totalPages, query }) {
  const pages = buildPageWindow(page, totalPages);
  return (
    <nav className="pagination" aria-label="検索結果のページ">
      <Link className={`pill-link ${page <= 1 ? "is-disabled" : ""}`} href={buildCatalogHref(query, { page: Math.max(1, page - 1) }, { resetPage: false })} aria-disabled={page <= 1}>前へ</Link>
      <div className="pagination__pages">
        {pages.map((item) => (
          <Link key={item} className={`pill-link ${item === page ? "is-active" : ""}`} href={buildCatalogHref(query, { page: item }, { resetPage: false })} aria-current={item === page ? "page" : undefined}>{item.toLocaleString("ja-JP")}</Link>
        ))}
      </div>
      <Link className={`pill-link ${page >= totalPages ? "is-disabled" : ""}`} href={buildCatalogHref(query, { page: Math.min(totalPages, page + 1) }, { resetPage: false })} aria-disabled={page >= totalPages}>次へ</Link>
    </nav>
  );
}

function buildPageWindow(page, totalPages) {
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
