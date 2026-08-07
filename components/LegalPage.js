import Link from "next/link";

export default function LegalPage({ eyebrow = "INFORMATION", title, lead, updated = "2026年8月8日", children }) {
  return (
    <main className="site-main">
      <div className="site-shell legal-shell">
        <nav className="detail-breadcrumbs" aria-label="パンくずリスト">
          <Link href="/">ホーム</Link><span>/</span><strong>{title}</strong>
        </nav>
        <header className="page-hero legal-hero">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="page-title">{title}</h1>
          {lead ? <p className="page-lead">{lead}</p> : null}
          <p className="legal-updated">最終更新: {updated}</p>
        </header>
        <article className="legal-document">{children}</article>
      </div>
    </main>
  );
}

export function LegalSection({ title, children }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
