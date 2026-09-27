"use client";

import { useEffect, useMemo, useState } from "react";
import DocumentLink from "@/components/DocumentLink";
import ProductImage from "@/components/ProductImage";
import { variantHref } from "@/lib/variant-url";

export default function StockClientPage() {
  const [state, setState] = useState({ status: "loading", rows: [] });
  const [filters, setFilters] = useState({ q: "", region: "", status: "" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialFilters = {
      q: String(params.get("q") || ""),
      region: String(params.get("region") || ""),
      status: String(params.get("status") || ""),
    };
    // Defer URL hydration so React does not synchronously cascade state from the mount effect.\n    const filterTimer = window.setTimeout(() => setFilters(initialFilters), 0);

    const controller = new AbortController();
    fetch("/api/public-stock", {
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((payload) => setState({
        status: "ready",
        rows: Array.isArray(payload.rows) ? payload.rows : [],
      }))
      .catch((error) => {
        if (error?.name !== "AbortError") setState({ status: "error", rows: [] });
      });

    return () => {
      window.clearTimeout(filterTimer);
      controller.abort();
    };
  }, []);

  const allRows = state.rows;
  const regions = useMemo(() => [...new Set(allRows.map(({ report }) => report.region).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ja")), [allRows]);
  const statuses = useMemo(() => [...new Set(allRows.map(({ report }) => report.status)
    .filter((value) => value && value !== "unknown"))], [allRows]);

  const q = filters.q.trim().toLowerCase();
  const rows = useMemo(() => allRows.filter(({ item, report }) => {
    const searchText = [item.name, item.series_name, report.shop_name, report.region].join(" ").toLowerCase();
    return (!q || searchText.includes(q))
      && (!filters.region || report.region === filters.region)
      && (!filters.status || report.status === filters.status);
  }), [allRows, q, filters.region, filters.status]);

  return (
    <main className="site-main">
      <div className="site-shell">
        <section className="page-hero">
          <p className="eyebrow">STOCK SIGHTING</p>
          <h1 className="page-title">在庫目撃情報</h1>
          <p className="page-lead">商品名や地域から、直近に確認された店頭在庫の動きを探せます。</p>
        </section>

        <form className="card stock-filter" action="/stock" method="get">
          <label><span>商品・店舗</span><input name="q" value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder="商品名や店舗名" /></label>
          <label><span>地域</span><select name="region" value={filters.region} onChange={(event) => setFilters((current) => ({ ...current, region: event.target.value }))}><option value="">すべて</option>{regions.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>在庫状況</span><select name="status" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">すべて</option>{statuses.map((value) => <option key={value} value={value}>{stockLabel(value)}</option>)}</select></label>
          <button className="button-link button-link--accent" type="submit">絞り込む</button>
        </form>

        <p className="stock-caution">目撃時点の情報であり、現在の在庫を保証するものではありません。</p>

        {state.status === "loading" ? <div className="card empty">在庫目撃情報を読み込んでいます。</div> : null}
        {state.status === "error" ? <div className="card empty">在庫目撃情報を取得できません。時間をおいて再度お試しください。</div> : null}

        {state.status === "ready" && rows.length ? (
          <section className="signal-list" aria-label="在庫目撃一覧">
            {rows.map(({ item, report }, index) => (
              <DocumentLink key={report.id || `${item.variant_id}-${report.reported_at}`} href={variantHref(item)} className="signal-row">
                <div className="signal-row__image"><ProductImage item={item} alt={item.name} priority={index < 4} /></div>
                <div className="signal-row__main">
                  <span className={`signal-row__badge stock-${report.status || "unknown"}`}>{report.status_label || stockLabel(report.status)}</span>
                  <h2>{item.name}</h2>
                  <p>{item.series_name}</p>
                </div>
                <dl className="signal-row__facts">
                  <div><dt>店舗</dt><dd>{report.shop_name || "店舗未登録"}</dd></div>
                  <div><dt>地域</dt><dd>{report.region || "地域未登録"}</dd></div>
                  <div><dt>目撃日時</dt><dd>{formatDateTime(report.reported_at)}</dd></div>
                  <div><dt>状況</dt><dd>{report.status_label || stockLabel(report.status)}</dd></div>
                </dl>
              </DocumentLink>
            ))}
          </section>
        ) : null}

        {state.status === "ready" && !rows.length ? (
          <div className="card empty">
            <strong>条件に合う在庫目撃情報はありません</strong>
            <span>条件を変えるか、商品一覧から探してください。</span>
            <DocumentLink href="/stock" className="button-link">条件をリセット</DocumentLink>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function stockLabel(value) {
  if (value === "in_stock") return "在庫あり";
  if (value === "low_stock") return "残りわずか";
  if (value === "sold_out") return "売り切れ";
  if (value === "refilled") return "補充確認";
  return "状況確認中";
}

function dateValue(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatDateTime(value) {
  const time = dateValue(value);
  if (!time) return "日時未登録";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(time));
}
