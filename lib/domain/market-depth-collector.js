import { stableId } from "../fetchers/feed-source-utils.js";
import { buildVerifiedAffiliatePersistenceFields } from "./market-affiliate-persistence.js";
import { buildMarketplaceListingId, canonicalMarketplaceSource } from "./market-canary-write.js";
import { canonicalizeBoundedMarketplaceUrl, resolveBoundedMarketplaceIdentity } from "./market-bounded-write.js";
import { isEligibleP3BoundedSeedCandidate } from "./market-p3-bounded-seed.js";
import { resolveMarketplaceStorefrontEvidence, storefrontIdentityKey } from "./market-storefront-identity.js";

export const MARKET_DEPTH_COLLECTOR_DEFAULT_BUDGET = 50;
export const MARKET_DEPTH_COLLECTOR_MAX_BUDGET = 200;

const CANDIDATE_KEY = /^[0-9a-f]{16}$/;
const PROVIDERS = new Set(["rakuten_ichiba", "yahoo_shopping"]);

export function selectMarketDepthCandidates(candidates = [], options = {}) {
  if (!Array.isArray(candidates)) throw new TypeError("Depth Collector candidates must be an array.");
  const budget = parseDepthBudget(options.budget ?? MARKET_DEPTH_COLLECTOR_DEFAULT_BUDGET);
  const targetVariantId = text(options.targetVariantId, 180);
  const targetSeriesId = text(options.targetSeriesId, 180);
  if (!targetVariantId || !targetSeriesId) throw new Error("Depth Collector requires explicit targetVariantId and targetSeriesId.");

  const existing = indexExistingListings(options.existingListings ?? []);
  const evaluated = candidates.map((candidate, inputIndex) => evaluateCandidate(candidate, {
    inputIndex,
    targetVariantId,
    targetSeriesId,
  }));
  const rejected = evaluated.filter((entry) => !entry.eligible).map(toRejected);
  const eligible = evaluated.filter((entry) => entry.eligible).sort(compareEvaluated);
  const selected = [];
  const identities = {
    candidateKeys: new Set(),
    listingIds: new Set(existing.listingIds),
    sourceIdentities: new Set(existing.sourceIdentities),
    urls: new Set(existing.urls),
  };

  for (const entry of eligible) {
    const duplicateReason = duplicateReasonFor(entry.identity, entry.candidate.candidate_key, identities);
    if (duplicateReason) {
      rejected.push(toRejected({ ...entry, reason: duplicateReason }));
      continue;
    }
    if (selected.length >= budget) {
      rejected.push(toRejected({ ...entry, reason: "operational_budget_exceeded" }));
      continue;
    }
    selected.push(entry.candidate);
    identities.candidateKeys.add(entry.candidate.candidate_key);
    identities.listingIds.add(entry.identity.listing_id);
    identities.sourceIdentities.add(entry.identity.source_identity);
    identities.urls.add(entry.identity.public_url);
  }

  const providerCounts = countBy(selected, (candidate) => normalizeProvider(candidate?.source?.provider));
  const storefrontKeys = selected.map(resolveCandidateStorefrontKey).filter(Boolean);
  const rejectionReasonCounts = countBy(rejected, (entry) => entry.reason);

  return {
    schema_version: 1,
    target_variant_id: targetVariantId,
    target_series_id: targetSeriesId,
    operational_budget: budget,
    operational_max_budget: MARKET_DEPTH_COLLECTOR_MAX_BUDGET,
    raw_candidate_count: candidates.length,
    eligible_candidate_count: eligible.length,
    selected_count: selected.length,
    selected,
    selected_candidate_keys: selected.map((candidate) => candidate.candidate_key),
    selected_listing_ids: selected.map(candidateIdentity).map((identity) => identity?.listing_id).filter(Boolean),
    provider_counts: providerCounts,
    distinct_listing_count: selected.length,
    known_storefront_count: new Set(storefrontKeys).size,
    unknown_storefront_count: selected.length - storefrontKeys.length,
    rejected_count: rejected.length,
    rejection_reason_counts: rejectionReasonCounts,
    rejected: rejected.sort((left, right) => left.input_index - right.input_index || left.candidate_key.localeCompare(right.candidate_key, "en")),
    product_completion_target: null,
    presentation_threshold_is_collection_target: false,
  };
}

export function buildMarketDepthCollectorRows(selection = {}, options = {}) {
  const selected = Array.isArray(selection.selected) ? selection.selected : [];
  const budget = parseDepthBudget(selection.operational_budget ?? options.budget ?? MARKET_DEPTH_COLLECTOR_DEFAULT_BUDGET);
  if (!selected.length || selected.length > budget || selected.length > MARKET_DEPTH_COLLECTOR_MAX_BUDGET) {
    throw new Error("Depth Collector row selection is empty or exceeds its operational budget.");
  }
  const observed = validDate(options.observedAt ?? new Date());
  const runKey = safeRunKey(options.runKey);
  if (!observed || !runKey) throw new Error("Depth Collector rows require observedAt and runKey.");
  const observedAt = observed.toISOString();

  const pairs = selected.map((candidate) => buildRows(candidate, { runKey, observedAt }));
  const listingRows = pairs.map((pair) => pair.listing);
  const observationRows = pairs.map((pair) => pair.observation);

  assertDistinctRows(listingRows, observationRows);
  return {
    listingRows,
    observationRows,
    projected_writes: {
      listing_inserts: listingRows.length,
      observation_inserts: observationRows.length,
      listing_updates: 0,
      observation_updates: 0,
      deletes: 0,
    },
  };
}

export function buildMarketDepthCollectorDryRun({ selection = {}, rows = null, retrieval = {}, generatedAt = new Date() } = {}) {
  const generated = validDate(generatedAt);
  const projected = rows?.projected_writes ?? {
    listing_inserts: Number(selection.selected_count) || 0,
    observation_inserts: Number(selection.selected_count) || 0,
    listing_updates: 0,
    observation_updates: 0,
    deletes: 0,
  };
  return {
    schema_version: 1,
    kind: "market_depth_collector_dry_run",
    generated_at: generated?.toISOString() ?? null,
    target_variant_id: text(selection.target_variant_id, 180) || null,
    target_series_id: text(selection.target_series_id, 180) || null,
    contract: {
      operational_budget: Number(selection.operational_budget) || 0,
      operational_max_budget: MARKET_DEPTH_COLLECTOR_MAX_BUDGET,
      product_completion_target: null,
      three_listings_is_done: false,
      production_enabled: false,
    },
    retrieval: {
      provider_request_count: nonNegativeInteger(retrieval.provider_request_count),
      raw_candidate_count: Number(selection.raw_candidate_count) || 0,
    },
    selection: {
      eligible_candidate_count: Number(selection.eligible_candidate_count) || 0,
      accepted_count: Number(selection.selected_count) || 0,
      rejected_count: Number(selection.rejected_count) || 0,
      rejection_reason_counts: plainCountObject(selection.rejection_reason_counts),
      provider_counts: plainCountObject(selection.provider_counts),
      distinct_listing_count: Number(selection.distinct_listing_count) || 0,
      known_storefront_count: Number(selection.known_storefront_count) || 0,
      unknown_storefront_count: Number(selection.unknown_storefront_count) || 0,
    },
    projected_writes: projected,
    production_actions: 0,
  };
}

export function parseDepthBudget(value) {
  const budget = Number(value);
  if (!Number.isInteger(budget) || budget < 1 || budget > MARKET_DEPTH_COLLECTOR_MAX_BUDGET) {
    throw new RangeError(`Depth Collector operational budget must be between 1 and ${MARKET_DEPTH_COLLECTOR_MAX_BUDGET}.`);
  }
  return budget;
}

function evaluateCandidate(candidate, context) {
  const candidateKey = text(candidate?.candidate_key, 16);
  if (!CANDIDATE_KEY.test(candidateKey)) return rejectedEvaluation(candidate, context.inputIndex, "invalid_candidate_key");
  if (text(candidate?.target?.variant_id, 180) !== context.targetVariantId) {
    return rejectedEvaluation(candidate, context.inputIndex, "wrong_target_variant");
  }
  if (text(candidate?.target?.series_id, 180) !== context.targetSeriesId) {
    return rejectedEvaluation(candidate, context.inputIndex, "wrong_target_series");
  }
  let safe = false;
  try {
    safe = isEligibleP3BoundedSeedCandidate(candidate);
  } catch {
    safe = false;
  }
  if (!safe) return rejectedEvaluation(candidate, context.inputIndex, "strict_market_safety_rejected");
  const identity = candidateIdentity(candidate);
  if (!identity) return rejectedEvaluation(candidate, context.inputIndex, "invalid_marketplace_identity");
  return { candidate, inputIndex: context.inputIndex, eligible: true, reason: null, identity };
}

function rejectedEvaluation(candidate, inputIndex, reason) {
  return { candidate, inputIndex, eligible: false, reason, identity: null };
}

function candidateIdentity(candidate) {
  try {
    const provider = normalizeProvider(candidate?.source?.provider);
    const sourceListingId = text(candidate?.source?.listing_id, 300);
    const publicUrl = canonicalizeBoundedMarketplaceUrl(candidate?.source?.public_url);
    const source = canonicalMarketplaceSource(provider);
    const listingId = buildMarketplaceListingId({
      provider,
      sourceListingId,
      publicUrl,
      title: candidate?.listing?.title,
    });
    if (!provider || !source || !sourceListingId || !publicUrl || !listingId) return null;
    const resolved = resolveBoundedMarketplaceIdentity({
      id: listingId,
      source,
      source_url: publicUrl,
      raw: { provider, source_listing_id: sourceListingId, public_url: publicUrl },
    });
    if (!resolved.complete || resolved.derivedId !== listingId) return null;
    return {
      provider,
      source,
      source_listing_id: sourceListingId,
      public_url: publicUrl,
      listing_id: listingId,
      source_identity: `${provider}:${sourceListingId}`,
    };
  } catch {
    return null;
  }
}

function duplicateReasonFor(identity, candidateKey, indexes) {
  if (indexes.candidateKeys.has(candidateKey)) return "duplicate_candidate_key";
  if (indexes.listingIds.has(identity.listing_id)) return "duplicate_or_existing_listing_id";
  if (indexes.sourceIdentities.has(identity.source_identity)) return "duplicate_or_existing_source_identity";
  if (indexes.urls.has(identity.public_url)) return "duplicate_or_existing_public_url";
  return null;
}

function indexExistingListings(listings) {
  if (!Array.isArray(listings)) throw new TypeError("Depth Collector existingListings must be an array.");
  const index = { listingIds: new Set(), sourceIdentities: new Set(), urls: new Set() };
  for (const listing of listings) {
    if (text(listing?.id, 180)) index.listingIds.add(text(listing.id, 180));
    const url = canonicalizeBoundedMarketplaceUrl(listing?.source_url);
    if (url) index.urls.add(url);
    try {
      const identity = resolveBoundedMarketplaceIdentity(listing);
      if (identity.complete) {
        index.listingIds.add(identity.derivedId);
        index.sourceIdentities.add(`${identity.provider}:${identity.sourceListingId}`);
        index.urls.add(identity.publicUrl);
      }
    } catch {
      // Existing corrupt/legacy rows do not create new authority. Known id/url are still indexed above.
    }
  }
  return index;
}

function compareEvaluated(left, right) {
  const candidateA = left.candidate;
  const candidateB = right.candidate;
  for (const [a, b] of [
    [candidateA?.checks?.explicit_label_target_match === true, candidateB?.checks?.explicit_label_target_match === true],
    [candidateA?.checks?.parent_series_exact_evidence_present === true, candidateB?.checks?.parent_series_exact_evidence_present === true],
  ]) if (a !== b) return a ? -1 : 1;
  const confidence = Number(candidateB?.assessment?.confidence) - Number(candidateA?.assessment?.confidence);
  return confidence || candidateA.candidate_key.localeCompare(candidateB.candidate_key, "en");
}

function buildRows(candidate, { runKey, observedAt }) {
  const identity = candidateIdentity(candidate);
  if (!identity) throw new Error("Depth Collector selected candidate identity is invalid.");
  let safe = false;
  try {
    safe = isEligibleP3BoundedSeedCandidate(candidate);
  } catch {
    safe = false;
  }
  if (!safe) throw new Error("Depth Collector selected candidate no longer passes strict market safety.");
  const affiliate = buildVerifiedAffiliatePersistenceFields(candidate);
  const storefront = resolveCandidateStorefront(candidate);
  const marker = {
    stage: "market-depth-collector-v1",
    run_key: runKey,
    candidate_key: candidate.candidate_key,
  };
  const marketSafety = {
    accepted: true,
    review_required: false,
    reason: candidate.assessment.reason,
    confidence: Number(candidate.assessment.confidence),
    variant_id: candidate.target.variant_id,
    series_id: candidate.target.series_id,
    listing_type: "single",
  };
  const listing = {
    id: identity.listing_id,
    variant_id: candidate.target.variant_id,
    matched_variant_id: candidate.target.variant_id,
    series_id: candidate.target.series_id,
    title: text(candidate.listing.title, 300),
    listing_type: "single",
    market_review_type: "single",
    classification_reason: candidate.assessment.reason,
    classification_confidence: Number(candidate.assessment.confidence),
    classification_details: { market_safety: marketSafety },
    price: Number(candidate.listing.price),
    status: "active",
    source: identity.source,
    source_type: "marketplace",
    source_url: identity.public_url,
    listed_at: observedAt,
    sold_at: null,
    last_observed_at: observedAt,
    confidence: Number(candidate.assessment.confidence),
    review_required: false,
    raw: {
      provider: identity.provider,
      source_listing_id: identity.source_listing_id,
      public_url: identity.public_url,
      query_text: text(candidate?.target?.search_query, 300),
      query_variant_id: candidate.target.variant_id,
      query_series_id: candidate.target.series_id,
      market_safety_assessed: true,
      market_safety: marketSafety,
      ...storefront,
      ...affiliate,
      market_depth_collector: marker,
    },
  };
  const resolved = resolveBoundedMarketplaceIdentity(listing);
  if (!resolved.complete || resolved.derivedId !== listing.id) throw new Error("Depth Collector built listing identity is inconsistent.");
  const observation = {
    id: stableId("market-depth-collector-observation", runKey, candidate.candidate_key, listing.id),
    listing_id: listing.id,
    variant_id: listing.variant_id,
    series_id: listing.series_id,
    price: listing.price,
    status: listing.status,
    source: listing.source,
    observed_at: observedAt,
    raw: { market_depth_collector: marker },
  };
  return { listing, observation };
}

function resolveCandidateStorefront(candidate) {
  const source = candidate?.source ?? {};
  const record = {
    source: source.provider,
    raw: {
      ...(source.raw && typeof source.raw === "object" && !Array.isArray(source.raw) ? source.raw : {}),
      provider: normalizeProvider(source.provider),
      source_listing_id: text(source.listing_id, 300),
      itemCode: text(source.itemCode ?? source.item_code, 300),
      shopCode: text(source.shopCode ?? source.shop_code, 120),
      shopName: text(source.shopName ?? source.shop_name, 180),
      seller: source.seller && typeof source.seller === "object" && !Array.isArray(source.seller) ? source.seller : undefined,
      sellerId: text(source.sellerId ?? source.seller_id, 120),
    },
  };
  const identity = resolveMarketplaceStorefrontEvidence(record);
  if (!identity.storefront_id) return {};
  return {
    storefront_id: identity.storefront_id,
    storefront_name: identity.storefront_name,
    storefront_identity_source: identity.storefront_identity_source,
  };
}

function resolveCandidateStorefrontKey(candidate) {
  const identity = resolveMarketplaceStorefrontEvidence({
    source: candidate?.source?.provider,
    raw: {
      ...(candidate?.source?.raw && typeof candidate.source.raw === "object" && !Array.isArray(candidate.source.raw) ? candidate.source.raw : {}),
      provider: normalizeProvider(candidate?.source?.provider),
      source_listing_id: text(candidate?.source?.listing_id, 300),
      itemCode: text(candidate?.source?.itemCode ?? candidate?.source?.item_code, 300),
      shopCode: text(candidate?.source?.shopCode ?? candidate?.source?.shop_code, 120),
      seller: candidate?.source?.seller && typeof candidate.source.seller === "object" ? candidate.source.seller : undefined,
      sellerId: text(candidate?.source?.sellerId ?? candidate?.source?.seller_id, 120),
    },
  });
  return storefrontIdentityKey(identity);
}

function assertDistinctRows(listingRows, observationRows) {
  const fields = [
    listingRows.map((row) => row.id),
    listingRows.map((row) => canonicalizeBoundedMarketplaceUrl(row.source_url)),
    listingRows.map((row) => `${row.raw.provider}:${row.raw.source_listing_id}`),
    observationRows.map((row) => row.id),
  ];
  if (listingRows.length !== observationRows.length || fields.some((values) => values.some((value) => !value) || new Set(values).size !== values.length)) {
    throw new Error("Depth Collector built duplicate or incomplete planned rows.");
  }
}

function toRejected(entry) {
  return {
    input_index: entry.inputIndex,
    candidate_key: text(entry?.candidate?.candidate_key, 16),
    reason: entry.reason || "rejected",
  };
}

function countBy(values, keyFor) {
  const counts = {};
  for (const value of values) {
    const key = String(keyFor(value) ?? "").trim();
    if (!key) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function plainCountObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([key, count]) => key && Number.isInteger(Number(count)) && Number(count) >= 0)
    .map(([key, count]) => [key, Number(count)]));
}

function nonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeProvider(value) {
  const provider = text(value, 64).toLowerCase();
  return PROVIDERS.has(provider) ? provider : "";
}

function validDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function safeRunKey(value) {
  const key = text(value, 120);
  return key && /^[A-Za-z0-9._:-]+$/.test(key) ? key : "";
}

function text(value, limit = 1000) {
  return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}
