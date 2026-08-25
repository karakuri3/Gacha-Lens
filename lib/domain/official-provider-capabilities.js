export const OFFICIAL_PROVIDER_CAPABILITY_LEVELS = Object.freeze({
  SERIES_METADATA: "SERIES_METADATA",
  VARIANT_CATALOG: "VARIANT_CATALOG",
});

const PROVIDER_PROFILES = Object.freeze({
  kitan_club: Object.freeze({
    source: "kitan_club",
    capability_support: Object.freeze({ SERIES_METADATA: "supported", VARIANT_CATALOG: "supported_when_validated" }),
  }),
  qualia: Object.freeze({
    source: "qualia",
    capability_support: Object.freeze({ SERIES_METADATA: "supported", VARIANT_CATALOG: "conditional_safe_link" }),
  }),
});

export function getOfficialProviderCapabilityProfile(source) {
  const profile = PROVIDER_PROFILES[text(source)];
  if (!profile) throw new Error("Unsupported official provider capability profile.");
  return {
    source: profile.source,
    capability_levels: Object.values(OFFICIAL_PROVIDER_CAPABILITY_LEVELS),
    capability_support: { ...profile.capability_support },
    production_integration_enabled: false,
  };
}

export function buildOfficialProviderCapabilityStatus(source, { metadata = {}, variants = [], sourceCountConflict = false } = {}) {
  const profile = getOfficialProviderCapabilityProfile(source);
  const seriesMetadataSafe = Boolean(text(metadata.series_name) && text(metadata.source_product_id) && text(metadata.official_url) && text(metadata.manufacturer) && (text(metadata.release_date) || text(metadata.release_month)) && Number.isFinite(metadata.price));
  const safeVariants = Array.isArray(variants) && variants.length > 0 && variants.every((variant) => text(variant?.name));
  return {
    ...profile,
    series_metadata_status: seriesMetadataSafe ? "safe" : "unavailable",
    variant_catalog_status: seriesMetadataSafe && safeVariants ? "safe" : "unavailable",
    source_count_conflict: Boolean(sourceCountConflict),
    automatic_production_eligible: false,
  };
}

// This adapter is diagnostic-only. Future ingestion must opt in separately.
export function buildOfficialProviderIntegrationPreview(source, { records = [], metadataRecords = [] } = {}) {
  const profile = getOfficialProviderCapabilityProfile(source);
  const seriesMetadataRecords = [...records, ...metadataRecords]
    .filter((record) => record?.capability?.series_metadata_status === "safe")
    .map((record) => ({ source_product_id: text(record.source_product_id), official_url: text(record.official_url), series_name: text(record.series_name) }));
  const variantCatalogRecords = records
    .filter((record) => record?.capability?.variant_catalog_status === "safe" && record?.capability?.source_count_conflict !== true)
    .map((record) => ({ source_product_id: text(record.source_product_id), variant_count: Array.isArray(record.variants) ? record.variants.length : 0 }));
  return {
    ...profile,
    integration_mode: "diagnostic_only",
    series_metadata_candidate_count: seriesMetadataRecords.length,
    variant_catalog_candidate_count: variantCatalogRecords.length,
    source_count_conflict_excluded_count: records.filter((record) => record?.capability?.source_count_conflict === true).length,
    production_integration_enabled: false,
    automatic_production_eligible: false,
    database_writes: 0,
  };
}

function text(value) { return value == null ? "" : String(value).trim(); }
