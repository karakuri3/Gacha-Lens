import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalMarketplaceSource } from "../lib/domain/market-canary-write.js";
import { resolveBoundedMarketplaceIdentity } from "../lib/domain/market-bounded-write.js";
import {
  MARKET_REOBSERVATION_BOUNDED_MAX_BATCH,
  MARKET_REOBSERVATION_BOUNDED_MIN_BATCH,
} from "../lib/domain/market-reobservation-bounded-persistence.js";
import { marketReobservationObservationId } from "../lib/domain/market-reobservation.js";
import { loadOptionalEnvFile } from "./load-optional-env.mjs";
import { fetchRows } from "./supabase-rest.mjs";

const LISTING_SELECT = "id,variant_id,matched_variant_id,series_id,title,listing_type,market_review_type,price,status,source,source_type,source_url,listed_at,sold_at,confidence,review_required,raw,created_at,updated_at,last_observed_at";
const OBSERVATION_SELECT = "id,listing_id,variant_id,series_id,price,status,source,observed_at,raw,created_at";
const OBSERVATION_ID = /^market-reobservation-[0-9a-f]{32}$/;
const SUCCESS_OUTCOMES = new Set(["unchanged", "price_changed", "status_changed"]);

export async function resolveMarketReobservationBoundedCommit(options = {}) {
  if (options.loadEnv !== false) loadOptionalEnvFile();
  const manifest = validateManifest(options.manifest);
  const readRows = options.fetchRows ?? fetchRows;
  const listingIds = manifest.batch.map((entry) => entry.listing_id);
  const observationIds = manifest.batch.map((entry) => entry.observation_id);
  const [listings, observations, targetObservations] = await Promise.all([
    readRows("market_listings", {
      select: LISTING_SELECT,
      pageSize: MARKET_REOBSERVATION_BOUNDED_MAX_BATCH,
      params: { id: inFilter(listingIds), order: "id.asc" },
      operationName: "market_reobservation_bounded.resolve_listings",
    }),
    readRows("market_listing_observations", {
      select: OBSERVATION_SELECT,
      pageSize: MARKET_REOBSERVATION_BOUNDED_MAX_BATCH,
      params: { id: inFilter(observationIds), order: "id.asc" },
      operationName: "market_reobservation_bounded.resolve_ids",
    }),
    readRows("market_listing_observations", {
      select: OBSERVATION_SELECT,
      pageSize: 200,
      params: { listing_id: inFilter(listingIds), order: "id.asc" },
      operationName: "market_reobservation_bounded.resolve_targets",
    }),
  ]);

  const listingById = new Map((listings ?? []).map((row) => [row.id, row]));
  const rows = Array.isArray(observations) ? observations : [];
  const targetCounts = countByListing(targetObservations);
  if (listingById.size !== manifest.batch.length) {
    return result("inconsistent", manifest, {
      reason: "bounded_listing_set_incomplete",
      target_observation_counts: countsObject(manifest.batch, targetCounts),
    });
  }

  if (rows.length === 0) {
    for (const entry of manifest.batch) {
      const listing = listingById.get(entry.listing_id);
      if (!verifyIdentity(listing, entry)
        || Number(listing.price) !== entry.expected_price
        || listing.status !== entry.expected_status
        || normalizeTime(listing.last_observed_at) !== entry.expected_last_observed_at
        || targetCounts.get(entry.listing_id) !== entry.expected_prior_observation_count) {
        return result("inconsistent", manifest, {
          reason: `no_bounded_ids_but_prewrite_state_changed:${entry.listing_id}`,
          target_observation_counts: countsObject(manifest.batch, targetCounts),
        });
      }
    }
    return result("not_committed", manifest, {
      reason: "no_deterministic_observation_ids_and_frozen_prewrite_state_intact",
      target_observation_counts: countsObject(manifest.batch, targetCounts),
    });
  }

  if (rows.length !== manifest.batch.length || new Set(rows.map((row) => row.id)).size !== manifest.batch.length) {
    return result("inconsistent", manifest, {
      reason: "partial_or_duplicate_bounded_observation_set",
      found_observation_ids: rows.map((row) => row.id).filter(Boolean).sort(),
      target_observation_counts: countsObject(manifest.batch, targetCounts),
    });
  }

  const rowByListing = new Map(rows.map((row) => [row.listing_id, row]));
  for (const entry of manifest.batch) {
    const listing = listingById.get(entry.listing_id);
    const row = rowByListing.get(entry.listing_id);
    const raw = row?.raw?.market_reobservation;
    if (!verifyIdentity(listing, entry)
      || !row
      || row.id !== entry.observation_id
      || row.variant_id !== entry.variant_id
      || row.series_id !== entry.series_id
      || row.source !== entry.source
      || Number(row.price) !== entry.price
      || row.status !== entry.status
      || normalizeTime(row.observed_at) !== entry.observed_at
      || raw?.provider !== entry.provider
      || raw?.source_listing_id !== entry.source_listing_id
      || raw?.observation_key !== manifest.observation_key
      || !SUCCESS_OUTCOMES.has(raw?.outcome)
      || Number(listing.price) !== entry.price
      || listing.status !== entry.status
      || normalizeTime(listing.last_observed_at) !== entry.observed_at
      || normalizeTime(listing.updated_at) !== entry.observed_at
      || listing.sold_at !== null
      || targetCounts.get(entry.listing_id) !== entry.expected_prior_observation_count + 1) {
      return result("inconsistent", manifest, {
        reason: `committed_row_verification_failed:${entry.listing_id}`,
        target_observation_counts: countsObject(manifest.batch, targetCounts),
      });
    }
  }

  if (observationIds.some((id) => !rows.some((row) => row.id === id))) {
    return result("inconsistent", manifest, {
      reason: "deterministic_bounded_observation_id_mismatch",
      target_observation_counts: countsObject(manifest.batch, targetCounts),
    });
  }

  return result("committed", manifest, {
    reason: "all_bounded_deterministic_observations_verified",
    target_observation_counts: countsObject(manifest.batch, targetCounts),
  });
}

export function buildMarketReobservationBoundedResolutionManifest({ observationKey, batch } = {}) {
  return validateManifest({
    schema_version: 1,
    kind: "market_reobservation_bounded_resolution_manifest",
    observation_key: observationKey,
    batch,
  });
}

function validateManifest(value) {
  const manifest = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const key = safeObservationKey(manifest.observation_key);
  const batch = Array.isArray(manifest.batch) ? manifest.batch.map((entry) => normalizeEntry(entry, key)) : [];
  if (Number(manifest.schema_version) !== 1
    || manifest.kind !== "market_reobservation_bounded_resolution_manifest"
    || !key
    || batch.length < MARKET_REOBSERVATION_BOUNDED_MIN_BATCH
    || batch.length > MARKET_REOBSERVATION_BOUNDED_MAX_BATCH
    || new Set(batch.map((entry) => entry.listing_id)).size !== batch.length
    || new Set(batch.map((entry) => entry.observation_id)).size !== batch.length) {
    throw new Error("Bounded re-observation resolution manifest is invalid.");
  }
  return {
    schema_version: 1,
    kind: "market_reobservation_bounded_resolution_manifest",
    observation_key: key,
    batch: batch.sort((left, right) => left.listing_id.localeCompare(right.listing_id, "en")),
  };
}

function normalizeEntry(entry, observationKey) {
  const value = entry && typeof entry === "object" && !Array.isArray(entry) ? entry : {};
  const listingId = clean(value.listing_id);
  const provider = clean(value.provider);
  const source = clean(value.source);
  const sourceListingId = clean(value.source_listing_id);
  const publicUrl = clean(value.public_url);
  const variantId = clean(value.variant_id);
  const seriesId = clean(value.series_id);
  const observationId = clean(value.observation_id);
  const observedAt = normalizeTime(value.observed_at);
  const expectedLastObservedAt = normalizeTime(value.expected_last_observed_at);
  const price = positiveInteger(value.price);
  const expectedPrice = positiveInteger(value.expected_price);
  const priorCount = positiveInteger(value.expected_prior_observation_count);
  const status = clean(value.status);
  const expectedStatus = clean(value.expected_status);
  let expectedSource = "";
  try {
    expectedSource = canonicalMarketplaceSource(provider);
  } catch {
    expectedSource = "";
  }
  let expectedObservationId = "";
  try {
    expectedObservationId = marketReobservationObservationId({ listingId, provider, observationKey });
  } catch {
    expectedObservationId = "";
  }
  if (!listingId || !["rakuten_ichiba", "yahoo_shopping"].includes(provider)
    || source !== expectedSource || !sourceListingId || !publicUrl || !variantId || !seriesId
    || !OBSERVATION_ID.test(observationId) || observationId !== expectedObservationId
    || !observedAt || !expectedLastObservedAt || observedAt <= expectedLastObservedAt
    || price === null || expectedPrice === null || priorCount === null
    || !["active", "sold_out"].includes(status) || !["active", "sold_out"].includes(expectedStatus)) {
    throw new Error("Bounded re-observation resolution manifest entry is invalid.");
  }
  return {
    listing_id: listingId,
    observation_id: observationId,
    provider,
    source_listing_id: sourceListingId,
    public_url: publicUrl,
    variant_id: variantId,
    series_id: seriesId,
    source,
    observation_key: observationKey,
    observed_at: observedAt,
    price,
    status,
    expected_price: expectedPrice,
    expected_status: expectedStatus,
    expected_last_observed_at: expectedLastObservedAt,
    expected_prior_observation_count: priorCount,
  };
}

function verifyIdentity(listing, entry) {
  if (!listing
    || listing.variant_id !== entry.variant_id
    || listing.matched_variant_id !== entry.variant_id
    || listing.series_id !== entry.series_id
    || listing.source !== entry.source
    || listing.source_type !== "marketplace"
    || listing.source_url !== entry.public_url
    || listing.listing_type !== "single"
    || listing.market_review_type !== "single"
    || listing.review_required === true
    || listing.raw?.provider !== entry.provider
    || listing.raw?.source_listing_id !== entry.source_listing_id
    || listing.raw?.public_url !== entry.public_url
    || listing.sold_at !== null) return false;
  const identity = resolveBoundedMarketplaceIdentity(listing);
  return identity.complete
    && identity.derivedId === entry.listing_id
    && identity.provider === entry.provider
    && identity.sourceListingId === entry.source_listing_id
    && identity.publicUrl === entry.public_url;
}

function result(state, manifest, extra = {}) {
  return {
    schema_version: 1,
    kind: "market_reobservation_bounded_commit_resolution",
    state,
    observation_key: manifest.observation_key,
    listing_ids: manifest.batch.map((entry) => entry.listing_id),
    observation_ids: manifest.batch.map((entry) => entry.observation_id),
    provider_requests: 0,
    rpc_calls: 0,
    production_writes: 0,
    automatic_retry: false,
    write_retry_authorized: false,
    ...extra,
  };
}

function countByListing(rows = []) {
  const counts = new Map();
  for (const row of rows ?? []) counts.set(row.listing_id, (counts.get(row.listing_id) ?? 0) + 1);
  return counts;
}

function countsObject(batch, counts) {
  return Object.fromEntries(batch.map((entry) => [entry.listing_id, counts.get(entry.listing_id) ?? 0]));
}

function normalizeTime(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function positiveInteger(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function safeObservationKey(value) {
  const key = clean(value);
  return key && key.length <= 120 && /^[A-Za-z0-9._:-]+$/.test(key) ? key : "";
}

function clean(value) {
  return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

function inFilter(ids) {
  return `in.(${ids.map((id) => `\"${String(id).replaceAll('"', '\\"')}\"`).join(",")})`;
}

function parseArgs(argv) {
  const result = { manifestPath: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (token === "--manifest") {
      if (!value || value.startsWith("--")) throw new Error("--manifest requires a value.");
      result.manifestPath = value;
      index += 1;
    } else throw new Error(`Unknown argument: ${token}`);
  }
  if (!result.manifestPath) throw new Error("--manifest is required.");
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = await fs.readFile(path.resolve(args.manifestPath), "utf8");
  const manifest = JSON.parse(raw);
  const artifact = await resolveMarketReobservationBoundedCommit({ manifest });
  console.log(JSON.stringify(artifact, null, 2));
  if (artifact.state === "inconsistent") process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`market re-observation bounded commit resolution failed closed: ${error?.message || "unknown_error"}`);
    process.exitCode = 1;
  });
}
