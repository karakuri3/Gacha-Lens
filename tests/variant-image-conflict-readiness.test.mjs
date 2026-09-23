import test from "node:test";
import assert from "node:assert/strict";
import {
  buildVariantImageConflictReadiness,
  classifyVariantImageConflict,
} from "../lib/domain/variant-image-conflict-readiness.js";

const parent = { id: "series-1", image_url: "https://img.example/series.jpg" };

test("multi-variant parent copy is a safe clear candidate", () => {
  const result = classifyVariantImageConflict({
    variant: { id: "v1", image: "https://img.example/series.jpg" },
    parent,
    siblingCount: 4,
  });

  assert.equal(result.classification, "safe_clear_parent_copy");
  assert.equal(result.eligible_for_clear, true);
  assert.equal(result.review_required, false);
});

test("normalization still detects the same parent image", () => {
  const result = classifyVariantImageConflict({
    variant: { image: "http://img.example/series.jpg?cache=1" },
    parent,
    siblingCount: 3,
  });

  assert.equal(result.classification, "safe_clear_parent_copy");
});

test("provisional parent copies remain separately classified", () => {
  const result = classifyVariantImageConflict({
    variant: { image: parent.image_url, variant_type: "provisional" },
    parent,
    siblingCount: 5,
  });

  assert.equal(result.classification, "safe_clear_provisional_parent_copy");
  assert.equal(result.eligible_for_clear, true);
});

test("explicit variant scope conflicts require human review", () => {
  const result = classifyVariantImageConflict({
    variant: { image: parent.image_url, image_scope: "variant" },
    parent,
    siblingCount: 4,
  });

  assert.equal(result.classification, "manual_review_explicit_variant_scope");
  assert.equal(result.review_required, true);
});

test("singleton series are never auto-cleared", () => {
  const result = classifyVariantImageConflict({
    variant: { image: parent.image_url },
    parent,
    siblingCount: 1,
  });

  assert.equal(result.classification, "manual_review_singleton");
  assert.equal(result.review_required, true);
});

test("unknown sibling counts are never auto-cleared", () => {
  const result = classifyVariantImageConflict({
    variant: { image: parent.image_url },
    parent,
    siblingCount: 0,
  });

  assert.equal(result.classification, "manual_review_unknown_sibling_count");
  assert.equal(result.review_required, true);
});

test("distinct variant images require no cleanup", () => {
  const result = classifyVariantImageConflict({
    variant: { image: "https://img.example/variant.jpg" },
    parent,
    siblingCount: 4,
  });

  assert.equal(result.classification, "not_parent_copy");
  assert.equal(result.action, "none");
});

test("readiness report exposes only indexes and aggregate classifications", () => {
  const report = buildVariantImageConflictReadiness({
    schema_version: 1,
    records: [
      {
        variant: { id: "secret-variant", image: parent.image_url },
        parent,
        sibling_count: 4,
      },
      {
        variant: { id: "keep", image: "https://img.example/variant.jpg" },
        parent,
        sibling_count: 4,
      },
    ],
  });

  assert.equal(report.safe_clear_count, 1);
  assert.equal(report.no_action_count, 1);
  assert.deepEqual(report.records, [
    { index: 0, classification: "safe_clear_parent_copy", action: "clear_variant_image" },
    { index: 1, classification: "not_parent_copy", action: "none" },
  ]);
  assert.equal(JSON.stringify(report).includes("secret-variant"), false);
  assert.equal(JSON.stringify(report).includes("img.example"), false);
  assert.deepEqual(report.safety, {
    network_requests: 0,
    credential_reads: 0,
    production_reads: 0,
    database_writes: 0,
  });
});
