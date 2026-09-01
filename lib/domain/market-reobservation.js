import crypto from "node:crypto";

import { canonicalMarketplaceSource } from "./market-canary-write.js";
import { canonicalizeBoundedMarketplaceUrl, resolveBoundedMarketplaceIdentity } from "./market-bounded-write.js";

export const MARKET_REOBSERVATION_OUTCOMES = Object.freeze([
  "unchanged",
  "price_changed",
  "status_changed",
  "not_found",
  "throttled",
  "provider_error",
  "identity_mismatch",
]);

export const MARKET_REOBSERVATION_CADENCE_HOURS = Object.freeze({
  hot: 6,
  active: 24,
  unavailable: 72,
});

const PROVIDERS = new Set(["rakuten_ichiba", "yahoo_shopping"]);
const SEEN_STATUSES = new Set(["active", "sold_out"]);
const FAILURE_OUTCOMES = new Set(["not_found", "throttled", "provider_error"]);

export function planMarketReobservation({ listing, providerResult, observedAt, observationKey } = {}) {
  const observed = validDate(observedAt);
  const key = safeKey(observationKey);
  if (!listing?.id || !observed || !key) throw new Error("Market re-observation requires listing, observedAt, and observationKey.");

  const persistedIdentity = resolveBoundedMarketplaceIdentity(listing);
  if (!persistedIdentity.complete || persistedIdentity.derivedId !== listing.id) {
    return noWritePlan("identity_mismatch", listing, {
      reason: "persisted_identity_invalid",
      observedAt: observed.toISOString(),
      observationKey: key,
      provider: persistedIdentity.provider || null,
    });
  }

  const previousObservedAt = validDate(listing.last_observed_at);
  if (previousObservedAt && observed.getTime() < previousObservedAt.getTime()) {
    return noWritePlan("provider_error", listing, {
      reason: "stale_observation_time",
      observedAt: observed.toISOString(),
      observationKey: key,
      provider: persistedIdentity.provider,
    });
  }

  const result = normalizeProviderResult(providerResult, persistedIdentity.provider);
  if (FAILURE_OUTCOMES.has(result.outcome)) {
    return noWritePlan(result.outcome, listing, {
      reason: result.reason,
      observedAt: observed.toISOString(),
      observationKey: key,
      provider: persistedIdentity.provider,
    });
  }

  const fetchedIdentity = resolveFetchedIdentity(result);
  if (!fetchedIdentity.complete
    || fetchedIdentity.provider !== persistedIdentity.provider
    || fetchedIdentity.sourceListingId !== persistedIdentity.sourceListingId
    || fetchedIdentity.publicUrl !== persistedIdentity.publicUrl
    || fetchedIdentity.derivedId !== listing.id) {
    return noWritePlan("identity_mismatch", listing, {
      reason: "provider_identity_changed",
      observedAt: observed.toISOString(),
      observationKey: key,
      provider: persistedIdentity.provider,
    });
  }

  const price = normalizePrice(result.price);
  if (price === null || !SEEN_STATUSES.has(result.status)) {
    return noWritePlan("provider_error", listing, {
      reason: "invalid_seen_payload",
      observedAt: observed.toISOString(),
      observationKey: key,
      provider: persistedIdentity.provider,
    });
  }

  const previousPrice = normalizePrice(listing.price);
  const previousStatus = String(listing.status ?? "").trim();
  const priceChanged = previousPrice !== price;
  const statusChanged = previousStatus !== result.status;
  const outcome = statusChanged ? "status_changed" : priceChanged ? "price_changed" : "unchanged";
  const observationId = marketReobservationObservationId({
    listingId: listing.id,
    provider: persistedIdentity.provider,
    observationKey: key,
  });
  const timestamp = observed.toISOString();

  return {
    outcome,
    reason: result.reason || "exact_provider_identity_verified",
    provider: persistedIdentity.provider,
    listing_id: listing.id,
    observation_key: key,
    observed_at: timestamp,
    price_changed: priceChanged,
    status_changed: statusChanged,
    writes: {
      observation_insert: {
        id: observationId,
        listing_id: listing.id,
        variant_id: listing.variant_id ?? null,
        series_id: listing.series_id ?? null,
        price,
        status: result.status,
        source: listing.source,
        observed_at: timestamp,
        raw: {
          market_reobservation: {
            provider: persistedIdentity.provider,
            source_listing_id: persistedIdentity.sourceListingId,
            observation_key: key,
            outcome,
          },
        },
      },
      listing_update: {
        id: listing.id,
        changes: {
          price,
          status: result.status,
          last_observed_at: timestamp,
          updated_at: timestamp,
        },
      },
    },
  };
}

export function marketReobservationObservationId({ listingId, provider, observationKey } = {}) {
  const listing = String(listingId ?? "").trim();
  const normalizedProvider = normalizeProvider(provider);
  const key = safeKey(observationKey);
  if (!listing || !normalizedProvider || !key) throw new Error("Market re-observation observation identity is incomplete.");
  const digest = crypto
    .createHash("sha256")
    .update(JSON.stringify(["gacha-lens", "market-reobservation-v1", listing, normalizedProvider, key]), "utf8")
    .digest("hex")
    .slice(0, 32);
  return `market-reobservation-${digest}`;
}

export function normalizeRakutenReobservationResponse(item, expected = {}) {
  if (!item) return failureResult("not_found", "rakuten_ichiba", expected, "exact_item_not_returned");
  const availability = String(item.availability ?? "").trim();
  if (availability !== "0" && availability !== "1") {
    return failureResult("provider_error", "rakuten_ichiba", expected, "unknown_availability");
  }
  return {
    outcome: "seen",
    provider: "rakuten_ichiba",
    source_listing_id: text(item.itemCode),
    public_url: text(item.itemUrl),
    price: item.itemPrice,
    status: availability === "0" ? "sold_out" : "active",
    reason: "rakuten_exact_item_response",
  };
}

export function normalizeYahooReobservationResponse(item, expected = {}) {
  if (!item) return failureResult("not_found", "yahoo_shopping", expected, "exact_item_not_returned");
  if (typeof item.inStock !== "boolean") {
    return failureResult("provider_error", "yahoo_shopping", expected, "unknown_availability");
  }
  return {
    outcome: "seen",
    provider: "yahoo_shopping",
    source_listing_id: text(item.code),
    public_url: text(item.url),
    price: item.price,
    status: item.inStock ? "active" : "sold_out",
    reason: "yahoo_exact_item_response",
  };
}

export function selectDueMarketReobservations(listings = [], { now = new Date(), limit = 100 } = {}) {
  if (!Array.isArray(listings)) throw new TypeError("Market re-observation listings must be an array.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new RangeError("Market re-observation limit must be between 1 and 1000.");
  const current = validDate(now);
  if (!current) throw new Error("Market re-observation now is invalid.");

  return listings
    .map((listing) => dueEntry(listing, current))
    .filter((entry) => entry.due)
    .sort((left, right) => left.priority_rank - right.priority_rank
      || left.due_at.localeCompare(right.due_at)
      || String(left.listing.id).localeCompare(String(right.listing.id), "en"))
    .slice(0, limit);
}

export function buildMarketReobservationDryRun(plans = [], metadata = {}) {
  const safePlans = Array.isArray(plans) ? plans : [];
  const counts = Object.fromEntries(MARKET_REOBSERVATION_OUTCOMES.map((outcome) => [outcome, 0]));
  const providers = {};
  let observationInserts = 0;
  let listingUpdates = 0;

  for (const plan of safePlans) {
    if (counts[plan?.outcome] !== undefined) counts[plan.outcome] += 1;
    const provider = normalizeProvider(plan?.provider);
    if (provider) providers[provider] = (providers[provider] ?? 0) + 1;
    if (plan?.writes?.observation_insert) observationInserts += 1;
    if (plan?.writes?.listing_update) listingUpdates += 1;
  }

  return {
    schema_version: 1,
    kind: "market_reobservation_dry_run",
    generated_at: validDate(metadata.generated_at ?? new Date())?.toISOString() ?? null,
    checked_count: safePlans.length,
    outcome_counts: counts,
    provider_counts: providers,
    projected_writes: {
      observation_inserts: observationInserts,
      listing_updates: listingUpdates,
      deletes: 0,
    },
    production_actions: 0,
  };
}

function dueEntry(listing, now) {
  const priority = listing?.reobservation_priority === "hot" || listing?.raw?.reobservation_priority === "hot"
    ? "hot"
    : String(listing?.status ?? "") === "active"
      ? "active"
      : "unavailable";
  const cadenceHours = MARKET_REOBSERVATION_CADENCE_HOURS[priority];
  const last = validDate(listing?.last_observed_at ?? listing?.listed_at ?? listing?.created_at ?? new Date(0));
  const dueAtMs = (last?.getTime() ?? 0) + cadenceHours * 60 * 60 * 1000;
  return {
    listing,
    priority,
    priority_rank: priority === "hot" ? 0 : priority === "active" ? 1 : 2,
    cadence_hours: cadenceHours,
    due_at: new Date(dueAtMs).toISOString(),
    due: dueAtMs <= now.getTime(),
  };
}

function resolveFetchedIdentity(result) {
  const provider = normalizeProvider(result.provider);
  if (!provider) return { complete: false };
  let source;
  try {
    source = canonicalMarketplaceSource(provider);
  } catch {
    return { complete: false };
  }
  return resolveBoundedMarketplaceIdentity({
    source,
    source_url: canonicalizeBoundedMarketplaceUrl(result.public_url),
    raw: {
      provider,
      source_listing_id: text(result.source_listing_id),
      public_url: canonicalizeBoundedMarketplaceUrl(result.public_url),
    },
  });
}

function normalizeProviderResult(value, expectedProvider) {
  const result = value && typeof value === "object" ? value : {};
  const outcome = String(result.outcome ?? "provider_error").trim();
  const provider = normalizeProvider(result.provider || expectedProvider);
  if (FAILURE_OUTCOMES.has(outcome)) {
    return {
      outcome,
      provider,
      reason: text(result.reason) || outcome,
    };
  }
  if (outcome !== "seen" || !provider) {
    return { outcome: "provider_error", provider, reason: "unsupported_provider_result" };
  }
  return {
    outcome,
    provider,
    source_listing_id: text(result.source_listing_id),
    public_url: canonicalizeBoundedMarketplaceUrl(result.public_url),
    price: result.price,
    status: String(result.status ?? "").trim(),
    reason: text(result.reason),
  };
}

function failureResult(outcome, provider, expected, reason) {
  return {
    outcome,
    provider,
    source_listing_id: text(expected.source_listing_id),
    public_url: canonicalizeBoundedMarketplaceUrl(expected.public_url),
    reason,
  };
}

function noWritePlan(outcome, listing, details = {}) {
  return {
    outcome,
    reason: details.reason || outcome,
    provider: normalizeProvider(details.provider),
    listing_id: listing?.id ?? null,
    observation_key: details.observationKey ?? null,
    observed_at: details.observedAt ?? null,
    price_changed: false,
    status_changed: false,
    writes: {
      observation_insert: null,
      listing_update: null,
    },
  };
}

function normalizeProvider(value) {
  const provider = String(value ?? "").trim().toLowerCase();
  return PROVIDERS.has(provider) ? provider : "";
}

function normalizePrice(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const price = Number(value);
  return Number.isInteger(price) && price > 0 ? price : null;
}

function safeKey(value) {
  const key = String(value ?? "").trim();
  return key && key.length <= 120 && /^[A-Za-z0-9._:-]+$/.test(key) ? key : "";
}

function validDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function text(value) {
  return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}
