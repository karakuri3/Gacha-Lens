import Link from "next/link";
import SeriesCard from "@/components/SeriesCard";
import { discoveryFacetHref, findPublicDiscoveryFacet } from "@/lib/domain/discovery-facets";

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
          <Link href="/franchises" className={type === "franchise" ? "is-active" : ""}>作品から探す</Link>
          <Link href="/brands" className={type === "brand" ? "is-active" : ""}>メーカーから探す</Link>
          <Link href="/categories">カテゴリから探す</Link>
        </nav>
        <section className="facet-grid" aria-label={title}>
          {facets.map((facet) => (
            <Link key={facet.name} href={discoveryFacetHref(type, facet.name)} className="facet-card">
              <span>
                <strong>{facet.name}</strong>
                <small>{facet.series_count.toLocaleString("ja-JP")}シリーズ</small>
              </span>
              <b>{facet.variant_count.toLocaleString("ja-JP")}種</b>
              <span className="facet-card__arrow" aria-hidden="true">›</span>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}

export function DiscoveryFacetLanding({ type, facet, items }) {
  const indexHref = type === "brand" ? "/brands" : "/franchises";
  const indexLabel = type === "brand" ? "メーカーから探す" : "作品から探す";
  return (
    <main className="site-main">
      <div className="site-shell">
        <nav className="detail-breadcrumbs" aria-label="パンくずリスト">
          <Link href="/">ホーム</Link><span>/</span><Link href={indexHref}>{indexLabel}</Link><span>/</span><strong>{facet.name}</strong>
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
          <Link href={indexHref} className="text-link">{indexLabel}へ</Link>
        </div>
        <section className="grid grid--cards">
          {items.map((item, index) => <SeriesCard key={item.slug} series={item} scope="series" priority={index < 6} />)}
        </section>
      </div>
    </main>
  );
}

export function DiscoveryFacetLink({ type, value, facets, fallback = "未登録" }) {
  const facet = findPublicDiscoveryFacet(facets, value);
  if (!facet) return value || fallback;
  return <Link href={discoveryFacetHref(type, facet.name)} className="detail-facet-link">{facet.name}</Link>;
}
