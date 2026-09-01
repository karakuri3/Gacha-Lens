import { SOURCE_TYPES, SOURCE_WEIGHTS } from "./gacha-schema.js";
import { X_INTENT_TAGS } from "./source-normalizers.js";

export const FORECAST_WEIGHTS = {
  complete: 0.24,
  ace: 0.25,
  compatibility: 0.16,
  limited: 0.16,
  preorder: 0.1,
  x: 0.09,
};

export const FORECAST_MIN_EVIDENCE_FAMILIES = 2;

const AUTHORIZED_SOCIAL_SOURCE_TYPES = new Set([
  SOURCE_TYPES.OFFICIAL_X,
  SOURCE_TYPES.SHOP_X,
  SOURCE_TYPES.USER_X,
]);

export function calculateUpcomingVariantForecast({
  variant = {},
  marketListings = [],
  xReactions = [],
  restockEvents = [],
  stockReports = [],
}) {
  const xSignals = getXSignals(xReactions);
  const preorder = getPreorderSignal(marketListings);
  const axes = variant.axes || {};
  const complete = Math.max(score(axes.complete), xSignals.axisBoosts.complete);
  const ace = Math.max(score(axes.ace), xSignals.axisBoosts.ace);
  const compatibility = Math.max(score(axes.compatibility), xSignals.axisBoosts.compatibility);
  const limited = score(axes.limited);
  const modelTotal = Math.round(
    complete * FORECAST_WEIGHTS.complete +
      ace * FORECAST_WEIGHTS.ace +
      compatibility * FORECAST_WEIGHTS.compatibility +
      limited * FORECAST_WEIGHTS.limited +
      preorder * FORECAST_WEIGHTS.preorder +
      xSignals.score * FORECAST_WEIGHTS.x
  );
  const evidence = classifyForecastEvidence({ variant, marketListings, xReactions, restockEvents, stockReports });

  return {
    total: evidence.ready ? modelTotal : null,
    evidence_status: evidence.ready ? "ready" : "insufficient_evidence",
    evidence_families: evidence.families,
    evidence_family_count: evidence.families.length,
    supporting_evidence_families: evidence.supporting_families,
    minimum_evidence_families: FORECAST_MIN_EVIDENCE_FAMILIES,
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

export function classifyForecastEvidence({
  variant = {},
  marketListings = [],
  xReactions = [],
  restockEvents = [],
  stockReports = [],
} = {}) {
  const families = [];
  const catalogIdentity = Boolean(text(variant.id ?? variant.variant_id) && text(variant.name ?? variant.variant_name));
  const preorderMarket = marketListings.some(isPreReleaseMarketEvidence);
  const socialReaction = xReactions.some(isObservedXReaction);
  const availabilitySignal = [...restockEvents, ...stockReports].some(isObservedAvailabilitySignal);

  if (catalogIdentity) families.push("catalog_identity");
  if (preorderMarket) families.push("preorder_market");
  if (socialReaction) families.push("authorized_social");

  // Availability is tracked because it is part of the target signal architecture, but v1 does not count it
  // toward readiness until the forecast formula gives it an explicit, reviewable weight.
  const supportingFamilies = availabilitySignal ? ["availability"] : [];
  const hasIdentityOrTwoObservedFamilies = catalogIdentity || (preorderMarket && socialReaction);
  const ready = hasIdentityOrTwoObservedFamilies && families.length >= FORECAST_MIN_EVIDENCE_FAMILIES;

  return {
    ready,
    families,
    supporting_families: supportingFamilies,
  };
}

export function deriveOfficialForecastAxes({ variant = {}, parent = {}, siblingCount = 1 }) {
  const value = `${parent.name || ""} ${parent.category || ""} ${variant.name || ""} ${(variant.tags || []).join(" ")}`.toLowerCase();
  const explicit = variant.axes || {};
  const complete = explicit.complete ?? clamp(46 + Math.min(7, siblingCount) * 5 + (hasAny(value, ["全種", "コレクション"]) ? 6 : 0));
  const ace = explicit.ace ?? clamp(
    hasAny(value, ["シークレット", "レア", "当たり", "限定カラー"]) ? 82 : isGenericName(variant.name) ? 42 : 58
  );
  const compatibility = explicit.compatibility ?? inferCompatibility(value);
  const limited = explicit.limited ?? (hasAny(value, ["限定", "先行", "イベント", "フラットガシャポン"]) ? 76 : 38);
  return { complete, ace, compatibility, limited };
}

function inferCompatibility(value) {
  if (hasAny(value, ["ミニチュア", "1/12", "ドール", "家具", "小物"])) return 88;
  if (hasAny(value, ["めじるし", "チャーム", "キーホルダー"])) return 72;
  if (hasAny(value, ["リング", "アクセサリー"])) return 62;
  if (hasAny(value, ["フィギュア", "マスコット"])) return 54;
  if (hasAny(value, ["ステッカー", "コースター", "クリアファイル"])) return 38;
  return 45;
}

function isGenericName(value = "") {
  return /^(variant[-_ ]?\d+|no\.?\s?\d+|[a-f]|[①-⑳])$/i.test(String(value).trim());
}

function hasAny(value, keywords) {
  return keywords.some((keyword) => value.includes(keyword));
}

function clamp(value) {
  return Math.max(0, Math.min(99, Math.round(value)));
}

function getPreorderSignal(marketListings) {
  const preReleaseListings = marketListings.filter(isPreReleaseMarketEvidence);
  if (!preReleaseListings.length) return 0;

  const listingStrength = 50 + preReleaseListings.length * 8 + average(preReleaseListings.map((listing) => Number(listing.confidence) * 30));
  return Math.round(Math.min(99, listingStrength));
}

function getXSignals(xReactions) {
  const intentTotals = {};
  const xStrength = xReactions.filter(isObservedXReaction).map((reaction) => {
    const engagement = Math.min(40, number(reaction.likes) * 0.05 + number(reaction.reposts) * 0.2 + number(reaction.quotes) * 0.3);
    const source = SOURCE_WEIGHTS[reaction.source_type] ?? 0.48;
    const baseStrength = (50 + engagement) * source * clamp01(reaction.confidence);

    for (const tag of reaction.intent_tags ?? []) {
      intentTotals[tag] = (intentTotals[tag] ?? 0) + baseStrength;
    }

    return baseStrength;
  });
  const inferred = average(xStrength);

  return {
    score: Math.round(inferred || 0),
    source_count: xStrength.length,
    intent_totals: Object.fromEntries(Object.entries(intentTotals).map(([key, value]) => [key, Math.round(value)])),
    axisBoosts: {
      complete: intentScore(intentTotals[X_INTENT_TAGS.COMPLETE_DEMAND]),
      ace: intentScore(intentTotals[X_INTENT_TAGS.ACE_DEMAND]),
      compatibility: intentScore((intentTotals[X_INTENT_TAGS.DOLL_COMPATIBILITY] ?? 0) + (intentTotals[X_INTENT_TAGS.MINIATURE_COMPATIBILITY] ?? 0)),
      attention: intentScore(intentTotals[X_INTENT_TAGS.ATTENTION]),
    },
  };
}

function isPreReleaseMarketEvidence(listing = {}) {
  const variantIdentity = text(listing.variant_id ?? listing.matched_variant_id);
  const listingIdentity = text(listing.id ?? listing.source_listing_id ?? listing.source_url);
  const observedAt = listing.last_observed_at ?? listing.listed_at ?? listing.created_at;
  return listing?.status === "pre_release"
    && listing?.listing_type === "single"
    && listing?.review_required !== true
    && Boolean(variantIdentity)
    && Boolean(listingIdentity)
    && validTimestamp(observedAt)
    && Number.isFinite(Number(listing.price))
    && Number(listing.price) > 0
    && Number(listing.confidence ?? 0) > 0;
}

function isObservedXReaction(reaction = {}) {
  const sourceType = text(reaction.source_type).toLowerCase();
  return AUTHORIZED_SOCIAL_SOURCE_TYPES.has(sourceType)
    && reaction?.review_required !== true
    && Boolean(text(reaction.id ?? reaction.url ?? reaction.text))
    && validTimestamp(reaction.posted_at ?? reaction.created_at)
    && Number(reaction.confidence ?? 0) > 0;
}

function isObservedAvailabilitySignal(entry = {}) {
  return entry?.review_required !== true
    && Boolean(text(entry.id ?? entry.source_url ?? entry.text))
    && validTimestamp(entry.reported_at ?? entry.observed_at ?? entry.created_at)
    && Number(entry.confidence ?? 0) > 0;
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

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, number(value)));
}

function average(values) {
  const filtered = values.filter(Number.isFinite);
  if (!filtered.length) return 0;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function validTimestamp(value) {
  if (!value) return false;
  return Number.isFinite(new Date(value).getTime());
}

function text(value) {
  return String(value ?? "").trim();
}
