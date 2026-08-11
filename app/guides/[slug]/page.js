import Link from "next/link";
import { notFound } from "next/navigation";
import StructuredData from "@/components/StructuredData";
import { getEditorialGuide, getEditorialGuideSlugs } from "@/lib/domain/editorial-guides";
import { absoluteSiteUrl, buildPageMetadata, SITE_NAME } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function hasQueryParameters(searchParams) {
  return Object.keys(searchParams ?? {}).length > 0;
}

async function resolveGuide(params) {
  return getEditorialGuide((await params).slug);
}

export async function generateStaticParams() {
  return getEditorialGuideSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params, searchParams }) {
  const guide = await resolveGuide(params);
  if (!guide) notFound();
  return buildPageMetadata({
    title: `${guide.title} | ${SITE_NAME}`,
    description: guide.description,
    path: `/guides/${guide.slug}`,
    type: "article",
    noIndex: hasQueryParameters(await searchParams),
  });
}

export default async function GuidePage({ params }) {
  const guide = await resolveGuide(params);
  if (!guide) notFound();
  const guideUrl = absoluteSiteUrl(`/guides/${guide.slug}`);
  const homeUrl = absoluteSiteUrl("/");
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      "@id": `${guideUrl}#article`,
      headline: guide.title,
      description: guide.description,
      mainEntityOfPage: guideUrl,
      inLanguage: "ja-JP",
      publisher: { "@id": `${homeUrl}#organization` },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "ホーム", item: homeUrl },
        { "@type": "ListItem", position: 2, name: "ガイド", item: absoluteSiteUrl("/guides") },
        { "@type": "ListItem", position: 3, name: guide.title, item: guideUrl },
      ],
    },
  ];

  return (
    <main className="site-main">
      <StructuredData value={structuredData} />
      <div className="site-shell guide-shell">
        <nav className="detail-breadcrumbs" aria-label="パンくずリスト">
          <Link href="/">ホーム</Link><span>/</span><Link href="/guides">ガイド</Link><span>/</span><strong>{guide.title}</strong>
        </nav>
        <article className="guide-article">
          <header className="guide-article__header">
            <p className="eyebrow">{guide.eyebrow}</p>
            <h1 className="page-title">{guide.title}</h1>
            <p className="page-lead">{guide.description}</p>
          </header>

          <div className="guide-article__body">
            {guide.sections.map((section) => (
              <section key={section.heading} className="guide-section">
                <h2>{section.heading}</h2>
                {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </section>
            ))}
          </div>

          <nav className="guide-related-links" aria-label="関連ページ">
            <span>関連ページ</span>
            {guide.relatedLinks.map((link) => (
              <Link key={link.href} href={link.href} className={link.supplemental ? "is-supplemental" : ""}>{link.label}</Link>
            ))}
          </nav>
        </article>
      </div>
    </main>
  );
}
