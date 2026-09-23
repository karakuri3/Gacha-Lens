import crypto from "node:crypto";

const ALLOWED_TYPES = new Set(["provisional", "normal", "rare", "secret"]);

export function buildParentImageCopyAudit(rows) {
  if (!Array.isArray(rows)) throw new Error("invalid_input");

  const candidates = [];
  const rejected = [];

  for (const row of rows) {
    const result = classifyRow(row);
    if (result.candidate) candidates.push(result.output);
    else rejected.push(result.output);
  }

  candidates.sort((a, b) => a.id.localeCompare(b.id, "en"));
  const digest = crypto
    .createHash("sha256")
    .update(candidates.map((item) => item.id).join("\n"), "utf8")
    .digest("hex");

  const byType = Object.fromEntries([...ALLOWED_TYPES].map((type) => [type, 0]));
  let reviewRequired = 0;
  for (const item of candidates) {
    if (item.variant_type in byType) byType[item.variant_type] += 1;
    if (item.review_required) reviewRequired += 1;
  }

  return {
    schema_version: 1,
    mode: "read_only_candidate_audit",
    candidate_count: candidates.length,
    candidate_sha256: digest,
    by_variant_type: byType,
    review_required_count: reviewRequired,
    candidates,
    rejected,
    safety: {
      database_writes: 0,
      updates: 0,
      deletes: 0,
      upserts: 0,
    },
  };
}

export function classifyRow(row) {
  const id = text(row?.id);
  const sourceType = text(row?.source_type);
  const variantType = text(row?.variant_type);
  const variantImage = text(row?.image);
  const parentImage = text(row?.series_image_url);
  const reviewRequired = row?.review_required === true;

  if (!id) return reject(id, "missing_id");
  if (sourceType !== "official_site") return reject(id, "non_official_source");
  if (!variantImage || !parentImage) return reject(id, "blank_image");
  if (variantImage !== parentImage) return reject(id, "not_exact_parent_copy");
  if (!ALLOWED_TYPES.has(variantType)) return reject(id, "unsupported_variant_type");

  return {
    candidate: true,
    output: {
      id,
      variant_type: variantType,
      review_required: reviewRequired,
      reason: "official_variant_image_exactly_equals_parent_series_image",
    },
  };
}

function reject(id, reason) {
  return {
    candidate: false,
    output: {
      id: id || null,
      reason,
    },
  };
}

function text(value) {
  return value == null ? "" : String(value).trim();
}
