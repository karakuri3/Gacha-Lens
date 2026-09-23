import { notFound } from "next/navigation";
import { getRankingSeries } from "@/lib/series";
import {
  hasPriceRankingEvidence,
  opportunityScore,
  releasedPriorityScore,
} from "@/lib/domain/public-display-clean";

export const revalidate = 300;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

export default async function DiagnosticIsrRankingPage({ params }) {
  const resolved = await params;
  const tab = resolved?.tab === "upcoming" ? "upcoming" : resolved?.tab === "released" ? "released" : "";
  const scope = resolved?.scope === "series" ? "series" : resolved?.scope === "variant" ? "variant" : "";
  if (!tab || !scope) notFound();

  const source = await getRankingSeries(tab, scope);
  const ranked = source
    .filter((item) => tab === "released"
      ? isReleasedCandidate(item, scope)
      : !item.is_released && (scope === "series" || item.variant_type !== "provisional") && (item.forecast_score ?? 0) > 0)
    .sort((a, b) => {
      const scoreA = tab === "released"
        ? (scope === "series" ? releasedSeriesPriority(a) : releasedPriorityScore(a))
        : opportunityScore(a) * 12 + (a.forecast_score ?? 0) * 3;
      const scoreB = tab === "released"
        ? (scope === "series" ? releasedSeriesPriority(b) : releasedPriorityScore(b))
        : opportunityScore(b) * 12 + (b.forecast_score ?? 0) * 3;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return String(a.name || "").localeCompare(String(b.name || ""), "ja");
    });

  return (
    <main>
      <h1>ISR ranking diagnostic</h1>
      <p data-diagnostic-marker="isr-ranking-path-params-v1">
        {tab}/{scope} — {ranked.length.toLocaleString("ja-JP")} records
      </p>
      <ol>
        {ranked.map((item, index) => (
          <li key={item.variant_id || item.series_id || item.slug || `${index}-${item.name}`}>
            <strong>{index + 1}. {item.name}</strong>
            <span> / {item.brand || item.series_name || ""}</span>
            <span> / forecast={item.forecast_score ?? 0}</span>
            <span> / listings={item.market_summary?.listing_count ?? item.listing_count ?? 0}</span>
          </li>
        ))}
      </ol>
    </main>
  );
}

function isReleasedCandidate(item, scope) {
  if (!item?.is_released) return false;
  if (scope === "series") return hasPriceRankingEvidence(item);
  return item.variant_type !== "provisional" && hasPriceRankingEvidence(item);
}

function releasedSeriesPriority(item) {
  const market = item.market_summary ?? {};
  const complete = market.type_stats?.complete_set ?? {};
  const partial = market.type_stats?.partial_set ?? {};
  const stock = item.stock_summary ?? item.availability_summary ?? {};
  return (
    (complete.sold_count ?? 0) * 90
    + (complete.active_listing_count ?? 0) * 28
    + (partial.sold_count ?? 0) * 32
    + (market.listing_count ?? 0) * 8
    + ((stock.restock_event_count ?? 0) + (stock.stock_report_count ?? 0)) * 24
    + (item.trend_score ?? 0) * 6
  );
}
