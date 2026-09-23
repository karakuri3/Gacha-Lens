import SeriesCard from "@/components/SeriesCard";
import { discoveryFacetHref, discoveryFacetPageHref, findPublicDiscoveryFacet } from "@/lib/domain/discovery-facets";
import { categoryDiscoveryPageHref } from "@/lib/domain/category-discovery";

export function DiscoveryFacetIndex({ type, eyebrow, title, lead, facets }) {
  return (
    <main className="site-main">
      <div className="site-shell">
        <section className="page-hero">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="page-title">{title}</h1>
          <p className="page-lead">{lead}</p>
        </section>
        <nav className="discovery-switcher" aria-label="探し方">
          <a href="/franchises" className={type === "franchise" ? "is-active" : ""}>作品から探す</a>
          <a href="/brands" className={type === "brand" ? "is-active" : ""}>メーカーから探す</a>
          <a href="/categories">カテゴリから探す</a>
        </nav>
        <section className="facet-grid" aria-label={title}>
          {facets.map((facet) => (
            <a key={facet.name} href={discoveryFacetHref(type, facet.name)} className="facet-card">
              <span>
                <strong>{facet.name}</strong>
                <small>{facet.series_count.toLocaleString("ja-JP")}シリーズ</small>
              </span>
              <b>{facet.variant_count.toLocaleString("ja-JP")}種</b>
              <span className="facet-card__arrow" aria-hidden="true">›</span>
            </a>
          ))}
        </section>
      </div>
    </main>
  );
}

export function DiscoveryFacetLanding({ type, facet, items, page }) {
  const indexHref = type === "brand" ? "/brands" : "/franchises";
  const indexLabel = type === "brand" ? "メーカーから探す" : "作品から探す";
  return (
    <main className="site-main">
      <div className="site-shell">
        <nav className="detail-breadcrumbs" aria-label="パンくずリスト">
          <a href="/">ホーム</a><span>/</span><a href={indexHref}>{indexLabel}</a><span>/</span><strong>{facet.name}</strong>
        </nav>
        <section className="page-hero discovery-landing-hero">
          <p className="eyebrow">{type === "brand" ? "MAKER" : "TITLE"}</p>
          <h1 className="page-title">{facet.name}のガチャ</h1>
          <p className="page-lead">
            公開中の{facet.series_count.toLocaleString("ja-JP")}シリーズ、{facet.variant_count.toLocaleString("ja-JP")}種をまとめています。
          </p>
        </section>
        <div className="section-head catalog-results-head">
          <div>
            <h2 className="section-title">シリーズ一覧</h2>
            <p className="section-sub">発売情報とラインナップをシリーズ単位で確認できます。</p>
          </div>
          <a href={indexHref} className="text-link">{indexLabel}へ</a>
        </div>
        <section className="grid grid--cards">
          {items.map((item, index) => <SeriesCard key={item.slug} series={item} scope="series" priority={index < 6} />)}
        </section>
        {page?.totalPages > 1 ? <DiscoveryFacetPagination type={type} facet={facet} page={page.page} totalPages={page.totalPages} /> : null}
      </div>
    </main>
  );
}

function DiscoveryFacetPagination({ type, facet, page, totalPages }) {
  const pages = buildPageWindow(page, totalPages);
  return (
    <nav className="pagination" aria-label="シリーズ一覧のページ">
      <a className={`pill-link ${page <= 1 ? "is-disabled" : ""}`} href={discoveryFacetPageHref(type, facet.name, Math.max(1, page - 1))} aria-disabled={page <= 1}>前へ</a>
      <div className="pagination__pages">
        {pages.map((value) => (
          <a key={value} className={`pill-link ${value === page ? "is-active" : ""}`} href={discoveryFacetPageHref(type, facet.name, value)} aria-current={value === page ? "page" : undefined}>{value.toLocaleString("ja-JP")}</a>
        ))}
      </div>
      <a className={`pill-link ${page >= totalPages ? "is-disabled" : ""}`} href={discoveryFacetPageHref(type, facet.name, Math.min(totalPages, page + 1))} aria-disabled={page >= totalPages}>次へ</a>
    </nav>
  );
}

function buildPageWindow(page, totalPages) {
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function DiscoveryFacetLink({ type, value, facets, fallback = "未登録" }) {
  const facet = findPublicDiscoveryFacet(facets, value);
  if (!facet) return value || fallback;
  return <a href={discoveryFacetHref(type, facet.name)} className="detail-facet-link">{facet.name}</a>;
}

export function CategoryDiscoveryLanding({ facet, items, page }) {
  return (
    <main className="site-main">
      <div className="site-shell">
        <nav className="detail-breadcrumbs" aria-label="パンくずリスト">
          <a href="/">ホーム</a><span>/</span><a href="/categories">カテゴリから探す</a><span>/</span><strong>{facet.name}</strong>
        </nav>
        <section className="page-hero discovery-landing-hero">
          <p className="eyebrow">CATEGORY</p>
          <h1 className="page-title">{facet.name}のガチャ</h1>
          <p className="page-lead">公開中の{facet.series_count.toLocaleString("ja-JP")}シリーズをカテゴリ別に確認できます。</p>
        </section>
        <div className="section-head catalog-results-head">
          <div>
            <h2 className="section-title">シリーズ一覧</h2>
            <p className="section-sub">発売中・発売予定のガチャシリーズを表示しています。</p>
          </div>
          <a href="/categories" className="text-link">カテゴリへ</a>
        </div>
        <section className="grid grid--cards">
          {items.map((item, index) => <SeriesCard key={item.slug} series={item} scope="series" priority={index < 6} />)}
        </section>
        {page?.totalPages > 1 ? <CategoryDiscoveryPagination facet={facet} page={page.page} totalPages={page.totalPages} /> : null}
      </div>
    </main>
  );
}

function CategoryDiscoveryPagination({ facet, page, totalPages }) {
  const pages = buildPageWindow(page, totalPages);
  return (
    <nav className="pagination" aria-label="カテゴリシリーズ一覧のページ">
      <a className={`pill-link ${page <= 1 ? "is-disabled" : ""}`} href={categoryDiscoveryPageHref(facet.name, Math.max(1, page - 1))} aria-disabled={page <= 1}>前へ</a>
      <div className="pagination__pages">
        {pages.map((value) => (
          <a key={value} className={`pill-link ${value === page ? "is-active" : ""}`} href={categoryDiscoveryPageHref(facet.name, value)} aria-current={value === page ? "page" : undefined}>{value.toLocaleString("ja-JP")}</a>
        ))}
      </div>
      <a className={`pill-link ${page >= totalPages ? "is-disabled" : ""}`} href={categoryDiscoveryPageHref(facet.name, Math.min(totalPages, page + 1))} aria-disabled={page >= totalPages}>次へ</a>
    </nav>
  );
}
