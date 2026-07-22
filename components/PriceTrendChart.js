"use client";

import { useState } from "react";

export default function PriceTrendChart({ item, compact = false }) {
  const [period, setPeriod] = useState(30);
  const evidence = item.market_evidence ?? item.market_summary?.evidence ?? {};
  const mode = evidence.completedCount >= 3 ? "completed" : evidence.tier === "listing_guide" ? "active" : "none";
  const source = mode === "completed" ? evidence.completedEvidence : mode === "active" ? evidence.activeEvidence : [];
  const timeline = buildTimeline(source);
  const visible = filterTimeline(timeline, compact ? 30 : period);
  const prices = mode === "completed" ? evidence.observedCompletedPrices ?? [] : evidence.observedActivePrices ?? [];

  if (timeline.length >= 2) {
    return (
      <div className={compact ? "price-chart-shell is-compact" : "price-chart-shell"}>
        {!compact ? (
          <div className="price-period-tabs" aria-label="表示期間">
            {[7, 30, 90].map((days) => (
              <button key={days} type="button" className={period === days ? "is-active" : ""} onClick={() => setPeriod(days)}>
                {days}日
              </button>
            ))}
          </div>
        ) : null}
        <TimelineChart points={visible.length >= 2 ? visible : timeline.slice(-2)} mode={mode} />
      </div>
    );
  }
  if (prices.length >= 3) return <RangeChart prices={[...prices].sort((a, b) => a - b)} evidence={evidence} mode={mode} />;

  return (
    <div className="price-chart-empty">
      <strong>価格推移はデータ不足です</strong>
      <span>{evidence.explanation || "同じ出品を重複せず、十分な件数が集まると表示します。"}</span>
    </div>
  );
}

function TimelineChart({ points, mode }) {
  const width = 680;
  const height = 230;
  const inset = { left: 24, right: 24, top: 24, bottom: 36 };
  const prices = points.map((point) => point.price);
  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);
  const padding = Math.max(50, (rawMax - rawMin) * 0.18);
  const min = Math.max(0, rawMin - padding);
  const max = rawMax + padding;
  const plotWidth = width - inset.left - inset.right;
  const plotHeight = height - inset.top - inset.bottom;
  const coords = points.map((point, index) => ({
    ...point,
    x: inset.left + (index / (points.length - 1)) * plotWidth,
    y: inset.top + (1 - (point.price - min) / Math.max(1, max - min)) * plotHeight,
  }));
  const line = coords.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${inset.left},${height - inset.bottom} ${line} ${width - inset.right},${height - inset.bottom}`;
  const title = mode === "completed" ? "成約価格の推移" : "出品価格の推移";

  return (
    <div className="price-chart" aria-label={title}>
      <div className="price-chart__summary">
        <div><span>{mode === "completed" ? "直近成約" : "直近出品"}</span><strong>{yen(points.at(-1)?.price)}</strong></div>
        <div><span>期間内最低</span><strong>{yen(rawMin)}</strong></div>
        <div><span>期間内最高</span><strong>{yen(rawMax)}</strong></div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} ${points.length}日分`}>
        <line x1={inset.left} y1={inset.top} x2={inset.left} y2={height - inset.bottom} className="price-chart__axis" />
        <line x1={inset.left} y1={height - inset.bottom} x2={width - inset.right} y2={height - inset.bottom} className="price-chart__axis" />
        <polygon points={area} className="price-chart__area" />
        <polyline points={line} className="price-chart__line" pathLength="1" />
        {coords.map((point, index) => (
          <circle key={`${point.date}-${index}`} cx={point.x} cy={point.y} r="5" className="price-chart__dot" tabIndex="0" aria-label={`${formatDate(point.date)} ${yen(point.price)}`}>
            <title>{`${formatDate(point.date)} ${yen(point.price)}`}</title>
          </circle>
        ))}
        <text x={inset.left} y={height - 12} className="price-chart__label">{formatDate(points[0].date)}</text>
        <text x={width - inset.right} y={height - 12} textAnchor="end" className="price-chart__label">{formatDate(points.at(-1).date)}</text>
      </svg>
    </div>
  );
}

function RangeChart({ prices, evidence, mode }) {
  const min = prices[0];
  const max = prices.at(-1);
  const center = evidence.medianPrice;
  const position = max === min ? 50 : ((center - min) / (max - min)) * 100;
  return (
    <div className="price-range-chart" aria-label={mode === "completed" ? "成約価格の分布" : "出品価格の分布"}>
      <div className="price-chart__summary">
        <div><span>最低</span><strong>{yen(min)}</strong></div>
        <div><span>中央値</span><strong>{yen(center)}</strong></div>
        <div><span>最高</span><strong>{yen(max)}</strong></div>
      </div>
      <div className="price-range-chart__track" aria-hidden="true">
        <span className="price-range-chart__fill" />
        <span className="price-range-chart__marker" style={{ left: `${position}%` }} />
      </div>
      <div className="price-range-chart__meta">
        <span>{prices.length}件の重複除外済みデータ</span>
        <span>{mode === "completed" ? "成約価格" : "売れた価格ではありません"}</span>
      </div>
    </div>
  );
}

function buildTimeline(points = []) {
  const groups = new Map();
  for (const point of points) {
    const price = Number(point.price);
    const time = new Date(point.observedAt).getTime();
    if (!Number.isFinite(price) || !Number.isFinite(time)) continue;
    const date = new Date(time).toISOString().slice(0, 10);
    const values = groups.get(date) ?? [];
    values.push(price);
    groups.set(date, values);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, values]) => ({ date, price: middle(values) }));
}

function filterTimeline(points, days) {
  if (!points.length) return [];
  const latest = new Date(`${points.at(-1).date}T23:59:59Z`).getTime();
  const cutoff = latest - (days - 1) * 86400000;
  return points.filter((point) => new Date(`${point.date}T00:00:00Z`).getTime() >= cutoff);
}

function middle(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[index] : Math.round((sorted[index - 1] + sorted[index]) / 2);
}

function yen(value) {
  return Number.isFinite(value) ? `${Math.round(value).toLocaleString("ja-JP")}円` : "--";
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? `${date.getMonth() + 1}/${date.getDate()}` : "";
}
