import fs from "node:fs";

const SCHEMA_VERSION = 1;
const PROFILE_NAME = "manual_canary_diversity";
const CANDIDATE_KEY = /^[0-9a-f]{16}$/;
const REASON_CODE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const ROOT_KEYS = new Set(["schema_version", "profile", "max_variants_per_series", "blocked_variants"]);
const BLOCKED_KEYS = new Set(["variant_id", "reason", "evidence_candidate_key"]);

export function loadMarketManualCanarySelectionProfile(filePath) {
  if (!filePath) throw new Error("Manual canary selection profile path is required.");
  let source;
  try {
    source = fs.readFileSync(filePath, "utf8");
  } catch {
    throw new Error("Manual canary selection profile could not be read.");
  }
  try {
    return parseMarketManualCanarySelectionProfile(JSON.parse(source));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Manual canary selection profile JSON is invalid.");
    throw error;
  }
}

export function parseMarketManualCanarySelectionProfile(value) {
  if (!plainObject(value)) throw new Error("Manual canary selection profile must be an object.");
  rejectUnknownKeys(value, ROOT_KEYS, "profile");
  if (value.schema_version !== SCHEMA_VERSION) throw new Error("Unsupported manual canary selection schema.");
  if (value.profile !== PROFILE_NAME) throw new Error("Unsupported manual canary selection profile.");
  const maxVariantsPerSeries = Number(value.max_variants_per_series);
  if (!Number.isInteger(maxVariantsPerSeries) || maxVariantsPerSeries < 1 || maxVariantsPerSeries > 200) {
    throw new Error("Manual canary series cap is invalid.");
  }
  if (!Array.isArray(value.blocked_variants)) throw new Error("Manual canary blocked variants must be an array.");

  const blockedVariants = value.blocked_variants.map((entry) => {
    if (!plainObject(entry)) throw new Error("Manual canary blocked variant must be an object.");
    rejectUnknownKeys(entry, BLOCKED_KEYS, "blocked variant");
    const variantId = boundedText(entry.variant_id, 200);
    const reason = boundedText(entry.reason, 100);
    const evidenceCandidateKey = boundedText(entry.evidence_candidate_key, 16);
    if (!variantId) throw new Error("Manual canary blocked variant ID is invalid.");
    if (!REASON_CODE.test(reason)) throw new Error("Manual canary blocked variant reason is invalid.");
    if (!CANDIDATE_KEY.test(evidenceCandidateKey)) {
      throw new Error("Manual canary blocked variant evidence key is invalid.");
    }
    return {
      variant_id: variantId,
      reason,
      evidence_candidate_key: evidenceCandidateKey,
    };
  });
  const ids = blockedVariants.map((entry) => entry.variant_id);
  if (new Set(ids).size !== ids.length) throw new Error("Manual canary blocked variant IDs must be unique.");

  return Object.freeze({
    schema_version: SCHEMA_VERSION,
    profile: PROFILE_NAME,
    max_variants_per_series: maxVariantsPerSeries,
    blocked_variants: Object.freeze(blockedVariants.map(Object.freeze)),
  });
}

export function shouldApplyMarketManualCanarySelection({
  task,
  mode,
  executeSources,
  eventName,
} = {}) {
  return task === "market"
    && mode === "dry-run"
    && executeSources === true
    && eventName === "workflow_dispatch";
}

export function manualCanarySelectionOptions(profile) {
  const parsed = parseMarketManualCanarySelectionProfile(profile);
  return {
    excludedVariantIds: parsed.blocked_variants.map((entry) => entry.variant_id),
    maxVariantsPerSeries: parsed.max_variants_per_series,
  };
}

export function buildMarketManualCanarySelectionDiagnostics(profile, summary = {}) {
  const parsed = parseMarketManualCanarySelectionProfile(profile);
  return {
    name: parsed.profile,
    max_variants_per_series: parsed.max_variants_per_series,
    blocked_variant_count: parsed.blocked_variants.length,
    blocked_variants_skipped: nonNegativeInteger(summary.skipped_excluded_variants),
    series_cap_skipped: nonNegativeInteger(summary.skipped_series_cap),
    distinct_series_selected: nonNegativeInteger(summary.distinct_series_selected),
    selected_variant_count: nonNegativeInteger(summary.selected_variants),
  };
}

export function sanitizeMarketManualCanarySelectionDiagnostics(value) {
  if (value == null) return null;
  if (!plainObject(value) || value.name !== PROFILE_NAME) {
    throw new Error("Manual canary selection diagnostics are invalid.");
  }
  const maxVariantsPerSeries = positiveInteger(value.max_variants_per_series);
  return {
    name: PROFILE_NAME,
    max_variants_per_series: maxVariantsPerSeries,
    blocked_variant_count: nonNegativeInteger(value.blocked_variant_count),
    blocked_variants_skipped: nonNegativeInteger(value.blocked_variants_skipped),
    series_cap_skipped: nonNegativeInteger(value.series_cap_skipped),
    distinct_series_selected: nonNegativeInteger(value.distinct_series_selected),
    selected_variant_count: nonNegativeInteger(value.selected_variant_count),
  };
}

function rejectUnknownKeys(value, allowed, label) {
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error(`Manual canary ${label} contains an unsupported field.`);
  }
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedText(value, maxLength) {
  const text = String(value ?? "").normalize("NFKC").trim();
  return text.length <= maxLength ? text : "";
}

function positiveInteger(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 200) {
    throw new Error("Manual canary selection diagnostics contain an invalid series cap.");
  }
  return number;
}

function nonNegativeInteger(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error("Manual canary selection diagnostics contain an invalid count.");
  }
  return number;
}
