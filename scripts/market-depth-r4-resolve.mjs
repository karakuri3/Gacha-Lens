import fs from "node:fs/promises";
import path from "node:path";
import {
  buildMarketDepthR4BatchDigest,
  buildMarketDepthR4RpcBatch,
  normalizeMarketDepthR4Manifest,
  verifyMarketDepthR4Committed,
} from "../lib/domain/market-depth-r4-persistence.js";
import { loadOptionalEnvFile } from "./load-optional-env.mjs";
import { fetchRows } from "./supabase-rest.mjs";

const LISTING_SELECT = "id,variant_id,matched_variant_id,series_id,title,listing_type,market_review_type,classification_reason,classification_confidence,classification_details,price,status,source,source_type,source_url,listed_at,sold_at,last_observed_at,confidence,review_required,raw,created_at,updated_at";
const OBSERVATION_SELECT = "id,listing_id,variant_id,series_id,price,status,source,observed_at,raw,created_at";

export async function resolveMarketDepthR4Commit(options = {}) {
  if (options.loadEnv !== false) loadOptionalEnvFile();
  const readRows = options.fetchRows ?? fetchRows;
  const resolutionInput = options.resolutionManifest ?? await readJson(options.resolutionManifestPath);
  if (!resolutionInput || resolutionInput.schema_version !== 1 || resolutionInput.kind !== "market_depth_r4_resolution_manifest") {
    throw new Error("R4 depth resolution manifest contract is invalid.");
  }
  const manifest = normalizeMarketDepthR4Manifest(resolutionInput.manifest);
  const expectedBatchDigest = buildMarketDepthR4BatchDigest({
    headSha: resolutionInput.head_sha,
    manifest,
  });
  if (String(resolutionInput.batch_digest ?? "").trim().toLowerCase() !== expectedBatchDigest) {
    throw new Error("R4 depth resolution manifest batch digest is invalid.");
  }
  const batch = buildMarketDepthR4RpcBatch({ manifest, headSha: resolutionInput.head_sha });
  const listingIds = batch.candidates.map((candidate) => candidate.listing_id);
  const observationIds = batch.candidates.map((candidate) => candidate.observation_id);
  const [listings, observations] = await Promise.all([
    readRows("market_listings", {
      select: LISTING_SELECT,
      params: { id: qIn(listingIds), order: "id.asc" },
      operationName: "market_depth_r4.resolve_listings",
    }),
    readRows("market_listing_observations", {
      select: OBSERVATION_SELECT,
      params: { id: qIn(observationIds), order: "id.asc" },
      operationName: "market_depth_r4.resolve_observations",
    }),
  ]);
  return {
    ...verifyMarketDepthR4Committed({
      manifest,
      listings,
      observations,
      now: options.now,
      batchDigest: expectedBatchDigest,
    }),
    head_sha: resolutionInput.head_sha,
    batch_digest: expectedBatchDigest,
  };
}

function qIn(values) {
  return `in.(${values.map((value) => `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`).join(",")})`;
}

async function readJson(filePath) {
  const target = String(filePath ?? "").trim();
  if (!target) throw new Error("R4 depth resolution manifest path is required.");
  return JSON.parse(await fs.readFile(path.resolve(target), "utf8"));
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
  const result = await resolveMarketDepthR4Commit({ resolutionManifestPath: args.manifest });
  console.log(JSON.stringify(result));
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
