export const STOCK_EVIDENCE_CONTRACT_VERSION = 1;

const VALID_SCOPES = new Set(["variant", "series", "provider_product", "unresolved"]);

export function buildStockEvidenceContract(record = {}, context = {}) {
  const explicitScopeValue = text(record.evidence_scope || record.evidenceScope || record.stock_scope || record.stockScope || record.scope);
  const explicitScope = normalizeScope(explicitScopeValue);
  const variantId = text(record.variant_id || record.variantId);
  const seriesId = text(record.series_id || record.seriesId);
  const providerProductId = text(record.provider_product_id || record.providerProductId || record.product_id || record.productId);
  const providerJan = text(record.provider_jan || record.providerJan || record.jan_code || record.janCode || record.jan || record.gtin);
  const providerStoreId = text(record.provider_store_id || record.providerStoreId || record.store_id || record.storeId || record.shop_code || record.shopCode);
  const sourceType = text(record.source_type || record.sourceType || record.source || context.source);
  const sourceUrl = text(record.source_url || record.sourceUrl || record.url || context.url);
  const providerReportedAt = nullableText(record.provider_reported_at || record.providerReportedAt || record.reported_at || record.created_at || record.createdAt);
  const providerUpdatedAt = nullableText(record.provider_updated_at || record.providerUpdatedAt || record.updated_at || record.updatedAt || record.last_updated_at || record.lastUpdatedAt);
  const fetchedAt = nullableText(record.fetched_at || record.fetchedAt || context.fetched_at || context.fetchedAt);
  const providerName = text(record.provider || record.provider_name || record.providerName || context.provider);
  const provenance = normalizeProvenance(record.provenance, {
    source: text(context.source || record.source),
    source_name: text(context.source_name || context.sourceName),
    source_type: sourceType,
    provider: providerName,
    feed_url: text(context.url),
  });
  const inferredScope = variantId
    ? "variant"
    : seriesId
      ? "series"
      : providerProductId || providerJan
        ? "provider_product"
        : "unresolved";
  const evidenceScope = explicitScope || inferredScope;
  const reviewReasons = [];

  if (explicitScopeValue && !explicitScope) reviewReasons.push("invalid_evidence_scope");
  if (!sourceUrl) reviewReasons.push("missing_source_url");
  if (!providerReportedAt && !providerUpdatedAt) reviewReasons.push("missing_provider_timestamp");
  if (!hasProvenance(provenance)) reviewReasons.push("missing_provenance");
  if (evidenceScope === "unresolved" && !providerProductId && !providerJan) reviewReasons.push("missing_local_or_provider_identity");
  if (evidenceScope === "series" && variantId) reviewReasons.push("series_scope_with_variant_id");
  if (evidenceScope === "variant" && !variantId && explicitScope === "variant") reviewReasons.push("variant_scope_missing_variant_id");

  const suppliedConfidence = boundedNumber(record.evidence_confidence ?? record.evidenceConfidence ?? record.confidence);
  const confidence = reviewReasons.length ? Math.min(suppliedConfidence ?? 0.25, 0.25) : suppliedConfidence;

  return {
    version: STOCK_EVIDENCE_CONTRACT_VERSION,
    evidence_scope: evidenceScope,
    local_identity: {
      series_id: seriesId || null,
      variant_id: variantId || null,
    },
    provider_identity: {
      provider: providerName || null,
      product_id: providerProductId || null,
      jan: providerJan || null,
      store_id: providerStoreId || null,
    },
    source_url: sourceUrl || null,
    provider_reported_at: providerReportedAt,
    provider_updated_at: providerUpdatedAt,
    fetched_at: fetchedAt,
    provenance,
    stock_state: nullableText(record.stock_state || record.stockState || record.status || record.status_label || record.statusLabel),
    confidence: confidence ?? null,
    review_required: reviewReasons.length > 0,
    review_reasons: reviewReasons,
    raw_evidence: { ...record },
  };
}

export function resolveStockEvidenceTarget(recordOrContract, catalog, context = {}) {
  const contract = isContract(recordOrContract)
    ? recordOrContract
    : buildStockEvidenceContract(recordOrContract, context);
  const seriesById = catalog?.seriesById ?? new Map((catalog?.series ?? []).map((entry) => [entry.id, entry]));
  const variantById = catalog?.variantById ?? new Map((catalog?.variants ?? []).map((entry) => [entry.id, entry]));
  const seriesId = contract.local_identity?.series_id || null;
  const variantId = contract.local_identity?.variant_id || null;

  if (contract.evidence_scope === "series") {
    if (variantId) return blocked(contract, "series_scope_with_variant_id");
    if (!seriesId) return blocked(contract, "series_scope_missing_series_id");
    const series = seriesById.get(seriesId);
    if (!series) return blocked(contract, "invalid_series_id", { supplied_series_id: seriesId });
    return {
      contract,
      evidence_scope: "series",
      series,
      variant: null,
      review_required: true,
      reason: "series_level_persistence_unsupported",
      persistence_blocked: true,
    };
  }

  if (contract.evidence_scope === "variant") {
    if (!variantId) return blocked(contract, "variant_scope_missing_variant_id");
    const variant = variantById.get(variantId);
    if (!variant) return blocked(contract, "invalid_variant_id", { supplied_variant_id: variantId, supplied_series_id: seriesId });
    const derivedSeries = seriesById.get(variant.series_id) ?? null;
    if (seriesId) {
      const suppliedSeries = seriesById.get(seriesId);
      if (!suppliedSeries) return blocked(contract, "invalid_series_id", { supplied_series_id: seriesId, supplied_variant_id: variantId });
      if (variant.series_id !== suppliedSeries.id) {
        return blocked(contract, "variant_series_mismatch", {
          supplied_series_id: suppliedSeries.id,
          supplied_variant_id: variant.id,
          variant_series_id: variant.series_id,
        });
      }
    }
    return resolvedVariant(contract, variant, derivedSeries);
  }

  if (contract.evidence_scope === "provider_product") {
    return blocked(contract, "provider_identity_unresolved");
  }

  const matches = findLegacyVariantMatches(contract.raw_evidence, catalog?.variants ?? []);
  if (matches.length === 1) {
    const variant = matches[0];
    return resolvedVariant(contract, variant, seriesById.get(variant.series_id) ?? null, "legacy_text_variant_match");
  }
  if (matches.length > 1) {
    return {
      contract,
      evidence_scope: "unresolved",
      series: null,
      variant: null,
      review_required: true,
      reason: "ambiguous_variant_text",
      persistence_blocked: false,
      candidate_variant_ids: matches.map((entry) => entry.id),
    };
  }
  return {
    contract,
    evidence_scope: "unresolved",
    series: null,
    variant: null,
    review_required: true,
    reason: "unknown_variant",
    persistence_blocked: false,
  };
}

export function contractFromNormalizedStockRecord(record = {}) {
  const embedded = record?.raw?.stock_contract || record?.stock_contract;
  if (isContract(embedded)) return embedded;
  return buildStockEvidenceContract(record, record?.raw?.fetch_context ?? {});
}

function resolvedVariant(contract, variant, series, reason = "resolved_variant") {
  return {
    contract,
    evidence_scope: "variant",
    series,
    variant,
    review_required: Boolean(contract.review_required),
    reason,
    persistence_blocked: false,
  };
}

function blocked(contract, reason, details = {}) {
  return {
    contract,
    evidence_scope: contract.evidence_scope,
    series: null,
    variant: null,
    review_required: true,
    reason,
    persistence_blocked: true,
    ...details,
  };
}

function findLegacyVariantMatches(record = {}, variants = []) {
  const body = normalize(`${record.text || record.body || record.title || record.name || ""}`);
  if (!body) return [];
  const matches = new Map();
  for (const variant of variants) {
    const terms = [variant.name, variant.slug].filter(Boolean).map(normalize).filter(Boolean);
    if (terms.some((term) => body.includes(term))) matches.set(variant.id, variant);
  }
  return [...matches.values()];
}

function normalizeProvenance(value, fallback) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      source: nullableText(value.source || fallback.source),
      source_name: nullableText(value.source_name || value.sourceName || fallback.source_name),
      source_type: nullableText(value.source_type || value.sourceType || fallback.source_type),
      provider: nullableText(value.provider || fallback.provider),
      feed_url: nullableText(value.feed_url || value.feedUrl || fallback.feed_url),
    };
  }
  if (text(value)) {
    return {
      source: text(value),
      source_name: nullableText(fallback.source_name),
      source_type: nullableText(fallback.source_type),
      provider: nullableText(fallback.provider),
      feed_url: nullableText(fallback.feed_url),
    };
  }
  return {
    source: nullableText(fallback.source),
    source_name: nullableText(fallback.source_name),
    source_type: nullableText(fallback.source_type),
    provider: nullableText(fallback.provider),
    feed_url: nullableText(fallback.feed_url),
  };
}

function hasProvenance(value) {
  return Boolean(value?.source || value?.source_name || value?.source_type || value?.provider || value?.feed_url);
}

function normalizeScope(value) {
  const normalized = text(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) return null;
  if (["variant", "variant_level", "sku", "item"].includes(normalized)) return "variant";
  if (["series", "series_level", "product", "product_level"].includes(normalized)) return "series";
  if (["provider", "provider_product", "provider_identity"].includes(normalized)) return "provider_product";
  if (["unknown", "unresolved", "legacy"].includes(normalized)) return "unresolved";
  return VALID_SCOPES.has(normalized) ? normalized : null;
}

function isContract(value) {
  return Boolean(value && typeof value === "object" && Number(value.version) === STOCK_EVIDENCE_CONTRACT_VERSION && value.local_identity && value.provider_identity);
}

function boundedNumber(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(1, Math.max(0, parsed));
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function nullableText(value) {
  return text(value) || null;
}

function normalize(value = "") {
  return String(value).trim().toLowerCase().replace(/[（）()・･\s_-]+/g, "");
}
