import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import {
  buildVariantParentImageConflictAudit,
  classifyVariantParentImageConflict,
} from "../lib/domain/variant-image-parent-conflict.js";

const parent = {
  id: "series-1",
  brand: "BANDAI",
  image_url: "https://images.example/series.jpg",
};

function record(overrides = {}) {
  const variant = {
    id: "variant-1",
    series_id: "series-1",
    source_type: "official_site",
    variant_type: "normal",
    image: parent.image_url,
    ...overrides.variant,
  };
  return {
    variant,
    parent: { ...parent, ...overrides.parent },
    sibling_count: overrides.sibling_count ?? 4,
  };
}

test("exact parent image + official source + series fallback is a candidate", () => {
  const result = classifyVariantParentImageConflict(record(), 0);
  assert.deepEqual(result.candidate, {
    variant_id: "variant-1",
    series_id: "series-1",
    variant_type: "normal",
    reason: "exact_parent_image_presented_as_series_fallback",
  });
});

test("singleton fails closed even when presentation would otherwise trust or suppress the image", () => {
  for (const variant_type of ["normal", "provisional"]) {
    const result = classifyVariantParentImageConflict(record({
      sibling_count: 1,
      variant: { variant_type },
    }), 0);
    assert.equal(result.candidate, null);
    assert.equal(result.rejection.reason, "singleton_ambiguous");
  }
});

test("non-exact parent image is not a candidate", () => {
  const result = classifyVariantParentImageConflict(record({
    variant: { image: "https://images.example/other.jpg" },
  }), 0);
  assert.equal(result.candidate, null);
  assert.equal(result.rejection.reason, "not_exact_parent_image");
});

test("non-official source is not a candidate", () => {
  const result = classifyVariantParentImageConflict(record({
    variant: { source_type: "community" },
  }), 0);
  assert.equal(result.candidate, null);
  assert.equal(result.rejection.reason, "non_official_source");
});

test("invalid or blank URLs are not candidates", () => {
  for (const image of ["not-a-url", ""]) {
    const result = classifyVariantParentImageConflict(record({
      variant: { image },
      parent: { image_url: image },
    }), 0);
    assert.equal(result.candidate, null);
    assert.equal(result.rejection.reason, "invalid_or_blank_image_url");
  }
});

test("explicit variant image scope is not a candidate", () => {
  const result = classifyVariantParentImageConflict(record({
    variant: { image_scope: "variant" },
  }), 0);
  assert.equal(result.candidate, null);
  assert.equal(result.rejection.reason, "explicit_variant_scope");
});

test("parent and variant identity mismatch is not a candidate", () => {
  const result = classifyVariantParentImageConflict(record({
    variant: { series_id: "series-other" },
  }), 0);
  assert.equal(result.candidate, null);
  assert.equal(result.rejection.reason, "invalid_identity");
});

test("provisional, normal, rare, secret, and other types are counted separately", () => {
  const types = ["provisional", "normal", "rare", "secret", "limited"];
  const records = types.map((variant_type, index) => record({
    variant: { id: `variant-${index + 1}`, variant_type },
  }));
  const report = buildVariantParentImageConflictAudit({ schema_version: 1, records });
  assert.equal(report.candidate_count, 5);
  assert.deepEqual(report.candidate_type_counts, {
    limited: 1,
    normal: 1,
    provisional: 1,
    rare: 1,
    secret: 1,
  });
  assert.deepEqual(report.candidate_type_buckets, {
    provisional: 1,
    normal: 1,
    rare: 1,
    secret: 1,
    other: 1,
  });
  assert.deepEqual(report.other_variant_type_counts, { limited: 1 });
});

test("candidate set SHA-256 is identical regardless of input order", () => {
  const a = record({ variant: { id: "variant-b" } });
  const b = record({ variant: { id: "variant-a" } });
  const first = buildVariantParentImageConflictAudit({ schema_version: 1, records: [a, b] });
  const second = buildVariantParentImageConflictAudit({ schema_version: 1, records: [b, a] });
  const expectedIds = ["variant-a", "variant-b"];
  const expected = `sha256:${createHash("sha256").update(JSON.stringify(expectedIds)).digest("hex")}`;

  assert.deepEqual(first.candidates.map((item) => item.variant_id), expectedIds);
  assert.equal(first.candidate_set_sha256, expected);
  assert.equal(second.candidate_set_sha256, expected);
});

test("non-ASCII candidate IDs use raw UTF-8 byte ordering deterministically", () => {
  const values = [
    record({ variant: { id: "variant-😀" } }),
    record({ variant: { id: "variant-あ" } }),
    record({ variant: { id: "variant-é" } }),
  ];
  const report = buildVariantParentImageConflictAudit({ schema_version: 1, records: values });
  assert.deepEqual(report.candidates.map((item) => item.variant_id), [
    "variant-é",
    "variant-あ",
    "variant-😀",
  ]);
});

test("audit command dependency surface has network 0, credential read 0, and DB write 0", () => {
  const cli = fs.readFileSync(new URL("../scripts/variant-image-parent-conflict-audit.mjs", import.meta.url), "utf8");
  const classifier = fs.readFileSync(new URL("../lib/domain/variant-image-parent-conflict.js", import.meta.url), "utf8");

  for (const source of [cli, classifier]) {
    assert.doesNotMatch(source, /@supabase|node:https?|node:net|node:tls|fetch\s*\(|process\.env|dotenv/i);
    assert.doesNotMatch(source, /\b(?:update|delete|insert|upsert)\b[\s\S]{0,40}\b(?:variants|series)\b/i);
  }

  const report = buildVariantParentImageConflictAudit({ schema_version: 1, records: [record()] });
  assert.deepEqual(report.safety, {
    network_requests: 0,
    credential_reads: 0,
    production_reads: 0,
    database_writes: 0,
  });
});
