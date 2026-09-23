import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

test("exact official parent image becomes a candidate only when presentation confirms series fallback", () => {
  const result = classifyVariantParentImageConflict(record(), 0);
  assert.deepEqual(result.candidate, {
    variant_id: "variant-1",
    series_id: "series-1",
    variant_type: "normal",
    reason: "exact_parent_image_presented_as_series_fallback",
  });
});

test("single-child exact image fails closed instead of assuming it is wrong", () => {
  const result = classifyVariantParentImageConflict(record({ sibling_count: 1 }), 0);
  assert.equal(result.candidate, null);
  assert.equal(result.rejection.reason, "presentation_does_not_confirm_series_fallback");
});

test("non-exact, non-official, invalid, and explicit variant-scope images are never candidates", () => {
  const cases = [
    [record({ variant: { image: "https://images.example/other.jpg" } }), "not_exact_parent_image"],
    [record({ variant: { source_type: "community" } }), "non_official_source"],
    [record({ variant: { image: "not-a-url" }, parent: { image_url: "not-a-url" } }), "invalid_or_blank_image_url"],
    [record({ variant: { image_scope: "variant" } }), "explicit_variant_scope"],
  ];
  for (const [value, reason] of cases) {
    const result = classifyVariantParentImageConflict(value, 0);
    assert.equal(result.candidate, null);
    assert.equal(result.rejection.reason, reason);
  }
});

test("provisional, normal, rare, and secret candidates are counted separately", () => {
  const types = ["provisional", "normal", "rare", "secret"];
  const records = types.map((variant_type, index) => record({
    variant: { id: `variant-${index + 1}`, variant_type },
  }));
  const report = buildVariantParentImageConflictAudit({ schema_version: 1, records });
  assert.equal(report.candidate_count, 4);
  assert.deepEqual(report.candidate_type_counts, {
    normal: 1,
    provisional: 1,
    rare: 1,
    secret: 1,
  });
});

test("candidate set and digest are deterministic regardless of input order", () => {
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


test("candidate ordering is stable UTF-8 byte order for non-ASCII IDs", () => {
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

test("identity mismatches fail closed", () => {
  const result = classifyVariantParentImageConflict(record({
    variant: { series_id: "series-other" },
  }), 0);
  assert.equal(result.candidate, null);
  assert.equal(result.rejection.reason, "invalid_identity");
});

test("audit declares zero network, credential, Production read, and database write activity", () => {
  const report = buildVariantParentImageConflictAudit({ schema_version: 1, records: [record()] });
  assert.deepEqual(report.safety, {
    network_requests: 0,
    credential_reads: 0,
    production_reads: 0,
    database_writes: 0,
  });
});
