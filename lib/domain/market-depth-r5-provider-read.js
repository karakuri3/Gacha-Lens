import crypto from "node:crypto";

export const MARKET_DEPTH_R5_PROVIDER_READ_CONFIRMATION = "APPROVE_MARKET_DEPTH_R5_PROVIDER_READ_V1";
export const MARKET_DEPTH_R5_PROVIDER_READ_PLAN_KIND = "market_depth_r5_provider_read_plan_v1";
export const MARKET_DEPTH_R5_PROVIDER_READ_MAX_TARGETS = 10;
export const MARKET_DEPTH_R5_PROVIDER_READ_MAX_ATTEMPTS_PER_REQUEST = 3;

const HEAD_SHA = /^[0-9a-f]{40}$/;
const SOURCES = new Set(["rakuten", "yahoo_shopping"]);

export function buildMarketDepthR5ProviderReadPlan({ headSha, cohortPlan, variants = [], series = [] } = {}) {
  const head = normalizeHead(headSha);
  const cohort = normalizeCohortPlan(cohortPlan);
  const variantById = new Map(array(variants).map((row) => [clean(row?.id, 180), row]));
  const seriesById = new Map(array(series).map((row) => [clean(row?.id, 180), row]));
  const requests = cohort.targets.map((target) => {
    const variant = variantById.get(target.variant_id);
    const parent = seriesById.get(target.series_id);
    const variantName = clean(variant?.name, 300);
    const seriesName = clean(parent?.name, 300);
    if (!variant || !parent || clean(variant?.series_id, 180) !== target.series_id
      || variant?.review_required === true || parent?.review_required === true || !variantName || !seriesName) {
      throw new Error(`R5 provider-read catalog drift: ${target.variant_id}.`);
    }
    const requestKey = crypto.createHash("sha256").update(canonicalJson({
      version: 1,
      variant_id: target.variant_id,
      series_id: target.series_id,
      current_source: target.current_source,
      target_source: target.target_source,
      expected_existing_listing_ids: target.expected_existing_listing_ids,
      series_name: seriesName,
      variant_name: variantName,
    }), "utf8").digest("hex").slice(0, 20);
    return {
      request_key: `r5-read-${requestKey}`,
      request_kind: "market_depth_root_v1",
      variant_id: target.variant_id,
      series_id: target.series_id,
      series_name: seriesName,
      variant_name: variantName,
      current_source: target.current_source,
      target_source: target.target_source,
      expected_existing_listing_ids: [...target.expected_existing_listing_ids],
      affiliate_enrichment: false,
      max_http_attempts: MARKET_DEPTH_R5_PROVIDER_READ_MAX_ATTEMPTS_PER_REQUEST,
    };
  });
  return normalizeMarketDepthR5ProviderReadPlan({
    schema_version: 1,
    kind: MARKET_DEPTH_R5_PROVIDER_READ_PLAN_KIND,
    head_sha: head,
    source_cohort_kind: cohort.kind,
    source_cohort_size: cohort.targets.length,
    requests,
    logical_provider_requests: requests.length,
    max_http_attempts: requests.length * MARKET_DEPTH_R5_PROVIDER_READ_MAX_ATTEMPTS_PER_REQUEST,
    affiliate_enrichment: false,
    production_writes: 0,
    rpc_calls: 0,
    workflow_dispatches: 0,
    batch_retry_authorized: false,
    approval_reusable: false,
  });
}

export function normalizeMarketDepthR5ProviderReadPlan(input = {}) {
  if (!plainObject(input) || input.schema_version !== 1 || input.kind !== MARKET_DEPTH_R5_PROVIDER_READ_PLAN_KIND) {
    throw new Error("R5 provider-read plan contract is invalid.");
  }
  const head = normalizeHead(input.head_sha);
  const sourceCohortKind = clean(input.source_cohort_kind, 100);
  const sourceCohortSize = Number(input.source_cohort_size);
  if (sourceCohortKind !== "market_depth_r5_cohort_plan" || !Number.isInteger(sourceCohortSize)) {
    throw new Error("R5 provider-read source cohort binding is invalid.");
  }
  if (!Array.isArray(input.requests) || input.requests.length < 1 || input.requests.length > MARKET_DEPTH_R5_PROVIDER_READ_MAX_TARGETS
    || sourceCohortSize !== input.requests.length) {
    throw new Error("R5 provider-read plan requires 1-10 bound requests.");
  }
  const requests = input.requests.map(normalizeRequest);
  for (const values of [
    requests.map((row) => row.request_key),
    requests.map((row) => row.variant_id),
    requests.map((row) => row.series_id),
    requests.flatMap((row) => row.expected_existing_listing_ids),
  ]) {
    if (new Set(values).size !== values.length) throw new Error("R5 provider-read plan contains duplicate identity.");
  }
  if (Number(input.logical_provider_requests) !== requests.length
    || Number(input.max_http_attempts) !== requests.length * MARKET_DEPTH_R5_PROVIDER_READ_MAX_ATTEMPTS_PER_REQUEST
    || input.affiliate_enrichment !== false || Number(input.production_writes) !== 0 || Number(input.rpc_calls) !== 0
    || Number(input.workflow_dispatches) !== 0 || input.batch_retry_authorized !== false || input.approval_reusable !== false) {
    throw new Error("R5 provider-read plan safety budget is invalid.");
  }
  return {
    schema_version: 1,
    kind: MARKET_DEPTH_R5_PROVIDER_READ_PLAN_KIND,
    head_sha: head,
    source_cohort_kind: sourceCohortKind,
    source_cohort_size: sourceCohortSize,
    requests,
    logical_provider_requests: requests.length,
    max_http_attempts: requests.length * MARKET_DEPTH_R5_PROVIDER_READ_MAX_ATTEMPTS_PER_REQUEST,
    affiliate_enrichment: false,
    production_writes: 0,
    rpc_calls: 0,
    workflow_dispatches: 0,
    batch_retry_authorized: false,
    approval_reusable: false,
  };
}

export function buildMarketDepthR5ProviderReadDigest({ headSha, readPlan } = {}) {
  const head = normalizeHead(headSha);
  const plan = normalizeMarketDepthR5ProviderReadPlan(readPlan);
  if (plan.head_sha !== head) throw new Error("R5 provider-read digest head does not match the bound plan.");
  return crypto.createHash("sha256").update(canonicalJson({
    version: 1,
    kind: "market_depth_r5_provider_read_v1",
    head_sha: head,
    read_plan: plan,
  }), "utf8").digest("hex");
}

export function expectedMarketDepthR5ProviderReadApproval({ headSha, readPlan } = {}) {
  const head = normalizeHead(headSha);
  const digest = buildMarketDepthR5ProviderReadDigest({ headSha: head, readPlan });
  return `${MARKET_DEPTH_R5_PROVIDER_READ_CONFIRMATION}:${head}:${digest}`;
}

export function validateMarketDepthR5ProviderReadInvocation(input = {}) {
  const mode = clean(input.mode, 40);
  const head = normalizeHead(input.head_sha);
  const expectedMain = normalizeHead(input.expected_main_sha);
  const readPlan = normalizeMarketDepthR5ProviderReadPlan(input.read_plan);
  if (!["dry-run", "provider-read"].includes(mode) || head !== expectedMain || readPlan.head_sha !== head) {
    throw new Error("R5 provider-read invocation is not exactly bound to current main.");
  }
  const digest = buildMarketDepthR5ProviderReadDigest({ headSha: head, readPlan });
  const approval = clean(input.approval, 400);
  if (mode === "dry-run") {
    if (approval) throw new Error("R5 provider-read dry-run must not include live-provider authorization.");
    return invocationResult({ mode, head, digest, readPlan, authorized: false });
  }
  if (approval !== `${MARKET_DEPTH_R5_PROVIDER_READ_CONFIRMATION}:${head}:${digest}`) {
    throw new Error("R5 provider-read approval is invalid.");
  }
  return invocationResult({ mode, head, digest, readPlan, authorized: true });
}

function normalizeCohortPlan(input) {
  if (!plainObject(input) || input.schema_version !== 1 || input.kind !== "market_depth_r5_cohort_plan"
    || input.complete !== true || Number(input.cohort_size_selected) !== Number(input.cohort_size_requested)
    || Number(input.provider_requests) !== 0 || Number(input.production_writes) !== 0 || Number(input.workflow_dispatches) !== 0
    || input?.policy?.exact_eligible_depth !== 1 || input?.policy?.one_variant_per_series !== true) {
    throw new Error("R5 provider-read requires a complete fail-closed cohort plan.");
  }
  if (!Array.isArray(input.targets) || input.targets.length < 1 || input.targets.length > MARKET_DEPTH_R5_PROVIDER_READ_MAX_TARGETS
    || Number(input.cohort_size_selected) !== input.targets.length) {
    throw new Error("R5 provider-read cohort target count is invalid.");
  }
  const targets = input.targets.map((target) => {
    const variantId = clean(target?.variant_id, 180);
    const seriesId = clean(target?.series_id, 180);
    const currentSource = clean(target?.current_source, 40).toLowerCase();
    const targetSource = clean(target?.target_source, 40).toLowerCase();
    const expectedExisting = Array.isArray(target?.expected_existing_listing_ids)
      ? target.expected_existing_listing_ids.map((value) => clean(value, 180)).filter(Boolean).sort((a, b) => a.localeCompare(b, "en"))
      : [];
    if (!variantId || !seriesId || !SOURCES.has(currentSource) || !SOURCES.has(targetSource) || currentSource === targetSource
      || oppositeSource(currentSource) !== targetSource || expectedExisting.length !== 1) {
      throw new Error("R5 provider-read cohort target is invalid.");
    }
    return {
      variant_id: variantId,
      series_id: seriesId,
      current_source: currentSource,
      target_source: targetSource,
      expected_existing_listing_ids: expectedExisting,
    };
  });
  if (new Set(targets.map((row) => row.variant_id)).size !== targets.length
    || new Set(targets.map((row) => row.series_id)).size !== targets.length) {
    throw new Error("R5 provider-read cohort must keep one variant per series.");
  }
  return { kind: "market_depth_r5_cohort_plan", targets };
}

function normalizeRequest(input) {
  if (!plainObject(input)) throw new Error("R5 provider-read request is invalid.");
  const requestKey = clean(input.request_key, 80).toLowerCase();
  const variantId = clean(input.variant_id, 180);
  const seriesId = clean(input.series_id, 180);
  const seriesName = clean(input.series_name, 300);
  const variantName = clean(input.variant_name, 300);
  const currentSource = clean(input.current_source, 40).toLowerCase();
  const targetSource = clean(input.target_source, 40).toLowerCase();
  const expectedExisting = Array.isArray(input.expected_existing_listing_ids)
    ? input.expected_existing_listing_ids.map((value) => clean(value, 180)).filter(Boolean).sort((a, b) => a.localeCompare(b, "en"))
    : [];
  if (!/^r5-read-[0-9a-f]{20}$/.test(requestKey) || input.request_kind !== "market_depth_root_v1"
    || !variantId || !seriesId || !seriesName || !variantName || !SOURCES.has(currentSource) || !SOURCES.has(targetSource)
    || oppositeSource(currentSource) !== targetSource || expectedExisting.length !== 1
    || input.affiliate_enrichment !== false || Number(input.max_http_attempts) !== MARKET_DEPTH_R5_PROVIDER_READ_MAX_ATTEMPTS_PER_REQUEST) {
    throw new Error("R5 provider-read request fields are invalid.");
  }
  return {
    request_key: requestKey,
    request_kind: "market_depth_root_v1",
    variant_id: variantId,
    series_id: seriesId,
    series_name: seriesName,
    variant_name: variantName,
    current_source: currentSource,
    target_source: targetSource,
    expected_existing_listing_ids: expectedExisting,
    affiliate_enrichment: false,
    max_http_attempts: MARKET_DEPTH_R5_PROVIDER_READ_MAX_ATTEMPTS_PER_REQUEST,
  };
}

function invocationResult({ mode, head, digest, readPlan, authorized }) {
  return {
    schema_version: 1,
    kind: "market_depth_r5_provider_read_invocation",
    mode,
    head_sha: head,
    batch_digest: digest,
    provider_read_authorized: authorized,
    logical_provider_requests: readPlan.logical_provider_requests,
    max_http_attempts: readPlan.max_http_attempts,
    production_writes: 0,
    rpc_calls: 0,
    workflow_dispatches: 0,
    affiliate_enrichment: false,
    batch_retry_authorized: false,
    approval_reusable: false,
    read_plan: readPlan,
  };
}

function oppositeSource(source) {
  if (source === "rakuten") return "yahoo_shopping";
  if (source === "yahoo_shopping") return "rakuten";
  return null;
}

function normalizeHead(value) {
  const head = clean(value, 40).toLowerCase();
  if (!HEAD_SHA.test(head)) throw new Error("R5 provider-read requires an exact 40-character main SHA.");
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

function array(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value, limit = 1000) {
  return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function plainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
