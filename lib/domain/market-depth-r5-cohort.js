export const MARKET_DEPTH_R5_SUPPORTED_SOURCES = Object.freeze(["rakuten", "yahoo_shopping"]);
export const MARKET_DEPTH_R5_DEFAULT_COHORT_SIZE = 4;
export const MARKET_DEPTH_R5_MAX_COHORT_SIZE = 10;

const DAY_MS = 24 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const SOURCE_SET = new Set(MARKET_DEPTH_R5_SUPPORTED_SOURCES);

export function planMarketDepthR5Cohort(options = {}) {
  const cohortSize = normalizeCohortSize(options.cohortSize);
  const now = validDate(options.now);
  if (!now) throw new Error("R5 depth cohort planner requires an explicit valid now timestamp.");
  const listings = array(options.listings);
  const clicks = array(options.clicks);
  const variants = array(options.variants);
  const series = array(options.series);

  const variantById = new Map();
  for (const row of variants) {
    const id = clean(row?.id, 180);
    const seriesId = clean(row?.series_id, 180);
    if (!id || !seriesId || row?.review_required === true) continue;
    variantById.set(id, { id, series_id: seriesId });
  }

  const seriesIds = new Set(series.map((row) => clean(row?.id, 180)).filter(Boolean));
  const clickStats = buildClickStats(clicks, now);
  const freshCutoff = now.getTime() - 30 * DAY_MS;
  const listingGroups = new Map();

  for (const row of listings) {
    const id = clean(row?.id, 180);
    const variantId = clean(row?.matched_variant_id || row?.variant_id, 180);
    const seriesId = clean(row?.series_id, 180);
    const source = normalizeSource(row?.source);
    const freshness = validDate(row?.last_observed_at ?? row?.listed_at ?? row?.updated_at ?? row?.created_at);
    const variant = variantById.get(variantId);
    if (!id || !variant || !seriesIds.has(seriesId) || variant.series_id !== seriesId) continue;
    if (!SOURCE_SET.has(source) || row?.status !== "active" || row?.listing_type !== "single" || row?.review_required === true) continue;
    if (!freshness || freshness.getTime() < freshCutoff || freshness.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) continue;

    const group = listingGroups.get(variantId) ?? new Map();
    group.set(id, {
      id,
      variant_id: variantId,
      series_id: seriesId,
      source,
      freshness_at: freshness.toISOString(),
    });
    listingGroups.set(variantId, group);
  }

  const candidates = [];
  for (const [variantId, group] of listingGroups) {
    const eligible = [...group.values()];
    if (eligible.length !== 1) continue;
    const listing = eligible[0];
    const stats = clickStats.get(variantId) ?? emptyClickStats();
    candidates.push({
      variant_id: variantId,
      series_id: listing.series_id,
      current_source: listing.source,
      target_source: oppositeSource(listing.source),
      expected_existing_listing_ids: [listing.id],
      current_listing_freshness_at: listing.freshness_at,
      clicks_7d: stats.clicks_7d,
      clicks_30d: stats.clicks_30d,
      last_click_at: stats.last_click_at,
    });
  }

  const byTarget = new Map(MARKET_DEPTH_R5_SUPPORTED_SOURCES.map((source) => [source, []]));
  for (const candidate of candidates) byTarget.get(candidate.target_source).push(candidate);
  for (const rows of byTarget.values()) rows.sort(compareDemand);

  const targetOrder = chooseTargetOrder(byTarget);
  const selected = [];
  const selectedVariants = new Set();
  const usedSeries = new Set();

  while (selected.length < cohortSize) {
    let progressed = false;
    for (const targetSource of targetOrder) {
      if (selected.length >= cohortSize) break;
      const next = byTarget.get(targetSource).find((candidate) => (
        !selectedVariants.has(candidate.variant_id) && !usedSeries.has(candidate.series_id)
      ));
      if (!next) continue;
      selected.push(next);
      selectedVariants.add(next.variant_id);
      usedSeries.add(next.series_id);
      progressed = true;
    }
    if (!progressed) break;
  }

  return {
    schema_version: 1,
    kind: "market_depth_r5_cohort_plan",
    cohort_size_requested: cohortSize,
    cohort_size_selected: selected.length,
    complete: selected.length === cohortSize,
    supported_sources: [...MARKET_DEPTH_R5_SUPPORTED_SOURCES],
    policy: {
      fresh_days: 30,
      listing_status: "active",
      listing_type: "single",
      review_required: false,
      exact_eligible_depth: 1,
      one_variant_per_series: true,
      ranking: ["clicks_7d_desc", "clicks_30d_desc", "last_click_at_desc", "freshness_desc", "variant_id_asc"],
      provider_balance: "alternate_missing_provider_when_possible",
    },
    targets: selected,
    eligible_candidate_count: candidates.length,
    provider_requests: 0,
    production_writes: 0,
    workflow_dispatches: 0,
  };
}

function buildClickStats(rows, now) {
  const result = new Map();
  const cutoff30 = now.getTime() - 30 * DAY_MS;
  const cutoff7 = now.getTime() - 7 * DAY_MS;
  for (const row of rows) {
    const variantId = clean(row?.variant_id, 180);
    const clickedAt = validDate(row?.clicked_at);
    if (!variantId || !clickedAt) continue;
    const timestamp = clickedAt.getTime();
    if (timestamp < cutoff30 || timestamp > now.getTime() + FUTURE_TOLERANCE_MS) continue;
    const stats = result.get(variantId) ?? emptyClickStats();
    stats.clicks_30d += 1;
    if (timestamp >= cutoff7) stats.clicks_7d += 1;
    if (!stats.last_click_at || timestamp > Date.parse(stats.last_click_at)) stats.last_click_at = clickedAt.toISOString();
    result.set(variantId, stats);
  }
  return result;
}

function compareDemand(a, b) {
  if (b.clicks_7d !== a.clicks_7d) return b.clicks_7d - a.clicks_7d;
  if (b.clicks_30d !== a.clicks_30d) return b.clicks_30d - a.clicks_30d;
  const clickDelta = dateScore(b.last_click_at) - dateScore(a.last_click_at);
  if (clickDelta !== 0) return clickDelta;
  const freshnessDelta = dateScore(b.current_listing_freshness_at) - dateScore(a.current_listing_freshness_at);
  if (freshnessDelta !== 0) return freshnessDelta;
  return a.variant_id.localeCompare(b.variant_id, "en");
}

function chooseTargetOrder(byTarget) {
  const rakutenTop = byTarget.get("rakuten")[0];
  const yahooTop = byTarget.get("yahoo_shopping")[0];
  if (!rakutenTop) return ["yahoo_shopping", "rakuten"];
  if (!yahooTop) return ["rakuten", "yahoo_shopping"];
  return compareDemand(rakutenTop, yahooTop) <= 0
    ? ["rakuten", "yahoo_shopping"]
    : ["yahoo_shopping", "rakuten"];
}

function oppositeSource(source) {
  if (source === "rakuten") return "yahoo_shopping";
  if (source === "yahoo_shopping") return "rakuten";
  throw new Error("R5 depth planner source is unsupported.");
}

function normalizeSource(value) {
  return clean(value, 80).toLowerCase();
}

function normalizeCohortSize(value) {
  const number = value == null ? MARKET_DEPTH_R5_DEFAULT_COHORT_SIZE : Number(value);
  if (!Number.isInteger(number) || number < 1 || number > MARKET_DEPTH_R5_MAX_COHORT_SIZE) {
    throw new Error(`R5 depth cohort size must be an integer from 1 to ${MARKET_DEPTH_R5_MAX_COHORT_SIZE}.`);
  }
  return number;
}

function emptyClickStats() {
  return { clicks_7d: 0, clicks_30d: 0, last_click_at: null };
}

function dateScore(value) {
  const date = validDate(value);
  return date ? date.getTime() : Number.NEGATIVE_INFINITY;
}

function validDate(value) {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value, limit = 1000) {
  return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}
