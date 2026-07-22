"use client";

import Link from "next/link";
import { Star, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import ProductImage from "@/components/ProductImage";
import { FAVORITES_STORAGE_KEY, getFavoritesSnapshot, subscribeFavorites } from "@/components/FavoriteButton";

export default function FavoritesPage() {
  const snapshot = useSyncExternalStore(subscribeFavorites, getFavoritesSnapshot, () => "[]");
  const storedItems = useMemo(() => parseFavorites(snapshot), [snapshot]);
  const [validation, setValidation] = useState({ key: "", identifiers: new Set(), failed: false });
  const variantIdentifiers = useMemo(
    () => storedItems.filter((item) => !isSeriesFavorite(item)).map((item) => item.slug),
    [storedItems]
  );
  const validationKey = variantIdentifiers.join("\u001f");

  useEffect(() => {
    const controller = new AbortController();
    const request = variantIdentifiers.length
      ? fetch(`/api/public-variants?ids=${encodeURIComponent(variantIdentifiers.join(","))}`, {
          signal: controller.signal,
          cache: "no-store",
        })
      : Promise.resolve({ ok: true, json: async () => ({ identifiers: [] }) });
    request
      .then((response) => {
        if (!response.ok) throw new Error("favorite validation failed");
        return response.json();
      })
      .then((result) => setValidation({ key: validationKey, identifiers: new Set(result.identifiers ?? []), failed: false }))
      .catch((error) => {
        if (error.name === "AbortError") return;
        setValidation({ key: validationKey, identifiers: new Set(), failed: true });
      });
    return () => controller.abort();
  }, [validationKey, variantIdentifiers]);

  const items = useMemo(
    () => validation.key !== validationKey
      ? []
      : storedItems.filter((item) => isSeriesFavorite(item) || validation.identifiers.has(item.slug)),
    [storedItems, validation, validationKey]
  );
  const isValidating = validation.key !== validationKey;

  function remove(slug) {
    const next = storedItems.filter((item) => item.slug !== slug);
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

        {isValidating ? (
          <div className="card favorites-empty"><p>お気に入りを確認しています。</p></div>
        ) : items.length ? (
          <section className="favorites-grid">
            {items.map((item) => (
              <article key={item.slug} className="card favorite-card">
                <Link href={favoriteHref(item)} className="favorite-card__link">
                  <div className="favorite-card__image"><ProductImage src={item.image_url} alt={item.name} /></div>
                  <div className="favorite-card__copy">
                    <span>{item.is_released ? "発売中" : "発売予定"}</span>
                    <h2>{item.name}</h2>
                    <p>{item.series_name}</p>
                    <span>{item.primary_label || (item.is_released ? "市場価格" : "発売")}</span>
                    <strong>{item.primary_label ? (item.primary_value || "データ不足") : (item.is_released ? "詳細で最新情報を確認" : item.primary_value || "未定")}</strong>
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
            <h2>{validation.failed ? "お気に入りを確認できませんでした" : "お気に入りはまだありません"}</h2>
            <p>{validation.failed ? "時間をおいて再度お試しください。" : "商品詳細の「お気に入りに追加」から保存できます。"}</p>
            <Link href="/ranking" className="button-link button-link--accent">ランキングを見る</Link>
          </div>
        )}
      </div>
    </main>
  );
}

function isSeriesFavorite(item) {
  return item?.entity_type === "series" || String(item?.slug || "").startsWith("series-");
}

function favoriteHref(item) {
  if (isSeriesFavorite(item)) {
    return `/series/group/${encodeURIComponent(String(item.slug).replace(/^series-/, ""))}`;
  }
  return `/series/${encodeURIComponent(item.slug)}`;
}

function parseFavorites(snapshot) {
  try {
    const value = JSON.parse(snapshot);
    return Array.isArray(value) ? value.filter((entry) => entry?.slug && entry?.name) : [];
  } catch {
    return [];
  }
}
