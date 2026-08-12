const PROVIDERS = new Set(["rakuten_ichiba", "yahoo_shopping", "approved_feed", "unknown"]);
const FAILURE_CATEGORIES = new Set([
  null,
  "timeout",
  "network",
  "rate_limited",
  "server_error",
  "client_error",
  "invalid_json",
  "configuration",
  "unknown",
]);
const MAX_QUERIES = 100;
const MAX_ATTEMPTS = 3;
const MAX_QUERY_LENGTH = 160;
const REQUEST_KINDS = new Set(["discovery", "affiliate_enrichment"]);
const RELEVANCE_REASONS = new Set(["normalization_rejected", "known_unrelated_title", "title_mismatch"]);
const CONTROL = /[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
const CREDENTIAL_URL = /(?:https?:\/\/|[?&](?:applicationid|accesskey|appid|affiliateid|api[_-]?key|token|secret|password)=)/i;
const FORBIDDEN_FIELD = /(application.?id|access.?key|app.?id|affiliate.?id|api.?key|authorization|cookie|headers?|environment|token|secret|password|service.?role|raw|seller|credential|response)/i;

export function buildSanitizedMarketRequestDiagnostics(feedResults = [], duplicateQueriesSkipped = 0) {
  if (!Array.isArray(feedResults)) throw new Error("Market request diagnostics must be built from an array.");
  feedResults.forEach(assertNoForbiddenFields);
  const attempted = feedResults.filter((entry) => Number(entry?.attempt_count) >= 1);
  if (attempted.length > MAX_QUERIES) throw new Error("Market request diagnostics exceed the query limit.");

  const providerIndexes = new Map();
  const queries = attempted.map((entry) => {
    const provider = normalizeProvider(entry.source);
    const fallbackIndex = providerIndexes.get(provider) ?? 0;
    providerIndexes.set(provider, fallbackIndex + 1);
    return sanitizeQueryDiagnostic(entry, provider, fallbackIndex);
  });
  const providers = {};
  for (const provider of [...new Set(queries.map((entry) => entry.provider))].sort()) {
    providers[provider] = aggregateQueries(queries.filter((entry) => entry.provider === provider));
  }
  const aggregate = {
    ...aggregateQueries(queries),
    duplicate_queries_skipped: nonnegativeInteger(duplicateQueriesSkipped, "duplicate_queries_skipped"),
  };
  const result = { aggregate, providers, queries };
  validateMarketRequestDiagnostics(result);
  return result;
}

export function sanitizeMarketRequestDiagnostics(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Market request diagnostics must be an object.");
  }
  validateMarketRequestDiagnostics(value);
  const queries = Array.isArray(value.queries)
    ? value.queries.map((entry, index) => sanitizeQueryDiagnostic(entry, normalizeProvider(entry?.provider), index))
    : [];
  const result = {
    aggregate: {
      ...aggregateQueries(queries),
      duplicate_queries_skipped: nonnegativeInteger(value.aggregate?.duplicate_queries_skipped, "duplicate_queries_skipped"),
    },
    providers: {},
    queries,
  };
  for (const provider of [...new Set(queries.map((entry) => entry.provider))].sort()) {
    result.providers[provider] = aggregateQueries(queries.filter((entry) => entry.provider === provider));
  }
  validateMarketRequestDiagnostics(result);
  return result;
}

export function validateMarketRequestDiagnostics(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.queries)) {
    throw new Error("Market request diagnostics are incomplete.");
  }
  if (value.queries.length > MAX_QUERIES) throw new Error("Market request diagnostics exceed the query limit.");
  assertNoForbiddenFields(value);
  for (const query of value.queries) validateQueryDiagnostic(query);

  const expectedProviders = {};
  for (const provider of [...new Set(value.queries.map((entry) => entry.provider))].sort()) {
    expectedProviders[provider] = aggregateQueries(value.queries.filter((entry) => entry.provider === provider));
  }
  if (canonical(value.providers) !== canonical(expectedProviders)) {
    throw new Error("Provider request diagnostics do not match query diagnostics.");
  }
  const expectedAggregate = {
    ...aggregateQueries(value.queries),
    duplicate_queries_skipped: nonnegativeInteger(value.aggregate?.duplicate_queries_skipped, "duplicate_queries_skipped"),
  };
  if (canonical(value.aggregate) !== canonical(expectedAggregate)) {
    throw new Error("Aggregate request diagnostics do not match provider diagnostics.");
  }
  return true;
}

function sanitizeQueryDiagnostic(entry, provider, fallbackIndex) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Query diagnostics must be objects.");
  assertNoForbiddenFields(entry);
  const attemptCount = boundedInteger(entry.attempt_count, 1, MAX_ATTEMPTS, "attempt_count");
  const retryCount = boundedInteger(entry.retry_count, 0, MAX_ATTEMPTS - 1, "retry_count");
  const attempts = Array.isArray(entry.attempts)
    ? entry.attempts.map(sanitizeAttemptDiagnostic)
    : [];
  const retryDelays = Array.isArray(entry.retry_delays_ms)
    ? entry.retry_delays_ms.map((value) => nonnegativeInteger(value, "retry_delay_ms"))
    : [];
  const query = sanitizeQuery(entry.query ?? queryFromName(entry.name));
  return {
    provider,
    query_index: boundedInteger(entry.query_index ?? fallbackIndex, 0, MAX_QUERIES - 1, "query_index"),
    query,
    request_kind: normalizeRequestKind(entry.request_kind),
    ok: entry.ok === true,
    attempt_count: attemptCount,
    retry_count: retryCount,
    retried: entry.retried === true,
    recovered_after_retry: entry.recovered_after_retry === true,
    failure_category: normalizeFailureCategory(entry.failure_category),
    final_status: status(entry.final_status ?? entry.status),
    timed_out: entry.timed_out === true,
    rate_limited: entry.rate_limited === true,
    duration_ms: nonnegativeInteger(entry.duration_ms, "duration_ms"),
    results_returned: nonnegativeInteger(entry.results_returned, "results_returned"),
    normalized_records: nonnegativeInteger(entry.normalized_records, "normalized_records"),
    records_rejected: nonnegativeInteger(entry.records_rejected, "records_rejected"),
    rejection_reason_counts: sanitizeRejectionReasonCounts(entry.rejection_reason_counts),
    retry_delays_ms: retryDelays,
    attempts,
  };
}

function sanitizeAttemptDiagnostic(entry, index) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Attempt diagnostics must be objects.");
  return {
    attempt: boundedInteger(entry.attempt ?? index + 1, 1, MAX_ATTEMPTS, "attempt"),
    status: status(entry.status),
    failure_category: normalizeFailureCategory(entry.failure_category),
    timed_out: entry.timed_out === true,
    rate_limited: entry.rate_limited === true,
    duration_ms: nonnegativeInteger(entry.duration_ms, "duration_ms"),
    retry_delay_ms: entry.retry_delay_ms == null ? null : nonnegativeInteger(entry.retry_delay_ms, "retry_delay_ms"),
  };
}

function validateQueryDiagnostic(query) {
  if (!PROVIDERS.has(query.provider)) throw new Error("Unsupported market diagnostics provider.");
  if (!query.query || query.query.length > MAX_QUERY_LENGTH || CREDENTIAL_URL.test(query.query)) {
    throw new Error("Market diagnostics query is missing or unsafe.");
  }
  if (query.attempt_count < 1 || query.attempt_count > MAX_ATTEMPTS) throw new Error("Market diagnostics attempt count is invalid.");
  if (!REQUEST_KINDS.has(query.request_kind)) throw new Error("Market diagnostics request kind is invalid.");
  if (query.normalized_records + query.records_rejected > query.results_returned) {
    throw new Error("Market diagnostics result totals are inconsistent.");
  }
  if (sumCounts(query.rejection_reason_counts) !== query.records_rejected) {
    throw new Error("Market diagnostics rejection totals are inconsistent.");
  }
  if (query.retry_count !== query.attempt_count - 1) throw new Error("Market diagnostics retry count is inconsistent.");
  if (query.retried !== (query.retry_count > 0)) throw new Error("Market diagnostics retried flag is inconsistent.");
  if (query.retry_delays_ms.length !== query.retry_count) throw new Error("Market diagnostics retry delays are inconsistent.");
  if (query.attempts.length !== query.attempt_count) throw new Error("Market diagnostics attempts are inconsistent.");
  if (query.attempts.some((attempt, index) => attempt.attempt !== index + 1)) throw new Error("Market diagnostics attempt ordering is invalid.");
  if (query.ok) {
    if (query.failure_category !== null || query.final_status == null || query.final_status < 200 || query.final_status > 299) {
      throw new Error("Successful market diagnostics are inconsistent.");
    }
  } else if (query.failure_category === null) {
    throw new Error("Failed market diagnostics require a failure category.");
  }
  if (query.recovered_after_retry && (!query.ok || !query.retried || query.retry_count < 1)) {
    throw new Error("Recovered market diagnostics are inconsistent.");
  }
  if (query.rate_limited && !query.attempts.some((attempt) => attempt.status === 429)) {
    throw new Error("Rate-limited market diagnostics require a 429 attempt.");
  }
  if (query.timed_out && !query.attempts.some((attempt) => attempt.failure_category === "timeout")) {
    throw new Error("Timed-out market diagnostics require a timeout attempt.");
  }
}

function aggregateQueries(queries) {
  const discovery = queries.filter((entry) => entry.request_kind === "discovery");
  return {
    requests_attempted: queries.length,
    requests_succeeded: queries.filter((entry) => entry.ok).length,
    requests_failed: queries.filter((entry) => !entry.ok).length,
    requests_retried: queries.filter((entry) => entry.retried).length,
    retry_attempts_total: queries.reduce((sum, entry) => sum + entry.retry_count, 0),
    transient_failures_recovered: queries.filter((entry) => entry.recovered_after_retry).length,
    requests_timed_out: queries.filter((entry) => entry.timed_out).length,
    requests_rate_limited: queries.filter((entry) => entry.rate_limited).length,
    requests_permanently_failed: queries.filter((entry) => !entry.ok).length,
    queries_executed: discovery.length,
    affiliate_requests_attempted: queries.length - discovery.length,
    results_returned: discovery.reduce((sum, entry) => sum + entry.results_returned, 0),
    zero_result_queries: discovery.filter((entry) => entry.ok && entry.results_returned === 0).length,
    normalized_records: discovery.reduce((sum, entry) => sum + entry.normalized_records, 0),
    records_rejected: discovery.reduce((sum, entry) => sum + entry.records_rejected, 0),
    rejection_reason_counts: mergeReasonCounts(discovery.map((entry) => entry.rejection_reason_counts)),
  };
}

function normalizeRequestKind(value) {
  const kind = String(value ?? "discovery").trim().toLowerCase();
  return REQUEST_KINDS.has(kind) ? kind : "discovery";
}

function sanitizeRejectionReasonCounts(value) {
  if (value == null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Market diagnostics rejection reasons must be an object.");
  }
  const result = {};
  for (const key of Object.keys(value).sort()) {
    if (!RELEVANCE_REASONS.has(key)) throw new Error("Unsupported market diagnostics rejection reason.");
    const count = nonnegativeInteger(value[key], `rejection_reason_counts.${key}`);
    if (count > 0) result[key] = count;
  }
  return result;
}

function mergeReasonCounts(values) {
  const result = {};
  for (const counts of values) {
    for (const [key, count] of Object.entries(counts ?? {})) result[key] = (result[key] ?? 0) + count;
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function sumCounts(value) {
  return Object.values(value ?? {}).reduce((sum, count) => sum + count, 0);
}

function normalizeProvider(value) {
  const provider = String(value ?? "unknown").trim().toLowerCase();
  if (provider === "rakuten" || provider === "rakuten_ichiba") return "rakuten_ichiba";
  if (provider === "yahoo" || provider === "yahoo_shopping") return "yahoo_shopping";
  if (provider === "approved_feed" || provider === "market_raw_feed") return "approved_feed";
  return "unknown";
}

function normalizeFailureCategory(value) {
  if (value == null || value === "") return null;
  const category = String(value).trim().toLowerCase();
  return FAILURE_CATEGORIES.has(category) ? category : "unknown";
}

function sanitizeQuery(value) {
  const query = String(value ?? "")
    .normalize("NFKC")
    .replace(CONTROL, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
  if (!query || CREDENTIAL_URL.test(query)) throw new Error("Market diagnostics query is missing or unsafe.");
  return query;
}

function queryFromName(value) {
  const name = String(value ?? "");
  const separator = name.indexOf(":");
  return separator >= 0 ? name.slice(separator + 1) : name;
}

function status(value) {
  if (value == null || value === "") return null;
  return boundedInteger(value, 100, 599, "HTTP status");
}

function nonnegativeInteger(value, label) {
  return boundedInteger(value ?? 0, 0, Number.MAX_SAFE_INTEGER, label);
}

function boundedInteger(value, min, max, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`Invalid ${label}.`);
  return number;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertNoForbiddenFields(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_FIELD.test(key)) throw new Error(`Forbidden market diagnostics field: ${key}`);
    assertNoForbiddenFields(child);
  }
}
