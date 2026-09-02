import crypto from "node:crypto";
import { buildMarketplaceListingId, canonicalMarketplaceSource } from "./market-canary-write.js";
import { canonicalizeBoundedMarketplaceUrl, resolveBoundedMarketplaceIdentity } from "./market-bounded-write.js";

export const MARKET_DEPTH_R4_MIN_BATCH = 1;
export const MARKET_DEPTH_R4_MAX_BATCH = 10;
export const MARKET_DEPTH_R4_RPC = "apply_market_depth_r4_atomic_v1";
export const MARKET_DEPTH_R4_CONFIRMATION = "APPROVE_MARKET_DEPTH_R4_ATOMIC_V1";
export const MARKET_DEPTH_R4_MANIFEST_KIND = "market_depth_r4_manifest_v1";
export const MARKET_DEPTH_R4_CONFIDENCE_FLOOR = 0.86;

const HEAD_SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const CANDIDATE_KEY = /^[0-9a-f]{16}$/;
const SOURCE_LISTING_ID = /^[A-Za-z0-9:._-]{1,300}$/;
const OBSERVATION_KEY = /^[a-z0-9][a-z0-9:_-]{0,119}$/;
const PROVIDERS = new Set(["rakuten_ichiba", "yahoo_shopping"]);

export function marketDepthR4ObservationId({ observationKey, candidateKey, listingId } = {}) {
  const key = clean(observationKey, 120).toLowerCase();
  const candidate = clean(candidateKey, 16).toLowerCase();
  const listing = clean(listingId, 180);
  if (!OBSERVATION_KEY.test(key) || !CANDIDATE_KEY.test(candidate) || !listing) {
    throw new Error("R4 depth observation identity is invalid.");
  }
  const raw = ["gacha-lens", "market-depth-r4-v1", key, candidate, listing].join("\x1f");
  return `market-depth-r4-${crypto.createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 32)}`;
}

export function normalizeMarketDepthR4Manifest(input = {}) {
  if (!plainObject(input) || input.schema_version !== 1 || input.kind !== MARKET_DEPTH_R4_MANIFEST_KIND) {
    throw new Error("R4 depth manifest contract is invalid.");
  }
  const observationKey = clean(input.observation_key, 120).toLowerCase();
  const sourceR3RunId = clean(input.source_r3_run_id, 80);
  const sourceR3MainSha = clean(input.source_r3_main_sha, 40).toLowerCase();
  const sourceR3ArtifactDigest = normalizeDigest(input.source_r3_artifact_digest);
  const sourceR3GeneratedAt = iso(input.source_r3_generated_at);
  if (!OBSERVATION_KEY.test(observationKey) || !sourceR3RunId || !HEAD_SHA.test(sourceR3MainSha)
    || !DIGEST.test(sourceR3ArtifactDigest) || !sourceR3GeneratedAt) {
    throw new Error("R4 depth manifest source evidence is invalid.");
  }
  if (!Array.isArray(input.candidates)
    || input.candidates.length < MARKET_DEPTH_R4_MIN_BATCH
    || input.candidates.length > MARKET_DEPTH_R4_MAX_BATCH) {
    throw new Error("R4 depth manifest requires 1-10 candidates.");
  }
  const candidates = input.candidates.map(normalizeCandidate)
    .sort((a, b) => a.candidate_key.localeCompare(b.candidate_key, "en"));
  for (const values of [
    candidates.map((c) => c.candidate_key),
    candidates.map((c) => c.selection_fingerprint),
    candidates.map((c) => c.listing_id),
    candidates.map((c) => `${c.provider}:${c.source_listing_id}`),
    candidates.map((c) => c.public_url),
  ]) {
    if (new Set(values).size !== values.length) throw new Error("R4 depth manifest contains duplicate candidate identity.");
  }
  return {
    schema_version: 1,
    kind: MARKET_DEPTH_R4_MANIFEST_KIND,
    observation_key: observationKey,
    source_r3_run_id: sourceR3RunId,
    source_r3_main_sha: sourceR3MainSha,
    source_r3_artifact_digest: sourceR3ArtifactDigest,
    source_r3_generated_at: sourceR3GeneratedAt,
    candidates,
  };
}

export function buildMarketDepthR4BatchDigest({ headSha, manifest } = {}) {
  const head = clean(headSha, 40).toLowerCase();
  if (!HEAD_SHA.test(head)) throw new Error("R4 depth digest requires an exact main SHA.");
  const frozen = normalizeMarketDepthR4Manifest(manifest);
  return crypto.createHash("sha256").update(canonicalJson({
    version: 1,
    kind: "market_depth_r4_atomic_v1",
    head_sha: head,
    manifest: frozen,
  }), "utf8").digest("hex");
}

export function expectedMarketDepthR4Approval({ headSha, manifest } = {}) {
  const head = clean(headSha, 40).toLowerCase();
  const digest = buildMarketDepthR4BatchDigest({ headSha: head, manifest });
  return `${MARKET_DEPTH_R4_CONFIRMATION}:${head}:${digest}`;
}

export function validateMarketDepthR4Invocation(input = {}) {
  const mode = clean(input.mode, 32);
  const head = clean(input.head_sha, 40).toLowerCase();
  const expectedMain = clean(input.expected_main_sha, 40).toLowerCase();
  const manifest = normalizeMarketDepthR4Manifest(input.manifest);
  if (!["dry-run", "canary-write"].includes(mode) || !HEAD_SHA.test(head) || expectedMain !== head) {
    throw new Error("R4 depth invocation is not exactly bound to approved main.");
  }
  const batchDigest = buildMarketDepthR4BatchDigest({ headSha: head, manifest });
  if (mode === "dry-run") {
    if (clean(input.approval, 400)) throw new Error("R4 depth dry-run must not include write authorization.");
    return { mode, head_sha: head, batch_digest: batchDigest, write_authorized: false, manifest };
  }
  const approval = clean(input.approval, 400);
  if (approval !== `${MARKET_DEPTH_R4_CONFIRMATION}:${head}:${batchDigest}`) {
    throw new Error("R4 depth canary-write approval is invalid.");
  }
  return { mode, head_sha: head, batch_digest: batchDigest, write_authorized: true, manifest };
}

export function buildMarketDepthR4RpcBatch({ manifest, headSha } = {}) {
  const frozen = normalizeMarketDepthR4Manifest(manifest);
  const batchDigest = buildMarketDepthR4BatchDigest({ headSha, manifest: frozen });
  return {
    schema_version: 1,
    kind: "market_depth_r4_atomic_v1",
    head_sha: clean(headSha, 40).toLowerCase(),
    batch_digest: batchDigest,
    observation_key: frozen.observation_key,
    source_r3_run_id: frozen.source_r3_run_id,
    source_r3_main_sha: frozen.source_r3_main_sha,
    source_r3_artifact_digest: frozen.source_r3_artifact_digest,
    source_r3_generated_at: frozen.source_r3_generated_at,
    candidates: frozen.candidates.map((candidate) => ({
      ...candidate,
      observation_id: marketDepthR4ObservationId({
        observationKey: frozen.observation_key,
        candidateKey: candidate.candidate_key,
        listingId: candidate.listing_id,
      }),
    })),
  };
}

export function preflightMarketDepthR4({
  manifest,
  variants = [],
  series = [],
  importIssues = [],
  listings = [],
  observations = [],
  now = new Date(),
} = {}) {
  const frozen = normalizeMarketDepthR4Manifest(manifest);
  const current = validDate(now);
  if (!current) throw new Error("R4 depth preflight time is invalid.");
  const variantById = new Map(variants.map((row) => [clean(row?.id, 180), row]));
  const seriesById = new Map(series.map((row) => [clean(row?.id, 180), row]));
  const listingById = new Map(listings.map((row) => [clean(row?.id, 180), row]));
  const observationIds = new Set(observations.map((row) => clean(row?.id, 180)).filter(Boolean));
  const identityIndex = indexMarketplaceIdentities(listings);
  const cutoff = current.getTime() - 30 * 24 * 60 * 60 * 1000;
  const perTargetNew = new Map();

  for (const candidate of frozen.candidates) {
    const variant = variantById.get(candidate.variant_id);
    const parent = seriesById.get(candidate.series_id);
    if (!variant || !parent || clean(variant.series_id, 180) !== candidate.series_id
      || variant.review_required === true || clean(variant.variant_type, 80).toLowerCase() === "provisional") {
      throw new Error(`R4 depth catalog drift: ${candidate.candidate_key}.`);
    }
    const unresolved = importIssues.filter((row) => row?.resolved !== true
      && ((row?.table_name === "variants" && row?.record_id === candidate.variant_id)
        || (row?.table_name === "series" && row?.record_id === candidate.series_id)));
    if (unresolved.length) throw new Error(`R4 depth unresolved catalog issue drift: ${candidate.candidate_key}.`);

    const eligibleIds = listings.filter((row) => {
      const variantId = clean(row?.matched_variant_id || row?.variant_id, 180);
      const timestamp = validDate(row?.last_observed_at ?? row?.listed_at ?? row?.created_at);
      return variantId === candidate.variant_id
        && row?.status === "active"
        && row?.listing_type === "single"
        && row?.review_required !== true
        && timestamp
        && timestamp.getTime() >= cutoff;
    }).map((row) => clean(row.id, 180)).sort((a, b) => a.localeCompare(b, "en"));
    if (canonicalJson(eligibleIds) !== canonicalJson(candidate.expected_existing_listing_ids)) {
      throw new Error(`R4 depth existing-depth snapshot drift: ${candidate.candidate_key}.`);
    }

    const observationId = marketDepthR4ObservationId({
      observationKey: frozen.observation_key,
      candidateKey: candidate.candidate_key,
      listingId: candidate.listing_id,
    });
    if (listingById.has(candidate.listing_id) || observationIds.has(observationId)
      || identityIndex.sourceIdentities.has(`${candidate.provider}:${candidate.source_listing_id}`)
      || identityIndex.publicUrls.has(candidate.public_url)) {
      throw new Error(`R4 depth candidate collision: ${candidate.candidate_key}.`);
    }
    perTargetNew.set(candidate.variant_id, (perTargetNew.get(candidate.variant_id) ?? 0) + 1);
  }

  return {
    schema_version: 1,
    kind: "market_depth_r4_preflight",
    observation_key: frozen.observation_key,
    candidate_count: frozen.candidates.length,
    candidates: frozen.candidates.map((candidate) => ({
      candidate_key: candidate.candidate_key,
      variant_id: candidate.variant_id,
      series_id: candidate.series_id,
      listing_id: candidate.listing_id,
      observation_id: marketDepthR4ObservationId({
        observationKey: frozen.observation_key,
        candidateKey: candidate.candidate_key,
        listingId: candidate.listing_id,
      }),
      expected_existing_listing_ids: candidate.expected_existing_listing_ids,
      projected_depth_after: candidate.expected_existing_listing_ids.length + (perTargetNew.get(candidate.variant_id) ?? 0),
    })),
    provider_requests: 0,
    rpc_calls: 0,
    production_writes: 0,
  };
}

export function verifyMarketDepthR4Committed({
  manifest,
  listings = [],
  observations = [],
  now = new Date(),
  batchDigest = null,
} = {}) {
  const frozen = normalizeMarketDepthR4Manifest(manifest);
  const expectedBatchDigest = batchDigest == null ? null : normalizeDigest(batchDigest);
  if (expectedBatchDigest !== null && !DIGEST.test(expectedBatchDigest)) {
    throw new Error("R4 depth resolution batch digest is invalid.");
  }
  const listingById = new Map(listings.map((row) => [clean(row?.id, 180), row]));
  const observationById = new Map(observations.map((row) => [clean(row?.id, 180), row]));
  const expected = frozen.candidates.map((candidate) => {
    const observationId = marketDepthR4ObservationId({
      observationKey: frozen.observation_key,
      candidateKey: candidate.candidate_key,
      listingId: candidate.listing_id,
    });
    return { candidate, observationId, listing: listingById.get(candidate.listing_id), observation: observationById.get(observationId) };
  });
  const presentPairs = expected.filter(({ listing, observation }) => listing && observation);
  if (presentPairs.length === 0 && expected.every(({ listing, observation }) => !listing && !observation)) {
    return resolution("not_committed", frozen);
  }
  if (presentPairs.length !== expected.length || expected.some(({ listing, observation }) => Boolean(listing) !== Boolean(observation))) {
    return resolution("inconsistent", frozen);
  }
  for (const { candidate, observationId, listing, observation } of expected) {
    const identity = resolveBoundedMarketplaceIdentity(listing);
    const marker = listing?.raw?.market_depth_r4;
    const observationMarker = observation?.raw?.market_depth_r4;
    if (!identity.complete || identity.derivedId !== candidate.listing_id
      || identity.provider !== candidate.provider || identity.sourceListingId !== candidate.source_listing_id
      || identity.publicUrl !== candidate.public_url
      || listing.variant_id !== candidate.variant_id || listing.matched_variant_id !== candidate.variant_id
      || listing.series_id !== candidate.series_id || listing.listing_type !== "single"
      || listing.market_review_type !== "single" || listing.review_required !== false
      || listing.status !== "active" || listing.sold_at !== null || Number(listing.price) !== candidate.price
      || marker?.candidate_key !== candidate.candidate_key
      || marker?.selection_fingerprint !== candidate.selection_fingerprint
      || marker?.source_r3_run_id !== frozen.source_r3_run_id
      || marker?.source_r3_main_sha !== frozen.source_r3_main_sha
      || marker?.source_r3_artifact_digest !== frozen.source_r3_artifact_digest
      || (expectedBatchDigest !== null && marker?.batch_digest !== expectedBatchDigest)
      || observation.id !== observationId || observation.listing_id !== candidate.listing_id
      || observation.variant_id !== candidate.variant_id || observation.series_id !== candidate.series_id
      || Number(observation.price) !== candidate.price || observation.status !== "active"
      || observation.source !== canonicalMarketplaceSource(candidate.provider)
      || observationMarker?.candidate_key !== candidate.candidate_key
      || observationMarker?.selection_fingerprint !== candidate.selection_fingerprint
      || (expectedBatchDigest !== null && observationMarker?.batch_digest !== expectedBatchDigest)) {
      return resolution("inconsistent", frozen);
    }
  }
  return resolution("committed", frozen, { verified_pairs: expected.length, checked_at: validDate(now)?.toISOString() ?? null });
}

function normalizeCandidate(input) {
  if (!plainObject(input)) throw new Error("R4 depth candidate is invalid.");
  const candidateKey = clean(input.candidate_key, 16).toLowerCase();
  const fingerprint = clean(input.selection_fingerprint, 64).toLowerCase();
  const variantId = clean(input.variant_id, 180);
  const seriesId = clean(input.series_id, 180);
  const provider = clean(input.provider, 40).toLowerCase();
  const sourceListingId = clean(input.source_listing_id, 300);
  const publicUrl = canonicalizeBoundedMarketplaceUrl(input.public_url);
  const listingId = clean(input.listing_id, 180);
  const title = clean(input.title, 300);
  const price = Number(input.price);
  const status = clean(input.status, 40).toLowerCase();
  const expectedExisting = Array.isArray(input.expected_existing_listing_ids)
    ? input.expected_existing_listing_ids.map((value) => clean(value, 180)).filter(Boolean).sort((a, b) => a.localeCompare(b, "en"))
    : [];
  if (!CANDIDATE_KEY.test(candidateKey) || !DIGEST.test(fingerprint) || !variantId || !seriesId
    || !PROVIDERS.has(provider) || !SOURCE_LISTING_ID.test(sourceListingId) || !publicUrl || !listingId || !title
    || !Number.isInteger(price) || price <= 0 || status !== "active"
    || !expectedExisting.length || new Set(expectedExisting).size !== expectedExisting.length || expectedExisting.includes(listingId)) {
    throw new Error("R4 depth candidate fields are invalid.");
  }
  const source = canonicalMarketplaceSource(provider);
  const expectedListingId = buildMarketplaceListingId({ provider, sourceListingId, publicUrl, title });
  if (!source || expectedListingId !== listingId || !providerUrlAllowed(provider, publicUrl)) {
    throw new Error("R4 depth candidate marketplace identity is invalid.");
  }
  return {
    candidate_key: candidateKey,
    selection_fingerprint: fingerprint,
    variant_id: variantId,
    series_id: seriesId,
    provider,
    source_listing_id: sourceListingId,
    public_url: publicUrl,
    listing_id: listingId,
    title,
    price,
    status: "active",
    expected_existing_listing_ids: expectedExisting,
  };
}

function indexMarketplaceIdentities(listings) {
  const sourceIdentities = new Set();
  const publicUrls = new Set();
  for (const listing of listings) {
    const directUrl = canonicalizeBoundedMarketplaceUrl(listing?.source_url);
    if (directUrl) publicUrls.add(directUrl);
    try {
      const identity = resolveBoundedMarketplaceIdentity(listing);
      if (identity.complete) {
        sourceIdentities.add(`${identity.provider}:${identity.sourceListingId}`);
        publicUrls.add(identity.publicUrl);
      }
    } catch {
      // Corrupt legacy provenance grants no new write authority.
    }
  }
  return { sourceIdentities, publicUrls };
}

function providerUrlAllowed(provider, value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return false;
    if (provider === "yahoo_shopping") return url.hostname === "store.shopping.yahoo.co.jp";
    if (provider === "rakuten_ichiba") return url.hostname === "item.rakuten.co.jp";
    return false;
  } catch {
    return false;
  }
}

function resolution(state, manifest, extra = {}) {
  return {
    schema_version: 1,
    kind: "market_depth_r4_resolution",
    state,
    observation_key: manifest.observation_key,
    source_r3_run_id: manifest.source_r3_run_id,
    candidate_count: manifest.candidates.length,
    provider_requests: 0,
    rpc_calls: 0,
    production_writes: 0,
    automatic_retry: false,
    write_retry_authorized: false,
    ...extra,
  };
}

function canonicalJson(value) {
  return JSON.stringify(sortCanonical(value));
}

function sortCanonical(value) {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (!plainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort((a, b) => a.localeCompare(b, "en")).map((key) => [key, sortCanonical(value[key])]));
}

function normalizeDigest(value) {
  const text = clean(value, 80).toLowerCase();
  return text.startsWith("sha256:") ? text.slice(7) : text;
}

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function iso(value) {
  return validDate(value)?.toISOString() ?? null;
}

function clean(value, limit = 1000) {
  return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function plainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
