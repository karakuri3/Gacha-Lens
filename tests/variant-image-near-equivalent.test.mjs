import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  NEAR_EQUIVALENT_PARENT_IMAGE_CLEANUP_EXPECTATION,
  buildNearEquivalentCleanupCandidate,
  classifyNearEquivalentImageProvenance,
  classifyProviderImageRelationship,
  decideNearEquivalentCleanupState,
  digestNearEquivalentCleanupCandidates,
  parseBandaiImageAsset,
  parseTakaratomyArtsImageAsset,
  validateNearEquivalentCleanupPrecondition,
} from "../lib/domain/variant-image-near-equivalent.js";
import { buildOfficialPhaseA3VariantRow } from "../lib/domain/official-phase-a3.js";
import { buildVariantImagePresentation } from "../lib/domain/variant-image-presentation.js";

const parent = {
  id: "series-1",
  name: "Example Series",
  image_url: "https://bandai-a.akamaihd.net/bc/img/model/xl/1000226726_1.jpg",
  updated_at: "2026-09-29T00:00:00Z",
};
const provisional = {
  id: "variant-1",
  series_id: parent.id,
  name: parent.name,
  variant_type: "provisional",
  source_type: "official_site",
  review_required: true,
  image: "https://bandai-a.akamaihd.net/bc/img/model/b/1000226726_1.jpg",
  updated_at: "2026-09-29T00:00:01Z",
  raw: {
    provisional: true,
    reason: "official_lineup_not_fetched_yet",
  },
};

test("provider identity: Bandai same asset + same frame + b/xl is safe", () => {
  const parsed = parseBandaiImageAsset(provisional.image);
  assert.equal(parsed.asset_id, "1000226726");
  assert.equal(parsed.frame, "1");
  assert.equal(parsed.size_path, "b");
  assert.equal(
    classifyProviderImageRelationship(provisional.image, parent.image_url).reason,
    "bandai_exact_asset_size_derivative",
  );
});

test("provider identity: Bandai _1 vs _2 is never auto-safe", () => {
  const result = classifyProviderImageRelationship(
    "https://bandai-a.akamaihd.net/bc/img/model/b/1000196986_2.jpg",
    "https://bandai-a.akamaihd.net/bc/img/model/xl/1000196986_1.jpg",
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "same_asset_different_frame");
});

test("provider identity: Bandai different asset ids are never auto-safe", () => {
  const result = classifyProviderImageRelationship(
    "https://bandai-a.akamaihd.net/bc/img/model/b/1000227912_1.jpg",
    "https://bandai-a.akamaihd.net/bc/img/model/xl/1000249782_1.jpg",
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "different_asset_id");
});

test("provider identity: Takara Tomy Arts same code _s/_b is safe", () => {
  const small = parseTakaratomyArtsImageAsset(
    "https://www.takaratomy-arts.co.jp/upfiles/products/Y051531_s.jpg",
  );
  const big = parseTakaratomyArtsImageAsset(
    "https://www.takaratomy-arts.co.jp/upfiles/products/Y051531_b.jpg",
  );
  assert.equal(small.product_code, "Y051531");
  assert.equal(small.size_suffix, "s");
  assert.equal(big.size_suffix, "b");
  assert.equal(
    classifyProviderImageRelationship(
      "https://www.takaratomy-arts.co.jp/upfiles/products/Y051531_s.jpg",
      "https://www.takaratomy-arts.co.jp/upfiles/products/Y051531_b.jpg",
    ).reason,
    "tarts_exact_asset_size_derivative",
  );
});

test("provider identity: Takara Tomy Arts different product code is rejected", () => {
  const result = classifyProviderImageRelationship(
    "https://www.takaratomy-arts.co.jp/upfiles/products/Y051531_s.jpg",
    "https://www.takaratomy-arts.co.jp/upfiles/products/Y059452_b.jpg",
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "different_product_code");
});

test("synthetic provisional semantic contract can become a cleanup candidate", () => {
  const result = classifyNearEquivalentImageProvenance({ variant: provisional, parent });
  assert.equal(result.ok, true);
  assert.equal(result.candidate, true);
  assert.equal(result.provenance, "synthetic_provisional_placeholder");
});

test("provisional contract mismatch is rejected", () => {
  for (const bad of [
    { ...provisional, name: "Different" },
    { ...provisional, review_required: false },
    { ...provisional, raw: { ...provisional.raw, reason: "other" } },
  ]) {
    assert.equal(classifyNearEquivalentImageProvenance({ variant: bad, parent }).ok, false);
  }
});

test("explicit variant image scope is rejected", () => {
  const result = classifyNearEquivalentImageProvenance({
    variant: { ...provisional, raw: { ...provisional.raw, image_scope: "variant" } },
    parent,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "explicit_variant_scope");
});

test("formal genuine image evidence always protects the row", () => {
  const formal = {
    ...provisional,
    variant_type: "normal",
    review_required: false,
    raw: { image_url: provisional.image },
  };
  const result = classifyNearEquivalentImageProvenance({
    variant: formal,
    parent,
    formalGenuineImageConfirmed: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "formal_genuine_variant_image");
});

test("formal parent-fallback provenance requires explicit confirmation", () => {
  const formal = { ...provisional, variant_type: "normal", review_required: false, raw: {} };
  const result = classifyNearEquivalentImageProvenance({
    variant: formal,
    parent,
    formalFallbackConfirmed: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, "formal_parent_fallback_provenance_confirmed");
});

test("formal near-equivalent without provenance proof fails closed as ambiguous", () => {
  const formal = { ...provisional, variant_type: "normal", review_required: false, raw: {} };
  const result = classifyNearEquivalentImageProvenance({ variant: formal, parent });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "formal_variant_ambiguous");
});

test("future provisional builder remains image null", () => {
  const source = fs.readFileSync("scripts/upsert-official-data.mjs", "utf8");
  const start = source.indexOf("function toProvisionalVariantRow");
  const end = source.indexOf("function loadEnvFile", start);
  const provisionalBuilder = source.slice(start, end);
  assert.match(provisionalBuilder, /^\s*image:\s*null,\s*$/m);
  assert.doesNotMatch(provisionalBuilder, /\\n\s*image:\s*null/);
  assert.doesNotMatch(provisionalBuilder, /\/\/[^\n]*image:\s*null/);
  assert.doesNotMatch(provisionalBuilder, /seriesRow\.image_url/);
});

test("future formal legacy and Phase A3 paths do not persist parent images", () => {
  const legacy = fs.readFileSync("scripts/upsert-official-data.mjs", "utf8");
  const phaseA3 = fs.readFileSync("lib/domain/official-phase-a3.js", "utf8");
  assert.doesNotMatch(
    legacy,
    /raw\.thumbnail\s*\|\|\s*seriesRow\.image_url/,
  );
  assert.doesNotMatch(
    phaseA3,
    /raw\?\.thumbnail[\s\S]{0,120}\|\|\s*series\?\.(?:image|image_url|imageUrl|product_image|thumbnail)/,
  );

  const row = buildOfficialPhaseA3VariantRow(
    { id: "formal-no-image", name: "Formal no image", variant_type: "normal" },
    { ...parent, brand: "バンダイ", released: true, price: 300 },
  );
  assert.equal(row.image, null);
});

test("presentation keeps parent series fallback after raw variant image is cleared", () => {
  const presentation = buildVariantImagePresentation({
    variant: { ...provisional, image: null },
    parent,
    siblingCount: 1,
  });
  assert.equal(presentation.has_variant_image, false);
  assert.equal(presentation.variant_image_url, "");
  assert.equal(presentation.display_image_url, parent.image_url);
  assert.equal(presentation.image_scope, "series_fallback");
});

test("candidate digest is UTF-8 deterministic and order independent", () => {
  const one = {
    variant_id: "b",
    provider: "bandai",
    reason: "bandai_exact_asset_size_derivative",
    before_url: "https://example/b",
    parent_url: "https://example/xl",
    canonical_asset_identity: "bandai|asset|1",
  };
  const two = { ...one, variant_id: "a" };
  assert.equal(
    digestNearEquivalentCleanupCandidates([one, two]),
    digestNearEquivalentCleanupCandidates([two, one]),
  );
});

test("frozen digest mismatch fails closed", () => {
  const e = NEAR_EQUIVALENT_PARENT_IMAGE_CLEANUP_EXPECTATION;
  assert.throws(() => decideNearEquivalentCleanupState({
    candidate_count: e.candidate_count,
    candidate_set_sha256: "sha256:" + "0".repeat(64),
    provider_buckets: e.provider_buckets,
    rejected_or_ambiguous: e.rejected_or_ambiguous,
    exact_parent_conflicts: e.exact_parent_conflicts,
    series_image_missing: e.series_image_missing,
    raw_variant_image_missing: e.raw_variant_image_missing_before,
  }), /candidate_digest_mismatch/);
});

test("candidate and parent drift fail closed before cleanup", () => {
  const candidate = buildNearEquivalentCleanupCandidate({ variant: provisional, parent });
  assert.ok(candidate);
  assert.equal(
    validateNearEquivalentCleanupPrecondition({
      candidate,
      variant: { ...provisional, image: provisional.image.replace("_1.jpg", "_2.jpg") },
      parent,
    }).reason,
    "candidate_image_drift",
  );
  assert.equal(
    validateNearEquivalentCleanupPrecondition({
      candidate,
      variant: provisional,
      parent: { ...parent, image_url: parent.image_url.replace("_1.jpg", "_2.jpg") },
    }).reason,
    "parent_image_drift",
  );
});

test("successful cleanup state is idempotent on retry", () => {
  const e = NEAR_EQUIVALENT_PARENT_IMAGE_CLEANUP_EXPECTATION;
  assert.deepEqual(decideNearEquivalentCleanupState({
    candidate_count: 0,
    rejected_or_ambiguous: e.rejected_or_ambiguous,
    exact_parent_conflicts: e.exact_parent_conflicts,
    series_image_missing: e.series_image_missing,
    raw_variant_image_missing: e.raw_variant_image_missing_after,
  }), {
    state: "already_clean",
    write_count: 0,
    reason: "near_equivalent_safe_cohort_already_cleaned",
  });
});

test("executor writes only variants.image and never parent/schema/RLS fields", () => {
  const sql = fs.readFileSync("scripts/variant-image-near-equivalent-cleanup.sql", "utf8");
  const updates = sql.match(/UPDATE\s+public\.\w+/gi) || [];
  assert.deepEqual(updates.map((value) => value.toLowerCase()), ["update public.variants"]);
  assert.match(sql, /UPDATE public\.variants v\s*\n\s*SET image = NULL/i);
  assert.doesNotMatch(sql, /UPDATE\s+public\.series/i);
  assert.doesNotMatch(sql, /ALTER\s+(?:TABLE|POLICY)|CREATE\s+POLICY|DROP\s+POLICY/i);
});

test("executor locks, batches, checks exact conflicts, series images, and formal controls", () => {
  const sql = fs.readFileSync("scripts/variant-image-near-equivalent-cleanup.sql", "utf8");
  assert.match(sql, /SET TRANSACTION ISOLATION LEVEL SERIALIZABLE/);
  assert.match(sql, /FOR UPDATE OF s/);
  assert.match(sql, /FOR UPDATE OF v/);
  assert.match(sql, /BY 250 LOOP/);
  assert.match(sql, /near_equivalent_cleanup_concurrent_drift/);
  assert.match(sql, /v_exact <> 0/);
  assert.match(sql, /v_series_missing <> 0/);
  assert.match(sql, /v_formal_near <> 9/);
  assert.match(sql, /v_remaining_safe <> 0/);
});

test("production expectation freezes the audited 3,982-row safe cohort", () => {
  assert.deepEqual(NEAR_EQUIVALENT_PARENT_IMAGE_CLEANUP_EXPECTATION.provider_buckets, {
    bandai: 3931,
    takaratomy_arts: 51,
  });
  assert.equal(NEAR_EQUIVALENT_PARENT_IMAGE_CLEANUP_EXPECTATION.candidate_count, 3982);
  assert.equal(NEAR_EQUIVALENT_PARENT_IMAGE_CLEANUP_EXPECTATION.rejected_or_ambiguous, 3);
  assert.equal(NEAR_EQUIVALENT_PARENT_IMAGE_CLEANUP_EXPECTATION.exact_parent_conflicts, 0);
  assert.equal(NEAR_EQUIVALENT_PARENT_IMAGE_CLEANUP_EXPECTATION.series_image_missing, 0);
});
