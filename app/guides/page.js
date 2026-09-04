import Link from "next/link";
import { getEditorialGuides } from "@/lib/domain/editorial-guides";
import { buildPageMetadata } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = buildPageMetadata({
  title: "ガチャ相場・データの見方ガイド | Gacha Lens",
  description: "Gacha Lensで表示される相場、価格履歴、ランキング、在庫・再入荷情報の読み方をまとめたガイドです。",
  path: "/guides",
});

export default function GuidesPage() {
  const guides = getEditorialGuides();
  return (
    <main className="site-main">
      <div className="site-shell guide-shell">
        <section className="page-hero">
          <p className="eyebrow">GUIDES</p>
          <h1 className="page-title">ガチャ相場・データの見方ガイド</h1>
          <p className="page-lead">相場、価格履歴、ランキング、在庫・再入荷情報などの読み方を、Gacha Lensの表示仕様に沿って整理しています。</p>
        </section>

        <section className="guide-card-grid" aria-label="データの見方ガイド">
          {guides.map((guide) => (
            <Link key={guide.slug} href={`/guides/${guide.slug}`} className="card guide-card">
              <span className="guide-card__eyebrow">{guide.eyebrow}</span>
              <h2>{guide.title}</h2>
              <p>{guide.description}</p>
              <span className="guide-card__link">ガイドを読む</span>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
