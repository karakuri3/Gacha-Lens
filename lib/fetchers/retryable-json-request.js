const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 5000;

export async function retryableJsonRequest(url, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const sleep = options.sleep ?? delay;
  const clock = options.clock ?? Date.now;
  const random = options.random ?? Math.random;
  const timeoutMs = clampInteger(options.timeoutMs, 1, 120000, 12000);
  const maxAttempts = clampInteger(options.maxAttempts, 1, 3, DEFAULT_MAX_ATTEMPTS);
  const baseDelayMs = clampInteger(options.baseDelayMs, 0, 5000, DEFAULT_BASE_DELAY_MS);
  const maxDelayMs = clampInteger(options.maxDelayMs, baseDelayMs, 10000, DEFAULT_MAX_DELAY_MS);
  const startedAt = clock();
  const attempts = [];
  const retryDelays = [];
  let timedOut = false;
  let rateLimited = false;
  let finalStatus = null;
  let finalCategory = "unknown";
  let finalMessage = "request failed";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptStartedAt = clock();
    let response;
    let category = null;
    let message = "";
    let status = null;
    let attemptTimedOut = false;
    let attemptRateLimited = false;

    try {
      response = await fetchImpl(url, {
        ...(options.request ?? {}),
        method: "GET",
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = Number.isFinite(Number(response?.status)) ? Number(response.status) : null;
      finalStatus = status;
      attemptRateLimited = status === 429;
      rateLimited ||= attemptRateLimited;

      if (response?.ok) {
        try {
          const data = await response.json();
          attempts.push(attemptDiagnostic({ attempt, status, category: null, attemptStartedAt, clock }));
          return {
            ok: true,
            status,
            data,
            message: "",
            diagnostics: buildDiagnostics({
              attempts,
              retryDelays,
              recovered: attempt > 1,
              finalCategory: null,
              finalStatus: status,
              timedOut,
              rateLimited,
              startedAt,
              clock,
            }),
          };
        } catch {
          category = "invalid_json";
          message = "invalid JSON response";
        }
      } else {
        category = failureCategoryForStatus(status);
        message = status ? `HTTP ${status}` : "invalid HTTP response";
      }
    } catch (error) {
      attemptTimedOut = isTimeoutError(error);
      timedOut ||= attemptTimedOut;
      category = attemptTimedOut ? "timeout" : "network";
      message = attemptTimedOut ? `timeout after ${timeoutMs}ms` : "network request failed";
    }

    finalCategory = category;
    finalMessage = message;
    const retryable = isRetryableFailure(category, status);
    const canRetry = retryable && attempt < maxAttempts;
    const retryDelay = canRetry
      ? retryDelayMs({ response, status, attempt, baseDelayMs, maxDelayMs, clock, random })
      : null;
    attempts.push(attemptDiagnostic({
      attempt,
      status,
      category,
      timedOut: attemptTimedOut,
      rateLimited: attemptRateLimited,
      retryDelay,
      attemptStartedAt,
      clock,
    }));

    if (!canRetry) break;
    retryDelays.push(retryDelay);
    await sleep(retryDelay);
  }

  return {
    ok: false,
    status: finalStatus,
    data: null,
    message: finalMessage,
    diagnostics: buildDiagnostics({
      attempts,
      retryDelays,
      recovered: false,
      finalCategory,
      finalStatus,
      timedOut,
      rateLimited,
      startedAt,
      clock,
    }),
  };
}

export function resolveMarketRetryOptions(options = {}, timeoutMs = 12000) {
  const maxAttempts = clampInteger(
    options.maxAttempts ?? process.env.MARKET_API_MAX_ATTEMPTS,
    1,
    3,
    DEFAULT_MAX_ATTEMPTS,
  );
  const baseDelayMs = clampInteger(
    options.baseDelayMs ?? process.env.MARKET_API_RETRY_BASE_DELAY_MS,
    0,
    5000,
    DEFAULT_BASE_DELAY_MS,
  );
  const maxDelayMs = clampInteger(
    options.maxDelayMs ?? process.env.MARKET_API_RETRY_MAX_DELAY_MS,
    baseDelayMs,
    10000,
    DEFAULT_MAX_DELAY_MS,
  );
  return { timeoutMs, maxAttempts, baseDelayMs, maxDelayMs };
}

export function summarizeMarketRequestDiagnostics(feedResults = [], duplicateQueriesSkipped = 0) {
  const diagnostics = feedResults.map((entry) => entry ?? {});
  return {
    requests_retried: diagnostics.filter((entry) => Number(entry.attempt_count) >= 2).length,
    retry_attempts_total: diagnostics.reduce((sum, entry) => sum + Math.max(0, Number(entry.retry_count) || 0), 0),
    transient_failures_recovered: diagnostics.filter((entry) => entry.recovered_after_retry === true).length,
    requests_timed_out: diagnostics.filter((entry) => entry.timed_out === true).length,
    requests_rate_limited: diagnostics.filter((entry) => entry.rate_limited === true || Number(entry.status) === 429).length,
    requests_permanently_failed: diagnostics.filter((entry) => entry.ok === false && Number(entry.attempt_count) > 0).length,
    duplicate_queries_skipped: Math.max(0, Number(duplicateQueriesSkipped) || 0),
  };
}

export function configurationRequestDiagnostics() {
  return {
    attempt_count: 0,
    retry_count: 0,
    retried: false,
    recovered_after_retry: false,
    failure_category: "configuration",
    final_status: null,
    timed_out: false,
    rate_limited: false,
    duration_ms: 0,
    retry_delays_ms: [],
    attempts: [],
  };
}

function buildDiagnostics({ attempts, retryDelays, recovered, finalCategory, finalStatus, timedOut, rateLimited, startedAt, clock }) {
  return {
    attempt_count: attempts.length,
    retry_count: Math.max(0, attempts.length - 1),
    retried: attempts.length >= 2,
    recovered_after_retry: recovered,
    failure_category: finalCategory,
    final_status: finalStatus,
    timed_out: timedOut,
    rate_limited: rateLimited,
    duration_ms: elapsed(startedAt, clock()),
    retry_delays_ms: retryDelays,
    attempts,
  };
}

function attemptDiagnostic({ attempt, status, category, timedOut = false, rateLimited = false, retryDelay = null, attemptStartedAt, clock }) {
  return {
    attempt,
    status,
    failure_category: category,
    timed_out: timedOut,
    rate_limited: rateLimited,
    duration_ms: elapsed(attemptStartedAt, clock()),
    retry_delay_ms: retryDelay,
  };
}

function retryDelayMs({ response, status, attempt, baseDelayMs, maxDelayMs, clock, random }) {
  const retryAfter = status === 429 || status === 503
    ? parseRetryAfter(response?.headers?.get?.("retry-after"), clock())
    : null;
  if (retryAfter != null) return Math.min(maxDelayMs, retryAfter);
  const exponential = Math.min(maxDelayMs, baseDelayMs * (2 ** (attempt - 1)));
  const jitter = Math.floor(exponential * 0.2 * clampNumber(random(), 0, 1));
  return Math.min(maxDelayMs, exponential + jitter);
}

function parseRetryAfter(value, now) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Math.max(0, Math.round(Number(raw) * 1000));
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? Math.max(0, parsed - now) : null;
}

function failureCategoryForStatus(status) {
  if (status === 429) return "rate_limited";
  if (status != null && status >= 500) return "server_error";
  if (status != null && status >= 400) return "client_error";
  return "unknown";
}

function isRetryableFailure(category, status) {
  return category === "timeout" || category === "network" || RETRYABLE_STATUSES.has(status);
}

function isTimeoutError(error) {
  return error?.name === "AbortError" || error?.name === "TimeoutError" || error?.code === "ETIMEDOUT";
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Math.min(max, Math.max(min, fallback));
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function clampNumber(value, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : min;
}

function elapsed(start, end) {
  return Math.max(0, Number(end) - Number(start) || 0);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
