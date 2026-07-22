export const MARKET_SOURCE_SCOPES = Object.freeze({
  PLANNER_APIS: "planner-apis",
  APPROVED_FEEDS: "approved-feeds",
  ALL: "all",
});

const VALID_SCOPES = new Set(Object.values(MARKET_SOURCE_SCOPES));

export function normalizeMarketSourceScope(value, fallback = MARKET_SOURCE_SCOPES.ALL) {
  const normalizedFallback = VALID_SCOPES.has(fallback) ? fallback : MARKET_SOURCE_SCOPES.ALL;
  return VALID_SCOPES.has(value) ? value : normalizedFallback;
}

export function selectMarketSourceFamilies(value, fallback = MARKET_SOURCE_SCOPES.ALL) {
  const sourceScope = normalizeMarketSourceScope(value, fallback);
  return {
    sourceScope,
    approvedFeedSourcesEnabled: sourceScope !== MARKET_SOURCE_SCOPES.PLANNER_APIS,
    plannerApiSourcesEnabled: sourceScope !== MARKET_SOURCE_SCOPES.APPROVED_FEEDS,
  };
}

export function describeMarketWriteReadiness(sourceScope, plannerApiSourcesConfigured) {
  const normalizedScope = normalizeMarketSourceScope(sourceScope, MARKET_SOURCE_SCOPES.PLANNER_APIS);
  const plannerCount = Math.max(0, Number(plannerApiSourcesConfigured) || 0);
  const blocked = normalizedScope === MARKET_SOURCE_SCOPES.PLANNER_APIS && plannerCount === 0;
  return {
    writeReady: !blocked,
    blockingReason: blocked ? "no_planner_api_source_configured" : null,
  };
}
