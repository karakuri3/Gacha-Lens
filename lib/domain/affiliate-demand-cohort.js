const PROVIDER_ALIASES = new Map([
  ["rakuten", "rakuten"],
  ["rakuten_ichiba", "rakuten"],
  ["yahoo", "yahoo"],
  ["yahoo_shopping", "yahoo"],
]);

const DEFAULT_CLICK_WINDOW_DAYS = 30;
const DEFAULT_LISTING_FRESHNESS_DAYS = 30;
const DEFAULT_COHORT_SIZE = 4;
const MAX_COHORT_SIZE = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

export function buildAffiliateDemandCohort(input = {}, options = {}) {
  const now = parseDate(options.now);
  if (!now) throw new Error("affiliate_demand_cohort_now_required");

  const outboundClicks = requireArray(input.outboundClicks, "outboundClicks");
  const marketListings = requireArray(input.marketListings, "marketListings");
  const variants = requireArray(input.variants, "variants");
  const clickWindowDays = boundedPositiveInteger(
    options.clickWindowDays,
    DEFAULT_CLICK_WINDOW_DAYS,
    1,
    90,
    "clickWindowDays",
  );
  const listingFreshnessDays = boundedPositiveInteger(
    options.listingFreshnessDays,
    DEFAULT_LISTING_FRESHNESS_DAYS,
    1,
    90,
    "listingFreshnessDays",
  );
  const cohortSize = boundedPositiveInteger(
    options.cohortSize,
    DEFAULT_COHORT_SIZE,
    1,
    MAX_COHORT_SIZE,
    "cohortSize",
  );

  const catalog = buildCatalog(variants);
  const listingGroups = buildListingGroups(marketListings, catalog, now, listingFreshnessDays);
  const clickGroups = buildClickGroups(outboundClicks, catalog, now, clickWindowDays);
  const candidates = [];

  for (const [key, demand] of clickGroups.entries()) {
    const supply = listingGroups.get(key);
    if (!supply || supply.hasAffiliateProvenance) continue;

    const variant = catalog.get(demand.variantId);
    candidates.push({
      variant_id: demand.variantId,
      series_id: variant.seriesId,
      provider: demand.provider,
      clicks_in_window: demand.count,
      latest_click_at: demand.latestClickAt.toISOString(),
      active_safe_listing_count: supply.rows.length,
      listing_ids: supply.rows.map((row) => row.id),
      latest_listing_at: supply.latestListingAt.toISOString(),
      affiliate_provenance_present: false,
    });
  }

  candidates.sort(compareCandidates);
  const targets = candidates.slice(0, cohortSize);

  return {
    schema_version: 1,
    generated_at: now.toISOString(),
    mode: "planning_only",
    click_window_days: clickWindowDays,
    listing_freshness_days: listingFreshnessDays,
    requested_cohort_size: cohortSize,
    candidate_count: candidates.length,
    selected_count: targets.length,
    historical_clicks_represented: targets.reduce((sum, target) => sum + target.clicks_in_window, 0),
    targets,
    execution: {
      provider_requests: 0,
      production_writes: 0,
      rpc_calls: 0,
      workflow_dispatches: 0,
      secrets_or_variables_changes: 0,
      approval_reusable: false,
    },
  };
}

function buildCatalog(rows) {
  const catalog = new Map();
  for (const row of rows) {
    const id = cleanText(row?.id);
    const seriesId = cleanText(row?.series_id);
    if (!id || !seriesId) continue;
    if (catalog.has(id)) throw new Error(`affiliate_demand_cohort_duplicate_variant:${id}`);
    catalog.set(id, { id, seriesId });
  }
  return catalog;
}

function buildClickGroups(rows, catalog, now, days) {
  const groups = new Map();
  for (const row of rows) {
    const variantId = cleanText(row?.variant_id);
    const provider = normalizeProvider(row?.provider);
    const clickedAt = parseDate(row?.clicked_at);
    if (!variantId || !catalog.has(variantId) || !provider || !isFresh(clickedAt, now, days)) continue;

    const key = pairKey(variantId, provider);
    const current = groups.get(key) ?? {
      variantId,
      provider,
      count: 0,
      latestClickAt: clickedAt,
    };
    current.count += 1;
    if (clickedAt > current.latestClickAt) current.latestClickAt = clickedAt;
    groups.set(key, current);
  }
  return groups;
}

function buildListingGroups(rows, catalog, now, days) {
  const groups = new Map();
  for (const row of rows) {
    const variantId = resolveListingVariantId(row);
    const provider = resolveListingProvider(row);
    const timestamp = listingTimestamp(row);
    if (!variantId || !catalog.has(variantId) || !provider) continue;
    if (row?.status !== "active" || row?.listing_type !== "single" || row?.review_required === true) continue;
    if (!isFresh(timestamp, now, days)) continue;

    const id = cleanText(row?.id);
    if (!id) continue;
    const key = pairKey(variantId, provider);
    const current = groups.get(key) ?? {
      rows: [],
      latestListingAt: timestamp,
      hasAffiliateProvenance: false,
    };
    current.rows.push({ id, timestamp });
    if (timestamp > current.latestListingAt) current.latestListingAt = timestamp;
    if (hasAffiliateProvenance(row)) current.hasAffiliateProvenance = true;
    groups.set(key, current);
  }

  for (const group of groups.values()) {
    group.rows.sort((a, b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id, "en"));
  }
  return groups;
}

function compareCandidates(a, b) {
  return b.clicks_in_window - a.clicks_in_window
    || Date.parse(b.latest_click_at) - Date.parse(a.latest_click_at)
    || Date.parse(b.latest_listing_at) - Date.parse(a.latest_listing_at)
    || a.variant_id.localeCompare(b.variant_id, "en")
    || a.provider.localeCompare(b.provider, "en");
}

function hasAffiliateProvenance(row) {
  const raw = row?.raw && typeof row.raw === "object" && !Array.isArray(row.raw) ? row.raw : {};
  return Boolean(
    cleanText(raw.affiliate_url)
    && cleanText(raw.affiliate_url_source)
    && cleanText(raw.affiliate_url_contract)
    && cleanText(raw.source_documentation)
  );
}

function resolveListingVariantId(row) {
  const variantId = cleanText(row?.variant_id);
  const matchedVariantId = cleanText(row?.matched_variant_id);
  if (variantId && matchedVariantId && variantId !== matchedVariantId) return "";
  return variantId || matchedVariantId;
}

function resolveListingProvider(row) {
  const sourceText = cleanText(row?.source);
  const rawProviderText = cleanText(row?.raw?.provider);
  const sourceProvider = normalizeProvider(sourceText);
  const rawProvider = normalizeProvider(rawProviderText);

  if (sourceText && rawProviderText) {
    if (!sourceProvider || !rawProvider || sourceProvider !== rawProvider) return "";
  }
  return rawProvider || sourceProvider;
}

function listingTimestamp(row) {
  return parseDate(row?.last_observed_at ?? row?.listed_at ?? row?.created_at);
}

function isFresh(value, now, days) {
  if (!value) return false;
  const age = now.getTime() - value.getTime();
  return age >= 0 && age <= days * DAY_MS;
}

function normalizeProvider(value) {
  return PROVIDER_ALIASES.get(cleanText(value).toLowerCase()) ?? "";
}

function pairKey(variantId, provider) {
  return `${variantId}\u0000${provider}`;
}

function parseDate(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function requireArray(value, name) {
  if (!Array.isArray(value)) throw new Error(`affiliate_demand_cohort_${name}_required`);
  return value;
}

function boundedPositiveInteger(value, fallback, min, max, name) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`affiliate_demand_cohort_invalid_${name}`);
  }
  return parsed;
}

export const AFFILIATE_DEMAND_COHORT_LIMITS = Object.freeze({
  defaultClickWindowDays: DEFAULT_CLICK_WINDOW_DAYS,
  defaultListingFreshnessDays: DEFAULT_LISTING_FRESHNESS_DAYS,
  defaultCohortSize: DEFAULT_COHORT_SIZE,
  maxCohortSize: MAX_COHORT_SIZE,
});
