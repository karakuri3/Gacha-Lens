export const MARKET_REQUEST_BUDGET_CONTRACT_VERSION = 1;
export const MARKET_MAX_QUERY_ATTEMPTS_PER_ROOT = 3;
export const MARKET_MAX_RETRY_ATTEMPTS_PER_REQUEST = 3;
export const MARKET_MAX_AFFILIATE_REQUESTS_PER_ROOT = 1;

export const MARKET_PROVIDER_ROOT_LIMITS = Object.freeze({
  rakuten_ichiba: Object.freeze({ default: 8, max: 30 }),
  yahoo_shopping: Object.freeze({ default: 24, max: 50 }),
});

export const MARKET_MAX_DIAGNOSTIC_ENTRIES = Object.values(MARKET_PROVIDER_ROOT_LIMITS)
  .reduce((sum, limits) => sum + limits.max * (
    MARKET_MAX_QUERY_ATTEMPTS_PER_ROOT + MARKET_MAX_AFFILIATE_REQUESTS_PER_ROOT
  ), 0);

export const MARKET_MAX_DIAGNOSTIC_ATTEMPTS = (
  MARKET_MAX_DIAGNOSTIC_ENTRIES * MARKET_MAX_RETRY_ATTEMPTS_PER_REQUEST
);

export function resolveMarketProviderRootLimit(provider, value) {
  const limits = MARKET_PROVIDER_ROOT_LIMITS[provider];
  if (!limits) throw budgetError("Unsupported market request-budget provider.");
  if (value == null || String(value).trim() === "") return limits.default;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > limits.max) {
    throw budgetError(`${provider} root query limit must be between 1 and ${limits.max}.`);
  }
  return parsed;
}

export function buildMarketRequestBudget({
  queryCount = 0,
  queryAttemptCount,
  rakutenConfigured = false,
  yahooConfigured = false,
  rakutenAffiliateConfigured = false,
  yahooAffiliateConfigured = false,
  rakutenRootLimit,
  yahooRootLimit,
} = {}) {
  const roots = nonnegativeInteger(queryCount, "query count");
  const attempts = queryAttemptCount == null
    ? roots * MARKET_MAX_QUERY_ATTEMPTS_PER_ROOT
    : nonnegativeInteger(queryAttemptCount, "query attempt count");
  if (attempts > roots * MARKET_MAX_QUERY_ATTEMPTS_PER_ROOT) {
    throw budgetError("Market discovery attempts exceed the per-root limit.");
  }

  const rakuten = providerBudget({
    configured: rakutenConfigured,
    affiliateConfigured: rakutenAffiliateConfigured,
    roots,
    attempts,
    rootLimit: rakutenConfigured
      ? resolveMarketProviderRootLimit("rakuten_ichiba", rakutenRootLimit)
      : MARKET_PROVIDER_ROOT_LIMITS.rakuten_ichiba.default,
  });
  const yahoo = providerBudget({
    configured: yahooConfigured,
    affiliateConfigured: yahooAffiliateConfigured,
    roots,
    attempts,
    rootLimit: yahooConfigured
      ? resolveMarketProviderRootLimit("yahoo_shopping", yahooRootLimit)
      : MARKET_PROVIDER_ROOT_LIMITS.yahoo_shopping.default,
  });
  const discovery = rakuten.discovery_requests + yahoo.discovery_requests;
  const affiliate = rakuten.affiliate_enrichment_requests + yahoo.affiliate_enrichment_requests;
  const total = discovery + affiliate;
  const result = {
    contract_version: MARKET_REQUEST_BUDGET_CONTRACT_VERSION,
    max_query_attempts_per_root: MARKET_MAX_QUERY_ATTEMPTS_PER_ROOT,
    max_retry_attempts_per_request: MARKET_MAX_RETRY_ATTEMPTS_PER_REQUEST,
    diagnostic_entry_capacity: MARKET_MAX_DIAGNOSTIC_ENTRIES,
    diagnostic_attempt_capacity: MARKET_MAX_DIAGNOSTIC_ATTEMPTS,
    providers: {
      rakuten_ichiba: rakuten,
      yahoo_shopping: yahoo,
    },
    discovery_requests: discovery,
    affiliate_enrichment_requests: affiliate,
    planner_api_requests: total,
    maximum_http_attempts: total * MARKET_MAX_RETRY_ATTEMPTS_PER_REQUEST,
  };
  assertMarketRequestBudget(result);
  return result;
}

export function assertMarketRequestBudget(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw budgetError("Market request budget is missing.");
  }
  if (
    value.contract_version !== MARKET_REQUEST_BUDGET_CONTRACT_VERSION
    || value.max_query_attempts_per_root !== MARKET_MAX_QUERY_ATTEMPTS_PER_ROOT
    || value.max_retry_attempts_per_request !== MARKET_MAX_RETRY_ATTEMPTS_PER_REQUEST
    || value.diagnostic_entry_capacity !== MARKET_MAX_DIAGNOSTIC_ENTRIES
    || value.diagnostic_attempt_capacity !== MARKET_MAX_DIAGNOSTIC_ATTEMPTS
  ) throw budgetError("Market request-budget contract metadata is inconsistent.");
  for (const provider of Object.keys(MARKET_PROVIDER_ROOT_LIMITS)) {
    const current = value.providers?.[provider];
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      throw budgetError("Market provider request budget is missing.");
    }
    const limits = MARKET_PROVIDER_ROOT_LIMITS[provider];
    const rootLimit = nonnegativeInteger(current.root_limit, `${provider} root limit`);
    const roots = nonnegativeInteger(current.root_queries, `${provider} root queries`);
    const discovery = nonnegativeInteger(current.discovery_requests, `${provider} discovery requests`);
    const affiliate = nonnegativeInteger(current.affiliate_enrichment_requests, `${provider} affiliate requests`);
    const total = nonnegativeInteger(current.total_requests, `${provider} total requests`);
    if (
      rootLimit < 1
      || rootLimit > limits.max
      || roots > rootLimit
      || discovery > roots * MARKET_MAX_QUERY_ATTEMPTS_PER_ROOT
      || affiliate > roots * MARKET_MAX_AFFILIATE_REQUESTS_PER_ROOT
      || total !== discovery + affiliate
    ) throw budgetError(`${provider} request budget exceeds the reviewed contract.`);
  }
  const providerValues = Object.values(value.providers);
  const discovery = providerValues.reduce((sum, entry) => sum + entry.discovery_requests, 0);
  const affiliate = providerValues.reduce((sum, entry) => sum + entry.affiliate_enrichment_requests, 0);
  const total = discovery + affiliate;
  if (
    value.discovery_requests !== discovery
    || value.affiliate_enrichment_requests !== affiliate
    || value.planner_api_requests !== total
    || total > MARKET_MAX_DIAGNOSTIC_ENTRIES
    || value.maximum_http_attempts !== total * MARKET_MAX_RETRY_ATTEMPTS_PER_REQUEST
    || value.maximum_http_attempts > MARKET_MAX_DIAGNOSTIC_ATTEMPTS
  ) throw budgetError("Combined market request budget exceeds the reviewed contract.");
  return true;
}

function providerBudget({ configured, affiliateConfigured, roots, attempts, rootLimit }) {
  if (!configured) return {
    root_limit: rootLimit,
    root_queries: 0,
    discovery_requests: 0,
    affiliate_enrichment_requests: 0,
    total_requests: 0,
  };
  const rootQueries = Math.min(roots, rootLimit);
  const discoveryRequests = roots <= rootLimit
    ? attempts
    : Math.min(attempts, rootQueries * MARKET_MAX_QUERY_ATTEMPTS_PER_ROOT);
  const affiliateRequests = affiliateConfigured
    ? rootQueries * MARKET_MAX_AFFILIATE_REQUESTS_PER_ROOT
    : 0;
  return {
    root_limit: rootLimit,
    root_queries: rootQueries,
    discovery_requests: discoveryRequests,
    affiliate_enrichment_requests: affiliateRequests,
    total_requests: discoveryRequests + affiliateRequests,
  };
}

function nonnegativeInteger(value, label) {
  const parsed = Number(value ?? 0);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > Number.MAX_SAFE_INTEGER) {
    throw budgetError(`Invalid market ${label}.`);
  }
  return parsed;
}

function budgetError(message) {
  const error = new Error(message);
  error.code = "market_request_budget_exceeded";
  return error;
}
