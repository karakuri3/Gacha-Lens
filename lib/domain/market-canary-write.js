import { buildMarketCandidateKey, sanitizeMarketPublicUrl } from "./market-candidate-key.js";
import { validateMarketCandidateAudit } from "./market-candidate-audit.js";
import { normalizeMarketplaceStatus } from "./market-status.js";
import { stableId } from "../fetchers/feed-source-utils.js";

const CANDIDATE_KEY = /^[0-9a-f]{16}$/;
const MAX_CANDIDATES = 4;
const MAX_AUDIT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ACCEPTED_REASON = "variant_and_parent_evidence_confirmed";
const ALLOWED_STATUSES = new Set(["active", "sold", "sold_out", "pre_release"]);
const FAILURE_STAGES = new Set([
  "request_validation",
  "approved_audit_load",
  "approved_audit_validation",
  "ancestor_validation",
  "coverage_plan",
  "external_fetch",
  "candidate_assessment",
  "exact_audit_match",
  "row_build",
  "approval_reuse_preflight",
  "preflight",
  "listing_write",
  "observation_write",
  "post_write_verification",
  "rollback",
  "complete",
]);
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
  if (String(input.priority) !== "1") throw new Error("Canary write requires priority=1.");
  if (input.release !== "released") throw new Error("Canary write requires release=released.");
  if (!/^\d+$/.test(String(input.auditRunId ?? ""))) throw new Error("Canary audit run ID must contain digits only.");
  return { ...input, limit: Number(input.limit), auditRunId: String(input.auditRunId), candidateKeys: keys };
}

export function parseCanaryCandidateKeys(value) {
  const keys = (Array.isArray(value) ? value : String(value ?? "").split(","))
    .map((entry) => String(entry).trim())
    .filter(Boolean);
  if (keys.length < 1 || keys.length > MAX_CANDIDATES) throw new Error("Canary candidate keys must contain between one and four values.");
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

    const rawStatus = requiredText(record.status);
    const approvedRawStatus = requiredText(candidate.listing.status);
    if (!rawStatus) throw new Error(`Candidate ${candidate.candidate_key} has a missing status.`);
    if (!approvedRawStatus) throw new Error(`Candidate ${candidate.candidate_key} has a missing approved status.`);
    const status = normalizeMarketplaceStatus(rawStatus);
    const approvedStatus = normalizeMarketplaceStatus(approvedRawStatus);
    const sourceUrl = sanitizeMarketPublicUrl(candidate.source.public_url);
    const price = candidate.listing.price;
    if (!Number.isFinite(price) || price <= 0) throw new Error(`Candidate ${candidate.candidate_key} has an invalid price.`);
    if (!ALLOWED_STATUSES.has(status) || !ALLOWED_STATUSES.has(approvedStatus)) {
      throw new Error(`Candidate ${candidate.candidate_key} has an unsupported status.`);
    }
    if (status !== approvedStatus) throw new Error(`Candidate ${candidate.candidate_key} has a status drift.`);
    const source = canonicalMarketplaceSource(candidate.source.provider);
    if (!source) throw new Error(`Candidate ${candidate.candidate_key} has an unsupported provider.`);
    const recordSource = requiredText(record.source).toLowerCase();
    if (!recordSource) throw new Error(`Candidate ${candidate.candidate_key} has a missing source.`);
    if (recordSource !== source) throw new Error(`Candidate ${candidate.candidate_key} has a source identity drift.`);
    const listingId = buildMarketplaceListingId({
      provider: candidate.source.provider,
      sourceListingId: candidate.source.listing_id,
      publicUrl: sourceUrl,
      title: candidate.listing.title,
    });
    if (!listingId || !sourceUrl || listingId !== String(record.id ?? "").trim()) {
      throw new Error(`Candidate ${candidate.candidate_key} has a listing identity drift.`);
    }
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
      price,
      status,
      source,
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
      id: stableId(
        "market-canary-observation",
        String(auditRunId),
        candidate.candidate_key,
        listingId,
      ),
      listing_id: listingId,
      variant_id: safety.variant_id,
      series_id: safety.series_id,
      price,
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

export async function persistMarketCanary({ listingRows, observationRows, store, onStage = () => {} } = {}) {
  if (!listingRows?.length || listingRows.length > MAX_CANDIDATES || listingRows.length !== observationRows?.length) {
    throw new Error("Canary persistence requires between one and four matching listing and observation rows.");
  }
  const listingIds = listingRows.map((row) => row.id);
  const observationIds = observationRows.map((row) => row.id);
  let beforeListings = [];
  let beforeObservations = [];
  let beforeCounts = {};
  let listingWrites = 0;
  let observationWrites = 0;
  let listingWriteAttempted = false;
  let observationWriteAttempted = false;
  let currentStage = "approval_reuse_preflight";
  try {
    setStage("approval_reuse_preflight");
    const approval = canaryApprovalIdentity(observationRows);
    const consumedObservations = await store.fetchConsumedCanaryObservations(
      approval.auditRunId,
      approval.candidateKeys,
    );
    assertCanaryApprovalUnused(consumedObservations, approval);

    setStage("preflight");
    [beforeListings, beforeObservations, beforeCounts] = await Promise.all([
      store.fetchRowsByIds("market_listings", listingIds, LISTING_SELECT),
      store.fetchRowsByIds("market_listing_observations", observationIds, OBSERVATION_SELECT),
      store.fetchCounts(),
    ]);
    assertPreflightIdentity(beforeListings, listingRows);
    setStage("listing_write");
    listingWriteAttempted = true;
    await store.upsertRows("market_listings", listingRows);
    listingWrites = listingRows.length;
    setStage("observation_write");
    observationWriteAttempted = true;
    await store.upsertRows("market_listing_observations", observationRows);
    observationWrites = observationRows.length;
    setStage("post_write_verification");
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
      rollback: normalizeCanaryRollback(),
    });
  } catch (error) {
    const failedStage = currentStage;
    const writeAttempted = listingWriteAttempted || observationWriteAttempted;
    const rollback = writeAttempted
      ? await runRollback()
      : {
          attempted: false,
          verified: false,
          listings_deleted: 0,
          observations_deleted: 0,
          listings_restored: 0,
          observations_restored: 0,
        };
    const rollbackState = rollback.attempted ? (rollback.verified ? "verified" : "failed") : "not required";
    const wrapped = new Error(`Canary persistence failed; rollback ${rollbackState}.`);
    wrapped.cause = error;
    wrapped.canaryResult = {
      ok: false,
      listing_writes: listingWrites,
      observation_writes: observationWrites,
      verification: false,
      rollback,
    };
    wrapped.canaryStage = !rollback.attempted || rollback.verified ? failedStage : "rollback";
    throw wrapped;
  }

  function setStage(stage) {
    currentStage = stage;
    onStage(stage);
  }

  async function runRollback() {
    onStage("rollback");
    return rollbackCanary({
      store,
      listingRows,
      observationRows,
      beforeListings,
      beforeObservations,
    });
  }
}

export function assertCanaryApprovalUnused(existingObservations = [], approval = {}) {
  const expectedAuditRunId = requiredText(approval.auditRunId);
  const expectedKeys = new Set((approval.candidateKeys ?? []).map(requiredText).filter(Boolean));
  const consumedKeys = new Set();

  for (const observation of existingObservations) {
    const raw = observation?.raw;
    if (!isPlainObject(raw)) throw new Error("Canary approval consumption marker is malformed.");
    const auditRunId = requiredText(raw.canary_audit_run_id);
    const candidateKey = requiredText(raw.canary_candidate_key);
    if (auditRunId !== expectedAuditRunId || !CANDIDATE_KEY.test(candidateKey)) {
      throw new Error("Canary approval consumption marker is malformed.");
    }
    if (expectedKeys.has(candidateKey)) consumedKeys.add(candidateKey);
  }

  if (consumedKeys.size > 0) {
    throw new Error("Canary approval has already been consumed.");
  }
  return true;
}

export function buildMarketplaceListingId({ provider, sourceListingId, publicUrl, title } = {}) {
  const prefix = provider === "rakuten_ichiba"
    ? "rakuten"
    : provider === "yahoo_shopping"
      ? "yahoo"
      : "";
  if (!prefix) return "";
  return stableId(prefix, sourceListingId || publicUrl || title);
}

export function canonicalMarketplaceSource(provider) {
  const value = requiredText(provider).toLowerCase();
  if (value === "rakuten_ichiba") return "rakuten";
  if (value === "yahoo_shopping") return "yahoo_shopping";
  return "";
}

export function resolveStoredMarketplaceIdentity(row = {}) {
  const source = requiredText(row.source).toLowerCase();
  const expectedProvider = source === "rakuten"
    ? "rakuten_ichiba"
    : source === "yahoo_shopping"
      ? "yahoo_shopping"
      : "";
  const providers = [];
  const externalIds = [];
  const publicUrls = [row.source_url];
  const visited = new Set();
  let current = row.raw;
  let depth = 0;
  let chainInvalid = false;

  while (isPlainObject(current)) {
    if (visited.has(current) || depth >= 128) {
      chainInvalid = true;
      break;
    }
    visited.add(current);
    providers.push(current.provider);
    externalIds.push(current.source_listing_id, current.listing_id);
    if (expectedProvider === "rakuten_ichiba") externalIds.push(current.itemCode);
    if (expectedProvider === "yahoo_shopping") externalIds.push(current.code);
    publicUrls.push(current.public_url, current.source_url);
    current = current.raw;
    depth += 1;
  }

  if (current !== undefined && current !== null && !isPlainObject(current)) chainInvalid = true;

  const providerValues = uniqueRequiredValues(providers);
  const externalIdValues = uniqueRequiredValues(externalIds);
  const publicUrlValues = uniqueRequiredValues(publicUrls.map(sanitizeMarketPublicUrl));
  const provider = providerValues.length === 1 ? providerValues[0] : "";
  const sourceListingId = externalIdValues.length === 1 ? externalIdValues[0] : "";
  const publicUrl = publicUrlValues.length === 1 ? publicUrlValues[0] : "";
  const derivedId = provider && sourceListingId && publicUrl
    ? buildMarketplaceListingId({ provider, sourceListingId, publicUrl })
    : "";
  const conflicts = {
    provider: providerValues.length > 1,
    source_listing_id: externalIdValues.length > 1,
    public_url: publicUrlValues.length > 1,
    raw_chain: chainInvalid,
  };

  return {
    provider,
    source,
    sourceListingId,
    publicUrl,
    derivedId,
    depth,
    conflicts,
    complete: Boolean(
      expectedProvider
      && provider === expectedProvider
      && source === canonicalMarketplaceSource(provider)
      && sourceListingId
      && publicUrl
      && derivedId
      && !Object.values(conflicts).some(Boolean)
    ),
  };
}

export function buildSanitizedCanaryFailureResult(input = {}) {
  const stage = FAILURE_STAGES.has(input.failedStage) ? input.failedStage : "request_validation";
  const keys = (Array.isArray(input.candidateKeys) ? input.candidateKeys : String(input.candidateKeys ?? "").split(","))
    .map((key) => String(key).trim())
    .filter((key) => CANDIDATE_KEY.test(key))
    .slice(0, MAX_CANDIDATES);
  const rollback = normalizeCanaryRollback(input.rollback);
  return {
    schema_version: 1,
    source_audit_run_id: /^\d+$/.test(String(input.auditRunId ?? "")) ? String(input.auditRunId) : "",
    workflow_run_id: /^\d*$/.test(String(input.workflowRunId ?? "")) ? String(input.workflowRunId ?? "") : "",
    head_sha: /^[0-9a-f]{7,40}$/i.test(String(input.headSha ?? "")) ? String(input.headSha) : "",
    mode: "canary-write",
    ok: false,
    failed_stage: stage,
    error_code: `canary_${stage}_failed`,
    candidate_count: keys.length,
    candidate_keys: keys,
    candidates: [],
    listing_writes: Number.isInteger(input.listingWrites) && input.listingWrites >= 0 ? input.listingWrites : 0,
    observation_writes: Number.isInteger(input.observationWrites) && input.observationWrites >= 0 ? input.observationWrites : 0,
    verification: false,
    rollback,
    db_deltas: {},
    health: { database: "unknown" },
  };
}

export function normalizeCanaryRollback(value) {
  const rollback = value && typeof value === "object" ? value : {};
  return {
    attempted: rollback.attempted === true,
    verified: rollback.verified === true,
    listings_deleted: nonnegativeInteger(rollback.listings_deleted),
    observations_deleted: nonnegativeInteger(rollback.observations_deleted),
    listings_restored: nonnegativeInteger(rollback.listings_restored),
    observations_restored: nonnegativeInteger(rollback.observations_restored),
  };
}

export function renderMarketCanaryResultMarkdown(result = {}) {
  const rollback = normalizeCanaryRollback(result.rollback);
  const candidates = Array.isArray(result.candidates) ? result.candidates : [];
  const lines = [
    "# Market Canary Result",
    "",
    `- Source audit run: ${result.source_audit_run_id ?? ""}`,
    `- Workflow run: ${result.workflow_run_id || "local"}`,
    `- Head SHA: ${result.head_sha ?? ""}`,
    `- Candidate count: ${nonnegativeInteger(result.candidate_count)}`,
    `- Listing writes: ${nonnegativeInteger(result.listing_writes)}`,
    `- Observation writes: ${nonnegativeInteger(result.observation_writes)}`,
    ...(result.failed_stage ? [`- Failed stage: ${result.failed_stage}`, `- Error code: ${result.error_code ?? ""}`] : []),
    `- Verification: ${result.verification === true}`,
    `- Rollback: ${rollback.attempted ? (rollback.verified ? "verified" : "failed") : "not required"}`,
    `- Rollback counts: listings deleted ${rollback.listings_deleted}, observations deleted ${rollback.observations_deleted}, listings restored ${rollback.listings_restored}, observations restored ${rollback.observations_restored}`,
    `- Health: ${result.health?.database ?? "unknown"}`,
    "",
    "| Key | Provider | Target variant | Status | Listing | Observation |",
    "|---|---|---|---|---|---|",
    ...candidates.map((candidate) => `| ${candidate.candidate_key ?? ""} | ${candidate.provider ?? ""} | ${escapeMarkdownText(candidate.target_variant_name)} | ${candidate.status ?? ""} | ${candidate.listing_operation ?? ""} | ${candidate.observation_operation ?? ""} |`),
    "",
  ];
  return lines.join("\n");
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
    const existingIdentity = resolveStoredMarketplaceIdentity(existing);
    const desiredIdentity = resolveStoredMarketplaceIdentity(desired);
    if (
      !desired
      || existing.source !== desired.source
      || !existingIdentity.complete
      || !desiredIdentity.complete
      || existingIdentity.provider !== desiredIdentity.provider
      || existingIdentity.sourceListingId !== desiredIdentity.sourceListingId
      || existingIdentity.publicUrl !== desiredIdentity.publicUrl
      || existingIdentity.derivedId !== existing.id
      || existingIdentity.derivedId !== desired.id
      || desiredIdentity.derivedId !== desired.id
    ) {
      throw new Error(`Existing listing identity conflicts for ${existing.id}.`);
    }
  }
}

function canaryApprovalIdentity(observationRows) {
  const identities = observationRows.map((row) => ({
    auditRunId: requiredText(row?.raw?.canary_audit_run_id),
    candidateKey: requiredText(row?.raw?.canary_candidate_key),
  }));
  const auditRunIds = new Set(identities.map((entry) => entry.auditRunId).filter(Boolean));
  const candidateKeys = identities.map((entry) => entry.candidateKey);
  if (
    auditRunIds.size !== 1
    || candidateKeys.some((key) => !CANDIDATE_KEY.test(key))
    || new Set(candidateKeys).size !== candidateKeys.length
  ) {
    throw new Error("Canary approval identity is invalid.");
  }
  return {
    auditRunId: [...auditRunIds][0],
    candidateKeys,
  };
}

function uniqueRequiredValues(values) {
  return [...new Set(values.map(requiredText).filter(Boolean))];
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function rollbackCanary({ store, listingRows, observationRows, beforeListings, beforeObservations }) {
  const existingListingIds = new Set(beforeListings.map((row) => row.id));
  const newListingIds = listingRows.map((row) => row.id).filter((id) => !existingListingIds.has(id));
  const observationIds = observationRows.map((row) => row.id);
  const result = {
    attempted: true,
    verified: false,
    listings_deleted: 0,
    observations_deleted: 0,
    listings_restored: 0,
    observations_restored: 0,
  };
  try {
    result.observations_deleted = await store.deleteRowsByIds("market_listing_observations", observationIds);
    result.listings_deleted = await store.deleteRowsByIds("market_listings", newListingIds);
    await store.upsertRows("market_listings", beforeListings);
    result.listings_restored = beforeListings.length;
    await store.upsertRows("market_listing_observations", beforeObservations);
    result.observations_restored = beforeObservations.length;
    const [restoredListings, restoredObservations] = await Promise.all([
      store.fetchRowsByIds("market_listings", listingRows.map((row) => row.id), LISTING_SELECT),
      store.fetchRowsByIds("market_listing_observations", observationIds, OBSERVATION_SELECT),
    ]);
    verifyRollbackRows(restoredListings, beforeListings, listingRows.map((row) => row.id), "market_listings");
    verifyRollbackRows(restoredObservations, beforeObservations, observationIds, "market_listing_observations");
    return { ...result, verified: true };
  } catch {
    return result;
  }
}

function verifySavedRows(actualRows, expectedRows, fields, table) {
  const actualById = new Map(actualRows.map((row) => [row.id, row]));
  for (const expected of expectedRows) {
    const actual = actualById.get(expected.id);
    if (!actual || fields.some((field) => normalized(actual[field], field) !== normalized(expected[field], field))) {
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
    if (expected && canonical(actual) !== canonical(expected)) throw new Error(`${table} rollback did not restore the prior row.`);
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

function normalized(value, field = "") {
  if (["listed_at", "sold_at", "last_observed_at", "observed_at"].includes(field) && value) {
    const time = new Date(value);
    return Number.isFinite(time.getTime()) ? time.toISOString() : String(value);
  }
  return value && typeof value === "object" ? canonical(value) : String(value ?? "");
}

function isoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function requiredText(value) {
  return String(value ?? "").normalize("NFKC").trim();
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function nonnegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function escapeMarkdownText(value) {
  return String(value ?? "").replace(/[\\|`*_[\]{}()<>#+\-.!~]/g, "\\$&");
}

const LISTING_VERIFY_FIELDS = [
  "id",
  "variant_id",
  "matched_variant_id",
  "series_id",
  "title",
  "listing_type",
  "market_review_type",
  "classification_reason",
  "classification_confidence",
  "classification_details",
  "price",
  "status",
  "source",
  "source_type",
  "source_url",
  "listed_at",
  "sold_at",
  "last_observed_at",
  "review_required",
  "confidence",
  "raw",
];
const OBSERVATION_VERIFY_FIELDS = ["id", "listing_id", "variant_id", "series_id", "price", "status", "source", "observed_at", "raw"];
