import { buildMarketCandidateKey, sanitizeMarketPublicUrl } from "./market-candidate-key.js";
import { validateMarketCandidateAudit } from "./market-candidate-audit.js";
import { normalizeMarketplaceStatus } from "./market-status.js";

const CANDIDATE_KEY = /^[0-9a-f]{16}$/;
const MAX_CANDIDATES = 2;
const MAX_AUDIT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ACCEPTED_REASON = "variant_and_parent_evidence_confirmed";
const LISTING_SELECT = "id,variant_id,matched_variant_id,series_id,title,listing_type,market_review_type,classification_reason,classification_confidence,classification_details,price,status,source,source_type,source_url,listed_at,sold_at,last_observed_at,confidence,review_required,raw";
const OBSERVATION_SELECT = "id,listing_id,variant_id,series_id,price,status,source,observed_at,raw";

export function validateCanaryRequest(input = {}) {
  const keys = parseCanaryCandidateKeys(input.candidateKeys);
  if (input.eventName !== "workflow_dispatch") throw new Error("Canary write requires workflow_dispatch.");
  if (input.task !== "market") throw new Error("Canary write requires task=market.");
  if (input.mode !== "canary-write") throw new Error("Canary write mode is required.");
  if (input.sourceScope !== "planner-apis") throw new Error("Canary write requires source_scope=planner-apis.");
  if (!Number.isInteger(Number(input.limit)) || Number(input.limit) < 1 || Number(input.limit) > 5) {
    throw new Error("Canary write limit must be between 1 and 5.");
  }
  if (input.release !== "released") throw new Error("Canary write requires release=released.");
  if (!/^\d+$/.test(String(input.auditRunId ?? ""))) throw new Error("Canary audit run ID must contain digits only.");
  return { ...input, limit: Number(input.limit), auditRunId: String(input.auditRunId), candidateKeys: keys };
}

export function parseCanaryCandidateKeys(value) {
  const keys = (Array.isArray(value) ? value : String(value ?? "").split(","))
    .map((entry) => String(entry).trim())
    .filter(Boolean);
  if (keys.length < 1 || keys.length > MAX_CANDIDATES) throw new Error("Canary candidate keys must contain one or two values.");
  if (new Set(keys).size !== keys.length) throw new Error("Canary candidate keys must not contain duplicates.");
  if (keys.some((key) => !CANDIDATE_KEY.test(key))) throw new Error("Canary candidate keys must be 16-character lowercase hex.");
  return keys;
}

export function validateApprovedMarketAudit(report, options = {}) {
  validateMarketCandidateAudit(report);
  if (report.mode !== "dry-run") throw new Error("Approved audit must be a dry-run.");
  if (report.source_scope !== "planner-apis") throw new Error("Approved audit must use planner-apis.");
  if (String(report.workflow?.run_id) !== String(options.auditRunId)) throw new Error("Approved audit run ID does not match.");
  if (report.workflow?.event_name !== "workflow_dispatch") throw new Error("Approved audit must come from workflow_dispatch.");
  if (report.result?.report_complete !== true) throw new Error("Approved audit report is incomplete.");
  if (Number(report.result?.truncated_count) !== 0) throw new Error("Approved audit report is truncated.");
  if (Number(report.result?.accepted_count) + Number(report.result?.review_count) !== Number(report.result?.candidate_count)) {
    throw new Error("Approved audit result totals do not match.");
  }
  if (Number(report.selection?.selected_variant_count) !== report.selection?.selected_variants?.length) {
    throw new Error("Approved audit selection totals do not match.");
  }
  if (Number(report.selection?.query_count) !== report.selection?.selected_variants?.length) {
    throw new Error("Approved audit query totals do not match.");
  }
  const generatedAt = new Date(report.generated_at).getTime();
  const now = new Date(options.now ?? new Date()).getTime();
  if (!Number.isFinite(generatedAt) || !Number.isFinite(now) || now < generatedAt || now - generatedAt > MAX_AUDIT_AGE_MS) {
    throw new Error("Approved audit has expired.");
  }
  if (options.isAncestor !== true) throw new Error("Approved audit head is not an ancestor of the current head.");
  return true;
}

export function assertExactMarketAuditMatch(approved, current) {
  const approvedComparable = comparableAudit(approved);
  const currentComparable = comparableAudit(current);
  if (JSON.stringify(approvedComparable) !== JSON.stringify(currentComparable)) {
    throw new Error("Current market candidates do not exactly match the approved audit.");
  }
  return true;
}

export function selectApprovedCanaryCandidates(report, candidateKeys) {
  const keys = parseCanaryCandidateKeys(candidateKeys);
  const byKey = new Map(report.candidates.map((candidate) => [candidate.candidate_key, candidate]));
  return keys.map((key) => {
    const candidate = byKey.get(key);
    if (!candidate) throw new Error(`Candidate ${key} is not present in the approved audit.`);
    if (
      candidate.assessment?.accepted !== true
      || candidate.assessment?.review_required !== false
      || candidate.assessment?.reason !== ACCEPTED_REASON
      || Number(candidate.assessment?.confidence) < 0.8
    ) {
      throw new Error(`Candidate ${key} is not approved for canary persistence.`);
    }
    return candidate;
  });
}

export function buildMarketCanaryRows({ records = [], report, candidateKeys, auditRunId, observedAt = new Date() } = {}) {
  const selected = selectApprovedCanaryCandidates(report, candidateKeys);
  const recordsByKey = new Map(records.map((record) => [buildMarketCandidateKey(record), record]));
  const date = new Date(observedAt);
  if (!Number.isFinite(date.getTime())) throw new Error("Canary observation time is invalid.");
  const observedIso = date.toISOString();
  const bucket = observedIso.slice(0, 10).replaceAll("-", "");
  const listingRows = [];
  const observationRows = [];

  for (const candidate of selected) {
    const record = recordsByKey.get(candidate.candidate_key);
    if (!record) throw new Error(`Current record for ${candidate.candidate_key} is missing.`);
    const safety = record.market_safety;
    if (
      record.market_safety_assessed !== true
      || safety?.accepted !== true
      || safety?.review_required !== false
      || safety?.variant_id !== candidate.target.variant_id
      || safety?.series_id !== candidate.target.series_id
    ) {
      throw new Error(`Current safety assessment for ${candidate.candidate_key} is invalid.`);
    }

    const status = normalizeMarketplaceStatus(record.status);
    const sourceUrl = sanitizeMarketPublicUrl(candidate.source.public_url);
    const listingId = String(record.id ?? "").trim();
    if (!listingId || !sourceUrl) throw new Error(`Candidate ${candidate.candidate_key} is missing a stable listing identity.`);
    const raw = {
      provider: candidate.source.provider,
      source_listing_id: candidate.source.listing_id,
      public_url: sourceUrl,
      query_text: candidate.target.search_query,
      query_variant_id: candidate.target.variant_id,
      query_series_id: candidate.target.series_id,
      fetched_at: isoOrNull(record.raw?.fetchedAt ?? record.raw?.fetched_at ?? record.listed_at) ?? observedIso,
      market_safety_assessed: true,
      market_safety: {
        accepted: true,
        review_required: false,
        reason: safety.reason,
        variant_id: safety.variant_id,
        series_id: safety.series_id,
        listing_type: safety.listing_type,
        confidence: Number(safety.confidence),
      },
      canary_audit_run_id: String(auditRunId),
      canary_candidate_key: candidate.candidate_key,
    };
    const listingRow = {
      id: listingId,
      variant_id: safety.variant_id,
      matched_variant_id: safety.variant_id,
      series_id: safety.series_id,
      title: candidate.listing.title,
      listing_type: safety.listing_type,
      market_review_type: safety.listing_type === "single" ? "single" : "rare_or_secret",
      classification_reason: safety.reason,
      classification_confidence: Number(safety.confidence),
      classification_details: { market_safety: raw.market_safety },
      price: Number(candidate.listing.price),
      status,
      source: record.source || candidate.source.provider,
      source_type: "marketplace",
      source_url: sourceUrl,
      listed_at: isoOrNull(record.listed_at) ?? observedIso,
      sold_at: status === "sold" ? isoOrNull(record.sold_at) : null,
      last_observed_at: observedIso,
      confidence: Number(safety.confidence),
      review_required: false,
      raw,
    };
    const observationRow = {
      id: stableId("market-observation", bucket, listingId),
      listing_id: listingId,
      variant_id: safety.variant_id,
      series_id: safety.series_id,
      price: Number(candidate.listing.price),
      status,
      source: listingRow.source,
      observed_at: observedIso,
      raw: {
        canary_audit_run_id: String(auditRunId),
        canary_candidate_key: candidate.candidate_key,
      },
    };
    listingRows.push(listingRow);
    observationRows.push(observationRow);
  }
  return { selected, listingRows, observationRows };
}

export async function persistMarketCanary({ listingRows, observationRows, store } = {}) {
  if (!listingRows?.length || listingRows.length > MAX_CANDIDATES || listingRows.length !== observationRows?.length) {
    throw new Error("Canary persistence requires one or two matching listing and observation rows.");
  }
  const listingIds = listingRows.map((row) => row.id);
  const observationIds = observationRows.map((row) => row.id);
  const [beforeListings, beforeObservations, beforeCounts] = await Promise.all([
    store.fetchRowsByIds("market_listings", listingIds, LISTING_SELECT),
    store.fetchRowsByIds("market_listing_observations", observationIds, OBSERVATION_SELECT),
    store.fetchCounts(),
  ]);
  assertPreflightIdentity(beforeListings, listingRows);

  try {
    await store.upsertRows("market_listings", listingRows);
    await store.upsertRows("market_listing_observations", observationRows);
    const [savedListings, savedObservations, afterCounts] = await Promise.all([
      store.fetchRowsByIds("market_listings", listingIds, LISTING_SELECT),
      store.fetchRowsByIds("market_listing_observations", observationIds, OBSERVATION_SELECT),
      store.fetchCounts(),
    ]);
    verifySavedRows(savedListings, listingRows, LISTING_VERIFY_FIELDS, "market_listings");
    verifySavedRows(savedObservations, observationRows, OBSERVATION_VERIFY_FIELDS, "market_listing_observations");
    const deltas = verifyCountDeltas(beforeCounts, afterCounts, listingRows.length, beforeListings, beforeObservations);
    return buildPersistenceResult({
      listingRows,
      observationRows,
      beforeListings,
      beforeObservations,
      deltas,
      rollback: false,
    });
  } catch (error) {
    const rollback = await rollbackCanary({
      store,
      listingRows,
      observationRows,
      beforeListings,
      beforeObservations,
    });
    const wrapped = new Error(`Canary persistence failed; rollback ${rollback.verified ? "verified" : "failed"}.`);
    wrapped.cause = error;
    wrapped.canaryResult = { ok: false, rollback };
    throw wrapped;
  }
}

function comparableAudit(report) {
  return {
    schema_version: report.schema_version,
    mode: report.mode,
    source_scope: report.source_scope,
    selection: report.selection,
    result: report.result,
    database_writes: report.database_writes,
    candidates: report.candidates,
  };
}

function assertPreflightIdentity(existingRows, desiredRows) {
  const desiredById = new Map(desiredRows.map((row) => [row.id, row]));
  for (const existing of existingRows) {
    const desired = desiredById.get(existing.id);
    const existingExternalId = existing.raw?.source_listing_id ?? existing.raw?.listing_id ?? existing.raw?.itemCode ?? existing.raw?.code;
    const desiredExternalId = desired.raw?.source_listing_id;
    if (
      !desired
      || existing.source !== desired.source
      || sanitizeMarketPublicUrl(existing.source_url) !== desired.source_url
      || String(existingExternalId ?? "") !== String(desiredExternalId ?? "")
    ) {
      throw new Error(`Existing listing identity conflicts for ${existing.id}.`);
    }
  }
}

async function rollbackCanary({ store, listingRows, observationRows, beforeListings, beforeObservations }) {
  const existingListingIds = new Set(beforeListings.map((row) => row.id));
  const newListingIds = listingRows.map((row) => row.id).filter((id) => !existingListingIds.has(id));
  const observationIds = observationRows.map((row) => row.id);
  try {
    await store.deleteRowsByIds("market_listing_observations", observationIds);
    await store.deleteRowsByIds("market_listings", newListingIds);
    await store.upsertRows("market_listings", beforeListings);
    await store.upsertRows("market_listing_observations", beforeObservations);
    const [restoredListings, restoredObservations] = await Promise.all([
      store.fetchRowsByIds("market_listings", listingRows.map((row) => row.id), LISTING_SELECT),
      store.fetchRowsByIds("market_listing_observations", observationIds, OBSERVATION_SELECT),
    ]);
    verifyRollbackRows(restoredListings, beforeListings, listingRows.map((row) => row.id), "market_listings");
    verifyRollbackRows(restoredObservations, beforeObservations, observationIds, "market_listing_observations");
    return { attempted: true, verified: true };
  } catch {
    return { attempted: true, verified: false };
  }
}

function verifySavedRows(actualRows, expectedRows, fields, table) {
  const actualById = new Map(actualRows.map((row) => [row.id, row]));
  for (const expected of expectedRows) {
    const actual = actualById.get(expected.id);
    if (!actual || fields.some((field) => normalized(actual[field]) !== normalized(expected[field]))) {
      throw new Error(`${table} post-write verification failed for ${expected.id}.`);
    }
  }
}

function verifyRollbackRows(actualRows, expectedRows, allIds, table) {
  const actualById = new Map(actualRows.map((row) => [row.id, row]));
  const expectedById = new Map(expectedRows.map((row) => [row.id, row]));
  for (const id of allIds) {
    const actual = actualById.get(id);
    const expected = expectedById.get(id);
    if (!expected && actual) throw new Error(`${table} rollback left a new row.`);
    if (expected && JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${table} rollback did not restore the prior row.`);
  }
}

function verifyCountDeltas(before, after, candidateCount, beforeListings, beforeObservations) {
  const deltas = Object.fromEntries(Object.keys(before).map((key) => [key, Number(after[key]) - Number(before[key])]));
  const expectedListingMax = candidateCount - beforeListings.length;
  const expectedObservationMax = candidateCount - beforeObservations.length;
  if (deltas.market_listings < 0 || deltas.market_listings > expectedListingMax) throw new Error("Unexpected market_listings count delta.");
  if (deltas.market_listing_observations < 0 || deltas.market_listing_observations > expectedObservationMax) throw new Error("Unexpected observation count delta.");
  if (deltas.import_issues !== 0 || deltas.ingestion_runs !== 0 || deltas.review_required !== 0) {
    throw new Error("Canary write changed a protected count.");
  }
  return deltas;
}

function buildPersistenceResult({ listingRows, observationRows, beforeListings, beforeObservations, deltas, rollback }) {
  const existingListings = new Set(beforeListings.map((row) => row.id));
  const existingObservations = new Set(beforeObservations.map((row) => row.id));
  return {
    ok: true,
    listing_writes: listingRows.length,
    observation_writes: observationRows.length,
    listings: listingRows.map((row) => ({ id: row.id, operation: existingListings.has(row.id) ? "updated" : "inserted" })),
    observations: observationRows.map((row) => ({ id: row.id, operation: existingObservations.has(row.id) ? "updated" : "inserted" })),
    verification: true,
    rollback,
    db_deltas: deltas,
    health: { database: "ok" },
  };
}

function normalized(value) {
  return value && typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
}

function isoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function stableId(...parts) {
  return parts.filter(Boolean).map((part) => String(part).replace(/[^a-zA-Z0-9_-]+/g, "-")).join("-").slice(0, 120);
}

const LISTING_VERIFY_FIELDS = [
  "variant_id",
  "matched_variant_id",
  "series_id",
  "price",
  "status",
  "source",
  "source_url",
  "review_required",
  "confidence",
];
const OBSERVATION_VERIFY_FIELDS = ["listing_id", "variant_id", "series_id", "price", "status"];
