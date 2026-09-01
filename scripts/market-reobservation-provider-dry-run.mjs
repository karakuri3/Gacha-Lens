import path from "node:path";
import { pathToFileURL } from "node:url";

import { resolveBoundedMarketplaceIdentity } from "../lib/domain/market-bounded-write.js";
import {
  buildMarketReobservationDryRun,
  planMarketReobservation,
  selectDueMarketReobservations,
} from "../lib/domain/market-reobservation.js";
import {
  fetchExactMarketReobservation,
  MARKET_REOBSERVATION_PROVIDER_MIN_DELAY_MS,
  sanitizeReobservationProviderRead,
} from "../lib/fetchers/market-reobservation-provider-read.js";
import { loadOptionalEnvFile } from "./load-optional-env.mjs";
import { fetchRows } from "./supabase-rest.mjs";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const ELIGIBLE_STATUSES = new Set(["active", "sold_out"]);
const ELIGIBLE_SOURCES = new Set(["rakuten", "yahoo_shopping"]);

export async function runMarketReobservationProviderDryRun(options = {}) {
  loadOptionalEnvFile();
  const now = validDate(options.now ?? new Date());
  if (!now) throw new Error("Re-observation dry-run now is invalid.");
  const limit = boundedInteger(options.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT, DEFAULT_LIMIT);
  const readRows = options.fetchRows ?? fetchRows;
  const providerRead = options.providerRead ?? fetchExactMarketReobservation;
  const sleep = options.sleep ?? delay;
  const clock = options.clock ?? Date.now;
  const observationKey = safeObservationKey(options.observationKey) || defaultObservationKey(now);

  const listings = await readRows("market_listings", {
    select: "id,variant_id,matched_variant_id,series_id,title,listing_type,market_review_type,price,status,source,source_type,source_url,listed_at,last_observed_at,review_required,created_at,raw",
    operationName: "market_reobservation_dry_run.market_listings",
  });
  const eligible = (Array.isArray(listings) ? listings : []).filter(isEligibleListing);
  const due = selectDueMarketReobservations(eligible, { now, limit });
  const lastStartedAtByProvider = new Map();
  const plans = [];
  const providerReads = [];

  for (const entry of due) {
    const listing = entry.listing;
    const identity = resolveBoundedMarketplaceIdentity(listing);
    const provider = identity.provider || providerFromListing(listing);
    await enforceProviderPacing(provider, lastStartedAtByProvider, { sleep, clock });
    lastStartedAtByProvider.set(provider, clock());

    let read;
    try {
      read = await providerRead(listing, options.providerOptions ?? options);
    } catch {
      read = {
        result: {
          outcome: "provider_error",
          provider,
          reason: "provider_read_exception",
        },
        diagnostics: {
          attempt_count: 0,
          retry_count: 0,
          final_status: null,
          failure_category: "provider_read_exception",
          rate_limited: false,
          timed_out: false,
          recovered_after_retry: false,
        },
      };
    }

    const sanitized = sanitizeReobservationProviderRead(read);
    providerReads.push(sanitized);
    plans.push(planMarketReobservation({
      listing,
      providerResult: sanitized.result,
      observedAt: now,
      observationKey,
    }));
  }

  const artifact = buildMarketReobservationDryRun(plans, { generated_at: now });
  return {
    ...artifact,
    kind: "market_reobservation_exact_provider_dry_run",
    observation_key: observationKey,
    eligible_listing_count: eligible.length,
    due_listing_count: due.length,
    selected_limit: limit,
    provider_read_summary: summarizeProviderReads(providerReads),
    production_actions: 0,
  };
}

export function summarizeProviderReads(reads = []) {
  const summary = {
    checked: 0,
    attempts: 0,
    retries: 0,
    rate_limited: 0,
    timed_out: 0,
    recovered_after_retry: 0,
    providers: {},
    outcomes: {},
    failure_categories: {},
  };
  for (const read of Array.isArray(reads) ? reads : []) {
    const sanitized = sanitizeReobservationProviderRead(read);
    const provider = clean(sanitized.result?.provider) || "unknown";
    const outcome = clean(sanitized.result?.outcome) || "provider_error";
    const category = clean(sanitized.diagnostics?.failure_category) || "none";
    summary.checked += 1;
    summary.attempts += Number(sanitized.diagnostics?.attempt_count) || 0;
    summary.retries += Number(sanitized.diagnostics?.retry_count) || 0;
    summary.rate_limited += sanitized.diagnostics?.rate_limited === true ? 1 : 0;
    summary.timed_out += sanitized.diagnostics?.timed_out === true ? 1 : 0;
    summary.recovered_after_retry += sanitized.diagnostics?.recovered_after_retry === true ? 1 : 0;
    summary.providers[provider] = (summary.providers[provider] ?? 0) + 1;
    summary.outcomes[outcome] = (summary.outcomes[outcome] ?? 0) + 1;
    if (category !== "none") summary.failure_categories[category] = (summary.failure_categories[category] ?? 0) + 1;
  }
  summary.providers = sortObject(summary.providers);
  summary.outcomes = sortObject(summary.outcomes);
  summary.failure_categories = sortObject(summary.failure_categories);
  return summary;
}

export async function enforceProviderPacing(provider, lastStartedAtByProvider, options = {}) {
  const normalized = clean(provider);
  const minimum = MARKET_REOBSERVATION_PROVIDER_MIN_DELAY_MS[normalized];
  if (!minimum) return 0;
  const clock = options.clock ?? Date.now;
  const sleep = options.sleep ?? delay;
  const previous = lastStartedAtByProvider.get(normalized);
  if (!Number.isFinite(previous)) return 0;
  const elapsed = Math.max(0, Number(clock()) - previous);
  const wait = Math.max(0, minimum - elapsed);
  if (wait > 0) await sleep(wait);
  return wait;
}

function isEligibleListing(listing) {
  return Boolean(
    listing
    && listing.review_required !== true
    && ELIGIBLE_STATUSES.has(clean(listing.status))
    && ELIGIBLE_SOURCES.has(clean(listing.source))
    && clean(listing.id)
    && clean(listing.source_url)
  );
}

function providerFromListing(listing) {
  if (listing?.source === "rakuten") return "rakuten_ichiba";
  if (listing?.source === "yahoo_shopping") return "yahoo_shopping";
  return "";
}

function defaultObservationKey(now) {
  const iso = now.toISOString();
  return `reobs-v1:${iso.slice(0, 13).replace(/[-:]/g, "")}`;
}

function safeObservationKey(value) {
  const key = clean(value);
  return key && key.length <= 120 && /^[A-Za-z0-9._:-]+$/.test(key) ? key : "";
}

function parseArgs(argv) {
  const args = { limit: DEFAULT_LIMIT, observationKey: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--limit") args.limit = boundedInteger(requiredValue(argv, ++index, token), 1, MAX_LIMIT, DEFAULT_LIMIT);
    else if (token === "--observation-key") args.observationKey = requiredValue(argv, ++index, token);
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function requiredValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function boundedInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function validDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function sortObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right, "en")));
}

function clean(value) {
  return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const artifact = await runMarketReobservationProviderDryRun(args);
  console.log(JSON.stringify(artifact, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`market re-observation provider dry-run failed: ${error?.message || "unknown_error"}`);
    process.exitCode = 1;
  });
}
