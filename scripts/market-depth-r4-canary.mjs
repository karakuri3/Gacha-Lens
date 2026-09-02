import fs from "node:fs/promises";
import path from "node:path";
import {
  MARKET_DEPTH_R4_RPC,
  buildMarketDepthR4BatchDigest,
  buildMarketDepthR4RpcBatch,
  normalizeMarketDepthR4Manifest,
  preflightMarketDepthR4,
  validateMarketDepthR4Invocation,
  verifyMarketDepthR4Committed,
} from "../lib/domain/market-depth-r4-persistence.js";
import { loadOptionalEnvFile } from "./load-optional-env.mjs";
import { fetchRows, fetchRowCount } from "./supabase-rest.mjs";

const LISTING_SELECT = "id,variant_id,matched_variant_id,series_id,title,listing_type,market_review_type,classification_reason,classification_confidence,classification_details,price,status,source,source_type,source_url,listed_at,sold_at,last_observed_at,confidence,review_required,raw,created_at,updated_at";
const OBSERVATION_SELECT = "id,listing_id,variant_id,series_id,price,status,source,observed_at,raw,created_at";

export async function runMarketDepthR4Canary(options = {}) {
  if (options.loadEnv !== false) loadOptionalEnvFile();
  const manifest = normalizeMarketDepthR4Manifest(options.manifest ?? await readJson(options.manifestPath));
  const invocation = validateMarketDepthR4Invocation({
    mode: options.mode ?? "dry-run",
    approval: options.approval ?? "",
    head_sha: options.headSha,
    expected_main_sha: options.expectedMainSha,
    manifest,
  });
  const readRows = options.fetchRows ?? fetchRows;
  const readCount = options.fetchRowCount ?? fetchRowCount;
  const preflight = await loadDepthR4Preflight(manifest, { readRows, now: options.now });
  const countsBefore = await loadCounts(readCount);
  const dryArtifact = {
    schema_version: 1,
    kind: "market_depth_r4_canary",
    mode: invocation.mode,
    head_sha: invocation.head_sha,
    batch_digest: invocation.batch_digest,
    observation_key: manifest.observation_key,
    source_r3_run_id: manifest.source_r3_run_id,
    source_r3_artifact_digest: manifest.source_r3_artifact_digest,
    candidate_count: manifest.candidates.length,
    candidate_listing_ids: manifest.candidates.map((candidate) => candidate.listing_id),
    projected_deltas: {
      market_listings: manifest.candidates.length,
      observations: manifest.candidates.length,
      completed_sold: 0,
    },
    production_counts_before: countsBefore,
    preflight,
    provider_requests: 0,
    rpc_calls: 0,
    production_writes: 0,
    automatic_rpc_retry: false,
  };
  if (invocation.mode === "dry-run") return dryArtifact;

  const resolutionManifestOut = clean(options.resolutionManifestOut ?? process.env.MARKET_DEPTH_R4_RESOLUTION_MANIFEST_OUT, 2000);
  if (!resolutionManifestOut) {
    throw new Error("R4 depth canary-write requires a resolution manifest output path before RPC.");
  }
  const rpcBatch = buildMarketDepthR4RpcBatch({ manifest, headSha: invocation.head_sha });
  const resolutionManifest = buildMarketDepthR4ResolutionManifest({
    manifest,
    headSha: invocation.head_sha,
    batchDigest: invocation.batch_digest,
  });
  const persistResolutionManifest = options.persistResolutionManifest ?? writeNewJson;
  await persistResolutionManifest(resolutionManifestOut, resolutionManifest);

  let rpcResult;
  try {
    rpcResult = await (options.invokeRpc ?? invokeMarketDepthR4Rpc)(rpcBatch, options);
  } catch (error) {
    const wrapped = new Error(error?.commit_ambiguous
      ? "R4 depth RPC commit state is ambiguous; use SELECT-only resolver and do not retry automatically."
      : `R4 depth RPC failed closed: ${clean(error?.message, 240) || "unknown error"}`);
    wrapped.cause = error;
    wrapped.commit_ambiguous = error?.commit_ambiguous === true;
    wrapped.automatic_retry = false;
    throw wrapped;
  }
  validateRpcResult(rpcResult, rpcBatch);

  const post = await loadCommittedRows(manifest, { readRows, headSha: invocation.head_sha });
  const resolution = verifyMarketDepthR4Committed({
    manifest,
    listings: post.listings,
    observations: post.observations,
    now: options.now,
    batchDigest: invocation.batch_digest,
  });
  if (resolution.state !== "committed") throw new Error(`R4 depth postwrite resolver returned ${resolution.state}.`);
  const depths = await verifyTargetDepths(manifest, readRows, options.now);
  const countsAfter = await loadCounts(readCount);
  if (countsAfter.market_listings < countsBefore.market_listings + manifest.candidates.length
    || countsAfter.observations < countsBefore.observations + manifest.candidates.length
    || countsAfter.completed_sold !== countsBefore.completed_sold) {
    throw new Error("R4 depth global Production sanity check failed.");
  }

  return {
    ...dryArtifact,
    mode: "canary-write",
    rpc_calls: 1,
    production_writes: manifest.candidates.length * 2,
    rpc_result: rpcResult,
    resolution,
    target_depths: depths,
    production_counts_after: countsAfter,
    exact_lane_deltas: {
      market_listings: manifest.candidates.length,
      observations: manifest.candidates.length,
      completed_sold: 0,
    },
    minimum_global_deltas: {
      market_listings: manifest.candidates.length,
      observations: manifest.candidates.length,
      completed_sold: 0,
    },
  };
}

export async function loadDepthR4Preflight(manifestInput, options = {}) {
  const manifest = normalizeMarketDepthR4Manifest(manifestInput);
  const readRows = options.readRows ?? options.fetchRows ?? fetchRows;
  const variantIds = unique(manifest.candidates.map((candidate) => candidate.variant_id));
  const seriesIds = unique(manifest.candidates.map((candidate) => candidate.series_id));
  const [variants, series, importIssues, listings, observations] = await Promise.all([
    readRows("variants", {
      select: "id,series_id,variant_type,review_required",
      params: { id: qIn(variantIds), order: "id.asc" },
      operationName: "market_depth_r4.preflight_variants",
    }),
    readRows("series", {
      select: "id",
      params: { id: qIn(seriesIds), order: "id.asc" },
      operationName: "market_depth_r4.preflight_series",
    }),
    readRows("import_issues", {
      select: "id,table_name,record_id,resolved",
      params: { resolved: "eq.false", order: "id.asc" },
      operationName: "market_depth_r4.preflight_import_issues",
    }),
    readRows("market_listings", {
      select: LISTING_SELECT,
      params: { order: "id.asc" },
      operationName: "market_depth_r4.preflight_listings",
    }),
    readRows("market_listing_observations", {
      select: "id",
      params: { order: "id.asc" },
      operationName: "market_depth_r4.preflight_observations",
    }),
  ]);
  return preflightMarketDepthR4({ manifest, variants, series, importIssues, listings, observations, now: options.now });
}

export async function invokeMarketDepthR4Rpc(batch, options = {}) {
  if (!batch || typeof batch !== "object" || !Array.isArray(batch.candidates) || batch.candidates.length < 1 || batch.candidates.length > 10) {
    throw new Error("R4 depth RPC batch is invalid.");
  }
  const supabaseUrl = clean(options.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL, 1000);
  const serviceRoleKey = clean(options.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY, 2000);
  if (!supabaseUrl || !serviceRoleKey) throw new Error("R4 depth RPC requires Supabase URL and service-role key.");
  const url = new URL(`/rest/v1/rpc/${MARKET_DEPTH_R4_RPC}`, supabaseUrl);
  let response;
  try {
    response = await (options.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ p_batch: batch }),
    });
  } catch (cause) {
    const error = new Error("R4 depth atomic RPC transport failed.");
    error.cause = cause;
    error.commit_ambiguous = true;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`R4 depth atomic RPC rejected with HTTP ${response.status}.`);
    error.commit_ambiguous = false;
    throw error;
  }
  let value;
  try {
    value = await response.json();
  } catch (cause) {
    const error = new Error("R4 depth atomic RPC response could not be decoded.");
    error.cause = cause;
    error.commit_ambiguous = true;
    throw error;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    const error = new Error("R4 depth atomic RPC response is invalid.");
    error.commit_ambiguous = true;
    throw error;
  }
  return value;
}

export function buildMarketDepthR4ResolutionManifest({ manifest, headSha, batchDigest } = {}) {
  const frozen = normalizeMarketDepthR4Manifest(manifest);
  const head = clean(headSha, 40).toLowerCase();
  const expectedBatchDigest = buildMarketDepthR4BatchDigest({ headSha: head, manifest: frozen });
  const suppliedBatchDigest = clean(batchDigest, 64).toLowerCase();
  if (suppliedBatchDigest !== expectedBatchDigest) {
    throw new Error("R4 depth resolution manifest batch digest is invalid.");
  }
  return {
    schema_version: 1,
    kind: "market_depth_r4_resolution_manifest",
    head_sha: head,
    batch_digest: expectedBatchDigest,
    manifest: frozen,
    provider_requests: 0,
    automatic_retry: false,
    write_retry_authorized: false,
  };
}

export async function writeNewJson(filePath, value) {
  const target = path.resolve(clean(filePath, 2000));
  if (!target) throw new Error("R4 depth output path is invalid.");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return target;
}

async function loadCommittedRows(manifest, { readRows, headSha }) {
  const batch = buildMarketDepthR4RpcBatch({ manifest, headSha });
  const listingIds = batch.candidates.map((candidate) => candidate.listing_id);
  const observationIds = batch.candidates.map((candidate) => candidate.observation_id);
  const [listings, observations] = await Promise.all([
    readRows("market_listings", {
      select: LISTING_SELECT,
      params: { id: qIn(listingIds), order: "id.asc" },
      operationName: "market_depth_r4.post_listings",
    }),
    readRows("market_listing_observations", {
      select: OBSERVATION_SELECT,
      params: { id: qIn(observationIds), order: "id.asc" },
      operationName: "market_depth_r4.post_observations",
    }),
  ]);
  return { listings, observations };
}

async function verifyTargetDepths(manifestInput, readRows, now = new Date()) {
  const manifest = normalizeMarketDepthR4Manifest(manifestInput);
  const current = validDate(now) ?? new Date();
  const cutoff = current.getTime() - 30 * 24 * 60 * 60 * 1000;
  const variantIds = unique(manifest.candidates.map((candidate) => candidate.variant_id));
  const rows = await readRows("market_listings", {
    select: "id,variant_id,matched_variant_id,status,listing_type,review_required,last_observed_at,listed_at,created_at",
    params: { order: "id.asc" },
    operationName: "market_depth_r4.post_depth",
  });
  return variantIds.map((variantId) => {
    const expectedBefore = manifest.candidates.find((candidate) => candidate.variant_id === variantId).expected_existing_listing_ids.length;
    const inserted = manifest.candidates.filter((candidate) => candidate.variant_id === variantId).length;
    const ids = rows.filter((row) => {
      const rowVariant = clean(row.matched_variant_id || row.variant_id, 180);
      const timestamp = validDate(row.last_observed_at ?? row.listed_at ?? row.created_at);
      return rowVariant === variantId && row.status === "active" && row.listing_type === "single"
        && row.review_required !== true && timestamp && timestamp.getTime() >= cutoff;
    }).map((row) => row.id).sort((a, b) => a.localeCompare(b, "en"));
    if (ids.length !== expectedBefore + inserted) throw new Error(`R4 depth target postwrite count mismatch for ${variantId}.`);
    return { variant_id: variantId, expected_before: expectedBefore, inserted, after: ids.length, listing_ids: ids };
  });
}

function validateRpcResult(value, batch) {
  const expectedListingIds = batch.candidates.map((candidate) => candidate.listing_id).sort((a, b) => a.localeCompare(b, "en"));
  const expectedObservationIds = batch.candidates.map((candidate) => candidate.observation_id).sort((a, b) => a.localeCompare(b, "en"));
  const listingIds = Array.isArray(value?.listing_ids) ? [...value.listing_ids].map(String).sort((a, b) => a.localeCompare(b, "en")) : [];
  const observationIds = Array.isArray(value?.observation_ids) ? [...value.observation_ids].map(String).sort((a, b) => a.localeCompare(b, "en")) : [];
  if (value?.schema_version !== 1 || value?.kind !== "market_depth_r4_atomic_v1"
    || Number(value?.inserted_count) !== batch.candidates.length
    || JSON.stringify(listingIds) !== JSON.stringify(expectedListingIds)
    || JSON.stringify(observationIds) !== JSON.stringify(expectedObservationIds)) {
    throw new Error("R4 depth RPC result identity is invalid.");
  }
}

async function loadCounts(readCount) {
  const [marketListings, observations, completedSold] = await Promise.all([
    readCount("market_listings"),
    readCount("market_listing_observations"),
    readCount("market_listings", { status: "eq.sold" }),
  ]);
  return { market_listings: marketListings, observations, completed_sold: completedSold };
}

function qIn(values) {
  return `in.(${values.map((value) => `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`).join(",")})`;
}

function unique(values) {
  return [...new Set(values)];
}

async function readJson(filePath) {
  const target = clean(filePath, 2000);
  if (!target) throw new Error("R4 depth manifest path is required.");
  return JSON.parse(await fs.readFile(path.resolve(target), "utf8"));
}

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function clean(value, limit = 1000) {
  return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq >= 0) args[token.slice(2, eq)] = token.slice(eq + 1);
    else if (argv[index + 1] && !argv[index + 1].startsWith("--")) args[token.slice(2)] = argv[++index];
    else args[token.slice(2)] = "true";
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runMarketDepthR4Canary({
    mode: args.mode ?? "dry-run",
    approval: args.approval ?? "",
    headSha: args["head-sha"] ?? "",
    expectedMainSha: args["expected-main-sha"] ?? "",
    manifestPath: args.manifest,
    resolutionManifestOut: args["resolution-manifest-out"],
  });
  if (args.out) await writeNewJson(args.out, result);
  console.log(JSON.stringify(result));
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
