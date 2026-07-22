"use client";

import { Star } from "lucide-react";
import { useSyncExternalStore } from "react";

export const FAVORITES_STORAGE_KEY = "gacha-lens:favorites";

export default function FavoriteButton({ item }) {
  const saved = useSyncExternalStore(
    subscribeFavorites,
    () => readFavorites().some((entry) => entry.slug === item.slug),
    () => false
  );

  function toggleFavorite() {
    const current = readFavorites();
    const next = current.some((entry) => entry.slug === item.slug)
      ? current.filter((entry) => entry.slug !== item.slug)
      : [{ ...item, publication_status: "public", saved_at: new Date().toISOString() }, ...current].slice(0, 100);
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("gacha-lens:favorites-changed"));
  }

  return (
    <button type="button" className={`favorite-button ${saved ? "is-saved" : ""}`} onClick={toggleFavorite} aria-pressed={saved}>
      <Star size={17} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
      <span>{saved ? "お気に入り登録済み" : "お気に入りに追加"}</span>
    </button>
  );
}

export function subscribeFavorites(callback) {
  window.addEventListener("gacha-lens:favorites-changed", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("gacha-lens:favorites-changed", callback);
    window.removeEventListener("storage", callback);
  };
}

export function getFavoritesSnapshot() {
  return typeof window === "undefined" ? "[]" : window.localStorage.getItem(FAVORITES_STORAGE_KEY) || "[]";
}

export function readFavorites() {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(FAVORITES_STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.filter((entry) => entry?.slug && entry?.name) : [];
  } catch {
    return [];
  }
}
