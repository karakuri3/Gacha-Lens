import crypto from "node:crypto";

const CANDIDATE_KEY = /^[0-9a-f]{16}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const HEAD_SHA = /^[0-9a-f]{40}$/;
const RUN_ID = /^[1-9][0-9]*$/;

export const MARKET_BOUNDED_COVERAGE_SCHEMA_VERSION = 1;
export const MARKET_BOUNDED_COVERAGE_SOURCE = "market_listing_observations.raw.automatic_rollout";

export class MarketBoundedCoverageError extends Error {
  constructor(message = "Market bounded coverage history is unavailable or ambiguous.") {
    super(message);
    this.name = "MarketBoundedCoverageError";
  }
}

export function buildMarketBoundedCoverageSnapshot(rows, options = {}) {
  if (!Array.isArray(rows)) throw new MarketBoundedCoverageError();
  const excludedRunId = clean(options.exclude_workflow_run_id);
  const excludedRunAttempt = clean(options.exclude_workflow_run_attempt);
  if ((excludedRunId || excludedRunAttempt) && (!RUN_ID.test(excludedRunId) || !RUN_ID.test(excludedRunAttempt))) {
    throw new MarketBoundedCoverageError("Coverage exclusion identity is invalid.");
  }

  const seenRowIds = new Set();
  const seenEvents = new Map();
  const listingVariants = new Map();
  const candidateIdentities = new Map();
  const events = [];

  for (const row of rows) {
    const event = normalizeHistoryRow(row);
    if (seenRowIds.has(event.id)) throw new MarketBoundedCoverageError("Coverage history contains duplicate rows.");
    seenRowIds.add(event.id);

    const eventIdentity = [event.workflow_run_id, event.workflow_run_attempt, event.candidate_key].join(":");
    if (seenEvents.has(eventIdentity)) throw new MarketBoundedCoverageError("Coverage history contains duplicate persistence events.");
    seenEvents.set(eventIdentity, event.id);

    const listingVariant = listingVariants.get(event.listing_id);
    if (listingVariant && listingVariant !== event.variant_id) {
      throw new MarketBoundedCoverageError("Coverage listing identity maps to multiple variants.");
    }
    listingVariants.set(event.listing_id, event.variant_id);

    const candidateIdentity = candidateIdentities.get(event.candidate_key);
    const nextCandidateIdentity = `${event.listing_id}:${event.variant_id}`;
    if (candidateIdentity && candidateIdentity !== nextCandidateIdentity) {
      throw new MarketBoundedCoverageError("Coverage candidate identity is ambiguous.");
    }
    candidateIdentities.set(event.candidate_key, nextCandidateIdentity);

    if (event.workflow_run_id === excludedRunId && event.workflow_run_attempt === excludedRunAttempt) continue;
    events.push(event);
  }

  events.sort(compareEvents);
  const variants = aggregateCoverage(events, (event) => event.variant_id, (variantId, values) => ({
    variant_id: variantId,
    persistence_count: values.length,
    last_persisted_at: values.at(-1).observed_at,
  }));
  const candidates = aggregateCoverage(events, (event) => event.candidate_key, (candidateKey, values) => ({
    candidate_key: candidateKey,
    listing_id: values[0].listing_id,
    variant_id: values[0].variant_id,
    persistence_count: values.length,
    last_persisted_at: values.at(-1).observed_at,
  }));
  const snapshot = {
    schema_version: MARKET_BOUNDED_COVERAGE_SCHEMA_VERSION,
    source: MARKET_BOUNDED_COVERAGE_SOURCE,
    complete: true,
    coverage_unit: "variant",
    source_row_count: events.length,
    source_digest: digest(events),
    variants,
    candidates,
  };
  snapshot.snapshot_digest = calculateMarketBoundedCoverageSnapshotDigest(snapshot);
  return snapshot;
}

export function validateMarketBoundedCoverageSnapshot(snapshot) {
  if (!plainObject(snapshot)
    || snapshot.schema_version !== MARKET_BOUNDED_COVERAGE_SCHEMA_VERSION
    || snapshot.source !== MARKET_BOUNDED_COVERAGE_SOURCE
    || snapshot.complete !== true
    || snapshot.coverage_unit !== "variant"
    || !Number.isInteger(snapshot.source_row_count)
    || snapshot.source_row_count < 0
    || !SHA256.test(String(snapshot.source_digest ?? ""))
    || !SHA256.test(String(snapshot.snapshot_digest ?? ""))
    || !Array.isArray(snapshot.variants)
    || !Array.isArray(snapshot.candidates)) {
    throw new MarketBoundedCoverageError("Coverage snapshot contract is invalid.");
  }

  validateCoverageEntries(snapshot.variants, "variant_id");
  validateCoverageEntries(snapshot.candidates, "candidate_key", true);
  if (snapshot.candidates.some((entry) => !CANDIDATE_KEY.test(entry.candidate_key)
    || !clean(entry.listing_id)
    || !clean(entry.variant_id))) {
    throw new MarketBoundedCoverageError("Coverage candidate entries are invalid.");
  }
  if (snapshot.variants.reduce((sum, entry) => sum + entry.persistence_count, 0) !== snapshot.source_row_count
    || snapshot.candidates.reduce((sum, entry) => sum + entry.persistence_count, 0) !== snapshot.source_row_count) {
    throw new MarketBoundedCoverageError("Coverage snapshot totals are inconsistent.");
  }
  const variantIds = new Set(snapshot.variants.map((entry) => entry.variant_id));
  if (snapshot.candidates.some((entry) => !variantIds.has(entry.variant_id))) {
    throw new MarketBoundedCoverageError("Coverage candidate references an unknown variant.");
  }
  if (calculateMarketBoundedCoverageSnapshotDigest(snapshot) !== snapshot.snapshot_digest) {
    throw new MarketBoundedCoverageError("Coverage snapshot digest mismatch.");
  }
  return snapshot;
}

export function calculateMarketBoundedCoverageSnapshotDigest(snapshot) {
  if (!plainObject(snapshot)) throw new MarketBoundedCoverageError("Coverage snapshot is missing.");
  const value = structuredClone(snapshot);
  delete value.snapshot_digest;
  return digest(value);
}

export function marketBoundedCoverageSnapshotsEqual(left, right) {
  try {
    validateMarketBoundedCoverageSnapshot(left);
    validateMarketBoundedCoverageSnapshot(right);
    return left.snapshot_digest === right.snapshot_digest;
  } catch {
    return false;
  }
}

export function marketBoundedCoverageMaps(snapshot) {
  validateMarketBoundedCoverageSnapshot(snapshot);
  return {
    variants: new Map(snapshot.variants.map((entry) => [entry.variant_id, entry])),
    candidates: new Map(snapshot.candidates.map((entry) => [entry.candidate_key, entry])),
  };
}

function normalizeHistoryRow(row) {
  if (!plainObject(row) || !plainObject(row.raw) || !plainObject(row.raw.automatic_rollout)) {
    throw new MarketBoundedCoverageError("Coverage history marker is missing.");
  }
  const marker = row.raw.automatic_rollout;
  const observedAt = validIso(row.observed_at);
  const event = {
    id: clean(row.id),
    listing_id: clean(row.listing_id),
    variant_id: clean(row.variant_id),
    observed_at: observedAt,
    candidate_key: clean(marker.candidate_key),
    workflow_run_id: clean(marker.workflow_run_id),
    workflow_run_attempt: clean(marker.workflow_run_attempt),
    head_sha: clean(marker.head_sha).toLowerCase(),
    policy_digest: clean(marker.policy_digest).toLowerCase(),
    audit_digest: clean(marker.audit_digest).toLowerCase(),
    plan_digest: clean(marker.plan_digest).toLowerCase(),
  };
  if (marker.stage !== "market-bounded"
    || !event.id
    || !event.listing_id
    || !event.variant_id
    || !event.observed_at
    || !CANDIDATE_KEY.test(event.candidate_key)
    || !RUN_ID.test(event.workflow_run_id)
    || !RUN_ID.test(event.workflow_run_attempt)
    || !HEAD_SHA.test(event.head_sha)
    || !SHA256.test(event.policy_digest)
    || !SHA256.test(event.audit_digest)
    || !SHA256.test(event.plan_digest)) {
    throw new MarketBoundedCoverageError("Coverage history marker is malformed.");
  }
  return event;
}

function validateCoverageEntries(entries, identityKey, candidate = false) {
  const identities = entries.map((entry) => clean(entry?.[identityKey]));
  if (identities.some((identity) => !identity) || new Set(identities).size !== identities.length) {
    throw new MarketBoundedCoverageError("Coverage snapshot identity is duplicated.");
  }
  if (entries.some((entry) => !plainObject(entry)
    || !Number.isInteger(entry.persistence_count)
    || entry.persistence_count <= 0
    || !validIso(entry.last_persisted_at)
    || (candidate && (!clean(entry.listing_id) || !clean(entry.variant_id))))) {
    throw new MarketBoundedCoverageError("Coverage snapshot entry is invalid.");
  }
  const sorted = [...identities].sort((left, right) => left.localeCompare(right, "en"));
  if (JSON.stringify(sorted) !== JSON.stringify(identities)) {
    throw new MarketBoundedCoverageError("Coverage snapshot ordering is not deterministic.");
  }
}

function aggregateCoverage(events, keyFor, build) {
  const groups = new Map();
  for (const event of events) {
    const key = keyFor(event);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([key, values]) => build(key, values.sort(compareEvents)));
}

function compareEvents(left, right) {
  return left.observed_at.localeCompare(right.observed_at, "en")
    || left.id.localeCompare(right.id, "en");
}

function digest(value) {
  return crypto.createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (plainObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function validIso(value) {
  const date = new Date(value ?? NaN);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function clean(value) {
  const text = String(value ?? "");
  if (text.length > 500 || /[\u0000-\u001f\u007f]/.test(text)) return "";
  return text.trim();
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
