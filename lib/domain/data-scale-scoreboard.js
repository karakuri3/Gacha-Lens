export const SCOREBOARD_SCHEMA_VERSION = 1;
export const SCOREBOARD_STATES = Object.freeze(["available", "unavailable", "not_instrumented"]);

const DAY_MS = 24 * 60 * 60 * 1000;
const PROVIDER_ALIASES = new Map([
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
  const snapshot = {
    schema_version: SCOREBOARD_SCHEMA_VERSION,
    generated_at: now.toISOString(),
    data_as_of: latestDataTimestamp({
      listings,
      observations,
      stockReports,
      restockEvents,
      xReactions,
      outboundClicks,
    }),
    main_sha: safeSha(options.mainSha ?? input.mainSha),
    source: "production_read_only",
    panels: {
      data: {
        catalog: {
          series_total: arrayCountMetric(series),
          variants_total: arrayCountMetric(variants),
          supported_source_count: sourceCapabilities === null ? unavailable() : metric(sourceCapabilities.length),
          source_capabilities: sourceCapabilities === null ? unavailable() : metric(sanitizeSourceCapabilities(sourceCapabilities)),
        },
        market_breadth: market.breadth,
        market_depth: market.depth,
        history: market.history,
        signals: buildSignalPanel({
          stockReports,
          restockEvents,
          xReactions,
          forecastEvaluations,
          socialAuthorized: input.socialAuthorized === true,
          now,
        }),
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
      click: buildClickPanel({ outboundClicks, listings, now }),
      revenue: sanitizeExternalPanel(input.revenue, [
        "affiliate_orders_30d",
        "affiliate_revenue_30d",
        "affiliate_revenue_lifetime",
        "conversion_rate_30d",
        "epc_30d",
        "adsense_revenue_30d",
      ]),
      collection_health: buildCollectionHealthPanel({
        ingestionRuns,
        importIssues,
        collectionHealth: plainObject(input.collectionHealth),
        market,
        now,
      }),
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
  const providers = breadth.provider_split?.value ?? {};

  return [
    `Gacha Lens Data Health — ${snapshot.generated_at ?? "unknown"}`,
    `Catalog       ${display(catalog.variants_total)} variants / ${display(catalog.series_total)} series`,
    `Market        ${display(breadth.listings_total)} listings (${signedDelta(snapshot.trends?.day?.listings_total)}/day)`,
    `Coverage      ${display(breadth.variants_fresh_30d)} variants / ${display(breadth.coverage_pct_30d, "%")} fresh <30d`,
    `Depth         ${display(depth.variants_1_fresh)}×1 | ${display(depth.variants_2_fresh)}×2 | ${display(sumMetrics([depth.variants_3_4_fresh, depth.variants_5_9_fresh, depth.variants_10_plus_fresh]))}×3+`,
    `History       ${display(history.observations_total)} obs | ${display(history.listings_reobserved_total)} re-observed`,
    `Sources       Rakuten ${providers.rakuten ?? 0} | Yahoo ${providers.yahoo ?? 0} | Mercari ${providers.mercari ?? "partnership_required"}`,
    `Signals       Stock ${signalTotal(signals.stock)} | Restock ${signalTotal(signals.restock)} | X ${signalTotal(signals.social)}`,
    `Traffic       ${panelStateText(snapshot.panels?.traffic)}`,
    `Clicks        ${display(clicks.clicks_7d)} / 7d`,
    `Revenue       ${panelStateText(snapshot.panels?.revenue)}`,
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

export function chooseScoreboardBottleneck(snapshot = {}) {
  const breadth = snapshot.panels?.data?.market_breadth ?? {};
  const depth = snapshot.panels?.data?.market_depth ?? {};
  const history = snapshot.panels?.data?.history ?? {};
  const signals = snapshot.panels?.data?.signals ?? {};
  const listings = metricNumber(breadth.listings_total);
  const reobservationRate = metricNumber(history.reobservation_rate);
  const covered = metricNumber(breadth.variants_fresh_30d);
  const coveragePct = metricNumber(breadth.coverage_pct_30d);
  const oneDeep = metricNumber(depth.variants_1_fresh);

  if (listings === null) return bottleneck("data_unavailable", "Market listing data is unavailable.");
  if (listings > 0 && reobservationRate !== null && reobservationRate < 10) {
    return bottleneck("history_not_enabled", "Known listings are not being re-observed often enough to build price history.");
  }
  if (covered > 0 && oneDeep !== null && oneDeep / covered >= 0.8) {
    return bottleneck("depth_insufficient", "Most covered variants still have only one fresh listing.");
  }
  if (coveragePct !== null && coveragePct < 5) {
    return bottleneck("source_gap", "Fresh market coverage is still too narrow across the catalog.");
  }
  const stock = signalTotalNumber(signals.stock);
  const restock = signalTotalNumber(signals.restock);
  if (stock === 0 && restock === 0) {
    return bottleneck("signal_gap", "Stock and restock signal coverage is still empty.");
  }
  return bottleneck("monitor", "No single P0 data bottleneck dominates the current snapshot.");
}

function buildMarketPanels({ variants, listings, observations, now }) {
  if (listings === null) {
    return {
      breadth: unavailableMarketBreadth(),
      depth: unavailableMarketDepth(),
      history: observations === null ? unavailableHistory() : buildHistory(observations, null, now),
    };
  }

  const safeSingles = listings.filter(isSafeActiveSingle);
  const fresh24 = safeSingles.filter((row) => isFresh(rowTimestamp(row), now, 1));
  const fresh7 = safeSingles.filter((row) => isFresh(rowTimestamp(row), now, 7));
  const fresh30 = safeSingles.filter((row) => isFresh(rowTimestamp(row), now, 30));
  const fresh30ByVariant = groupUniqueListingsByVariant(fresh30);
  const variantTotal = variants?.length ?? null;
  const affiliateRows = listings.filter(hasAffiliateProvenance);

  return {
    breadth: {
      listings_total: metric(listings.length),
      active_safe_single_total: metric(safeSingles.length),
      distinct_variants_with_market_evidence: metric(uniqueVariantCount(safeSingles)),
      variants_fresh_24h: metric(uniqueVariantCount(fresh24)),
      variants_fresh_7d: metric(uniqueVariantCount(fresh7)),
      variants_fresh_30d: metric(fresh30ByVariant.size),
      coverage_pct_30d: variantTotal === null
        ? unavailable()
        : metric(round(variantTotal ? fresh30ByVariant.size / variantTotal * 100 : 0, 4)),
      provider_split: metric(sortObject(countBy(listings, providerOfListing))),
      new_listings_24h: metric(countFresh(listings, now, 1, (row) => row.created_at ?? row.listed_at)),
      new_listings_7d: metric(countFresh(listings, now, 7, (row) => row.created_at ?? row.listed_at)),
      new_listings_30d: metric(countFresh(listings, now, 30, (row) => row.created_at ?? row.listed_at)),
      completed_sale_evidence_count: metric(listings.filter((row) => String(row.status ?? "") === "sold").length),
      affiliate_provenance_total: metric(affiliateRows.length),
      affiliate_provenance_provider_split: metric(sortObject(countBy(affiliateRows, providerOfListing))),
    },
    depth: buildDepth({ variants, fresh30ByVariant }),
    history: observations === null ? unavailableHistory() : buildHistory(observations, listings, now),
  };
}

function buildDepth({ variants, fresh30ByVariant }) {
  const counts = [...fresh30ByVariant.values()].map((rows) => rows.length);
  return {
    variants_0_fresh: variants === null ? unavailable() : metric(Math.max(0, variants.length - fresh30ByVariant.size)),
    variants_1_fresh: metric(counts.filter((value) => value === 1).length),
    variants_2_fresh: metric(counts.filter((value) => value === 2).length),
    variants_3_4_fresh: metric(counts.filter((value) => value >= 3 && value <= 4).length),
    variants_5_9_fresh: metric(counts.filter((value) => value >= 5 && value <= 9).length),
    variants_10_plus_fresh: metric(counts.filter((value) => value >= 10).length),
    covered_variant_listing_distribution: metric({
      p50: percentile(counts, 0.5),
      p90: percentile(counts, 0.9),
      max: counts.length ? Math.max(...counts) : 0,
    }),
  };
}

function buildHistory(observations, listings, now) {
  const byListing = groupBy(observations.filter((row) => text(row.listing_id)), (row) => text(row.listing_id));
  const listingIds = listings === null
    ? [...byListing.keys()]
    : listings.map((row) => text(row.id)).filter(Boolean);
  const uniqueListingIds = [...new Set(listingIds)];
  const counts = uniqueListingIds.map((listingId) => byListing.get(listingId)?.length ?? 0);
  const reobserved = counts.filter((value) => value >= 2).length;
  const outcomeRows = observations.filter((row) => text(row?.raw?.market_reobservation?.outcome));

  return {
    observations_total: metric(observations.length),
    new_observations_24h: metric(countFresh(observations, now, 1, observationTimestamp)),
    new_observations_7d: metric(countFresh(observations, now, 7, observationTimestamp)),
    new_observations_30d: metric(countFresh(observations, now, 30, observationTimestamp)),
    observations_per_listing_distribution: metric({
      p50: percentile(counts, 0.5),
      p90: percentile(counts, 0.9),
      max: counts.length ? Math.max(...counts) : 0,
    }),
    listings_with_0_observations: listings === null ? unavailable() : metric(counts.filter((value) => value === 0).length),
    listings_with_1_observation: metric(counts.filter((value) => value === 1).length),
    listings_with_2_4_observations: metric(counts.filter((value) => value >= 2 && value <= 4).length),
    listings_with_5_plus_observations: metric(counts.filter((value) => value >= 5).length),
    listings_reobserved_total: metric(reobserved),
    listings_reobserved_24h: metric(reobservedWithin(byListing, now, 1)),
    listings_reobserved_7d: metric(reobservedWithin(byListing, now, 7)),
    listings_reobserved_30d: metric(reobservedWithin(byListing, now, 30)),
    reobservation_rate: metric(uniqueListingIds.length ? round(reobserved / uniqueListingIds.length * 100, 4) : 0),
    reobservation_outcomes: outcomeRows.length
      ? metric(sortObject(countBy(outcomeRows, (row) => text(row.raw.market_reobservation.outcome) || "unknown")))
      : notInstrumented(),
  };
}

function buildSignalPanel({ stockReports, restockEvents, xReactions, forecastEvaluations, socialAuthorized, now }) {
  return {
    stock: stockReports === null ? unavailable() : signalWindow(stockReports, now, signalTimestamp),
    restock: restockEvents === null ? unavailable() : signalWindow(restockEvents, now, signalTimestamp),
    social: !socialAuthorized
      ? notInstrumented()
      : xReactions === null
        ? unavailable()
        : signalWindow(xReactions.filter((row) => row.review_required !== true), now, socialTimestamp),
    expectation: forecastEvaluations === null
      ? notInstrumented()
      : metric({
          total: forecastEvaluations.length,
          ready: forecastEvaluations.filter((row) => row.evidence_status === "ready").length,
          insufficient: forecastEvaluations.filter((row) => row.evidence_status !== "ready").length,
          provenance_complete: forecastEvaluations.filter((row) => row.evidence_status === "ready" && Number(row.evidence_family_count) >= 2).length,
        }),
  };
}

function buildClickPanel({ outboundClicks, listings, now }) {
  if (outboundClicks === null) return unavailableClickPanel();

  const rows30 = outboundClicks.filter((row) => isFresh(row.clicked_at, now, 30));
  const affiliateKeys = listings === null
    ? null
    : new Set(listings.filter(hasAffiliateProvenance).map((row) => `${listingVariantId(row)}:${providerOfListing(row)}`));
  const eligibleClicks = affiliateKeys === null
    ? null
    : rows30.filter((row) => affiliateKeys.has(`${text(row.variant_id)}:${normalizeProvider(row.provider)}`)).length;

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
  const hasCollectionHealth = Object.keys(collectionHealth).length > 0;
  const marketRuns = ingestionRuns === null ? null : ingestionRuns.filter((row) => row.task === "market");
  const recentRuns = marketRuns === null ? null : marketRuns.filter((row) => isFresh(row.started_at ?? row.created_at, now, 1));
  const unresolvedIssues = importIssues === null ? null : importIssues.filter((row) => row.resolved !== true);

  return {
    state: ingestionRuns !== null || importIssues !== null || hasCollectionHealth ? "available" : "unavailable",
    market_runs_24h: recentRuns === null ? unavailable() : metric(recentRuns.length),
    market_run_success_24h: recentRuns === null ? unavailable() : metric(recentRuns.filter((row) => ["success", "succeeded"].includes(String(row.status))).length),
    market_run_failed_24h: recentRuns === null ? unavailable() : metric(recentRuns.filter((row) => ["failed", "error"].includes(String(row.status))).length),
    unresolved_issue_count: unresolvedIssues === null ? unavailable() : metric(unresolvedIssues.length),
    unresolved_issue_reason_counts: unresolvedIssues === null
      ? unavailable()
      : metric(sortObject(countBy(unresolvedIssues, issueReason))),
    provider_request_metrics: collectionHealth.provider_request_metrics
      ? metric(sanitizeNumberObject(collectionHealth.provider_request_metrics))
      : notInstrumented(),
    reobserver_outcomes: collectionHealth.reobserver_outcomes
      ? metric(sanitizeNumberObject(collectionHealth.reobserver_outcomes))
      : market.history.reobservation_outcomes,
    depth_collector: collectionHealth.depth_collector
      ? metric(sanitizeNumberObject(collectionHealth.depth_collector))
      : notInstrumented(),
    observed_daily_throughput: market.breadth.new_listings_24h?.state === "available"
      && market.history.new_observations_24h?.state === "available"
      ? metric({
          new_listings: market.breadth.new_listings_24h.value,
          new_observations: market.history.new_observations_24h.value,
        })
      : unavailable(),
    theoretical_daily_throughput: Number.isFinite(Number(collectionHealth.theoretical_daily_throughput))
      ? metric(Number(collectionHealth.theoretical_daily_throughput))
      : notInstrumented(),
  };
}

function signalWindow(rows, now, timestampSelector) {
  return metric({
    total: rows.length,
    distinct_variants: new Set(rows.map((row) => text(row.variant_id ?? row.matched_variant_id)).filter(Boolean)).size,
    fresh_24h: countFresh(rows, now, 1, timestampSelector),
    fresh_7d: countFresh(rows, now, 7, timestampSelector),
    fresh_30d: countFresh(rows, now, 30, timestampSelector),
  });
}

function sanitizeExternalPanel(value, allowedKeys) {
  const object = plainObject(value);
  if (!Object.keys(object).length) return { state: "unavailable" };
  if (SCOREBOARD_STATES.includes(object.state) && object.state !== "available") return { state: object.state };

  const panel = { state: "available" };
  for (const key of allowedKeys) {
    if (!Object.hasOwn(object, key)) {
      panel[key] = unavailable();
      continue;
    }
    const sanitized = safeScalar(object[key]);
    panel[key] = sanitized === null ? unavailable() : metric(sanitized);
  }
  return panel;
}

function sanitizeSourceCapabilities(rows) {
  return rows.map((row) => ({
    source: text(row?.source).slice(0, 80),
    capability: text(row?.capability).slice(0, 120),
    state: ["active", "disabled", "partnership_required", "not_configured"].includes(row?.state)
      ? row.state
      : "not_configured",
  })).filter((row) => row.source).sort((a, b) => a.source.localeCompare(b.source, "en"));
}

function sanitizeNumberObject(value) {
  return sortObject(Object.fromEntries(Object.entries(plainObject(value))
    .filter(([key, entry]) => /^[a-z0-9_.-]{1,80}$/i.test(key) && Number.isFinite(Number(entry)))
    .map(([key, entry]) => [key, Number(entry)])));
}

function deltaSet(current, previous, paths) {
  return Object.fromEntries(Object.entries(paths).map(([name, path]) => {
    const currentValue = metricNumber(readPath(current, path));
    const previousValue = metricNumber(readPath(previous, path));
    return [name, currentValue !== null && previousValue !== null
      ? metric(round(currentValue - previousValue, 4))
      : unavailable()];
  }));
}

function groupUniqueListingsByVariant(rows) {
  const groups = new Map();
  for (const row of rows) {
    const variantId = listingVariantId(row);
    if (!variantId) continue;
    if (!groups.has(variantId)) groups.set(variantId, new Map());
    const key = text(row.id) || `${providerOfListing(row)}:${text(row.source_url)}`;
    groups.get(variantId).set(key, row);
  }
  return new Map([...groups.entries()].map(([variantId, entries]) => [variantId, [...entries.values()]]));
}

function reobservedWithin(groups, now, days) {
  let total = 0;
  for (const rows of groups.values()) {
    const times = rows.map((row) => validDate(observationTimestamp(row))).filter(Boolean).sort((a, b) => a - b);
    if (times.length >= 2 && times.slice(1).some((time) => isFresh(time, now, days))) total += 1;
  }
  return total;
}

function unavailableMarketBreadth() {
  return Object.fromEntries([
    "listings_total",
    "active_safe_single_total",
    "distinct_variants_with_market_evidence",
    "variants_fresh_24h",
    "variants_fresh_7d",
    "variants_fresh_30d",
    "coverage_pct_30d",
    "provider_split",
    "new_listings_24h",
    "new_listings_7d",
    "new_listings_30d",
    "completed_sale_evidence_count",
    "affiliate_provenance_total",
    "affiliate_provenance_provider_split",
  ].map((key) => [key, unavailable()]));
}

function unavailableMarketDepth() {
  return Object.fromEntries([
    "variants_0_fresh",
    "variants_1_fresh",
    "variants_2_fresh",
    "variants_3_4_fresh",
    "variants_5_9_fresh",
    "variants_10_plus_fresh",
    "covered_variant_listing_distribution",
  ].map((key) => [key, unavailable()]));
}

function unavailableHistory() {
  return Object.fromEntries([
    "observations_total",
    "new_observations_24h",
    "new_observations_7d",
    "new_observations_30d",
    "observations_per_listing_distribution",
    "listings_with_0_observations",
    "listings_with_1_observation",
    "listings_with_2_4_observations",
    "listings_with_5_plus_observations",
    "listings_reobserved_total",
    "listings_reobserved_24h",
    "listings_reobserved_7d",
    "listings_reobserved_30d",
    "reobservation_rate",
    "reobservation_outcomes",
  ].map((key) => [key, unavailable()]));
}

function unavailableClickPanel() {
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

function latestDataTimestamp(groups) {
  const values = [
    ...(groups.listings ?? []).flatMap((row) => [row.updated_at, row.last_observed_at, row.created_at]),
    ...(groups.observations ?? []).flatMap((row) => [row.observed_at, row.created_at]),
    ...(groups.stockReports ?? []).flatMap((row) => [row.reported_at, row.created_at]),
    ...(groups.restockEvents ?? []).flatMap((row) => [row.reported_at, row.created_at]),
    ...(groups.xReactions ?? []).flatMap((row) => [row.posted_at, row.created_at]),
    ...(groups.outboundClicks ?? []).map((row) => row.clicked_at),
  ].map(validDate).filter(Boolean);
  return values.length ? new Date(Math.max(...values.map((date) => date.getTime())).toISOString() : null;
}

function issueReason(row) {
  const reasonCode = text(row?.raw?.reason_code ?? row?.raw?.reason);
  const issueType = text(row?.issue_type);
  return (reasonCode || issueType || "unknown").slice(0, 100);
}

function isSafeActiveSingle(row) {
  return row?.status === "active"
    && row?.listing_type === "single"
    && row?.review_required !== true
    && Boolean(listingVariantId(row));
}
function hasAffiliateProvenance(row) {
  const raw = plainObject(row?.raw);
  return Boolean(
    text(raw.affiliate_url)
    && text(raw.affiliate_url_source)
    && text(raw.affiliate_url_contract)
    && text(raw.source_documentation)
  );
}
function uniqueVariantCount(rows) { return new Set(rows.map(listingVariantId).filter(Boolean)).size; }
function listingVariantId(row) { return text(row?.variant_id ?? row?.matched_variant_id); }
function providerOfListing(row) { return normalizeProvider(row?.raw?.provider ?? row?.source) || "unknown"; }
function normalizeProvider(value) { return PROVIDER_ALIASES.get(text(value).toLowerCase()) ?? ""; }
function rowTimestamp(row) { return row?.last_observed_at ?? row?.listed_at ?? row?.created_at; }
function observationTimestamp(row) { return row?.observed_at ?? row?.created_at; }
function signalTimestamp(row) { return row?.reported_at ?? row?.created_at; }
function socialTimestamp(row) { return row?.posted_at ?? row?.created_at; }

function countFresh(rows, now, days, selector) { return rows.filter((row) => isFresh(selector(row), now, days)).length; }
function isFresh(value, now, days) {
  const date = value instanceof Date ? value : validDate(value);
  return Boolean(date && date <= now && now.getTime() - date.getTime() < days * DAY_MS);
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
function percentile(values, quantile) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}
function readPath(value, path) { return path.reduce((current, key) => current?.[key], value); }
function optionalArray(value) { return Array.isArray(value) ? value : null; }
function arrayCountMetric(value) { return value === null ? unavailable() : metric(value.length); }
function plainObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function metric(value) { return { state: "available", value }; }
function unavailable() { return { state: "unavailable", value: null }; }
function notInstrumented() { return { state: "not_instrumented", value: null }; }
function metricNumber(value) {
  if (value?.state !== "available" || !Number.isFinite(Number(value.value))) return null;
  return Number(value.value);
}
function safeScalar(value) {
  if (typeof value === "string") return text(value).slice(0, 200);
  if (typeof value === "boolean") return value;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}
function safeSha(value) { const sha = text(value).toLowerCase(); return /^[0-9a-f]{40}$/.test(sha) ? sha : null; }
function validDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
function sortObject(value) { return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en"))); }
function round(value, digits) { const factor = 10 ** digits; return Math.round(Number(value) * factor) / factor; }
function text(value) { return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim(); }
function bottleneck(label, reason) { return { label, reason }; }
function sumMetrics(values) {
  if (values.some((value) => value?.state !== "available")) return unavailable();
  return metric(values.reduce((sum, value) => sum + Number(value.value || 0), 0));
}
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
function signalTotal(value) {
  if (value?.state !== "available") return value?.state ?? "unavailable";
  return Number.isFinite(Number(value.value?.total)) ? String(Number(value.value.total)) : "unavailable";
}
function signalTotalNumber(value) {
  if (value?.state !== "available" || !Number.isFinite(Number(value.value?.total))) return null;
  return Number(value.value.total);
}
function panelStateText(panel) { return SCOREBOARD_STATES.includes(panel?.state) ? panel.state : "unavailable"; }
