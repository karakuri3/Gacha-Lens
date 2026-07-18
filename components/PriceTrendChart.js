"use client";

import { useState } from "react";

function yen(value) {
  return Number.isFinite(value) ? `${Math.round(value).toLocaleString("ja-JP")}円` : "--";
}

export default function PriceTrendChart({ item, compact = false }) {
  const [period, setPeriod] = useState(30);
  const timeline = buildTimeline(item.market_observations ?? []);
  const visibleTimeline = filterTimeline(timeline, compact ? 30 : period);
  const currentPrices = (item.market_listings ?? [])
    .map((listing) => Number(listing.price))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

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
        <TimelineChart points={visibleTimeline.length >= 2 ? visibleTimeline : timeline.slice(-2)} />
      </div>
    );
  }
  if (currentPrices.length) return <RangeChart prices={currentPrices} observedAt={item.market_summary?.last_observed_at} />;

  return (
    <div className="price-chart-empty">
      <strong>価格の観測を開始しています</strong>
      <span>データが2回以上蓄積すると、ここに推移グラフが表示されます。</span>
    </div>
  );
}

function TimelineChart({ points }) {
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

  return (
    <div className="price-chart" aria-label="価格推移">
      <div className="price-chart__summary">
        <div><span>現在</span><strong>{yen(points.at(-1)?.price)}</strong></div>
        <div><span>期間内安値</span><strong>{yen(rawMin)}</strong></div>
        <div><span>期間内高値</span><strong>{yen(rawMax)}</strong></div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${points.length}時点の参考価格推移`}>
        <line x1={inset.left} y1={inset.top} x2={inset.left} y2={height - inset.bottom} className="price-chart__axis" />
        <line x1={inset.left} y1={height - inset.bottom} x2={width - inset.right} y2={height - inset.bottom} className="price-chart__axis" />
        <polygon points={area} className="price-chart__area" />
        <polyline points={line} className="price-chart__line" pathLength="1" />
        {coords.map((point) => (
          <circle key={point.date} cx={point.x} cy={point.y} r="5" className="price-chart__dot" tabIndex="0" aria-label={`${formatDate(point.date)} ${yen(point.price)}`}>
            <title>{`${formatDate(point.date)} ${yen(point.price)}`}</title>
          </circle>
        ))}
        <text x={inset.left} y={height - 12} className="price-chart__label">{formatDate(points[0].date)}</text>
        <text x={width - inset.right} y={height - 12} textAnchor="end" className="price-chart__label">{formatDate(points.at(-1).date)}</text>
      </svg>
    </div>
  );
}

function RangeChart({ prices, observedAt }) {
  const min = prices[0];
  const max = prices.at(-1);
  const median = prices[Math.floor((prices.length - 1) / 2)];
  const position = max === min ? 50 : ((median - min) / (max - min)) * 100;

  return (
    <div className="price-range-chart" aria-label="現在の価格分布">
      <div className="price-chart__summary">
        <div><span>最安</span><strong>{yen(min)}</strong></div>
        <div><span>中央値</span><strong>{yen(median)}</strong></div>
        <div><span>最高</span><strong>{yen(max)}</strong></div>
      </div>
      <div className="price-range-chart__track" aria-hidden="true">
        <span className="price-range-chart__fill" />
        <span className="price-range-chart__marker" style={{ left: `${position}%` }} />
      </div>
      <div className="price-range-chart__meta">
        <span>{prices.length}件の観測</span>
        <span>{observedAt ? `${formatDate(observedAt)}更新` : "観測中"}</span>
      </div>
    </div>
  );
}

function buildTimeline(observations) {
  const groups = new Map();
  for (const observation of observations) {
    const price = Number(observation.price);
    const timestamp = new Date(observation.observed_at).getTime();
    if (!Number.isFinite(price) || !Number.isFinite(timestamp)) continue;
    const date = new Date(timestamp).toISOString().slice(0, 10);
    const values = groups.get(date) ?? [];
    values.push(price);
    groups.set(date, values);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, values]) => ({ date, price: median(values) }));
}

function filterTimeline(points, days) {
  if (!points.length) return [];
  const latest = new Date(`${points.at(-1).date}T23:59:59Z`).getTime();
  const cutoff = latest - (days - 1) * 86400000;
  return points.filter((point) => new Date(`${point.date}T00:00:00Z`).getTime() >= cutoff);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function formatDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
