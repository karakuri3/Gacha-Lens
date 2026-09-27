"use client";

import { useEffect, useState } from "react";
import DocumentLink from "@/components/DocumentLink";
import SeriesCard from "@/components/SeriesCard";
import { categoryDiscoveryPageHref } from "@/lib/domain/category-discovery";

export default function CategoryDiscoveryClientLanding({ name, page = 1 }) {
  const [state, setState] = useState({ status: "loading", result: null });

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({
      type: "category",
      name,
      page: String(page),
    });

    fetch(`/api/public-discovery?${query.toString()}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((payload) => setState({ status: "ready", result: payload.result }))
      .catch((error) => {
        if (error?.name !== "AbortError") setState({ status: "error", result: null });
      });

    return () => controller.abort();
  }, [name, page]);

  const result = state.result;
  const facet = result?.facet ?? { name, series_count: 0, variant_count: 0 };
  const items = Array.isArray(result?.items) ? result.items : [];

  return (
    <main className="site-main">
      <div className="site-shell">
        <nav className="detail-breadcrumbs" aria-label="パンくずリスト">
          <DocumentLink href="/">ホーム</DocumentLink><span>/</span><DocumentLink href="/categories">カテゴリから探す</DocumentLink><span>/</span><strong>{name}</strong>
        </nav>
        <section className="page-hero discovery-landing-hero">
          <p className="eyebrow">CATEGORY</p>
          <h1 className="page-title">{name}のガチャ</h1>
          <p className="page-lead">
            {state.status === "ready"
              ? `公開中の${facet.series_count.toLocaleString("ja-JP")}シリーズをカテゴリ別に確認できます。`
              : "公開シリーズを読み込んでいます。"}
          </p>
        </section>

        <div className="section-head catalog-results-head">
          <div>
            <h2 className="section-title">シリーズ一覧</h2>
            <p className="section-sub">発売中・発売予定のガチャシリーズを表示しています。</p>
          </div>
          <DocumentLink href="/categories" className="text-link">カテゴリへ</DocumentLink>
        </div>

        {state.status === "loading" ? <div className="card empty">シリーズを読み込んでいます。</div> : null}
        {state.status === "error" ? <div className="card empty">カテゴリ情報を取得できません。時間をおいて再度お試しください。</div> : null}

        {state.status === "ready" ? (
          <>
            <section className="grid grid--cards">
              {items.map((item, index) => <SeriesCard key={item.slug} series={item} scope="series" priority={index < 6} />)}
            </section>
            {result.totalPages > 1 ? (
              <nav className="pagination" aria-label="カテゴリシリーズ一覧のページ">
                <DocumentLink className={`pill-link ${result.page <= 1 ? "is-disabled" : ""}`} href={categoryDiscoveryPageHref(facet.name, Math.max(1, result.page - 1))} aria-disabled={result.page <= 1}>前へ</DocumentLink>
                <span>{result.page.toLocaleString("ja-JP")} / {result.totalPages.toLocaleString("ja-JP")}</span>
                <DocumentLink className={`pill-link ${result.page >= result.totalPages ? "is-disabled" : ""}`} href={categoryDiscoveryPageHref(facet.name, Math.min(result.totalPages, result.page + 1))} aria-disabled={result.page >= result.totalPages}>次へ</DocumentLink>
              </nav>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
