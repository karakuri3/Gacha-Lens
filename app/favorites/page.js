"use client";

import Link from "next/link";
import { Star, Trash2 } from "lucide-react";
import { useMemo, useSyncExternalStore } from "react";
import ProductImage from "@/components/ProductImage";
import { FAVORITES_STORAGE_KEY, getFavoritesSnapshot, subscribeFavorites } from "@/components/FavoriteButton";

export default function FavoritesPage() {
  const snapshot = useSyncExternalStore(subscribeFavorites, getFavoritesSnapshot, () => "[]");
  const items = useMemo(() => parseFavorites(snapshot), [snapshot]);

  function remove(slug) {
    const next = items.filter((item) => item.slug !== slug);
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("gacha-lens:favorites-changed"));
  }

  return (
    <main className="site-main">
      <div className="site-shell">
        <section className="page-hero page-hero--compact">
          <p className="eyebrow">FAVORITES</p>
          <h1 className="page-title">お気に入り</h1>
          <p className="page-lead">気になる単品をこの端末に保存して、あとからすぐ確認できます。</p>
        </section>

        {items.length ? (
          <section className="favorites-grid">
            {items.map((item) => (
              <article key={item.slug} className="card favorite-card">
                <Link href={`/series/${encodeURIComponent(item.slug)}`} className="favorite-card__link">
                  <div className="favorite-card__image"><ProductImage src={item.image_url} alt={item.name} /></div>
                  <div className="favorite-card__copy">
                    <span>{item.is_released ? "発売中" : "発売予定"}</span>
                    <h2>{item.name}</h2>
                    <p>{item.series_name}</p>
                    <strong>{item.primary_value || "データ不足"}</strong>
                  </div>
                </Link>
                <button type="button" onClick={() => remove(item.slug)} aria-label={`${item.name}をお気に入りから削除`} title="削除">
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
          </section>
        ) : (
          <div className="card favorites-empty">
            <Star size={28} aria-hidden="true" />
            <h2>お気に入りはまだありません</h2>
            <p>商品詳細の「お気に入りに追加」から保存できます。</p>
            <Link href="/ranking" className="button-link button-link--accent">ランキングを見る</Link>
          </div>
        )}
      </div>
    </main>
  );
}

function parseFavorites(snapshot) {
  try {
    const value = JSON.parse(snapshot);
    return Array.isArray(value) ? value.filter((entry) => entry?.slug && entry?.name) : [];
  } catch {
    return [];
  }
}
