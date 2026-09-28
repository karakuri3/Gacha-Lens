import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildVariantImagePresentation } from "../lib/domain/variant-image-presentation.js";
import {
  PROVISIONAL_SINGLETON_PARENT_IMAGE_CLEANUP_EXPECTATION,
  classifyProvisionalSingletonParentImageCleanup,
  decideProvisionalSingletonParentImageCleanupState,
  digestProvisionalSingletonCandidateIds,
  validateProvisionalSingletonParentImageCleanupPrecondition,
} from "../lib/domain/variant-image-provisional-singleton-cleanup.js";

const parent = (overrides = {}) => ({
  id: "series-1",
  name: "Synthetic Series",
  brand: "バンダイ",
  image_url: "https://images.example/series-1.jpg",
  ...overrides,
});

const variant = (overrides = {}) => ({
  id: "series-1-provisional",
  series_id: "series-1",
  name: "Synthetic Series",
  variant_type: "provisional",
  source_type: "official_site",
  image: "https://images.example/series-1.jpg",
  raw: {
    provisional: true,
    reason: "official_lineup_not_fetched_yet",
  },
  ...overrides,
});

const classify = (variantOverrides = {}, parentOverrides = {}, siblingCount = 1) =>
  classifyProvisionalSingletonParentImageCleanup({
    variant: variant(variantOverrides),
    parent: parent(parentOverrides),
    siblingCount,
  });

test("1 provisional singleton exact parent image is a cleanup candidate", () => {
  assert.deepEqual(classify(), {
    ok: true,
    reason: "synthetic_provisional_singleton_parent_copy",
    provider: "bandai",
  });
});

test("2 normal singleton exact same image is never a candidate", () => {
  assert.equal(classify({ variant_type: "normal" }).ok, false);
});

test("3 rare and secret singleton rows are never candidates", () => {
  assert.equal(classify({ variant_type: "rare" }).ok, false);
  assert.equal(classify({ variant_type: "secret" }).ok, false);
});

test("4 provisional raw.provisional=false is rejected", () => {
  assert.deepEqual(classify({ raw: { provisional: false, reason: "official_lineup_not_fetched_yet" } }), {
    ok: false,
    reason: "raw_provisional_not_true",
  });
});

test("5 wrong provisional reason is rejected", () => {
  assert.deepEqual(classify({ raw: { provisional: true, reason: "other" } }), {
    ok: false,
    reason: "wrong_provisional_reason",
  });
});

test("6 variant name must equal parent series name", () => {
  assert.deepEqual(classify({ name: "Actual Variant" }), {
    ok: false,
    reason: "name_not_parent_name",
  });
});

test("7 non-official source is rejected", () => {
  assert.deepEqual(classify({ source_type: "manual" }), {
    ok: false,
    reason: "non_official_source",
  });
});

test("8 explicit variant image scope is rejected", () => {
  assert.deepEqual(classify({ raw: { provisional: true, reason: "official_lineup_not_fetched_yet", image_scope: "variant" } }), {
    ok: false,
    reason: "explicit_variant_scope",
  });
});

test("9 invalid image URL is rejected", () => {
  assert.deepEqual(classify({ image: "not-a-url" }), {
    ok: false,
    reason: "invalid_or_blank_image_url",
  });
});

test("10 parent image mismatch is rejected", () => {
  assert.deepEqual(classify({ image: "https://images.example/variant.jpg" }), {
    ok: false,
    reason: "parent_image_mismatch",
  });
});

test("11 already cleaned null is a no-op state rather than a candidate", () => {
  assert.equal(classify({ image: null }).ok, false);
  assert.deepEqual(decideProvisionalSingletonParentImageCleanupState({
    candidate_count: 0,
    exact_valid_parent_conflicts: 0,
    singleton_conflicts: 0,
  }), {
    state: "already_clean",
    write_count: 0,
    reason: "provisional_singleton_cohort_already_cleaned",
  });
});

test("12 presentation falls back to the parent after cleanup", () => {
  const presentation = buildVariantImagePresentation({
    variant: variant({ image: null }),
    parent: parent(),
    siblingCount: 1,
  });
  assert.equal(presentation.variant_image_url, "");
  assert.equal(presentation.display_image_url, parent().image_url);
  assert.equal(presentation.image_scope, "series_fallback");
  assert.equal(presentation.has_variant_image, false);
});

test("13 Bandai provisional placeholders use the same semantic contract", () => {
  const result = classify({}, { brand: "バンダイ" });
  assert.equal(result.ok, true);
  assert.equal(result.provider, "bandai");
});

test("14 Takara Tomy Arts provisional placeholders use the same semantic contract", () => {
  const result = classify({ id: "tarts-y000001-provisional" }, { brand: "タカラトミーアーツ" });
  assert.equal(result.ok, true);
  assert.equal(result.provider, "takaratomy_arts");
});

test("15 formal lineup promotion remains identity-driven and rejects provisional Phase A3 rows", () => {
  const phaseA3 = fs.readFileSync("lib/domain/official-phase-a3.js", "utf8");
  const cleanup = fs.readFileSync("scripts/cleanup-provisional-variants.mjs", "utf8");
  assert.match(phaseA3, /phase_a3_provisional_variant_rejected/);
  assert.match(cleanup, /row\.variant_type !== "provisional"/);
  assert.match(cleanup, /row\.variant_type === "provisional" && realSeriesIds\.has\(row\.series_id\)/);
  assert.match(cleanup, /preservedBecauseReferenced/);
});

test("16 future provisional ingestion stores no series artwork in variants.image", () => {
  const legacy = fs.readFileSync("scripts/upsert-official-data.mjs", "utf8");
  const start = legacy.indexOf("function toProvisionalVariantRow");
  const end = legacy.indexOf("function loadEnvFile", start);
  const provisionalBuilder = legacy.slice(start, end);
  const officialApply = fs.readFileSync("lib/domain/official-apply-contract.js", "utf8");
  assert.match(provisionalBuilder, /variant_type: "provisional"/);
  assert.match(provisionalBuilder, /image: null/);
  assert.doesNotMatch(provisionalBuilder, /image:\s*seriesRow\.image_url/);
  assert.match(officialApply, /image: nullable\(variant\.image \|\| variant\.image_url \|\| existing\?\.image\)/);
  assert.doesNotMatch(officialApply, /image:\s*nullable\([^\n]*series\.image_url/);
});

test("17 digest mismatch fails closed", () => {
  const expected = PROVISIONAL_SINGLETON_PARENT_IMAGE_CLEANUP_EXPECTATION;
  assert.throws(() => decideProvisionalSingletonParentImageCleanupState({
    candidate_count: expected.candidate_count,
    exact_valid_parent_conflicts: expected.exact_valid_parent_conflicts,
    singleton_conflicts: expected.singleton_conflicts,
    candidate_set_sha256: "sha256:" + "0".repeat(64),
    provider_buckets: expected.provider_buckets,
  }), /candidate_digest_mismatch/);
  assert.equal(
    digestProvisionalSingletonCandidateIds(["b", "a"]),
    digestProvisionalSingletonCandidateIds(["a", "b"]),
  );
});

test("18 concurrent drift fails closed under locks and row-count assertions", () => {
  const sql = fs.readFileSync("scripts/variant-image-provisional-singleton-cleanup.sql", "utf8");
  assert.match(sql, /SET TRANSACTION ISOLATION LEVEL SERIALIZABLE/);
  assert.match(sql, /FOR UPDATE OF s/);
  assert.match(sql, /FOR UPDATE OF v/);
  assert.match(sql, /GET DIAGNOSTICS v_affected = ROW_COUNT/);
  assert.match(sql, /gl050_provisional_singleton_batch_drift/);
  assert.match(sql, /SELECT COUNT\(\*\)[\s\S]*sibling\.series_id = b\.series_id[\s\S]*\) = 1/);
});

test("19 bounded batch retry is idempotent", () => {
  const sql = fs.readFileSync("scripts/variant-image-provisional-singleton-cleanup.sql", "utf8");
  assert.match(sql, /BY 250 LOOP/);
  assert.match(sql, /v_candidates = 0 AND v_exact = 0 AND v_singleton = 0 AND v_multi = 0/);
  assert.match(sql, /IF v_candidate_count = 0 THEN[\s\S]*RETURN/);
  assert.match(sql, /gl050_provisional_singleton_idempotent_postcondition_mismatch/);
});

test("20 executor can change only variants.image and preserves updated_at and parent images", () => {
  const sql = fs.readFileSync("scripts/variant-image-provisional-singleton-cleanup.sql", "utf8");
  const updates = [...sql.matchAll(/UPDATE\s+public\.([a-z_]+)\s+\w+[\s\S]*?SET\s+([a-z_]+)\s*=/g)];
  assert.equal(updates.length, 1);
  assert.equal(updates[0][1], "variants");
  assert.equal(updates[0][2], "image");
  assert.match(sql, /v\.updated_at IS DISTINCT FROM c\.expected_updated_at/);
  assert.match(sql, /s\.image_url IS DISTINCT FROM c\.expected_parent_image/);
  assert.doesNotMatch(sql, /SET\s+updated_at\s*=/i);
});

test("candidate identity drift fails closed independently of semantic classification", () => {
  assert.deepEqual(validateProvisionalSingletonParentImageCleanupPrecondition({
    candidate: { variant_id: "wrong", series_id: "series-1" },
    variant: variant(),
    parent: parent(),
    siblingCount: 1,
  }), { ok: false, reason: "variant_id_drift" });
});

test("non-singleton provisional placeholders remain outside GL-050", () => {
  assert.deepEqual(classify({}, {}, 2), { ok: false, reason: "not_singleton" });
});
