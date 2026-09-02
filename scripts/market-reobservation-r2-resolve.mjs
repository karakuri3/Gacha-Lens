import path from "node:path";
import { pathToFileURL } from "node:url";

import { resolveBoundedMarketplaceIdentity } from "../lib/domain/market-bounded-write.js";
import { marketReobservationObservationId } from "../lib/domain/market-reobservation.js";
import { loadOptionalEnvFile } from "./load-optional-env.mjs";
import { fetchRows } from "./supabase-rest.mjs";
import {
  R2_FROZEN_LISTING_IDS,
  R2_OBSERVATION_KEY,
  loadFrozenListings,
} from "./market-reobservation-r2-canary.mjs";

const OBSERVATION_SELECT = "id,listing_id,variant_id,series_id,price,status,source,observed_at,raw,created_at";

export async function resolveMarketReobservationR2Commit(options = {}) {
  if (options.loadEnv !== false) loadOptionalEnvFile();
  const readRows = options.fetchRows ?? fetchRows;
  const listings = await loadFrozenListings(readRows);
  const identities = new Map();
  const observationIds = [];

  for (const listing of listings) {
    const identity = resolveBoundedMarketplaceIdentity(listing);
    if (!identity.complete || identity.derivedId !== listing.id) {
      return result("inconsistent", listings, observationIds, {
        reason: "frozen_listing_identity_invalid",
        write_retry_authorized: false,
      });
    }
    identities.set(listing.id, identity);
    observationIds.push(marketReobservationObservationId({
      listingId: listing.id,
      provider: identity.provider,
      observationKey: R2_OBSERVATION_KEY,
    }));
  }

  const [r2Observations, targetObservations] = await Promise.all([
    readRows("market_listing_observations", {
      select: OBSERVATION_SELECT,
      pageSize: 4,
      params: { id: inFilter(observationIds), order: "id.asc" },
      operationName: "market_reobservation_r2.resolve_ids",
    }),
    readRows("market_listing_observations", {
      select: OBSERVATION_SELECT,
      pageSize: 20,
      params: { listing_id: inFilter(R2_FROZEN_LISTING_IDS), order: "id.asc" },
      operationName: "market_reobservation_r2.resolve_targets",
    }),
  ]);

  const rows = Array.isArray(r2Observations) ? r2Observations : [];
  const targetCounts = countByListing(targetObservations);
  if (rows.length === 0) {
    const allStillOne = R2_FROZEN_LISTING_IDS.every((id) => targetCounts.get(id) === 1);
    return result(allStillOne ? "not_committed" : "inconsistent", listings, observationIds, {
      reason: allStillOne ? "no_r2_observation_ids_and_one_prior_each" : "no_r2_ids_but_target_history_changed",
      target_observation_counts: countsObject(targetCounts),
      write_retry_authorized: false,
    });
  }

  if (rows.length !== 4 || new Set(rows.map((row) => row.id)).size !== 4) {
    return result("inconsistent", listings, observationIds, {
      reason: "partial_or_duplicate_r2_observation_set",
      found_observation_ids: rows.map((row) => row.id).filter(Boolean).sort(),
      target_observation_counts: countsObject(targetCounts),
      write_retry_authorized: false,
    });
  }

  const byListing = new Map(rows.map((row) => [row.listing_id, row]));
  for (const listing of listings) {
    const row = byListing.get(listing.id);
    const identity = identities.get(listing.id);
    const raw = row?.raw?.market_reobservation;
    if (!row
      || row.variant_id !== listing.variant_id
      || row.series_id !== listing.series_id
      || row.source !== listing.source
      || row.status !== listing.status
      || Number(row.price) !== Number(listing.price)
      || normalizeTime(row.observed_at) !== normalizeTime(listing.last_observed_at)
      || raw?.provider !== identity.provider
      || raw?.source_listing_id !== identity.sourceListingId
      || raw?.observation_key !== R2_OBSERVATION_KEY
      || !["unchanged", "price_changed", "status_changed"].includes(raw?.outcome)
      || listing.sold_at !== null
      || !["active", "sold_out"].includes(listing.status)
      || targetCounts.get(listing.id) !== 2) {
      return result("inconsistent", listings, observationIds, {
        reason: `committed_row_verification_failed:${listing.id}`,
        target_observation_counts: countsObject(targetCounts),
        write_retry_authorized: false,
      });
    }
  }

  if (observationIds.some((id) => !rows.some((row) => row.id === id))) {
    return result("inconsistent", listings, observationIds, {
      reason: "deterministic_observation_id_mismatch",
      target_observation_counts: countsObject(targetCounts),
      write_retry_authorized: false,
    });
  }

  return result("committed", listings, observationIds, {
    reason: "all_four_deterministic_observations_verified",
    target_observation_counts: countsObject(targetCounts),
    write_retry_authorized: false,
  });
}

function result(state, listings, observationIds, extra = {}) {
  return {
    schema_version: 1,
    kind: "market_reobservation_r2_commit_resolution",
    state,
    observation_key: R2_OBSERVATION_KEY,
    listing_ids: listings.map((row) => row.id),
    observation_ids: [...observationIds],
    provider_requests: 0,
    rpc_calls: 0,
    production_writes: 0,
    automatic_retry: false,
    ...extra,
  };
}

function countByListing(rows = []) {
  const counts = new Map();
  for (const row of rows ?? []) counts.set(row.listing_id, (counts.get(row.listing_id) ?? 0) + 1);
  return counts;
}

function countsObject(counts) {
  return Object.fromEntries(R2_FROZEN_LISTING_IDS.map((id) => [id, counts.get(id) ?? 0]));
}

function normalizeTime(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function inFilter(ids) {
  return `in.(${ids.map((id) => `\"${String(id).replaceAll('"', '\\"')}\"`).join(",")})`;
}

async function main() {
  const artifact = await resolveMarketReobservationR2Commit();
  console.log(JSON.stringify(artifact, null, 2));
  if (artifact.state === "inconsistent") process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`market re-observation R2 commit resolution failed closed: ${error?.message || "unknown_error"}`);
    process.exitCode = 1;
  });
}
