import { canonicalizeBoundedMarketplaceUrl, resolveBoundedMarketplaceIdentity } from "../domain/market-bounded-write.js";
import {
  normalizeRakutenReobservationResponse,
  normalizeYahooReobservationResponse,
} from "../domain/market-reobservation.js";

export const MARKET_REOBSERVATION_PROVIDER_MIN_DELAY_MS = Object.freeze({
  rakuten_ichiba: 1200,
  yahoo_shopping: 1000,
});

const RAKUTEN_ENDPOINT = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701";
const YAHOO_ENDPOINT = "https://shopping.yahooapis.jp/ShoppingWebService/V1/json/itemLookup";
const YAHOO_CALLBACK = "gachaLensItemLookupV1";
const YAHOO_JSONP_PADDING = "/* */";
const YAHOO_HTTPS_HOSTS = new Set(["store.shopping.yahoo.co.jp", "shopping.yahoo.co.jp"]);

export async function fetchExactMarketReobservation(listing, options = {}) {
  const identity = resolveBoundedMarketplaceIdentity(listing);
  if (!identity.complete || identity.derivedId !== listing?.id) {
    return failure("identity_mismatch", identity.provider, "persisted_identity_invalid", emptyDiagnostics("identity"));
  }

  if (identity.provider === "rakuten_ichiba") {
    return fetchRakutenExactReobservation(identity, options.rakuten ?? options);
  }
  if (identity.provider === "yahoo_shopping") {
    return fetchYahooExactReobservation(identity, options.yahoo ?? options);
  }
  return failure("provider_error", identity.provider, "unsupported_provider", emptyDiagnostics("configuration"));
}

export async function fetchRakutenExactReobservation(identity, options = {}) {
  const applicationId = clean(options.applicationId ?? process.env.RAKUTEN_APPLICATION_ID);
  const accessKey = clean(options.accessKey ?? process.env.RAKUTEN_ACCESS_KEY);
  if (!applicationId || !accessKey || !clean(identity?.sourceListingId)) {
    return failure("provider_error", "rakuten_ichiba", "configuration_missing", emptyDiagnostics("configuration"));
  }

  const timeoutMs = boundedInteger(options.timeoutMs ?? process.env.RAKUTEN_REQUEST_TIMEOUT_MS, 2000, 30000, 12000);
  const maxAttempts = boundedInteger(options.maxAttempts ?? process.env.MARKET_API_MAX_ATTEMPTS, 1, 3, 3);
  const url = buildRakutenExactItemUrl({
    endpoint: options.endpoint,
    applicationId,
    itemCode: identity.sourceListingId,
  });
  const requestOrigin = clean(options.requestOrigin ?? process.env.RAKUTEN_REQUEST_ORIGIN) || "https://gachalens.com";
  const response = await requestWithRetry(url, {
    mode: "json",
    timeoutMs,
    maxAttempts,
    fetchImpl: options.fetchImpl,
    sleep: options.sleep,
    headers: {
      accept: "application/json",
      accessKey,
      origin: requestOrigin,
      referer: `${requestOrigin.replace(/\/+$/, "")}/`,
      "user-agent": "GachaLensBot/0.4 (+exact-market-reobservation)",
    },
  });
  const diagnostics = sanitizeDiagnostics(response.diagnostics);
  if (!response.ok) return requestFailure("rakuten_ichiba", response, diagnostics);

  const items = Array.isArray(response.data?.items) ? response.data.items : [];
  if (!items.length) return failure("not_found", "rakuten_ichiba", "exact_item_not_returned", diagnostics);
  const exact = items.find((item) => clean(item?.itemCode) === clean(identity.sourceListingId));
  if (!exact) return failure("identity_mismatch", "rakuten_ichiba", "exact_item_identity_mismatch", diagnostics);

  const result = normalizeRakutenReobservationResponse(exact, {
    source_listing_id: identity.sourceListingId,
    public_url: identity.publicUrl,
  });
  if (!providerResultMatchesPersistedIdentity(result, identity)) {
    return failure("identity_mismatch", "rakuten_ichiba", "exact_item_identity_mismatch", diagnostics);
  }
  return { result, diagnostics };
}

export async function fetchYahooExactReobservation(identity, options = {}) {
  const appId = clean(options.appId ?? options.applicationId ?? process.env.YAHOO_SHOPPING_APP_ID);
  if (!appId || !clean(identity?.sourceListingId)) {
    return failure("provider_error", "yahoo_shopping", "configuration_missing", emptyDiagnostics("configuration"));
  }

  const timeoutMs = boundedInteger(options.timeoutMs ?? process.env.YAHOO_SHOPPING_REQUEST_TIMEOUT_MS, 2000, 30000, 12000);
  const maxAttempts = boundedInteger(options.maxAttempts ?? process.env.MARKET_API_MAX_ATTEMPTS, 1, 3, 3);
  const url = buildYahooExactItemLookupUrl({ endpoint: options.endpoint, appId, itemCode: identity.sourceListingId });
  const response = await requestWithRetry(url, {
    mode: "text",
    timeoutMs,
    maxAttempts,
    fetchImpl: options.fetchImpl,
    sleep: options.sleep,
    headers: { accept: "application/javascript, application/json;q=0.9, */*;q=0.1" },
  });
  const diagnostics = sanitizeDiagnostics(response.diagnostics);
  if (!response.ok) return requestFailure("yahoo_shopping", response, diagnostics);

  let payload;
  try {
    payload = parseYahooItemLookupJsonp(response.text);
  } catch {
    return failure("provider_error", "yahoo_shopping", "invalid_jsonp_payload", diagnostics);
  }

  const parsed = extractYahooItemLookupHit(payload);
  if (parsed.not_found) return failure("not_found", "yahoo_shopping", "exact_item_not_returned", diagnostics);
  if (!parsed.item) return failure("provider_error", "yahoo_shopping", parsed.reason || "invalid_item_payload", diagnostics);

  const result = normalizeYahooReobservationResponse(parsed.item, {
    source_listing_id: identity.sourceListingId,
    public_url: identity.publicUrl,
  });
  if (!providerResultMatchesPersistedIdentity(result, identity)) {
    return failure("identity_mismatch", "yahoo_shopping", "exact_item_identity_mismatch", diagnostics);
  }
  return { result, diagnostics };
}

export function buildRakutenExactItemUrl({ endpoint = RAKUTEN_ENDPOINT, applicationId, itemCode } = {}) {
  const app = clean(applicationId);
  const code = clean(itemCode);
  if (!app || !code) throw new Error("Rakuten exact item request identity is incomplete.");
  const url = reviewedOfficialEndpoint(endpoint, RAKUTEN_ENDPOINT, "Rakuten");
  url.searchParams.set("applicationId", app);
  url.searchParams.set("itemCode", code);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("hits", "1");
  url.searchParams.set("elements", "itemCode,itemPrice,itemUrl,availability");
  return url.toString();
}

export function buildYahooExactItemLookupUrl({ endpoint = YAHOO_ENDPOINT, appId, itemCode } = {}) {
  const app = clean(appId);
  const code = clean(itemCode);
  if (!app || !code) throw new Error("Yahoo exact item request identity is incomplete.");
  const url = reviewedOfficialEndpoint(endpoint, YAHOO_ENDPOINT, "Yahoo");
  url.searchParams.set("appid", app);
  url.searchParams.set("itemcode", code);
  url.searchParams.set("responsegroup", "large");
  url.searchParams.set("callback", YAHOO_CALLBACK);
  return url.toString();
}

export function parseYahooItemLookupJsonp(value) {
  const rawBody = String(value ?? "");
  const prefix = `${YAHOO_CALLBACK}(`;
  let wrappedBody = rawBody;

  if (!rawBody.startsWith(prefix)) {
    if (!rawBody.startsWith(YAHOO_JSONP_PADDING)) throw new Error("Yahoo JSONP callback mismatch.");
    wrappedBody = rawBody.slice(YAHOO_JSONP_PADDING.length);
  }

  wrappedBody = wrappedBody.trimEnd();
  if (!wrappedBody.startsWith(prefix)) throw new Error("Yahoo JSONP callback mismatch.");
  const suffixLength = wrappedBody.endsWith(");") ? 2 : wrappedBody.endsWith(")") ? 1 : 0;
  if (!suffixLength) throw new Error("Yahoo JSONP wrapper is incomplete.");
  const payload = wrappedBody.slice(prefix.length, -suffixLength).trim();
  if (!payload || payload.length > 2_000_000) throw new Error("Yahoo JSONP payload is invalid.");
  return JSON.parse(payload);
}

export function extractYahooItemLookupHit(payload = {}) {
  const root = plainObject(payload?.ResultSet) ? payload.ResultSet : null;
  if (!root) return { item: null, reason: "missing_result_set", not_found: false };
  const total = numericScalar(root.totalResultsReturned);
  if (total === 0) return { item: null, reason: "exact_item_not_returned", not_found: true };

  const rootData = firstIndexed(root) ?? root;
  const result = firstIndexed(rootData?.Result ?? root?.Result);
  if (!plainObject(result)) return { item: null, reason: "missing_result", not_found: false };
  const hit = firstIndexed(result.Hit) ?? result;
  if (!plainObject(hit)) return { item: null, reason: "missing_hit", not_found: false };

  const code = scalar(hit.Code) || scalar(result?.ItemCode?.Codes?.Code);
  const url = normalizeYahooPublicUrl(scalar(hit.Url));
  const price = numericScalar(hit.Price);
  const availability = scalar(hit.Availability).toLowerCase();
  if (!code || !url || !Number.isInteger(price) || price <= 0) {
    return { item: null, reason: "incomplete_exact_item", not_found: false };
  }
  if (!["instock", "outofstock"].includes(availability)) {
    return { item: null, reason: "unknown_availability", not_found: false };
  }

  return {
    item: {
      code,
      url,
      price,
      inStock: availability === "instock",
    },
    reason: "yahoo_exact_item_response",
    not_found: false,
  };
}

export function sanitizeReobservationProviderRead(value = {}) {
  return {
    result: value?.result && typeof value.result === "object" ? {
      outcome: clean(value.result.outcome) || "provider_error",
      provider: clean(value.result.provider),
      source_listing_id: clean(value.result.source_listing_id),
      public_url: canonicalizeBoundedMarketplaceUrl(value.result.public_url),
      price: positiveInteger(value.result.price),
      status: ["active", "sold_out"].includes(clean(value.result.status)) ? clean(value.result.status) : null,
      reason: clean(value.result.reason).slice(0, 120),
    } : null,
    diagnostics: sanitizeDiagnostics(value?.diagnostics),
  };
}

async function requestWithRetry(url, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const sleep = options.sleep ?? delay;
  const maxAttempts = boundedInteger(options.maxAttempts, 1, 3, 3);
  const timeoutMs = boundedInteger(options.timeoutMs, 2000, 30000, 12000);
  const attempts = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response;
    let status = null;
    let category = null;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        redirect: "error",
        headers: options.headers ?? {},
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = Number.isFinite(Number(response?.status)) ? Number(response.status) : null;
    } catch (error) {
      category = error?.name === "AbortError" || error?.name === "TimeoutError" ? "timeout" : "network";
    }

    if (response?.ok) {
      try {
        const value = options.mode === "text" ? await response.text() : await response.json();
        attempts.push(attemptEntry(attempt, status, null));
        return {
          ok: true,
          status,
          data: options.mode === "text" ? undefined : value,
          text: options.mode === "text" ? value : "",
          diagnostics: requestDiagnostics(attempts, null, status),
        };
      } catch {
        attempts.push(attemptEntry(attempt, status, "invalid_response"));
        return { ok: false, status, diagnostics: requestDiagnostics(attempts, "invalid_response", status) };
      }
    }

    if (!category) {
      category = status === 429 ? "rate_limited" : status != null && status >= 500 ? "server_error" : "client_error";
    }
    attempts.push(attemptEntry(attempt, status, category));
    const retryable = ["rate_limited", "server_error", "timeout", "network"].includes(category);
    if (!retryable || attempt >= maxAttempts) {
      return { ok: false, status, diagnostics: requestDiagnostics(attempts, category, status) };
    }
    await sleep(Math.min(4000, 1000 * (2 ** (attempt - 1))));
  }

  return { ok: false, status: null, diagnostics: requestDiagnostics(attempts, "unknown", null) };
}

function providerResultMatchesPersistedIdentity(result, identity) {
  if (!result || result.outcome !== "seen") return true;
  const fetchedUrl = canonicalizeBoundedMarketplaceUrl(result.public_url);
  const persistedUrl = canonicalizeBoundedMarketplaceUrl(identity.publicUrl);
  return clean(result.provider) === clean(identity.provider)
    && clean(result.source_listing_id) === clean(identity.sourceListingId)
    && Boolean(fetchedUrl)
    && fetchedUrl === persistedUrl;
}

function requestFailure(provider, response, diagnostics) {
  const outcome = diagnostics.rate_limited || Number(response?.status) === 429 ? "throttled" : "provider_error";
  return failure(outcome, provider, diagnostics.failure_category || "provider_request_failed", diagnostics);
}

function failure(outcome, provider, reason, diagnostics) {
  return {
    result: {
      outcome,
      provider: clean(provider),
      reason: clean(reason).slice(0, 120),
    },
    diagnostics: sanitizeDiagnostics(diagnostics),
  };
}

function attemptEntry(attempt, status, failureCategory) {
  return {
    attempt,
    status,
    failure_category: failureCategory,
    rate_limited: status === 429,
    timed_out: failureCategory === "timeout",
  };
}

function requestDiagnostics(attempts, failureCategory, finalStatus) {
  return {
    attempt_count: attempts.length,
    retry_count: Math.max(0, attempts.length - 1),
    final_status: finalStatus,
    failure_category: failureCategory,
    rate_limited: attempts.some((entry) => entry.rate_limited),
    timed_out: attempts.some((entry) => entry.timed_out),
    recovered_after_retry: !failureCategory && attempts.length > 1,
  };
}

function sanitizeDiagnostics(value = {}) {
  return {
    attempt_count: boundedInteger(value.attempt_count, 0, 3, 0),
    retry_count: boundedInteger(value.retry_count, 0, 2, 0),
    final_status: Number.isInteger(Number(value.final_status)) ? Number(value.final_status) : null,
    failure_category: clean(value.failure_category).slice(0, 80) || null,
    rate_limited: value.rate_limited === true,
    timed_out: value.timed_out === true,
    recovered_after_retry: value.recovered_after_retry === true,
  };
}

function emptyDiagnostics(category) {
  return {
    attempt_count: 0,
    retry_count: 0,
    final_status: null,
    failure_category: category,
    rate_limited: false,
    timed_out: false,
    recovered_after_retry: false,
  };
}

function reviewedOfficialEndpoint(value, expected, label) {
  const allowed = new URL(expected);
  const candidate = new URL(clean(value) || expected);
  const sameDestination = candidate.protocol === "https:"
    && !candidate.username
    && !candidate.password
    && candidate.hostname.toLowerCase() === allowed.hostname.toLowerCase()
    && candidate.port === allowed.port
    && candidate.pathname === allowed.pathname
    && candidate.search === ""
    && candidate.hash === "";
  if (!sameDestination) {
    throw new Error(`${label} exact item endpoint must match the reviewed official API destination.`);
  }
  return candidate;
}

function firstIndexed(value) {
  if (Array.isArray(value)) return value[0] ?? null;
  if (!plainObject(value)) return null;
  if (Object.hasOwn(value, "0")) return value["0"];
  return value;
}

function scalar(value) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return clean(value);
  if (!plainObject(value)) return "";
  for (const key of ["_value", "value", "#text"]) {
    if (Object.hasOwn(value, key)) return clean(value[key]);
  }
  return "";
}

function numericScalar(value) {
  const parsed = Number(scalar(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeYahooPublicUrl(value) {
  const raw = clean(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" && YAHOO_HTTPS_HOSTS.has(url.hostname.toLowerCase())) url.protocol = "https:";
    return canonicalizeBoundedMarketplaceUrl(url.toString());
  } catch {
    return null;
  }
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function boundedInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Math.min(max, Math.max(min, fallback));
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function plainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clean(value) {
  return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
