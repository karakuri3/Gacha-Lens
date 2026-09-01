export const SCOREBOARD_SCHEMA_VERSION = 1;
export const SCOREBOARD_STATES = Object.freeze(["available", "unavailable", "not_instrumented"]);

const DAY_MS = 24 * 60 * 60 * 1000;
const SAFE_PROVIDER_NAMES = new Map([
  ["rakuten", "rakuten"],
  ["rakuten_ichiba", "rakuten"],
  ["yahoo", "yahoo"],
  ["yahoo_shopping", "yahoo"],
  ["mercari", "mercari"],
  ["amazon", "amazon"],
  ["official", "official"],
]);

export function buildDataScaleScoreboard(input = {}, options = {}) {
  const now = validDate(options.now ?? new Date());
  if (!now) throw new Error("Scoreboard now is invalid.");

  const series = optionalArray(input.series);
  const variants = optionalArray(input.variants);
  const listings = optionalArray(input.marketListings);
  const observations = optionalArray(input.marketObservations);
  const stockReports = optionalArray(input.stockReports);
  const restockEvents = optionalArray(input.restockEvents);
  const xReactions = optionalArray(input.xReactions);
  const outboundClicks = optionalArray(input.outboundClicks);
  const ingestionRuns = optionalArray(input.ingestionRuns);
  const importIssues = optionalArray(input.importIssues);
  const forecastEvaluations = optionalArray(input.forecastEvaluations);
  const sourceCapabilities = optionalArray(input.sourceCapabilities);

  const market = buildMarketPanels({ variants, listings, observations, now });
  const signals = buildSignalPanel({
    stockReports,
    restockEvents,
    xReactions,
    forecastEvaluations,
    socialAuthorized: input.socialAuthorized === true,
    now,
  });
  const clicks = buildClickPanel({ outboundClicks, listings, now });
  const collectionHealth = buildCollectionHealthPanel({
    ingestionRuns,
    importIssues,
    collectionHealth: input.collectionHealth,
    market,
    now,
  });

  const snapshot = {
    schema_version: SCOREBOARD_SCHEMA_VERSION,
    generated_at: now.toISOString(),
    data_as_of: latestDataTimestamp({ listings, observations, stockReports, restockEvents, xReactions, outboundClicks }) ?? now.toISOString(),
    main_sha: safeSha(options.mainSha ?? input.mainSha),
    source: "production_read_only",
    panels: {
      data: {
        catalog: {
          series_total: arrayCountMetric(series),
          variants_total: arrayCountMetric(variants),
          supported_source_count: sourceCapabilities ? metric(sourceCapabilities.length) : unavailable(),
          source_capabilities: sourceCapabilities ? metric(sanitizeSourceCapabilities(sourceCapabilities)) : unavailable(),
        },
        market_breadth: market.breadth,
        market_depth: market.depth,
        history: market.history,
        signals,
      },
      traffic: sanitizeExternalPanel(input.traffic, [
        "impressions_7d",
        "impressions_28d",
        "organic_clicks_7d",
        "organic_clicks_28d",
        "indexed_pages",
        "known_pages",
        "organic_sessions_7d",
        "organic_sessions_28d",
        "engagement_rate_7d",
        "engagement_rate_28d",
      ]),
      click: clicks,
      revenue: sanitizeExternalPanel(input.revenue, [
        "affiliate_orders_30d",
        "affiliate_revenue_30d",
        "affiliate_revenue_lifetime",
        "conversion_rate_30d",
        "epc_30d",
        "adsense_revenue_30d",
      ]),
      collection_health: collectionHealth,
    },
  };

  snapshot.trends = buildScoreboardDeltas(snapshot, {
    previousDay: options.previousDay ?? input.previousDay,
    previousWeek: options.previousWeek ?? input.previousWeek,
  });
  snapshot.bottleneck = chooseScoreboardBottleneck(snapshot);
  return snapshot;
}

export function renderDataScaleScoreboardHuman(snapshot = {}) {
  const data = snapshot.panels?.data ?? {};
  const catalog = data.catalog ?? {};
  const breadth = data.market_breadth ?? {};
  const depth = data.market_depth ?? {};
  const history = data.history ?? {};
  const signals = data.signals ?? {};
  const clicks = snapshot.panels?.click ?? {};
  const traffic = snapshot.panels?.traffic;
  const revenue = snapshot.panels?.revenue;
  const bucket = depth.fresh_30d_buckets?.value ?? {};
  const providers = breadth.provider_split?.value ?? {};

  return [
    `Gacha Lens Data Health — ${snapshot.generated_at ?? "unknown"}`,
    `Catalog       ${display(catalog.variants_total)} variants / ${display(catalog.series_total)} series`,
    `Market        ${display(breadth.listings_total)} listings (${signedDelta(snapshot.trends?.day?.listings_total)}/day)`,
    `Coverage      ${display(breadth.variants_fresh_30d)} variants / ${display(breadth.coverage_pct_30d, "%")} fresh <30d`,
    `Depth         ${bucket.one ?? "?"}×1 | ${bucket.two ?? "?"}×2 | ${(bucket.three_four ?? 0) + (bucket.five_nine ?? 0) + (bucket.ten_plus ?? 0)}×3+`,
    `History       ${display(history.observations_total)} obs | ${display(history.listings_reobserved_total)} re-observed`,
    `Sources       Rakuten ${providers.rakuten ?? 0} | Yahoo ${providers.yahoo ?? 0} | Mercari ${providers.mercari ?? "partnership_required"}`,
    `Signals       Stock ${display(signals.stock?.total)} | Restock ${display(signals.restock?.total)} | X ${panelStateText(signals.social)}`,
    `Traffic       ${panelStateText(traffic)}`,
    `Clicks        ${display(clicks.clicks_7d)} / 7d`,
    `Revenue       ${panelStateText(revenue)}`,
    `P0 Bottleneck ${snapshot.bottleneck?.label ?? "unknown"}`,
  ].join("\n");
}

export function buildScoreboardDeltas(current, { previousDay = null, previousWeek = null } = {}) {
  const paths = {
    listings_total: ["panels", "data", "market_breadth", "listings_total"],
    observations_total: ["panels", "data", "history", "observations_total"],
    variants_fresh_30d: ["panels", "data", "market_breadth", "variants_fresh_30d"],
    listings_reobserved_total: ["panels", "data", "history", "listings_reobserved_total"],
    clicks_7d: ["panels", "click", "clicks_7d"],
  };
  return {
    day: deltaSet(current, previousDay, paths),
    week: deltaSet(current, previousWeek, paths),
  };
}

function buildMarketPanels({ variants, listings, observations, now }) {
  if (!listings) {
    return {
      breadth: unavailableMarketBreadth(),
      depth: unavailableMarketDepth(),
      history: observations ? buildHistory(observations, null, now) : unavailableHistory(),
    };
  }

  const safeSingles = listings.filter(isSafeActiveSingle);
  const fresh24 = safeSingles.filter((row) => isFresh(rowTimestamp(row), now, 1));
  const fresh7 = safeSingles.filter((row) => isFresh(rowTimestamp(row), now, 7));
  const fresh30 = safeSingles.filter((row) => isFresh(rowTimestamp(row), now, 30));
  const fresh30ByVariant = groupUniqueListingsByVariant(fresh30);
  const covered30 = fresh30ByVariant.size;
  const variantTotal = variants?.length ?? null;
  const providerSplit = countBy(listings, providerOfListing);
  const affiliateRows = listings.filter(hasAffiliateProvenance);

  return {
    breadth: {
      listings_total: metric(listings.length),
      active_safe_single_total: metric(safeSingles.length),
      distinct_variants_with_market_evidence: metric(new Set(safeSingles.map(listingVariantId).filter(Boolean)).size),
      variants_fresh_24h: metric(new Set(fresh24.map(listingVariantId).filter(Boolean)).size),
      variants_fresh_7d: metric(new Set(fresh7.map(listingVariantId).filter(Boolean)).size),
      variants_fresh_30d: metric(covered30),
      coverage_pct_30d: variantTotal === null ? unavailable() : metric(round(variantTotal ? covered30 / variantTotal * 100 : 0, 4)),
      provider_split: metric(sortObject(providerSplit)),
      new_listings_24h: metric(countFresh(listings, now, 1, (row) => row.created_at ?? row.listed_at)),
      new_listings_7d: metric(countFresh(listings, now, 7, (row) => row.created_at ?? row.listed_at)),
      new_listings_30d: metric(countFresh(listings, now, 30, (row) => row.created_at ?? row.listed_at)),
      completed_sale_evidence_count: metric(listings.filter((row) => String(row.status ?? "") === "sold").length),
      affiliate_provenance_total: metric(affiliateRows.length),
      affiliate_provenance_provider_split: metric(sortObject(countBy(affiliateRows, providerOfListing))),
    },
    depth: buildDepth({ variants, fresh30ByVariant }),
    history: observations ? buildHistory(observations, listings, now) : unavailableHistory(),
  };
}

function buildDepth({ variants, fresh30ByVariant }) {
  const counts = [...fresh30ByVariant.values()].map((rows) => rows.length);
  const buckets = {
    zero: variants ? Math.max(0, variants.length - fresh30ByVariant.size) : null,
    one: counts.filter((value) => value === 1).length,
    two: counts.filter((value) => value === 2).length,
    three_four: counts.filter((value) => value >= 3 && value <= 4).length,
    five_nine: counts.filter((value) => value >= 5 && value <= 9).length,
    ten_plus: counts.filter((value) => value >= 10).length,
  };
  return {
    fresh_30d_buckets: metric(buckets),
    covered_variant_listing_distribution: metric({
      p50: percentile(counts, 0.5),
      p90: percentile(counts, 0.9),
      max: counts.length ? Math.max(...counts) : 0,
    }),
  };
}

function buildHistory(observations, listings, now) {
  const byListing = groupBy(observations.filter((row) => text(row.listing_id)), (row) => text(row.listing_id));
  const counts = [...byListing.values()].map((rows) => rows.length);
  const reobserved = counts.filter((value) => value >= 2).length;
  const outcomeRows = observations.filter((row) => text(row?.raw?.market_reobservation?.outcome));
  const denominator = listings ? listings.length : byListing.size;
  return {
    observations_total: metric(observations.length),
    new_observations_24h: metric(countFresh(observations, now, 1, (row) => row.observed_at ?? row.created_at)),
    new_observations_7d: metric(countFresh(observations, now, 7, (row) => row.observed_at ?? row.created_at)),
    new_observations_30d: metric(countFresh(observations, now, 30, (row) => row.observed_at ?? row.created_at)),
    observations_per_listing_distribution: metric({
      p50: percentile(counts, 0.5),
      p90: percentile(counts, 0.9),
      max: counts.length ? Math.max(...counts) : 0,
    }),
    listings_with_1_observation: metric(counts.filter((value) => value === 1).length),
    listings_with_2_4_observations: metric(counts.filter((value) => value >= 2 && value <= 4).length),
    listings_with_5_plus_observations: metric(counts.filter((value) => value >= 5).length),
    listings_reobserved_total: metric(reobserved),
    listings_reobserved_24h: metric(reobservedWithin(byListing, now, 1)),
    listings_reobserved_7d: metric(reobservedWithin(byListing, now, 7)),
    listings_reobserved_30d: metric(reobservedWithin(byListing, now, 30)),
    reobservation_rate: metric(denominator ? round(reobserved / denominator * 100, 4) : 0),
    reobservation_outcomes: outcomeRows.length
      ? metric(sortObject(countBy(outcomeRows, (row) => text(row.raw.market_reobservation.outcome) || "unknown")))
      : notInstrumented(),
  };
}

function buildSignalPanel({ stockReports, restockEvents, xReactions, forecastEvaluations, socialAuthorized, now }) {
  return {
    stock: stockReports ? signalWindow(stockReports, now, (row) => row.reported_at ?? row.created_at) : unavailable(),
    restock: restockEvents ? signalWindow(restockEvents, now, (row) => row.reported_at ?? row.created_at) : unavailable(),
    social: !socialAuthorized
      ? notInstrumented()
      : xReactions
        ? signalWindow(xReactions.filter((row) => row.review_required !== true), now, (row) => row.posted_at ?? row.created_at)
        : unavailable(),
    expectation: forecastEvaluations
      ? metric({
          total: forecastEvaluations.length,
          ready: forecastEvaluations.filter((row) => row.evidence_status === "ready").length,
          insufficient: forecastEvaluations.filter((row) => row.evidence_status !== "ready").length,
          provenance_complete: forecastEvaluations.filter((row) => row.evidence_status === "ready" && Number(row.evidence_family_count) >= 2).length,
        })
      : notInstrumented(),
  };
}

function buildClickPanel({ outboundClicks, listings, now }) {
  if (!outboundClicks) {
    return {
      state: "unavailable",
      clicks_24h: unavailable(),
      clicks_7d: unavailable(),
      clicks_30d: unavailable(),
      distinct_variants_30d: unavailable(),
      provider_split_30d: unavailable(),
      affiliate_eligible_click_share_30d: unavailable(),
    };
  }
  const rows30 = outboundClicks.filter((row) => isFresh(row.clicked_at, now, 30));
  const affiliateKeys = listings ? new Set(listings.filter(hasAffiliateProvenance).map((row) => `${listingVariantId(row)}:${providerOfListing(row)}`)) : null;
  const eligibleClicks = affiliateKeys
    ? rows30.filter((row) => affiliateKeys.has(`${text(row.variant_id)}:${normalizeProvider(row.provider)}`)).length
    : null;
  return {
    state: "available",
    clicks_24h: metric(outboundClicks.filter((row) => isFresh(row.clicked_at, now, 1)).length),
    clicks_7d: metric(outboundClicks.filter((row) => isFresh(row.clicked_at, now, 7)).length),
    clicks_30d: metric(rows30.length),
    distinct_variants_30d: metric(new Set(rows30.map((row) => text(row.variant_id)).filter(Boolean)).size),
    provider_split_30d: metric(sortObject(countBy(rows30, (row) => normalizeProvider(row.provider) || "unknown"))),
    affiliate_eligible_click_share_30d: eligibleClicks === null
      ? unavailable()
      : metric(rows30.length ? round(eligibleClicks / rows30.length * 100, 2) : 0),
  };
}

function buildCollectionHealthPanel({ ingestionRuns, importIssues, collectionHealth, market, now }) {
  const marketRuns = ingestionRuns?.filter((row) => row.task === "market") ?? null;
  const recentRuns = marketRuns?.filter((row) => isFresh(row.started_at ?? row.created_at, now, 1)) ?? null;
  const unresolvedIssues = importIssues?.filter((row) => row.resolved !== true) ?? null;
  return {
    state: ingestionRuns || importIssues || collectionHealth ? "available" : "unavailable",
    market_runs_24h: recentRuns ? metric(recentRuns.length) : unavailable(),
    market_run_success_24h: recentRuns ? metric(recentRuns.filter((row) => row.status === "success" || row.status === "succeeded").length) : unavailable(),
    market_run_failed_24h: recentRuns ? metric(recentRuns.filter((row) => ["failed", "error"].includes(String(row.status))).length) : unavailable(),
    unresolved_issue_count: unresolvedIssues ? metric(unresolvedIssues.length) : unavailable(),
    unresolved_issue_reason_counts: unresolvedIssues ? metric(sortObject(countBy(unresolvedIssues, issueReason))) : unavailable(),
    provider_request_metrics: collectionHealth?.provider_request_metrics ? metric(sanitizeNumberObject(collectionHealth.provider_request_metrics)) : notInstrumented(),
    reobserver_outcomes: collectionHealth?.reobserver_outcomes ? metric(sanitizeNumberObject(collectionHealth.reobserver_outcomes)) : market.history.reobservation_outcomes,
    depth_collector: collectionHealth?.depth_collector ? metric(sanitizeNumberObject(collectionHealth.depth_collector)) : notInstrumented(),
    observed_daily_throughput: metric({
      new_listings: metricValue(market.breadth.new_listings_24h) ?? 0,
      new_observations: metricValue(market.history.new_observations_24h) ?? 0,
    }),
    theoretical_daily_throughput: Number.isFinite(Number(collectionHealth?.theoretical_daily_throughput))
      ? metric(Number(collectionHealth.theoretical_daily_throughput))
      : notInstrumented(),
  };
}

export function chooseScoreboardBottleneck(snapshot = {}) {
  const breadth = snapshot.panels?.data?.market_breadth ?? {};
  const depth = snapshot.panels?.data?.market_depth ?? {};
  const history = snapshot.panels?.data?.history ?? {};
  const signals = snapshot.panels?.data?.signals ?? {};
  const listings = metricValue(breadth.listings_total);
  const reobservationRate = metricValue(history.reobservation_rate);
  const covered = metricValue(breadth.variants_fresh_30d);
  const coveragePct = metricValue(breadth.coverage_pct_30d);
  const buckets = depth.fresh_30d_buckets?.value ?? {};

  if (listings === null) return bottleneck("data_unavailable", "Market listing data is unavailable.");
  if (listings > 0 && reobservationRate !== null && reobservationRate < 10) {
    return bottleneck("history_not_enabled", "Known listings are not being re-observed often enough to build price history.");
  }
  if (covered > 0 && Number(buckets.one ?? 0) / covered >= 0.8) {
    return bottleneck("depth_insufficient", "Most covered variants still have only one fresh listing.");
  }
  if (coveragePct !== null && coveragePct < 5) {
    return bottleneck("source_gap", "Fresh market coverage is still too narrow across the catalog.");
  }
  const stock = signals.stock?.value?.total;
  const restock = signals.restock?.value?.total;
  if (stock === 0 && restock === 0) {
    return bottleneck("signal_gap", "Stock and restock signal coverage is still empty.");
  }
  return bottleneck("monitor", "No single P0 data bottleneck dominates the current snapshot.");
}

function signalWindow(rows, now, timeSelector) {
  return metric({
    total: rows.length,
    distinct_variants: new Set(rows.map((row) => text(row.variant_id ?? row.matched_variant_id)).filter(Boolean)).size,
    fresh_24h: countFresh(rows, now, 1, timeSelector),
    fresh_7d: countFresh(rows, now, 7, timeSelector),
    fresh_30d: countFresh(rows, now, 30, timeSelector),
  });
}

function unavailableMarketBreadth() {
  return Object.fromEntries([
    "listings_total", "active_safe_single_total", "distinct_variants_with_market_evidence", "variants_fresh_24h",
    "variants_fresh_7d", "variants_fresh_30d", "coverage_pct_30d", "provider_split", "new_listings_24h",
    "new_listings_7d", "new_listings_30d", "completed_sale_evidence_count", "affiliate_provenance_total",
    "affiliate_provenance_provider_split",
  ].map((key) => [key, unavailable()]));
}
function unavailableMarketDepth() { return { fresh_30d_buckets: unavailable(), covered_variant_listing_distribution: unavailable() }; }
function unavailableHistory() {
  return Object.fromEntries([
    "observations_total", "new_observations_24h", "new_observations_7d", "new_observations_30d",
    "observations_per_listing_distribution", "listings_with_1_observation", "listings_with_2_4_observations",
    "listings_with_5_plus_observations", "listings_reobserved_total", "listings_reobserved_24h",
    "listings_reobserved_7d", "listings_reobserved_30d", "reobservation_rate", "reobservation_outcomes",
  ].map((key) => [key, unavailable()]));
}

function sanitizeExternalPanel(value, allowedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { state: "unavailable" };
  const panel = { state: "available" };
  for (const key of allowedKeys) {
    panel[key] = Object.hasOwn(value, key) && value[key] !== undefined
      ? metric(safeScalar(value[key]))
      : unavailable();
  }
  return panel;
}

function sanitizeSourceCapabilities(rows) {
  return rows.map((row) => ({
    source: text(row?.source).slice(0, 80),
    capability: text(row?.capability).slice(0, 120),
    state: ["active", "disabled", "partnership_required", "not_configured"].includes(row?.state) ? row.state : "not_configured",
  })).filter((row) => row.source).sort((a, b) => a.source.localeCompare(b.source, "en"));
}

function sanitizeNumberObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return sortObject(Object.fromEntries(Object.entries(value)
    .filter(([key, entry]) => /^[a-z0-9_.-]{1,80}$/i.test(key) && Number.isFinite(Number(entry)))
    .map(([key, entry]) => [key, Number(entry)])));
}

function deltaSet(current, previous, paths) {
  return Object.fromEntries(Object.entries(paths).map(([name, path]) => {
    const currentValue = metricValue(readPath(current, path));
    const previousValue = metricValue(readPath(previous, path));
    return [name, currentValue !== null && previousValue !== null ? metric(round(currentValue - previousValue, 4)) : unavailable()];
  }));
}

function groupUniqueListingsByVariant(rows) {
  const groups = new Map();
  for (const row of rows) {
    const variantId = listingVariantId(row);
    if (!variantId) continue;
    if (!groups.has(variantId)) groups.set(variantId, new Map());
    groups.get(variantId).set(text(row.id) || `${providerOfListing(row)}:${text(row.source_url)}`, row);
  }
  return new Map([...groups.entries()].map(([variantId, entries]) => [variantId, [...entries.values()]]));
}

function isSafeActiveSingle(row) {
  return row?.status === "active"
    && row?.listing_type === "single"
    && row?.review_required !== true
    && Boolean(listingVariantId(row));
}
function listingVariantId(row) { return text(row?.variant_id ?? row?.matched_variant_id); }
function rowTimestamp(row) { return row?.last_observed_at ?? row?.listed_at ?? row?.created_at; }
function providerOfListing(row) { return normalizeProvider(row?.raw?.provider ?? row?.source) || "unknown"; }
function normalizeProvider(value) { return SAFE_PROVIDER_NAMES.get(text(value).toLowerCase()) ?? ""; }
function hasAffiliateProvenance(row) {
  const raw = row?.raw;
  return Boolean(raw && typeof raw === "object"
    && text(raw.affiliate_url)
    && text(raw.affiliate_url_source)
    && text(raw.affiliate_url_contract)
    && text(raw.source_documentation));
}

function reobservedWithin(groups, now, days) {
  let count = 0;
  for (const rows of groups.values()) {
    const times = rows.map((row) => validDate(row.observed_at ?? row.created_at)).filter(Boolean).sort((a, b) => a - b);
    if (times.length < 2) continue;
    if (times.slice(1).some((time) => isFresh(time, now, days))) count += 1;
  }
  return count;
}

function issueReason(row) {
  return text(row?.raw?.reason_code ?? row?.raw?.reason ?? row?.issue_type ?? row?.note).slice(0, 100) || "unknown";
}

function countFresh(rows, now, days, selector) { return rows.filter((row) => isFresh(selector(row), now, days)).length; }
function isFresh(value, now, days) {
  const date = validDate(value);
  if (!date || date > now) return false;
  return now.getTime() - date.getTime() < days * DAY_MS;
}

function latestDataTimestamp(groups) {
  const values = [
    ...(groups.listings ?? []).flatMap((row) => [row.updated_at, row.last_observed_at, row.created_at]),
    ...(groups.observations ?? []).flatMap((row) => [row.observed_at, row.created_at]),
    ...(groups.stockReports ?? []).flatMap((row) => [row.reported_at, row.created_at]),
    ...(groups.restockEvents ?? []).flatMap((row) => [row.reported_at, row.created_at]),
    ...(groups.xReactions ?? []).flatMap((row) => [row.posted_at, row.created_at]),
    ...(groups.outboundClicks ?? []).map((row) => row.clicked_at),
  ].map(validDate).filter(Boolean);
  return values.length ? new Date(Math.max(...values.map((date) => date.getTime()))).toISOString() : null;
}

function groupBy(rows, selector) {
  const groups = new Map();
  for (const row of rows) {
    const key = selector(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}
function countBy(rows, selector) {
  const counts = {};
  for (const row of rows) {
    const key = selector(row) || "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
function percentile(values, percentileValue) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.max(0, Math.ceil(sorted.length * percentileValue) - 1);
  return sorted[index];
}

function readPath(value, path) { return path.reduce((current, key) => current?.[key], value); }
function arrayCountMetric(value) { return value ? metric(value.length) : unavailable(); }
function optionalArray(value) { return Array.isArray(value) ? value : null; }
function metric(value) { return { state: "available", value }; }
function unavailable() { return { state: "unavailable", value: null }; }
function notInstrumented() { return { state: "not_instrumented", value: null }; }
function metricValue(value) { return value?.state === "available" && Number.isFinite(Number(value.value)) ? Number(value.value) : null; }
function safeScalar(value) { return typeof value === "string" || typeof value === "boolean" ? value : Number.isFinite(Number(value)) ? Number(value) : null; }
function safeSha(value) { const sha = text(value).toLowerCase(); return /^[0-9a-f]{40}$/.test(sha) ? sha : null; }
function safeRunState(value) { return SCOREBOARD_STATES.includes(value) ? value : "unavailable"; }
function validDate(value) { const date = value instanceof Date ? new Date(value.getTime()) : value ? new Date(value) : null; return date && Number.isFinite(date.getTime()) ? date : null; }
function sortObject(value) { return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en"))); }
function round(value, digits) { const factor = 10 ** digits; return Math.round(Number(value) * factor) / factor; }
function text(value) { return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim(); }
function bottleneck(label, reason) { return { label, reason }; }
function display(value, suffix = "") {
  if (value?.state !== "available") return value?.state ?? "unavailable";
  if (typeof value.value === "number") return `${value.value.toLocaleString("ja-JP")}${suffix}`;
  return `${value.value ?? "unavailable"}${suffix}`;
}
function signedDelta(value) {
  if (value?.state !== "available") return value?.state ?? "unavailable";
  const number = Number(value.value);
  return Number.isFinite(number) ? `${number >= 0 ? "+" : ""}${number}` : "unavailable";
}
function panelStateText(panel) {
  if (!panel) return "unavailable";
  if (panel.state) return safeRunState(panel.state);
  if (panel.state === undefined && panel.value !== undefined) return panel.state ?? "unavailable";
  return "available";
}
