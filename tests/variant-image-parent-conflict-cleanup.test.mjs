import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  VARIANT_PARENT_IMAGE_CLEANUP_EXPECTATION,
  decideVariantParentImageCleanupState,
  digestCandidateIds,
  partitionVariantParentImageCleanupCandidates,
  validateVariantParentImageCleanupPrecondition,
} from "../lib/domain/variant-image-parent-conflict-cleanup.js";
import { buildVariantImagePresentation } from "../lib/domain/variant-image-presentation.js";
import { classifyVariantParentImageConflict } from "../lib/domain/variant-image-parent-conflict.js";

const parent = {
  id: "series-1",
  brand: "BANDAI",
  image_url: "https://images.example/series.jpg",
};

function candidate(overrides = {}) {
  return {
    variant_id: "variant-1",
    series_id: "series-1",
    variant_type: "normal",
    ...overrides,
  };
}

function variant(overrides = {}) {
  return {
    id: "variant-1",
    series_id: "series-1",
    source_type: "official_site",
    variant_type: "normal",
    image: parent.image_url,
    raw: {},
    ...overrides,
  };
}

function readyState(overrides = {}) {
  return {
    candidate_count: 5885,
    candidate_set_sha256: VARIANT_PARENT_IMAGE_CLEANUP_EXPECTATION.candidate_set_sha256,
    exact_valid_parent_conflicts: 7072,
    singleton_ambiguous: 1187,
    candidate_type_buckets: {
      provisional: 2383,
      normal: 3492,
      rare: 5,
      secret: 5,
      other: 0,
    },
    ...overrides,
  };
}

test("safe multi-sibling exact parent image satisfies the live cleanup precondition", () => {
  assert.deepEqual(validateVariantParentImageCleanupPrecondition({
    candidate: candidate(),
    variant: variant(),
    parent,
    siblingCount: 4,
  }), { ok: true, reason: "precondition_confirmed" });
});

test("genuine variant image is never accepted", () => {
  const result = validateVariantParentImageCleanupPrecondition({
    candidate: candidate(),
    variant: variant({ image: "https://images.example/variant.jpg" }),
    parent,
    siblingCount: 4,
  });
  assert.deepEqual(result, { ok: false, reason: "image_drift" });
});

test("image mismatch is never accepted", () => {
  const result = validateVariantParentImageCleanupPrecondition({
    candidate: candidate(),
    variant: variant({ image: "https://images.example/other.jpg" }),
    parent,
    siblingCount: 4,
  });
  assert.equal(result.ok, false);
});

test("singleton remains ambiguous and is never accepted", () => {
  const result = validateVariantParentImageCleanupPrecondition({
    candidate: candidate(),
    variant: variant(),
    parent,
    siblingCount: 1,
  });
  assert.deepEqual(result, { ok: false, reason: "singleton_or_invalid_sibling_count" });
});

test("non-official source is never accepted", () => {
  const result = validateVariantParentImageCleanupPrecondition({
    candidate: candidate(),
    variant: variant({ source_type: "community" }),
    parent,
    siblingCount: 4,
  });
  assert.deepEqual(result, { ok: false, reason: "source_type_drift" });
});

test("explicit variant image scope is never accepted", () => {
  const result = validateVariantParentImageCleanupPrecondition({
    candidate: candidate(),
    variant: variant({ raw: { image_scope: "variant" } }),
    parent,
    siblingCount: 4,
  });
  assert.deepEqual(result, { ok: false, reason: "explicit_variant_scope" });
});

test("invalid or blank URLs are never accepted", () => {
  for (const image of ["", "not-a-url"]) {
    const result = validateVariantParentImageCleanupPrecondition({
      candidate: candidate(),
      variant: variant({ image }),
      parent: { ...parent, image_url: image },
      siblingCount: 4,
    });
    assert.deepEqual(result, { ok: false, reason: "invalid_or_blank_image_url" });
  }
});

test("already-cleaned state is an idempotent no-op", () => {
  assert.deepEqual(decideVariantParentImageCleanupState({
    candidate_count: 0,
    exact_valid_parent_conflicts: 1187,
    singleton_ambiguous: 1187,
    candidate_set_sha256: "",
    candidate_type_buckets: {},
  }), {
    state: "already_clean",
    write_count: 0,
    reason: "safe_cohort_already_cleaned",
  });
});

test("digest mismatch fails closed", () => {
  assert.throws(
    () => decideVariantParentImageCleanupState(readyState({ candidate_set_sha256: "sha256:wrong" })),
    /candidate_digest_mismatch/,
  );
});

test("expected count mismatch fails closed", () => {
  assert.throws(
    () => decideVariantParentImageCleanupState(readyState({ candidate_count: 5884 })),
    /expected_count_mismatch/,
  );
});

test("concurrent variant image drift fails closed", () => {
  const result = validateVariantParentImageCleanupPrecondition({
    candidate: candidate(),
    variant: variant({ image: "https://images.example/drift.jpg" }),
    parent,
    siblingCount: 4,
  });
  assert.deepEqual(result, { ok: false, reason: "image_drift" });
});

test("concurrent parent image drift fails closed", () => {
  const result = validateVariantParentImageCleanupPrecondition({
    candidate: candidate(),
    variant: variant(),
    parent: { ...parent, image_url: "https://images.example/new-parent.jpg" },
    siblingCount: 4,
  });
  assert.deepEqual(result, { ok: false, reason: "image_drift" });
});

test("batch retry is deterministic and side-effect free", () => {
  const values = [
    candidate({ variant_id: "variant-c" }),
    candidate({ variant_id: "variant-a" }),
    candidate({ variant_id: "variant-b" }),
  ];
  const expectedDigest = digestCandidateIds(values.map((item) => item.variant_id));
  const first = partitionVariantParentImageCleanupCandidates(values, {
    batchSize: 2,
    expectedCount: 3,
    expectedDigest,
  });
  const second = partitionVariantParentImageCleanupCandidates(values, {
    batchSize: 2,
    expectedCount: 3,
    expectedDigest,
  });
  assert.deepEqual(first, second);
  assert.deepEqual(first.batches.map((batch) => batch.map((item) => item.variant_id)), [
    ["variant-a", "variant-b"],
    ["variant-c"],
  ]);
});

test("ready state requires the exact locked Production expectation", () => {
  assert.deepEqual(decideVariantParentImageCleanupState(readyState()), {
    state: "ready",
    write_count: 5885,
    reason: "deterministic_safe_cohort_confirmed",
  });
});

test("cleanup leaves presentation on series fallback after variants.image becomes null", () => {
  const presentation = buildVariantImagePresentation({
    variant: variant({ image: null }),
    parent,
    siblingCount: 4,
  });
  assert.equal(presentation.variant_image_url, "");
  assert.equal(presentation.series_image_url, parent.image_url);
  assert.equal(presentation.display_image_url, parent.image_url);
  assert.equal(presentation.has_variant_image, false);
  assert.equal(presentation.image_scope, "series_fallback");
});

test("GL-048 prevention semantics still classify exact parent reuse as series fallback", () => {
  const sourceVariant = variant();
  const presentation = buildVariantImagePresentation({
    variant: sourceVariant,
    parent,
    siblingCount: 4,
  });
  assert.equal(presentation.image_scope, "series_fallback");
  assert.equal(presentation.has_variant_image, false);

  const classification = classifyVariantParentImageConflict({
    variant: sourceVariant,
    parent,
    sibling_count: 4,
  }, 0);
  assert.equal(classification.candidate?.variant_id, "variant-1");
});

test("write executor is SERIALIZABLE, bounded, locked, and writes only variants.image", () => {
  const sql = fs.readFileSync(
    new URL("../scripts/variant-image-parent-conflict-cleanup.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /SET TRANSACTION ISOLATION LEVEL SERIALIZABLE/i);
  assert.equal((sql.match(/DO \\$\\$/g) || []).length, 3);
  assert.doesNotMatch(sql, /DO \\$\\nDECLARE/);
  assert.match(sql, /FOR UPDATE OF s/i);
  assert.match(sql, /FOR UPDATE OF v/i);
  assert.match(sql, /FOR v_batch_start IN 1\.\.5885 BY 250/i);
  assert.match(sql, /UPDATE public\.variants v\s+SET image = NULL/i);
  assert.doesNotMatch(sql, /UPDATE public\.series/i);
  assert.doesNotMatch(sql, /SET\s+(?:updated_at|name|series_id|price|brand|source_type|variant_type|rarity|review_required|official_url)\s*=/i);
  assert.doesNotMatch(sql, /ALTER\s+(?:TABLE|POLICY)|CREATE\s+POLICY|DROP\s+POLICY/i);
  assert.match(sql, /v_user_triggers <> 0/i);
  assert.match(sql, /candidate_parent_image_cleanup_batch_drift|variant_parent_image_cleanup_batch_drift/i);
});

test("dry run is SELECT-only and locks the exact count, breakdown, singleton and SHA contract", () => {
  const sql = fs.readFileSync(
    new URL("../scripts/variant-image-parent-conflict-cleanup-dry-run.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /safe_candidate_count/i);
  assert.match(sql, /singleton_ambiguous/i);
  assert.match(sql, /candidate_sha256/i);
  assert.match(sql, /variants_user_trigger_count/i);
  assert.doesNotMatch(sql, /\b(?:UPDATE|DELETE|INSERT|UPSERT|ALTER|DROP|TRUNCATE)\b/i);
});
