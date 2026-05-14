import { SOURCE_WEIGHTS } from "./gacha-schema";
import { X_INTENT_TAGS } from "./source-normalizers";

export const FORECAST_WEIGHTS = {
  complete: 0.24,
  ace: 0.25,
  compatibility: 0.16,
  limited: 0.16,
  preorder: 0.1,
  x: 0.09,
};

export function calculateUpcomingVariantForecast({
  variant,
  marketListings = [],
  xReactions = [],
  restockEvents = [],
  stockReports = [],
}) {
  const xSignals = getXSignals(variant, xReactions, restockEvents, stockReports);
  const preorder = getPreorderSignal(variant, marketListings);
  const axes = variant.axes || {};
  const complete = Math.max(score(axes.complete), xSignals.axisBoosts.complete);
  const ace = Math.max(score(axes.ace), xSignals.axisBoosts.ace);
  const compatibility = Math.max(score(axes.compatibility), xSignals.axisBoosts.compatibility);
  const limited = score(axes.limited);
  const total = Math.round(
    complete * FORECAST_WEIGHTS.complete +
      ace * FORECAST_WEIGHTS.ace +
      compatibility * FORECAST_WEIGHTS.compatibility +
      limited * FORECAST_WEIGHTS.limited +
      preorder * FORECAST_WEIGHTS.preorder +
      xSignals.score * FORECAST_WEIGHTS.x
  );

  return {
    total,
    complete,
    ace,
    compatibility,
    limited,
    preorder,
    x: xSignals.score,
    x_details: xSignals,
    formula: "complete*0.24 + ace*0.25 + compatibility*0.16 + limited*0.16 + preorder*0.10 + x*0.09",
  };
}

function getPreorderSignal(variant, marketListings) {
  const manual = score(variant.signals?.preorder);
  const preReleaseListings = marketListings.filter((listing) => listing.status === "pre_release");
  if (!preReleaseListings.length) return manual;

  const listingStrength = 50 + preReleaseListings.length * 8 + average(preReleaseListings.map((listing) => listing.confidence * 30));
  return Math.round(Math.max(manual, Math.min(99, listingStrength)));
}

function getXSignals(variant, xReactions, restockEvents, stockReports) {
  const manual = score(variant.signals?.x);
  const intentTotals = {};
  const xStrength = xReactions.map((reaction) => {
    const engagement = Math.min(40, reaction.likes * 0.05 + reaction.reposts * 0.2 + reaction.quotes * 0.3);
    const source = SOURCE_WEIGHTS[reaction.source_type] ?? 0.48;
    const baseStrength = (50 + engagement) * source * reaction.confidence;

    for (const tag of reaction.intent_tags ?? []) {
      intentTotals[tag] = (intentTotals[tag] ?? 0) + baseStrength;
    }

    return baseStrength;
  });
  const sourceStrength = [...restockEvents, ...stockReports].map((entry) => {
    const source = SOURCE_WEIGHTS[entry.source_type] ?? 0.48;
    return source * entry.confidence * 100;
  });
  const inferred = average([...xStrength, ...sourceStrength]);

  return {
    score: Math.round(Math.max(manual, inferred || 0)),
    source_count: xReactions.length,
    intent_totals: Object.fromEntries(Object.entries(intentTotals).map(([key, value]) => [key, Math.round(value)])),
    axisBoosts: {
      complete: intentScore(intentTotals[X_INTENT_TAGS.COMPLETE_DEMAND]),
      ace: intentScore(intentTotals[X_INTENT_TAGS.ACE_DEMAND]),
      compatibility: intentScore((intentTotals[X_INTENT_TAGS.DOLL_COMPATIBILITY] ?? 0) + (intentTotals[X_INTENT_TAGS.MINIATURE_COMPATIBILITY] ?? 0)),
      attention: intentScore(intentTotals[X_INTENT_TAGS.ATTENTION]),
    },
  };
}

function intentScore(value = 0) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(99, Math.round(45 + value * 0.55));
}

function score(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(99, Math.round(parsed)));
}

function average(values) {
  const filtered = values.filter(Number.isFinite);
  if (!filtered.length) return 0;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}
