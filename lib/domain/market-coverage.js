import { MARKET_EVIDENCE_TIERS, classifyMarketEvidence } from "./market-evidence.js";
import { isPublicVariant } from "./variant-publication.js";

export const MARKET_COVERAGE_STATES = Object.freeze({
  SOLD_MARKET: "sold_market",
  REFERENCE_MARKET: "reference_market",
  LISTING_GUIDE: "listing_guide",
  NEAR_REFERENCE: "near_reference",
  NEAR_LISTING_GUIDE: "near_listing_guide",
  OBSERVED_INSUFFICIENT: "observed_insufficient",
  NO_EVIDENCE: "no_evidence",
  NOT_ELIGIBLE: "not_eligible",
});

const DAY_MS = 24 * 60 * 60 * 1000;

export function classifyVariantMarketCoverage({
  variant = {},
  parentSeries,
  listings = [],
  attempts = [],
  now = new Date(),
} = {}) {
  const nowDate = validDate(now) ?? new Date();
  const released = releaseState(variant, parentSeries, nowDate);
  const releaseDate = releaseDateValue(variant, parentSeries);
  const eligible = Boolean(parentSeries) && isPublicVariant(variant, {
    seriesIds: new Set([String(parentSeries?.id || "")]),
  });
  const subject = { ...variant, released };
  const evidence = classifyMarketEvidence({ subject, listings, now: nowDate });
  const lastMarketObservedAt = evidence.lastObservedAt;
  const lastCollectionAttemptAt = latestIso([
    lastMarketObservedAt,
    ...attempts.map((attempt) => typeof attempt === "string" ? attempt : attempt?.attemptedAt || attempt?.started_at),
  ]);

  if (!eligible) {
    return baseResult({
      variant,
      parentSeries,
      released,
      releaseDate,
      evidence,
      lastMarketObservedAt,
      lastCollectionAttemptAt,
      coverageState: MARKET_COVERAGE_STATES.NOT_ELIGIBLE,
      priority: null,
      priorityReason: eligibilityReason(variant, parentSeries),
    });
  }

  const coverageState = coverageStateFor(evidence);
  const priority = collectionPriority({ evidence, coverageState, released, releaseDate, now: nowDate });
  return baseResult({
    variant,
    parentSeries,
    released,
    releaseDate,
    evidence,
    lastMarketObservedAt,
    lastCollectionAttemptAt,
    coverageState,
    priority: priority.value,
    priorityReason: priority.reason,
  });
}

export function buildMarketCoverageRows({ catalog = {}, listings = [], ingestionRuns = [], now = new Date() } = {}) {
  const seriesById = catalog.seriesById instanceof Map
    ? catalog.seriesById
    : new Map((catalog.series ?? []).map((entry) => [entry.id, entry]));
  const listingsByVariant = groupBy(listings, (listing) => listing.matched_variant_id || listing.variant_id);
  const attemptsByVariant = extractMarketCollectionAttempts(ingestionRuns);

  return (catalog.variants ?? []).map((variant) => classifyVariantMarketCoverage({
    variant,
    parentSeries: seriesById.get(variant.series_id),
    listings: listingsByVariant.get(variant.id) ?? [],
    attempts: attemptsByVariant.get(variant.id) ?? [],
    now,
  }));
}

export function selectMarketCollectionTargets(rows = [], options = {}) {
  const now = validDate(options.now) ?? new Date();
  const limit = clampInteger(options.limit ?? 25, 1, 200);
  const cooldownHours = clampNumber(options.cooldownHours ?? 24, 0, 24 * 30);
  const priority = options.priority == null || options.priority === "all" ? null : Number(options.priority);
  const release = ["released", "upcoming", "all"].includes(options.release) ? options.release : "all";
  let skippedCooldown = 0;
  let skippedEligibility = 0;
  let skippedTrustedTier = 0;
  let skippedPriority = 0;
  const candidates = [];

  for (const row of rows) {
    if (row.coverageState === MARKET_COVERAGE_STATES.NOT_ELIGIBLE) {
      skippedEligibility += 1;
      continue;
    }
    if (row.priority == null) {
      skippedTrustedTier += 1;
      continue;
    }
    if (priority && row.priority !== priority) {
      skippedPriority += 1;
      continue;
    }
    if (release === "released" && !row.released || release === "upcoming" && row.released) continue;
    if (withinCooldown(row.lastCollectionAttemptAt, now, cooldownHours)) {
      skippedCooldown += 1;
      continue;
    }
    candidates.push(row);
  }

  const dayBucket = now.toISOString().slice(0, 10);
  candidates.sort((a, b) =>
    a.priority - b.priority
    || attemptTime(a.lastCollectionAttemptAt) - attemptTime(b.lastCollectionAttemptAt)
    || rotationRank(a.variantId, dayBucket) - rotationRank(b.variantId, dayBucket)
    || a.variantId.localeCompare(b.variantId, "ja")
  );

  return {
    selected: dedupeBy(candidates, (row) => row.variantId).slice(0, limit),
    summary: {
      eligible_variants: rows.filter((row) => row.coverageState !== MARKET_COVERAGE_STATES.NOT_ELIGIBLE).length,
      candidate_variants: candidates.length,
      selected_variants: Math.min(limit, candidates.length),
      skipped_cooldown: skippedCooldown,
      skipped_eligibility: skippedEligibility,
      skipped_trusted_tier: skippedTrustedTier,
      skipped_priority: skippedPriority,
      limit,
      cooldown_hours: cooldownHours,
      release,
      priority: priority ?? "all",
    },
  };
}

export function extractMarketCollectionAttempts(ingestionRuns = []) {
  const attempts = new Map();
  for (const run of ingestionRuns) {
    if (run?.task !== "market") continue;
    const summary = run.summary && typeof run.summary === "object" ? run.summary : {};
    const ids = [
      ...(Array.isArray(summary.selected_variant_ids) ? summary.selected_variant_ids : []),
      ...(Array.isArray(summary.selectedVariantIds) ? summary.selectedVariantIds : []),
    ];
    for (const variantId of new Set(ids.filter(Boolean))) {
      if (!attempts.has(variantId)) attempts.set(variantId, []);
      attempts.get(variantId).push({ attemptedAt: run.started_at, status: run.status });
    }
  }
  return attempts;
}

export function summarizeMarketCoverage(rows = []) {
  const states = Object.fromEntries(Object.values(MARKET_COVERAGE_STATES).map((state) => [state, 0]));
  for (const row of rows) states[row.coverageState] = (states[row.coverageState] ?? 0) + 1;
  const publicRows = rows.filter((row) => row.coverageState !== MARKET_COVERAGE_STATES.NOT_ELIGIBLE);
  return {
    public_variants: publicRows.length,
    released: publicRows.filter((row) => row.released).length,
    upcoming: publicRows.filter((row) => !row.released).length,
    with_evidence: publicRows.filter((row) => row.eligibleListingCount > 0).length,
    without_evidence: publicRows.filter((row) => row.coverageState === MARKET_COVERAGE_STATES.NO_EVIDENCE).length,
    price_ranking_eligible: publicRows.filter((row) => row.eligibleForPriceRanking).length,
    provisional_excluded: rows.filter((row) => row.variantType === "provisional").length,
    states,
  };
}

export async function runMarketCollectionBatch(items = [], worker) {
  const results = [];
  for (const item of items) {
    try {
      results.push({ item, ok: true, value: await worker(item) });
    } catch (error) {
      results.push({ item, ok: false, error: String(error?.message || error).slice(0, 500) });
    }
  }
  return results;
}

function coverageStateFor(evidence) {
  if (evidence.tier === MARKET_EVIDENCE_TIERS.SOLD) return MARKET_COVERAGE_STATES.SOLD_MARKET;
  if (evidence.tier === MARKET_EVIDENCE_TIERS.REFERENCE) return MARKET_COVERAGE_STATES.REFERENCE_MARKET;
  if (evidence.tier === MARKET_EVIDENCE_TIERS.LISTING_GUIDE) return MARKET_COVERAGE_STATES.LISTING_GUIDE;
  if (evidence.completedCount >= 1 && evidence.completedCount <= 2) return MARKET_COVERAGE_STATES.NEAR_REFERENCE;
  if (evidence.activeCount >= 1 && evidence.activeCount <= 2) return MARKET_COVERAGE_STATES.NEAR_LISTING_GUIDE;
  if (evidence.eligibleListingCount > 0) return MARKET_COVERAGE_STATES.OBSERVED_INSUFFICIENT;
  return MARKET_COVERAGE_STATES.NO_EVIDENCE;
}

function collectionPriority({ evidence, coverageState, released, releaseDate, now }) {
  if ([MARKET_COVERAGE_STATES.SOLD_MARKET, MARKET_COVERAGE_STATES.REFERENCE_MARKET, MARKET_COVERAGE_STATES.LISTING_GUIDE].includes(coverageState)) {
    return { value: null, reason: "trusted_market_tier_already_available" };
  }
  if (evidence.completedCount === 2) return { value: 1, reason: "one_completed_sale_from_reference_market" };
  if (evidence.completedCount === 1) return { value: 2, reason: "two_completed_sales_from_reference_market" };
  if (evidence.activeCount === 2) return { value: 1, reason: "one_active_listing_from_listing_guide" };
  if (evidence.activeCount === 1) return { value: 2, reason: "two_active_listings_from_listing_guide" };

  const distanceDays = releaseDate ? Math.floor((now.getTime() - releaseDate.getTime()) / DAY_MS) : null;
  if (released && distanceDays != null && distanceDays >= 0 && distanceDays <= 90) {
    return { value: 3, reason: "recently_released_without_market_evidence" };
  }
  if (!released && distanceDays != null && distanceDays >= -60 && distanceDays < 0) {
    return { value: 4, reason: "releasing_within_60_days" };
  }
  return { value: 5, reason: coverageState === MARKET_COVERAGE_STATES.NO_EVIDENCE ? "rotating_no_evidence_backlog" : "stale_or_insufficient_evidence" };
}

function baseResult({ variant, parentSeries, released, releaseDate, evidence, lastMarketObservedAt, lastCollectionAttemptAt, coverageState, priority, priorityReason }) {
  return {
    variantId: String(variant.id || ""),
    slug: String(variant.slug || ""),
    seriesId: String(variant.series_id || ""),
    seriesName: String(parentSeries?.name || ""),
    franchise: String(parentSeries?.franchise || ""),
    brand: String(variant.brand || parentSeries?.brand || ""),
    category: String(parentSeries?.category || ""),
    variantName: String(variant.name || ""),
    variantType: String(variant.variant_type || ""),
    released,
    releaseDate: releaseDate?.toISOString() ?? null,
    completedCount: evidence.completedCount,
    activeCount: evidence.activeCount,
    eligibleListingCount: evidence.eligibleListingCount,
    marketTier: evidence.tier,
    eligibleForPriceRanking: evidence.eligibleForPriceRanking,
    lastMarketObservedAt,
    lastCollectionAttemptAt,
    coverageState,
    priority,
    priorityReason,
  };
}

function releaseState(variant, parentSeries, now) {
  if (typeof variant.released === "boolean") return variant.released;
  if (typeof parentSeries?.is_released === "boolean") return parentSeries.is_released;
  const releaseDate = releaseDateValue(variant, parentSeries);
  return releaseDate ? releaseDate <= now : false;
}

function releaseDateValue(variant, parentSeries) {
  return validDate(variant.release_date || parentSeries?.release_date);
}

function eligibilityReason(variant, parentSeries) {
  if (String(variant?.variant_type || "").toLowerCase() === "provisional") return "provisional_variant";
  if (!parentSeries) return "parent_series_missing";
  if (!String(variant?.name || "").trim()) return "variant_name_missing";
  if (!String(variant?.slug || "").trim()) return "variant_slug_missing";
  return "public_variant_rule_failed";
}

function withinCooldown(value, now, hours) {
  if (!value || hours <= 0) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && now.getTime() - time >= 0 && now.getTime() - time < hours * 60 * 60 * 1000;
}

function attemptTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) && time > 0 ? time : 0;
}

function rotationRank(id, bucket) {
  return [...`${bucket}:${id}`].reduce((hash, char) => ((hash * 33) ^ char.charCodeAt(0)) >>> 0, 5381);
}

function latestIso(values) {
  const latest = values.reduce((value, entry) => Math.max(value, new Date(entry || 0).getTime() || 0), 0);
  return latest > 0 ? new Date(latest).toISOString() : null;
}

function validDate(value) {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function groupBy(values, selector) {
  const grouped = new Map();
  for (const value of values) {
    const key = selector(value);
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(value);
  }
  return grouped;
}

function dedupeBy(values, selector) {
  return [...new Map(values.map((value) => [selector(value), value])).values()];
}

function clampInteger(value, min, max) {
  return Math.min(max, Math.max(min, Math.trunc(Number(value) || min)));
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}
