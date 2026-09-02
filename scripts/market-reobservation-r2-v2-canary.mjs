import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalJson } from "../lib/domain/market-bounded-write.js";
import {
  buildMarketReobservationR2V2CohortDigest,
  buildMarketReobservationR2V2RpcBatch,
  expectedMarketReobservationR2V2Approval,
  MARKET_REOBSERVATION_R2_V2_BATCH_SIZE,
  MARKET_REOBSERVATION_R2_V2_OBSERVATION_KEY,
  MARKET_REOBSERVATION_R2_V2_RPC,
  validateMarketReobservationR2V2Invocation,
  validateMarketReobservationR2V2RpcResult,
} from "../lib/domain/market-reobservation-r2-v2-persistence.js";
import { marketReobservationObservationId, planMarketReobservation } from "../lib/domain/market-reobservation.js";
import {
  fetchExactMarketReobservation,
  MARKET_REOBSERVATION_PROVIDER_MIN_DELAY_MS,
  sanitizeReobservationProviderRead,
} from "../lib/fetchers/market-reobservation-provider-read.js";
import { loadOptionalEnvFile } from "./load-optional-env.mjs";
import { fetchRowCount, fetchRows } from "./supabase-rest.mjs";

export const R2_V2_OBSERVATION_KEY = MARKET_REOBSERVATION_R2_V2_OBSERVATION_KEY;
export const R2_V2_FROZEN_LISTING_IDS = Object.freeze([
  "yahoo-lead-netstore-302507s186ook3",
  "yahoo-selen-shope-5500000224314",
  "yahoo-lead-netstore-qq222607s309ptk2",
  "yahoo-toysanta-g-5l960018a9-002-57393",
]);

const HEAD_SHA = /^[0-9a-f]{40}$/;
const SUCCESS_OUTCOMES = new Set(["unchanged", "price_changed", "status_changed"]);
const LISTING_SELECT = "id,variant_id,matched_variant_id,series_id,title,listing_type,market_review_type,price,status,source,source_type,source_url,listed_at,sold_at,confidence,review_required,raw,created_at,updated_at,last_observed_at";

export async function runMarketReobservationR2V2Canary(options = {}) {
  if (options.loadEnv !== false) loadOptionalEnvFile();
  const mode = options.mode ?? "dry-run";
  const headSha = clean(options.headSha ?? process.env.GITHUB_SHA).toLowerCase();
  const expectedMainSha = clean(options.expectedMainSha ?? process.env.R2_V2_EXPECTED_MAIN_SHA).toLowerCase();
  if (!HEAD_SHA.test(headSha) || expectedMainSha !== headSha) throw new Error("R2 v2 runner must be bound to exact current main.");

  const readRows = options.fetchRows ?? fetchRows;
  const readCount = options.fetchRowCount ?? fetchRowCount;
  const listings = await loadR2V2FrozenListings(readRows);
  const preflight = await loadR2V2PreflightEvidence({ listings, readRows, readCount });
  const cohortDigest = buildMarketReobservationR2V2CohortDigest({
    headSha,
    observationKey: R2_V2_OBSERVATION_KEY,
    listings,
  });
  const invocation = validateMarketReobservationR2V2Invocation({
    mode,
    head_sha: headSha,
    expected_main_sha: expectedMainSha,
    cohort_digest: cohortDigest,
    approval: options.approval ?? "",
  });

  if (mode === "dry-run") {
    return buildPreparationArtifact({ headSha, cohortDigest, listings, preflight });
  }

  const providerRead = options.providerRead ?? fetchExactMarketReobservation;
  const sleep = options.sleep ?? delay;
  const clock = options.clock ?? Date.now;
  const observedAt = validDate(options.now ?? new Date());
  if (!observedAt) throw new Error("R2 v2 observed_at is invalid.");
  const lastStartedAtByProvider = new Map();
  const plans = [];
  const providerEvidence = [];
  let totalAttempts = 0;

  for (const listing of listings) {
    const provider = listing.raw?.provider;
    if (provider !== "yahoo_shopping") throw new Error("R2 v2 frozen cohort must be Yahoo Shopping only.");
    await enforceProviderPacing(provider, lastStartedAtByProvider, { sleep, clock });
    lastStartedAtByProvider.set(provider, clock());
    const read = sanitizeReobservationProviderRead(await providerRead(listing, options.providerOptions ?? options));
    const attempts = Number(read.diagnostics?.attempt_count) || 0;
    if (attempts < 1 || attempts > 3) throw new Error("R2 v2 provider attempt count exceeded the per-listing contract.");
    totalAttempts += attempts;
    if (totalAttempts > 12) throw new Error("R2 v2 provider attempt budget exceeded 12 HTTP attempts.");
    const plan = planMarketReobservation({
      listing,
      providerResult: read.result,
      observedAt,
      observationKey: R2_V2_OBSERVATION_KEY,
    });
    const evidence = sanitizeProviderEvidence(listing.id, read, plan);
    providerEvidence.push(evidence);
    if (!SUCCESS_OUTCOMES.has(plan.outcome) || !plan.writes?.observation_insert || !plan.writes?.listing_update) {
      throw new Error(`R2 v2 all-or-nothing provider preflight failed for ${listing.id}: ${plan.outcome || "provider_error"}; attempts=${evidence.attempt_count}; total_attempts=${totalAttempts}.`);
    }
    plans.push(plan);
  }

  if (plans.length !== MARKET_REOBSERVATION_R2_V2_BATCH_SIZE) throw new Error("R2 v2 provider preflight did not produce four successful plans.");
  const batch = buildMarketReobservationR2V2RpcBatch({ listings, plans, observationKey: R2_V2_OBSERVATION_KEY });
  const rpcCall = options.rpcCall ?? invokeR2V2Rpc;
  const rpcResult = validateMarketReobservationR2V2RpcResult(await rpcCall(batch, options));
  const postwrite = await verifyR2V2Postwrite({
    listingsBefore: listings,
    batch,
    preflight,
    readRows,
    readCount,
  });

  return {
    schema_version: 2,
    kind: "market_reobservation_r2_canary_v2_result",
    mode: invocation.mode,
    head_sha: headSha,
    cohort_digest: cohortDigest,
    observation_key: R2_V2_OBSERVATION_KEY,
    provider_attempts: totalAttempts,
    provider_evidence: providerEvidence,
    rpc: rpcResult,
    postwrite,
    production_actions: 1,
    database_writes_expected: 8,
  };
}

export async function loadR2V2FrozenListings(readRows = fetchRows) {
  const rows = await readRows("market_listings", {
    select: LISTING_SELECT,
    pageSize: MARKET_REOBSERVATION_R2_V2_BATCH_SIZE,
    params: { id: inFilter(R2_V2_FROZEN_LISTING_IDS), order: "id.asc" },
    operationName: "market_reobservation_r2_v2.market_listings",
  });
  const byId = new Map((rows ?? []).map((row) => [row.id, row]));
  if (byId.size !== MARKET_REOBSERVATION_R2_V2_BATCH_SIZE || R2_V2_FROZEN_LISTING_IDS.some((id) => !byId.has(id))) {
    throw new Error("R2 v2 frozen listing cohort is incomplete.");
  }
  const listings = R2_V2_FROZEN_LISTING_IDS.map((id) => byId.get(id));
  if (listings.some((listing) => listing?.raw?.provider !== "yahoo_shopping" || listing?.source !== "yahoo_shopping")) {
    throw new Error("R2 v2 frozen cohort is not Yahoo Shopping only.");
  }
  return listings;
}

export async function loadR2V2PreflightEvidence({ listings, readRows = fetchRows, readCount = fetchRowCount } = {}) {
  const listingIds = listings.map((listing) => listing.id);
  const observationIds = listings.map((listing) => marketReobservationObservationId({
    listingId: listing.id,
    provider: listing.raw?.provider,
    observationKey: R2_V2_OBSERVATION_KEY,
  }));
  const [targetObservations, collidingObservations, unresolvedIssues, allObservations, marketListings, observations, completedSold] = await Promise.all([
    readRows("market_listing_observations", {
      select: "id,listing_id,variant_id,series_id,price,status,source,observed_at,raw,created_at",
      pageSize: 20,
      params: { listing_id: inFilter(listingIds), order: "id.asc" },
      operationName: "market_reobservation_r2_v2.target_observations",
    }),
    readRows("market_listing_observations", {
      select: "id,listing_id",
      pageSize: 4,
      params: { id: inFilter(observationIds), order: "id.asc" },
      operationName: "market_reobservation_r2_v2.id_collisions",
    }),
    readRows("import_issues", {
      select: "id,record_id,resolved",
      pageSize: 20,
      params: { table_name: "eq.market_listings", record_id: inFilter(listingIds), resolved: "eq.false", order: "id.asc" },
      operationName: "market_reobservation_r2_v2.import_issues",
    }),
    readRows("market_listing_observations", {
      select: "id,listing_id,status",
      operationName: "market_reobservation_r2_v2.all_observations",
    }),
    readCount("market_listings"),
    readCount("market_listing_observations"),
    readCount("market_listings", { status: "eq.sold" }),
  ]);

  const targetCounts = countByListing(targetObservations);
  if (listings.some((listing) => targetCounts.get(listing.id) !== 1)
    || (collidingObservations ?? []).length !== 0
    || (unresolvedIssues ?? []).length !== 0) {
    throw new Error("R2 v2 Production preflight no longer matches the frozen one-observation cohort.");
  }

  return {
    counts: {
      market_listings: marketListings,
      observations,
      reobserved_listings: countReobserved(allObservations),
      completed_sold: completedSold,
    },
    target_observation_counts: Object.fromEntries(listingIds.map((id) => [id, targetCounts.get(id) ?? 0])),
    observation_ids: observationIds,
    observation_id_collisions: 0,
    unresolved_import_issues: 0,
  };
}

export async function verifyR2V2Postwrite({ listingsBefore, batch, preflight, readRows = fetchRows, readCount = fetchRowCount } = {}) {
  const listingIds = batch.map((entry) => entry.listing_id);
  const observationIds = batch.map((entry) => entry.observation_id);
  const [listingsAfter, insertedObservations, targetObservations, allObservations, marketListings, observations, completedSold] = await Promise.all([
    readRows("market_listings", {
      select: LISTING_SELECT,
      pageSize: 4,
      params: { id: inFilter(listingIds), order: "id.asc" },
      operationName: "market_reobservation_r2_v2.post_listings",
    }),
    readRows("market_listing_observations", {
      select: "id,listing_id,variant_id,series_id,price,status,source,observed_at,raw,created_at",
      pageSize: 4,
      params: { id: inFilter(observationIds), order: "id.asc" },
      operationName: "market_reobservation_r2_v2.post_observations",
    }),
    readRows("market_listing_observations", {
      select: "id,listing_id",
      pageSize: 20,
      params: { listing_id: inFilter(listingIds), order: "id.asc" },
      operationName: "market_reobservation_r2_v2.post_target_counts",
    }),
    readRows("market_listing_observations", {
      select: "id,listing_id,status",
      operationName: "market_reobservation_r2_v2.post_all_observations",
    }),
    readCount("market_listings"),
    readCount("market_listing_observations"),
    readCount("market_listings", { status: "eq.sold" }),
  ]);

  const afterById = new Map(listingsAfter.map((row) => [row.id, row]));
  const batchById = new Map(batch.map((entry) => [entry.listing_id, entry]));
  const beforeById = new Map(listingsBefore.map((row) => [row.id, row]));
  if (afterById.size !== 4 || insertedObservations.length !== 4) throw new Error("R2 v2 postwrite rows are incomplete.");

  for (const id of listingIds) {
    const before = beforeById.get(id);
    const after = afterById.get(id);
    const expected = batchById.get(id);
    if (!before || !after || !expected
      || protectedListingSnapshot(before) !== protectedListingSnapshot(after)
      || after.price !== expected.price
      || after.status !== expected.status
      || validDate(after.last_observed_at)?.toISOString() !== expected.observed_at
      || validDate(after.updated_at)?.toISOString() !== expected.observed_at
      || after.sold_at !== null) {
      throw new Error(`R2 v2 protected listing verification failed for ${id}.`);
    }
  }

  const targetCounts = countByListing(targetObservations);
  const afterCounts = {
    market_listings: marketListings,
    observations,
    reobserved_listings: countReobserved(allObservations),
    completed_sold: completedSold,
  };
  const expectedDeltas = { market_listings: 0, observations: 4, reobserved_listings: 4, completed_sold: 0 };
  for (const [key, expectedDelta] of Object.entries(expectedDeltas)) {
    if (afterCounts[key] - preflight.counts[key] !== expectedDelta) throw new Error(`R2 v2 unexpected Production delta for ${key}.`);
  }
  if (listingIds.some((id) => targetCounts.get(id) !== 2)) throw new Error("R2 v2 target observation history did not become exactly two rows each.");
  if (new Set(insertedObservations.map((row) => row.id)).size !== 4
    || observationIds.some((id) => !insertedObservations.some((row) => row.id === id))) {
    throw new Error("R2 v2 deterministic observation rows are missing after commit.");
  }

  return { verified: true, before: preflight.counts, after: afterCounts, deltas: expectedDeltas };
}

export async function invokeR2V2Rpc(batch, options = {}) {
  if (!Array.isArray(batch) || batch.length !== MARKET_REOBSERVATION_R2_V2_BATCH_SIZE) throw new Error("R2 v2 RPC call requires exactly four entries.");
  const supabaseUrl = clean(options.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL);
  const serviceRoleKey = clean(options.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) throw new Error("R2 v2 RPC requires Supabase URL and service-role key.");
  const url = new URL(`/rest/v1/rpc/${MARKET_REOBSERVATION_R2_V2_RPC}`, supabaseUrl);
  const response = await (options.fetchImpl ?? fetch)(url, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ p_batch: batch }),
  });
  if (!response.ok) throw new Error(`R2 v2 atomic RPC failed with HTTP ${response.status}.`);
  const value = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("R2 v2 atomic RPC response is invalid.");
  return value;
}

function buildPreparationArtifact({ headSha, cohortDigest, listings, preflight }) {
  const observationIds = listings.map((listing) => marketReobservationObservationId({
    listingId: listing.id,
    provider: listing.raw?.provider,
    observationKey: R2_V2_OBSERVATION_KEY,
  }));
  return {
    schema_version: 2,
    kind: "market_reobservation_r2_v2_preflight",
    mode: "dry-run",
    head_sha: headSha,
    cohort_digest: cohortDigest,
    observation_key: R2_V2_OBSERVATION_KEY,
    listing_ids: listings.map((listing) => listing.id),
    observation_ids: observationIds,
    current_counts: preflight.counts,
    target_observation_counts: preflight.target_observation_counts,
    observation_id_collisions: preflight.observation_id_collisions,
    unresolved_import_issues: preflight.unresolved_import_issues,
    projected_if_all_provider_reads_seen: {
      market_listing_delta: 0,
      observation_delta: 4,
      reobserved_listing_delta: 4,
      completed_sold_delta: 0,
    },
    required_approval: expectedMarketReobservationR2V2Approval({ headSha, cohortDigest }),
    provider_requests: 0,
    production_actions: 0,
    write_authorized: false,
  };
}

function sanitizeProviderEvidence(listingId, read, plan) {
  return {
    listing_id: listingId,
    provider: clean(read.result?.provider),
    outcome: clean(plan?.outcome) || "provider_error",
    attempt_count: Number(read.diagnostics?.attempt_count) || 0,
    retry_count: Number(read.diagnostics?.retry_count) || 0,
    rate_limited: read.diagnostics?.rate_limited === true,
    timed_out: read.diagnostics?.timed_out === true,
  };
}

function protectedListingSnapshot(row) {
  return canonicalJson({
    id: row.id,
    variant_id: row.variant_id,
    matched_variant_id: row.matched_variant_id,
    series_id: row.series_id,
    title: row.title,
    listing_type: row.listing_type,
    market_review_type: row.market_review_type,
    source: row.source,
    source_type: row.source_type,
    source_url: row.source_url,
    listed_at: validDate(row.listed_at)?.toISOString() ?? null,
    confidence: row.confidence == null ? null : Number(row.confidence),
    review_required: row.review_required === true,
    raw: row.raw,
    created_at: validDate(row.created_at)?.toISOString() ?? null,
  });
}

function countByListing(rows = []) {
  const counts = new Map();
  for (const row of rows ?? []) counts.set(row.listing_id, (counts.get(row.listing_id) ?? 0) + 1);
  return counts;
}

function countReobserved(rows = []) {
  return [...countByListing(rows).values()].filter((count) => count >= 2).length;
}

async function enforceProviderPacing(provider, lastStartedAtByProvider, options = {}) {
  const minimum = MARKET_REOBSERVATION_PROVIDER_MIN_DELAY_MS[provider];
  if (!minimum || provider !== "yahoo_shopping") throw new Error("R2 v2 Yahoo provider pacing contract is unavailable.");
  const previous = lastStartedAtByProvider.get(provider);
  if (!Number.isFinite(previous)) return;
  const elapsed = Math.max(0, Number(options.clock()) - previous);
  const wait = Math.max(0, minimum - elapsed);
  if (wait > 0) await options.sleep(wait);
}

function inFilter(ids) {
  return `in.(${ids.map((id) => `\"${String(id).replaceAll('"', '\\"')}\"`).join(",")})`;
}

function validDate(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function clean(value) {
  return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const result = { mode: "dry-run", approval: "", headSha: "", expectedMainSha: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (token === "--mode" || token === "--approval" || token === "--head-sha" || token === "--expected-main-sha") {
      if (!value || value.startsWith("--")) throw new Error(`${token} requires a value.`);
      index += 1;
      if (token === "--mode") result.mode = value;
      else if (token === "--approval") result.approval = value;
      else if (token === "--head-sha") result.headSha = value;
      else result.expectedMainSha = value;
    } else throw new Error(`Unknown argument: ${token}`);
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const artifact = await runMarketReobservationR2V2Canary(args);
  console.log(JSON.stringify(artifact, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`market re-observation R2 v2 canary failed closed: ${error?.message || "unknown_error"}`);
    process.exitCode = 1;
  });
}
