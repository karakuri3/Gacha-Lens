import { SOURCE_WEIGHTS } from "./gacha-schema";

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
  const preorder = getPreorderSignal(variant, marketListings);
  const x = getXSignal(variant, xReactions, restockEvents, stockReports);
  const axes = variant.axes || {};
  const complete = score(axes.complete);
  const ace = score(axes.ace);
  const compatibility = score(axes.compatibility);
  const limited = score(axes.limited);
  const total = Math.round(
    complete * FORECAST_WEIGHTS.complete +
      ace * FORECAST_WEIGHTS.ace +
      compatibility * FORECAST_WEIGHTS.compatibility +
      limited * FORECAST_WEIGHTS.limited +
      preorder * FORECAST_WEIGHTS.preorder +
      x * FORECAST_WEIGHTS.x
  );

  return {
    total,
    complete,
    ace,
    compatibility,
    limited,
    preorder,
    x,
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

function getXSignal(variant, xReactions, restockEvents, stockReports) {
  const manual = score(variant.signals?.x);
  const xStrength = xReactions.map((reaction) => {
    const engagement = Math.min(40, reaction.likes * 0.05 + reaction.reposts * 0.2 + reaction.quotes * 0.3);
    const source = SOURCE_WEIGHTS[reaction.source_type] ?? 0.48;
    return (50 + engagement) * source * reaction.confidence;
  });
  const sourceStrength = [...restockEvents, ...stockReports].map((entry) => {
    const source = SOURCE_WEIGHTS[entry.source_type] ?? 0.48;
    return source * entry.confidence * 100;
  });

  const inferred = average([...xStrength, ...sourceStrength]);
  return Math.round(Math.max(manual, inferred || 0));
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
