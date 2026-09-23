import { createHash } from "node:crypto";
import { buildVariantImagePresentation } from "./variant-image-presentation.js";

export const PARENT_IMAGE_CONFLICT_REASON = "exact_parent_image_presented_as_series_fallback";

export function buildVariantParentImageConflictAudit(input = {}) {
  const records = Array.isArray(input.records) ? input.records : [];
  const candidates = [];
  const rejected = [];
  const typeCounts = {};

  for (let index = 0; index < records.length; index += 1) {
    const result = classifyVariantParentImageConflict(records[index], index);
    if (result.candidate) {
      candidates.push(result.candidate);
      const type = result.candidate.variant_type || "unknown";
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    } else {
      rejected.push(result.rejection);
    }
  }

  candidates.sort((left, right) => left.variant_id.localeCompare(right.variant_id, "en"));
  rejected.sort((left, right) => left.index - right.index);
  const candidateIds = candidates.map((item) => item.variant_id);
  const digest = createHash("sha256")
    .update(JSON.stringify(candidateIds))
    .digest("hex");

  return {
    schema_version: 1,
    mode: "offline_read_only",
    record_count: records.length,
    candidate_count: candidates.length,
    candidate_type_counts: sortObject(typeCounts),
    candidate_set_sha256: `sha256:${digest}`,
    candidates,
    rejected_count: rejected.length,
    rejection_counts: countBy(rejected, (item) => item.reason),
    safety: {
      network_requests: 0,
      credential_reads: 0,
      production_reads: 0,
      database_writes: 0,
    },
  };
}

export function classifyVariantParentImageConflict(record = {}, index = 0) {
  const variant = record.variant || {};
  const parent = record.parent || {};
  const siblingCount = Number(record.sibling_count);
  const variantId = cleanId(variant.id);
  const seriesId = cleanId(variant.series_id);
  const parentId = cleanId(parent.id);
  const variantImage = cleanText(variant.image || variant.image_url || variant.imageUrl);
  const parentImage = cleanText(parent.image_url || parent.imageUrl);
  const sourceType = cleanText(variant.source_type);
  const explicitScope = cleanText(variant.image_scope || variant.raw?.image_scope);

  const reject = (reason) => ({
    candidate: null,
    rejection: { index, variant_id: variantId || null, reason },
  });

  if (!variantId || !seriesId || !parentId || seriesId !== parentId) return reject("invalid_identity");
  if (!Number.isSafeInteger(siblingCount) || siblingCount < 1) return reject("invalid_sibling_count");
  if (sourceType !== "official_site") return reject("non_official_source");
  if (!isHttpUrl(variantImage) || !isHttpUrl(parentImage)) return reject("invalid_or_blank_image_url");
  if (variantImage !== parentImage) return reject("not_exact_parent_image");
  if (explicitScope === "variant") return reject("explicit_variant_scope");

  const presentation = buildVariantImagePresentation({
    variant,
    parent,
    siblingCount,
  });
  if (presentation.image_scope !== "series_fallback" || presentation.has_variant_image) {
    return reject("presentation_does_not_confirm_series_fallback");
  }

  return {
    candidate: {
      variant_id: variantId,
      series_id: seriesId,
      variant_type: cleanText(variant.variant_type) || "unknown",
      reason: PARENT_IMAGE_CONFLICT_REASON,
    },
    rejection: null,
  };
}

function cleanText(value) {
  return value == null ? "" : String(value).trim();
}

function cleanId(value) {
  const text = cleanText(value);
  if (!text || text.length > 256 || /[\u0000-\u001f\u007f]/.test(text)) return "";
  return text;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function countBy(values, selector) {
  const counts = {};
  for (const value of values) {
    const key = selector(value) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return sortObject(counts);
}

function sortObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right, "en")));
}
