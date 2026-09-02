import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalJson } from "../lib/domain/market-bounded-write.js";
import {
  buildMarketReobservationBoundedCohortDigest,
  buildMarketReobservationBoundedDryRunArtifact,
  buildMarketReobservationBoundedRpcBatch,
  expectedMarketReobservationBoundedApproval,
  MARKET_REOBSERVATION_BOUNDED_MAX_ATTEMPTS,
  MARKET_REOBSERVATION_BOUNDED_MAX_BATCH,
  MARKET_REOBSERVATION_BOUNDED_MIN_BATCH,
  MARKET_REOBSERVATION_BOUNDED_RPC,
  validateMarketReobservationBoundedInvocation,
  validateMarketReobservationBoundedRpcResult,
} from "../lib/domain/market-reobservation-bounded-persistence.js";
import { marketReobservationObservationId, planMarketReobservation } from "../lib/domain/market-reobservation.js";
import {
  fetchExactMarketReobservation,
  MARKET_REOBSERVATION_PROVIDER_MIN_DELAY_MS,
  sanitizeReobservationProviderRead,
} from "../lib/fetchers/market-reobservation-provider-read.js";
import { loadOptionalEnvFile } from "./load-optional-env.mjs";
import { buildMarketReobservationBoundedResolutionManifest } from "./market-reobservation-bounded-resolve.mjs";
import { fetchRowCount, fetchRows } from "./supabase-rest.mjs";

const HEAD_SHA = /^[0-9a-f]{40}$/;
const SUCCESS_OUTCOMES = new Set(["unchanged", "price_changed", "status_changed"]);
const LISTING_SELECT = "id,variant_id,matched_variant_id,series_id,title,listing_type,market_review_type,price,status,source,source_type,source_url,listed_at,sold_at,confidence,review_required,raw,created_at,updated_at,last_observed_at";

export async function runMarketReobservationBoundedCanary(options = {}) {
  if (options.loadEnv !== false) loadOptionalEnvFile();
  const mode = options.mode ?? "dry-run";
  const headSha = clean(options.headSha ?? process.env.GITHUB_SHA).toLowerCase();
  const expectedMainSha = clean(options.expectedMainSha ?? process.env.REOBS_BOUNDED_EXPECTED_MAIN_SHA).toLowerCase();
  const observationKey = safeObservationKey(options.observationKey ?? process.env.REOBS_BOUNDED_OBSERVATION_KEY);
  const listingIds = normalizeListingIds(options.listingIds ?? parseListingIds(process.env.REOBS_BOUNDED_LISTING_IDS ?? ""));
  if (!HEAD_SHA.test(headSha) || expectedMainSha !== headSha) throw new Error("Bounded re-observation runner must be bound to exact current main.");
  if (!observationKey) throw new Error("Bounded re-observation requires an explicit observation key.");

  const readRows = options.fetchRows ?? fetchRows;
  const readCount = options.fetchRowCount ?? fetchRowCount;
  const listings = await loadBoundedListings(listingIds, readRows);
  const preflight = await loadBoundedPreflightEvidence({ listings, observationKey, readRows, readCount });
  const cohort = listings.map((listing) => ({
    listing,
    prior_observation_count: preflight.target_observation_counts[listing.id],
  }));
  const cohortDigest = buildMarketReobservationBoundedCohortDigest({ headSha, observationKey, cohort });
  const invocation = validateMarketReobservationBoundedInvocation({
    mode,
    head_sha: headSha,
    expected_main_sha: expectedMainSha,
    cohort_digest: cohortDigest,
    approval: options.approval ?? "",
  });

  if (mode === "dry-run") {
    return buildPreparationArtifact({ headSha, cohortDigest, observationKey, cohort, preflight });
  }

  const resolutionManifestPath = clean(options.resolutionManifestPath
    ?? process.env.REOBS_BOUNDED_RESOLUTION_MANIFEST_OUT);
  if (!resolutionManifestPath) {
    throw new Error("Bounded re-observation canary-write requires a resolution manifest output path before RPC.");
  }

  const providerRead = options.providerRead ?? fetchExactMarketReobservation;
  const sleep = options.sleep ?? delay;
  const clock = options.clock ?? Date.now;
  const observedAt = validDate(options.now ?? new Date());
  if (!observedAt) throw new Error("Bounded re-observation observed_at is invalid.");
  const lastStartedAtByProvider = new Map();
  const plans = [];
  const providerEvidence = [];
  let totalAttempts = 0;
  const absoluteAttemptCeiling = Math.min(MARKET_REOBSERVATION_BOUNDED_MAX_ATTEMPTS, listings.length * 3);

  for (const listing of listings) {
    const provider = clean(listing.raw?.provider);
    await enforceProviderPacing(provider, lastStartedAtByProvider, { sleep, clock });
    lastStartedAtByProvider.set(provider, clock());
    const read = sanitizeReobservationProviderRead(await providerRead(listing, options.providerOptions ?? options));
    const attempts = Number(read.diagnostics?.attempt_count) || 0;
    totalAttempts += attempts;
    if (attempts < 1 || attempts > 3) {
      throw new Error(`Bounded re-observation provider attempt count failed contract for ${listing.id}; attempts=${attempts}; total_attempts=${totalAttempts}.`);
    }
    if (totalAttempts > absoluteAttemptCeiling) {
      throw new Error(`Bounded re-observation provider attempt budget exceeded ${absoluteAttemptCeiling}; total_attempts=${totalAttempts}.`);
    }
    const plan = planMarketReobservation({
      listing,
      providerResult: read.result,
      observedAt,
      observationKey,
    });
    const evidence = sanitizeProviderEvidence(listing.id, read, plan);
    providerEvidence.push(evidence);
    if (!SUCCESS_OUTCOMES.has(plan.outcome) || !plan.writes?.observation_insert || !plan.writes?.listing_update) {
      throw new Error(`Bounded re-observation all-or-nothing provider preflight failed for ${listing.id}: ${plan.outcome || "provider_error"}; attempts=${evidence.attempt_count}; total_attempts=${totalAttempts}.`);
    }
    plans.push(plan);
  }

  if (plans.length !== listings.length) throw new Error("Bounded re-observation provider preflight did not produce a successful plan for every frozen listing.");
  const batch = buildMarketReobservationBoundedRpcBatch({ cohort, plans, observationKey });
  const resolutionManifest = buildMarketReobservationBoundedResolutionManifest({ observationKey, batch });
  const persistResolutionManifest = options.persistResolutionManifest ?? writeResolutionManifest;
  await persistResolutionManifest(resolutionManifest, resolutionManifestPath);

  const newlyReobservedDelta = batch.filter((entry) => entry.expected_prior_observation_count === 1).length;
  const rpcCall = options.rpcCall ?? invokeBoundedRpc;
  const rpcResult = validateMarketReobservationBoundedRpcResult(await rpcCall(batch, options), {
    batchSize: batch.length,
    newlyReobservedDelta,
    observationKey,
    listingIds: batch.map((entry) => entry.listing_id),
    observationIds: batch.map((entry) => entry.observation_id),
  });
  const postwrite = await verifyBoundedPostwrite({
    listingsBefore: listings,
    batch,
    preflight,
    readRows,
    readCount,
  });

  return {
    schema_version: 1,
    kind: "market_reobservation_bounded_canary_result",
    mode: invocation.mode,
    head_sha: headSha,
    cohort_digest: cohortDigest,
    observation_key: observationKey,
    batch_size: batch.length,
    provider_attempts: totalAttempts,
    provider_attempt_ceiling: absoluteAttemptCeiling,
    provider_evidence: providerEvidence,
    resolution_manifest_preserved: true,
    resolution_manifest_path: resolutionManifestPath,
    rpc: rpcResult,
    postwrite,
    production_actions: 1,
    database_writes_expected: batch.length * 2,
  };
}

export async function loadBoundedListings(listingIds, readRows = fetchRows) {
  const ids = normalizeListingIds(listingIds);
  const rows = await readRows("market_listings", {
    select: LISTING_SELECT,
    pageSize: MARKET_REOBSERVATION_BOUNDED_MAX_BATCH,
    params: { id: inFilter(ids), order: "id.asc" },
    operationName: "market_reobservation_bounded.market_listings",
  });
  const byId = new Map((rows ?? []).map((row) => [row.id, row]));
  if (byId.size !== ids.length || ids.some((id) => !byId.has(id))) {
    throw new Error("Bounded re-observation frozen listing cohort is incomplete.");
  }
  return ids.map((id) => byId.get(id));
}

export async function loadBoundedPreflightEvidence({ listings, observationKey, readRows = fetchRows, readCount = fetchRowCount } = {}) {
  if (!Array.isArray(listings) || listings.length < MARKET_REOBSERVATION_BOUNDED_MIN_BATCH || listings.length > MARKET_REOBSERVATION_BOUNDED_MAX_BATCH) {
    throw new Error("Bounded re-observation preflight requires 1-10 listings.");
  }
  const key = safeObservationKey(observationKey);
  if (!key) throw new Error("Bounded re-observation preflight requires a valid observation key.");
  const listingIds = listings.map((listing) => listing.id);
  const observationIds = listings.map((listing) => marketReobservationObservationId({
    listingId: listing.id,
    provider: listing.raw?.provider,
    observationKey: key,
  }));
  const [targetObservations, collidingObservations, unresolvedIssues, allObservations, marketListings, observations, completedSold] = await Promise.all([
    readRows("market_listing_observations", {
      select: "id,listing_id,variant_id,series_id,price,status,source,observed_at,raw,created_at",
      pageSize: 200,
      params: { listing_id: inFilter(listingIds), order: "id.asc" },
      operationName: "market_reobservation_bounded.target_observations",
    }),
    readRows("market_listing_observations", {
      select: "id,listing_id",
      pageSize: MARKET_REOBSERVATION_BOUNDED_MAX_BATCH,
      params: { id: inFilter(observationIds), order: "id.asc" },
      operationName: "market_reobservation_bounded.id_collisions",
    }),
    readRows("import_issues", {
      select: "id,record_id,resolved",
      pageSize: 100,
      params: { table_name: "eq.market_listings", record_id: inFilter(listingIds), resolved: "eq.false", order: "id.asc" },
      operationName: "market_reobservation_bounded.import_issues",
    }),
    readRows("market_listing_observations", {
      select: "id,listing_id,status",
      operationName: "market_reobservation_bounded.all_observations",
    }),
    readCount("market_listings"),
    readCount("market_listing_observations"),
    readCount("market_listings", { status: "eq.sold" }),
  ]);

  const targetCounts = countByListing(targetObservations);
  if (listings.some((listing) => (targetCounts.get(listing.id) ?? 0) < 1)
    || (collidingObservations ?? []).length !== 0
    || (unresolvedIssues ?? []).length !== 0) {
    throw new Error("Bounded re-observation Production preflight no longer matches the frozen safe cohort.");
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

export async function verifyBoundedPostwrite({ listingsBefore, batch, preflight, readRows = fetchRows, readCount = fetchRowCount } = {}) {
  if (!Array.isArray(batch) || batch.length < MARKET_REOBSERVATION_BOUNDED_MIN_BATCH || batch.length > MARKET_REOBSERVATION_BOUNDED_MAX_BATCH) {
    throw new Error("Bounded re-observation postwrite batch is invalid.");
  }
  const listingIds = batch.map((entry) => entry.listing_id);
  const observationIds = batch.map((entry) => entry.observation_id);
  const [listingsAfter, insertedObservations, targetObservations, allObservations, marketListings, observations, completedSold] = await Promise.all([
    readRows("market_listings", {
      select: LISTING_SELECT,
      pageSize: MARKET_REOBSERVATION_BOUNDED_MAX_BATCH,
      params: { id: inFilter(listingIds), order: "id.asc" },
      operationName: "market_reobservation_bounded.post_listings",
    }),
    readRows("market_listing_observations", {
      select: "id,listing_id,variant_id,series_id,price,status,source,observed_at,raw,created_at",
      pageSize: MARKET_REOBSERVATION_BOUNDED_MAX_BATCH,
      params: { id: inFilter(observationIds), order: "id.asc" },
      operationName: "market_reobservation_bounded.post_observations",
    }),
    readRows("market_listing_observations", {
      select: "id,listing_id",
      pageSize: 200,
      params: { listing_id: inFilter(listingIds), order: "id.asc" },
      operationName: "market_reobservation_bounded.post_target_counts",
    }),
    readRows("market_listing_observations", {
      select: "id,listing_id,status",
      operationName: "market_reobservation_bounded.post_all_observations",
    }),
    readCount("market_listings"),
    readCount("market_listing_observations"),
    readCount("market_listings", { status: "eq.sold" }),
  ]);

  const afterById = new Map((listingsAfter ?? []).map((row) => [row.id, row]));
  const batchById = new Map(batch.map((entry) => [entry.listing_id, entry]));
  const beforeById = new Map((listingsBefore ?? []).map((row) => [row.id, row]));
  if (afterById.size !== batch.length || insertedObservations.length !== batch.length) {
    throw new Error("Bounded re-observation postwrite rows are incomplete.");
  }

  for (const id of listingIds) {
    const before = beforeById.get(id);
    const after = afterById.get(id);
    const expected = batchById.get(id);
    if (!before || !after || !expected
      || protectedListingSnapshot(before) !== protectedListingSnapshot(after)
      || Number(after.price) !== expected.price
      || after.status !== expected.status
      || validDate(after.last_observed_at)?.toISOString() !== expected.observed_at
      || validDate(after.updated_at)?.toISOString() !== expected.observed_at
      || after.sold_at !== null) {
      throw new Error(`Bounded re-observation protected listing verification failed for ${id}.`);
    }
  }

  const targetCounts = countByListing(targetObservations);
  for (const entry of batch) {
    if (targetCounts.get(entry.listing_id) !== entry.expected_prior_observation_count + 1) {
      throw new Error(`Bounded re-observation target observation count mismatch for ${entry.listing_id}.`);
    }
  }
  if (new Set(insertedObservations.map((row) => row.id)).size !== batch.length
    || observationIds.some((id) => !insertedObservations.some((row) => row.id === id))) {
    throw new Error("Bounded re-observation deterministic observation rows are missing after commit.");
  }

  const expectedNewlyReobserved = batch.filter((entry) => entry.expected_prior_observation_count === 1).length;
  const afterCounts = {
    market_listings: marketListings,
    observations,
    reobserved_listings: countReobserved(allObservations),
    completed_sold: completedSold,
  };
  const observedGlobalDeltas = Object.fromEntries(Object.keys(afterCounts).map((key) => [
    key,
    afterCounts[key] - preflight.counts[key],
  ]));
  const minimumGlobalDeltas = {
    market_listings: 0,
    observations: batch.length,
    reobserved_listings: expectedNewlyReobserved,
    completed_sold: 0,
  };
  if (observedGlobalDeltas.market_listings < minimumGlobalDeltas.market_listings
    || observedGlobalDeltas.observations < minimumGlobalDeltas.observations
    || observedGlobalDeltas.reobserved_listings < minimumGlobalDeltas.reobserved_listings
    || observedGlobalDeltas.completed_sold !== 0) {
    throw new Error("Bounded re-observation global Production sanity check failed.");
  }

  return {
    verified: true,
    before: preflight.counts,
    after: afterCounts,
    exact_lane_deltas: {
      market_listings: 0,
      observations: batch.length,
      reobserved_listings: expectedNewlyReobserved,
      completed_sold: 0,
    },
    minimum_global_deltas: minimumGlobalDeltas,
    observed_global_deltas: observedGlobalDeltas,
  };
}

export async function invokeBoundedRpc(batch, options = {}) {
  if (!Array.isArray(batch) || batch.length < MARKET_REOBSERVATION_BOUNDED_MIN_BATCH || batch.length > MARKET_REOBSERVATION_BOUNDED_MAX_BATCH) {
    throw new Error("Bounded re-observation RPC call requires 1-10 entries.");
  }
  const supabaseUrl = clean(options.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL);
  const serviceRoleKey = clean(options.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Bounded re-observation RPC requires Supabase URL and service-role key.");
  const url = new URL(`/rest/v1/rpc/${MARKET_REOBSERVATION_BOUNDED_RPC}`, supabaseUrl);
  const response = await (options.fetchImpl ?? fetch)(url, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ p_batch: batch }),
  });
  if (!response.ok) throw new Error(`Bounded re-observation atomic RPC failed with HTTP ${response.status}.`);
  const value = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Bounded re-observation atomic RPC response is invalid.");
  return value;
}

export function normalizeListingIds(value) {
  const ids = Array.isArray(value) ? value.map(clean).filter(Boolean) : parseListingIds(value);
  if (ids.length < MARKET_REOBSERVATION_BOUNDED_MIN_BATCH || ids.length > MARKET_REOBSERVATION_BOUNDED_MAX_BATCH) {
    throw new Error("Bounded re-observation requires 1-10 explicit listing IDs.");
  }
  if (new Set(ids).size !== ids.length) throw new Error("Bounded re-observation listing IDs must be unique.");
  return [...ids].sort((a, b) => a.localeCompare(b, "en"));
}

export async function writeResolutionManifest(manifest, outputPath) {
  const safePath = clean(outputPath);
  if (!safePath) throw new Error("Bounded re-observation resolution manifest output path is invalid.");
  const absolute = path.resolve(safePath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return absolute;
}

function buildPreparationArtifact({ headSha, cohortDigest, observationKey, cohort, preflight }) {
  const projectedBatch = cohort.map(({ listing, prior_observation_count }) => ({
    listing_id: listing.id,
    observation_id: marketReobservationObservationId({
      listingId: listing.id,
      provider: listing.raw?.provider,
      observationKey,
    }),
    expected_prior_observation_count: prior_observation_count,
  }));
  const artifact = buildMarketReobservationBoundedDryRunArtifact({
    headSha,
    cohortDigest,
    observationKey,
    batch: projectedBatch,
  });
  return {
    ...artifact,
    kind: "market_reobservation_bounded_preflight",
    mode: "dry-run",
    current_counts: preflight.counts,
    target_observation_counts: preflight.target_observation_counts,
    observation_id_collisions: preflight.observation_id_collisions,
    unresolved_import_issues: preflight.unresolved_import_issues,
    projected_if_all_provider_reads_seen: {
      market_listing_delta: 0,
      observation_delta: cohort.length,
      newly_reobserved_delta: projectedBatch.filter((entry) => entry.expected_prior_observation_count === 1).length,
      completed_sold_delta: 0,
    },
    required_approval: expectedMarketReobservationBoundedApproval({ headSha, cohortDigest }),
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
  if (!minimum) throw new Error(`Bounded re-observation provider pacing contract is unavailable for ${provider || "unknown"}.`);
  const previous = lastStartedAtByProvider.get(provider);
  if (!Number.isFinite(previous)) return;
  const elapsed = Math.max(0, Number(options.clock()) - previous);
  const wait = Math.max(0, minimum - elapsed);
  if (wait > 0) await options.sleep(wait);
}

function inFilter(ids) {
  return `in.(${ids.map((id) => `\"${String(id).replaceAll('"', '\\"')}\"`).join(",")})`;
}

function parseListingIds(value) {
  return String(value ?? "").split(",").map(clean).filter(Boolean);
}

function safeObservationKey(value) {
  const key = clean(value);
  return key && key.length <= 120 && /^[A-Za-z0-9._:-]+$/.test(key) ? key : "";
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
  const result = {
    mode: "dry-run",
    approval: "",
    headSha: "",
    expectedMainSha: "",
    observationKey: "",
    listingIds: [],
    resolutionManifestPath: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (["--mode", "--approval", "--head-sha", "--expected-main-sha", "--observation-key", "--listing-ids", "--resolution-manifest-out"].includes(token)) {
      if (!value || value.startsWith("--")) throw new Error(`${token} requires a value.`);
      index += 1;
      if (token === "--mode") result.mode = value;
      else if (token === "--approval") result.approval = value;
      else if (token === "--head-sha") result.headSha = value;
      else if (token === "--expected-main-sha") result.expectedMainSha = value;
      else if (token === "--observation-key") result.observationKey = value;
      else if (token === "--listing-ids") result.listingIds = parseListingIds(value);
      else result.resolutionManifestPath = value;
    } else throw new Error(`Unknown argument: ${token}`);
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const artifact = await runMarketReobservationBoundedCanary(args);
  console.log(JSON.stringify(artifact, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`market re-observation bounded canary failed closed: ${error?.message || "unknown_error"}`);
    process.exitCode = 1;
  });
}
