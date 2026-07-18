import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import { getCategoryCatalog } from "@/lib/series";

export const metadata = {
  title: "カテゴリ一覧 | Gacha Lens",
  description: "登録済みのガチャをカテゴリ別に探せます。",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CategoriesPage() {
  const categories = await getCategoryCatalog();

  return (
    <main className="site-main">
      <div className="site-shell">
        <section className="page-hero">
          <p className="eyebrow">CATEGORY</p>
          <h1 className="page-title">カテゴリから探す</h1>
          <p className="page-lead">登録されている単品だけを、実際のカテゴリごとにまとめています。</p>
        </section>

        {categories.length ? (
          <section className="category-grid">
            {categories.map((category, index) => (
              <Link
                key={category.name}
                href={{ pathname: "/series", query: { category: category.name } }}
                className="category-card"
              >
                <div className="category-card__image">
                  <ProductImage src={category.image_url} alt={category.name} priority={index < 4} />
                </div>
                <div>
                  <h2>{category.name}</h2>
                  <p>{category.item_count.toLocaleString("ja-JP")}件の単品</p>
                </div>
                <span aria-hidden="true">→</span>
              </Link>
            ))}
          </section>
        ) : (
          <div className="card empty">
            <strong>カテゴリ情報はまだありません</strong>
            <span>カテゴリが確認できる商品は、登録後にここへ表示されます。</span>
            <Link href="/series" className="button-link">ガチャ一覧を見る</Link>
          </div>
        )}
      </div>
    </main>
  );
}
