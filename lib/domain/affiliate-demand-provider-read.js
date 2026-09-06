import crypto from "node:crypto";

export const AFFILIATE_DEMAND_PROVIDER_READ_CONFIRMATION = "APPROVE_AFFILIATE_DEMAND_PROVIDER_READ_V1";
export const AFFILIATE_DEMAND_PROVIDER_READ_PLAN_KIND = "affiliate_demand_provider_read_plan_v1";
export const AFFILIATE_DEMAND_PROVIDER_READ_MAX_TARGETS = 10;
export const AFFILIATE_DEMAND_PROVIDER_READ_PHASES_PER_TARGET = 2;
export const AFFILIATE_DEMAND_PROVIDER_READ_MAX_ATTEMPTS_PER_PHASE = 3;

const HEAD_SHA = /^[0-9a-f]{40}$/;
const PROVIDERS = Object.freeze({
  rakuten: Object.freeze({
    listing_sources: new Set(["rakuten", "rakuten_ichiba"]),
    raw_providers: new Set(["rakuten", "rakuten_ichiba"]),
    host: "item.rakuten.co.jp",
    required_configuration: Object.freeze(["RAKUTEN_APPLICATION_ID", "RAKUTEN_ACCESS_KEY", "RAKUTEN_AFFILIATE_ID"]),
  }),
  yahoo: Object.freeze({
    listing_sources: new Set(["yahoo", "yahoo_shopping"]),
    raw_providers: new Set(["yahoo", "yahoo_shopping"]),
    host: "store.shopping.yahoo.co.jp",
    required_configuration: Object.freeze(["YAHOO_SHOPPING_APP_ID", "YAHOO_AFFILIATE_TRACKING_ID"]),
  }),
});

export function buildAffiliateDemandProviderReadPlan({
  headSha,
  cohortPlan,
  variants = [],
  series = [],
  marketListings = [],
} = {}) {
  const head = normalizeHead(headSha);
  const cohort = normalizeCohortPlan(cohortPlan);
  const variantById = uniqueIndex(variants, "id", "variant");
  const seriesById = uniqueIndex(series, "id", "series");
  const listingById = uniqueIndex(marketListings, "id", "listing");

  const requests = cohort.targets.map((target) => {
    const variant = variantById.get(target.variant_id);
    const parent = seriesById.get(target.series_id);
    const variantName = clean(variant?.name, 300);
    const seriesName = clean(parent?.name, 300);
    if (!variant || !parent || clean(variant?.series_id, 180) !== target.series_id
      || variant?.review_required === true || parent?.review_required === true || !variantName || !seriesName) {
      throw new Error(`Affiliate provider-read catalog drift: ${target.variant_id}.`);
    }

    const evidence = target.listing_ids.map((listingId) => {
      const listing = listingById.get(listingId);
      return normalizeBoundListing(listing, target);
    }).sort(compareEvidence);

    if (evidence.length !== target.active_safe_listing_count) {
      throw new Error(`Affiliate provider-read listing count drift: ${target.variant_id}/${target.provider}.`);
    }

    const requestKey = crypto.createHash("sha256").update(canonicalJson({
      version: 1,
      variant_id: target.variant_id,
      series_id: target.series_id,
      provider: target.provider,
      clicks_in_window: target.clicks_in_window,
      latest_click_at: target.latest_click_at,
      series_name: seriesName,
      variant_name: variantName,
      listing_evidence: evidence,
    }), "utf8").digest("hex").slice(0, 20);

    return normalizeRequest({
      request_key: `affiliate-read-${requestKey}`,
      request_kind: "affiliate_provenance_refresh_v1",
      variant_id: target.variant_id,
      series_id: target.series_id,
      series_name: seriesName,
      variant_name: variantName,
      provider: target.provider,
      clicks_in_window: target.clicks_in_window,
      latest_click_at: target.latest_click_at,
      listing_evidence: evidence,
      request_sequence: ["discovery", "affiliate_enrichment"],
      required_configuration: [...PROVIDERS[target.provider].required_configuration],
      max_http_attempts_per_phase: AFFILIATE_DEMAND_PROVIDER_READ_MAX_ATTEMPTS_PER_PHASE,
      persistence_authorized: false,
    });
  });

  return normalizeAffiliateDemandProviderReadPlan({
    schema_version: 1,
    kind: AFFILIATE_DEMAND_PROVIDER_READ_PLAN_KIND,
    head_sha: head,
    source_cohort_mode: cohort.mode,
    source_cohort_generated_at: cohort.generated_at,
    source_cohort_selected_count: cohort.targets.length,
    historical_clicks_represented: cohort.historical_clicks_represented,
    requests,
    target_count: requests.length,
    logical_provider_http_requests: requests.length * AFFILIATE_DEMAND_PROVIDER_READ_PHASES_PER_TARGET,
    max_http_attempts: requests.length * AFFILIATE_DEMAND_PROVIDER_READ_PHASES_PER_TARGET * AFFILIATE_DEMAND_PROVIDER_READ_MAX_ATTEMPTS_PER_PHASE,
    configuration_preflight_required: true,
    production_writes: 0,
    rpc_calls: 0,
    workflow_dispatches: 0,
    secrets_or_variables_changes: 0,
    persistence_authorized: false,
    batch_retry_authorized: false,
    approval_reusable: false,
  });
}

export function normalizeAffiliateDemandProviderReadPlan(input = {}) {
  if (!plainObject(input) || input.schema_version !== 1 || input.kind !== AFFILIATE_DEMAND_PROVIDER_READ_PLAN_KIND) {
    throw new Error("Affiliate provider-read plan contract is invalid.");
  }
  const head = normalizeHead(input.head_sha);
  const sourceMode = clean(input.source_cohort_mode, 40);
  const generatedAt = normalizeTimestamp(input.source_cohort_generated_at, "source cohort generated_at");
  const selectedCount = Number(input.source_cohort_selected_count);
  if (sourceMode !== "planning_only" || !Number.isInteger(selectedCount)) {
    throw new Error("Affiliate provider-read source cohort binding is invalid.");
  }
  if (!Array.isArray(input.requests) || input.requests.length < 1 || input.requests.length > AFFILIATE_DEMAND_PROVIDER_READ_MAX_TARGETS
    || selectedCount !== input.requests.length) {
    throw new Error("Affiliate provider-read plan requires 1-10 bound requests.");
  }
  const requests = input.requests.map(normalizeRequest);
  uniqueValues(requests.map((row) => row.request_key), "request key");
  uniqueValues(requests.map((row) => `${row.variant_id}\u0000${row.provider}`), "variant/provider pair");
  uniqueValues(requests.flatMap((row) => row.listing_evidence.map((entry) => entry.listing_id)), "listing identity");

  const targetCount = requests.length;
  const logicalRequests = targetCount * AFFILIATE_DEMAND_PROVIDER_READ_PHASES_PER_TARGET;
  const maxAttempts = logicalRequests * AFFILIATE_DEMAND_PROVIDER_READ_MAX_ATTEMPTS_PER_PHASE;
  const historicalClicks = Number(input.historical_clicks_represented);
  if (!Number.isInteger(historicalClicks) || historicalClicks < 0
    || Number(input.target_count) !== targetCount
    || Number(input.logical_provider_http_requests) !== logicalRequests
    || Number(input.max_http_attempts) !== maxAttempts
    || input.configuration_preflight_required !== true
    || Number(input.production_writes) !== 0 || Number(input.rpc_calls) !== 0 || Number(input.workflow_dispatches) !== 0
    || Number(input.secrets_or_variables_changes) !== 0 || input.persistence_authorized !== false
    || input.batch_retry_authorized !== false || input.approval_reusable !== false) {
    throw new Error("Affiliate provider-read plan safety budget is invalid.");
  }

  return {
    schema_version: 1,
    kind: AFFILIATE_DEMAND_PROVIDER_READ_PLAN_KIND,
    head_sha: head,
    source_cohort_mode: "planning_only",
    source_cohort_generated_at: generatedAt,
    source_cohort_selected_count: targetCount,
    historical_clicks_represented: historicalClicks,
    requests,
    target_count: targetCount,
    logical_provider_http_requests: logicalRequests,
    max_http_attempts: maxAttempts,
    configuration_preflight_required: true,
    production_writes: 0,
    rpc_calls: 0,
    workflow_dispatches: 0,
    secrets_or_variables_changes: 0,
    persistence_authorized: false,
    batch_retry_authorized: false,
    approval_reusable: false,
  };
}

export function buildAffiliateDemandProviderReadDigest({ headSha, readPlan } = {}) {
  const head = normalizeHead(headSha);
  const plan = normalizeAffiliateDemandProviderReadPlan(readPlan);
  if (plan.head_sha !== head) throw new Error("Affiliate provider-read digest head does not match the bound plan.");
  return crypto.createHash("sha256").update(canonicalJson({
    version: 1,
    kind: "affiliate_demand_provider_read_v1",
    head_sha: head,
    read_plan: plan,
  }), "utf8").digest("hex");
}

export function expectedAffiliateDemandProviderReadApproval({ headSha, readPlan } = {}) {
  const head = normalizeHead(headSha);
  const digest = buildAffiliateDemandProviderReadDigest({ headSha: head, readPlan });
  return `${AFFILIATE_DEMAND_PROVIDER_READ_CONFIRMATION}:${head}:${digest}`;
}

export function validateAffiliateDemandProviderReadInvocation(input = {}) {
  const mode = clean(input.mode, 40);
  const head = normalizeHead(input.head_sha);
  const expectedMain = normalizeHead(input.expected_main_sha);
  const readPlan = normalizeAffiliateDemandProviderReadPlan(input.read_plan);
  if (!["dry-run", "provider-read"].includes(mode) || head !== expectedMain || readPlan.head_sha !== head) {
    throw new Error("Affiliate provider-read invocation is not exactly bound to current main.");
  }
  const digest = buildAffiliateDemandProviderReadDigest({ headSha: head, readPlan });
  const approval = clean(input.approval, 400);
  if (mode === "dry-run") {
    if (approval) throw new Error("Affiliate provider-read dry-run must not include live-provider authorization.");
    return invocationResult({ mode, head, digest, readPlan, authorized: false });
  }
  if (approval !== `${AFFILIATE_DEMAND_PROVIDER_READ_CONFIRMATION}:${head}:${digest}`) {
    throw new Error("Affiliate provider-read approval is invalid.");
  }
  return invocationResult({ mode, head, digest, readPlan, authorized: true });
}

function normalizeCohortPlan(input) {
  if (!plainObject(input) || input.schema_version !== 1 || input.mode !== "planning_only") {
    throw new Error("Affiliate provider-read requires a planning-only cohort plan.");
  }
  const generatedAt = normalizeTimestamp(input.generated_at, "cohort generated_at");
  const selectedCount = Number(input.selected_count);
  const requestedCount = Number(input.requested_cohort_size);
  const historicalClicks = Number(input.historical_clicks_represented);
  const execution = input.execution;
  if (!Number.isInteger(selectedCount) || selectedCount < 1 || selectedCount > AFFILIATE_DEMAND_PROVIDER_READ_MAX_TARGETS
    || !Number.isInteger(requestedCount) || requestedCount < selectedCount || requestedCount > AFFILIATE_DEMAND_PROVIDER_READ_MAX_TARGETS
    || !Number.isInteger(historicalClicks) || historicalClicks < 1 || !plainObject(execution)
    || Number(execution.provider_requests) !== 0 || Number(execution.production_writes) !== 0 || Number(execution.rpc_calls) !== 0
    || Number(execution.workflow_dispatches) !== 0 || Number(execution.secrets_or_variables_changes) !== 0
    || execution.approval_reusable !== false) {
    throw new Error("Affiliate provider-read cohort safety contract is invalid.");
  }
  if (!Array.isArray(input.targets) || input.targets.length !== selectedCount) {
    throw new Error("Affiliate provider-read cohort target count is invalid.");
  }
  const targets = input.targets.map((target) => {
    const variantId = clean(target?.variant_id, 180);
    const seriesId = clean(target?.series_id, 180);
    const provider = clean(target?.provider, 40).toLowerCase();
    const clicks = Number(target?.clicks_in_window);
    const latestClick = normalizeTimestamp(target?.latest_click_at, "target latest_click_at");
    const activeCount = Number(target?.active_safe_listing_count);
    const listingIds = Array.isArray(target?.listing_ids)
      ? target.listing_ids.map((value) => clean(value, 180)).filter(Boolean).sort((a, b) => a.localeCompare(b, "en"))
      : [];
    if (!variantId || !seriesId || !PROVIDERS[provider] || !Number.isInteger(clicks) || clicks < 1
      || !Number.isInteger(activeCount) || activeCount < 1 || activeCount !== listingIds.length
      || new Set(listingIds).size !== listingIds.length || target?.affiliate_provenance_present !== false) {
      throw new Error("Affiliate provider-read cohort target is invalid.");
    }
    return {
      variant_id: variantId,
      series_id: seriesId,
      provider,
      clicks_in_window: clicks,
      latest_click_at: latestClick,
      active_safe_listing_count: activeCount,
      listing_ids: listingIds,
    };
  });
  uniqueValues(targets.map((row) => `${row.variant_id}\u0000${row.provider}`), "cohort variant/provider pair");
  uniqueValues(targets.flatMap((row) => row.listing_ids), "cohort listing identity");
  if (targets.reduce((sum, target) => sum + target.clicks_in_window, 0) !== historicalClicks) {
    throw new Error("Affiliate provider-read cohort click metric is inconsistent.");
  }
  return { mode: "planning_only", generated_at: generatedAt, historical_clicks_represented: historicalClicks, targets };
}

function normalizeBoundListing(listing, target) {
  if (!plainObject(listing)) throw new Error(`Affiliate provider-read missing listing evidence: ${target.variant_id}/${target.provider}.`);
  const listingId = clean(listing.id, 180);
  const listingVariantId = resolveListingVariantId(listing);
  const provider = resolveListingProvider(listing);
  const publicUrl = normalizeProviderUrl(listing.source_url, target.provider);
  const nativeId = resolveNativeId(listing, target.provider);
  if (!listingId || listingVariantId !== target.variant_id || provider !== target.provider || !publicUrl || !nativeId
    || listing.status !== "active" || listing.listing_type !== "single" || listing.review_required === true
    || hasAffiliateProvenance(listing)) {
    throw new Error(`Affiliate provider-read listing drift: ${listingId || "unknown"}.`);
  }
  return {
    listing_id: listingId,
    provider: target.provider,
    provider_native_id: nativeId,
    public_url: publicUrl,
  };
}

function normalizeRequest(input) {
  if (!plainObject(input)) throw new Error("Affiliate provider-read request is invalid.");
  const requestKey = clean(input.request_key, 80).toLowerCase();
  const variantId = clean(input.variant_id, 180);
  const seriesId = clean(input.series_id, 180);
  const seriesName = clean(input.series_name, 300);
  const variantName = clean(input.variant_name, 300);
  const provider = clean(input.provider, 40).toLowerCase();
  const clicks = Number(input.clicks_in_window);
  const latestClick = normalizeTimestamp(input.latest_click_at, "request latest_click_at");
  const evidence = Array.isArray(input.listing_evidence) ? input.listing_evidence.map((entry) => normalizeEvidence(entry, provider)).sort(compareEvidence) : [];
  const requiredConfiguration = Array.isArray(input.required_configuration)
    ? input.required_configuration.map((value) => clean(value, 100)).filter(Boolean)
    : [];
  if (!/^affiliate-read-[0-9a-f]{20}$/.test(requestKey) || input.request_kind !== "affiliate_provenance_refresh_v1"
    || !variantId || !seriesId || !seriesName || !variantName || !PROVIDERS[provider]
    || !Number.isInteger(clicks) || clicks < 1 || evidence.length < 1
    || !sameArray(input.request_sequence, ["discovery", "affiliate_enrichment"])
    || !sameArray(requiredConfiguration, PROVIDERS[provider].required_configuration)
    || Number(input.max_http_attempts_per_phase) !== AFFILIATE_DEMAND_PROVIDER_READ_MAX_ATTEMPTS_PER_PHASE
    || input.persistence_authorized !== false) {
    throw new Error("Affiliate provider-read request fields are invalid.");
  }
  uniqueValues(evidence.map((entry) => entry.listing_id), "request listing identity");
  uniqueValues(evidence.map((entry) => entry.provider_native_id), "request provider native identity");
  uniqueValues(evidence.map((entry) => entry.public_url), "request public URL identity");
  return {
    request_key: requestKey,
    request_kind: "affiliate_provenance_refresh_v1",
    variant_id: variantId,
    series_id: seriesId,
    series_name: seriesName,
    variant_name: variantName,
    provider,
    clicks_in_window: clicks,
    latest_click_at: latestClick,
    listing_evidence: evidence,
    request_sequence: ["discovery", "affiliate_enrichment"],
    required_configuration: [...PROVIDERS[provider].required_configuration],
    max_http_attempts_per_phase: AFFILIATE_DEMAND_PROVIDER_READ_MAX_ATTEMPTS_PER_PHASE,
    persistence_authorized: false,
  };
}

function normalizeEvidence(input, provider) {
  if (!plainObject(input) || !PROVIDERS[provider]) throw new Error("Affiliate provider-read listing evidence is invalid.");
  const listingId = clean(input.listing_id, 180);
  const evidenceProvider = clean(input.provider, 40).toLowerCase();
  const nativeId = clean(input.provider_native_id, 300);
  const publicUrl = normalizeProviderUrl(input.public_url, provider);
  if (!listingId || evidenceProvider !== provider || !nativeId || !publicUrl) {
    throw new Error("Affiliate provider-read listing evidence fields are invalid.");
  }
  return { listing_id: listingId, provider, provider_native_id: nativeId, public_url: publicUrl };
}

function invocationResult({ mode, head, digest, readPlan, authorized }) {
  return {
    schema_version: 1,
    kind: "affiliate_demand_provider_read_invocation",
    mode,
    head_sha: head,
    batch_digest: digest,
    provider_read_authorized: authorized,
    configuration_preflight_required: true,
    target_count: readPlan.target_count,
    logical_provider_http_requests: readPlan.logical_provider_http_requests,
    max_http_attempts: readPlan.max_http_attempts,
    production_writes: 0,
    rpc_calls: 0,
    workflow_dispatches: 0,
    secrets_or_variables_changes: 0,
    persistence_authorized: false,
    batch_retry_authorized: false,
    approval_reusable: false,
    read_plan: readPlan,
  };
}

function resolveListingVariantId(row) {
  const variantId = clean(row?.variant_id, 180);
  const matchedVariantId = clean(row?.matched_variant_id, 180);
  if (variantId && matchedVariantId && variantId !== matchedVariantId) return "";
  return variantId || matchedVariantId;
}

function resolveListingProvider(row) {
  const source = clean(row?.source, 40).toLowerCase();
  const payload = marketplacePayload(row);
  const rawProvider = clean(payload.provider, 40).toLowerCase();
  const sourceProvider = canonicalProvider(source);
  const payloadProvider = canonicalProvider(rawProvider);
  if (source && rawProvider && (!sourceProvider || !payloadProvider || sourceProvider !== payloadProvider)) return "";
  return payloadProvider || sourceProvider;
}

function resolveNativeId(row, provider) {
  const payload = marketplacePayload(row);
  if (provider === "rakuten") return clean(payload.itemCode || payload.source_listing_id, 300);
  if (provider === "yahoo") return clean(payload.code || payload.source_listing_id, 300);
  return "";
}

function hasAffiliateProvenance(row) {
  const payload = marketplacePayload(row);
  return Boolean(clean(payload.affiliate_url) && clean(payload.affiliate_url_source)
    && clean(payload.affiliate_url_contract) && clean(payload.source_documentation || payload.affiliate_url_documentation));
}

function marketplacePayload(row) {
  const outer = plainObject(row?.raw) ? row.raw : {};
  const nested = plainObject(outer.raw) ? outer.raw : {};
  return { ...outer, ...nested };
}

function normalizeProviderUrl(value, provider) {
  try {
    const url = new URL(clean(value, 2000));
    if (url.protocol !== "https:" || url.username || url.password || url.hostname.toLowerCase() !== PROVIDERS[provider]?.host) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function canonicalProvider(value) {
  const normalized = clean(value, 40).toLowerCase();
  if (PROVIDERS.rakuten.listing_sources.has(normalized) || PROVIDERS.rakuten.raw_providers.has(normalized)) return "rakuten";
  if (PROVIDERS.yahoo.listing_sources.has(normalized) || PROVIDERS.yahoo.raw_providers.has(normalized)) return "yahoo";
  return "";
}

function uniqueIndex(rows, field, label) {
  const index = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = clean(row?.[field], 180);
    if (!key) continue;
    if (index.has(key)) throw new Error(`Affiliate provider-read duplicate ${label} identity: ${key}.`);
    index.set(key, row);
  }
  return index;
}

function uniqueValues(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`Affiliate provider-read duplicate ${label}.`);
}

function compareEvidence(a, b) {
  return a.listing_id.localeCompare(b.listing_id, "en")
    || a.provider_native_id.localeCompare(b.provider_native_id, "en")
    || a.public_url.localeCompare(b.public_url, "en");
}

function normalizeTimestamp(value, label) {
  const parsed = Date.parse(clean(value, 80));
  if (!Number.isFinite(parsed)) throw new Error(`Affiliate provider-read ${label} is invalid.`);
  return new Date(parsed).toISOString();
}

function normalizeHead(value) {
  const head = clean(value, 40).toLowerCase();
  if (!HEAD_SHA.test(head)) throw new Error("Affiliate provider-read requires an exact 40-character main SHA.");
  return head;
}

function canonicalJson(value) {
  return JSON.stringify(sortCanonical(value));
}

function sortCanonical(value) {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (!plainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort((a, b) => a.localeCompare(b, "en")).map((key) => [key, sortCanonical(value[key])]));
}

function sameArray(left, right) {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function clean(value, limit = 1000) {
  return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function plainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
