import assert from "node:assert/strict";
import test from "node:test";
import {
  buildParentImageCopyAudit,
  classifyRow,
} from "../scripts/variant-image-parent-copy-audit.mjs";

const base = {
  id: "v-1",
  source_type: "official_site",
  variant_type: "normal",
  image: "https://img.example/series.jpg",
  series_image_url: "https://img.example/series.jpg",
  review_required: false,
};

test("exact official parent-image copies are cleanup candidates", () => {
  const result = classifyRow(base);
  assert.equal(result.candidate, true);
  assert.equal(result.output.reason, "official_variant_image_exactly_equals_parent_series_image");
});

test("non-exact URLs are never cleanup candidates", () => {
  assert.equal(classifyRow({ ...base, image: "https://img.example/variant.jpg" }).candidate, false);
  assert.equal(classifyRow({ ...base, image: " https://img.example/series.jpg " }).candidate, true);
  assert.equal(classifyRow({ ...base, series_image_url: "https://img.example/series.jpg?x=1" }).candidate, false);
});

test("non-official rows are never cleanup candidates", () => {
  const result = classifyRow({ ...base, source_type: "marketplace" });
  assert.equal(result.candidate, false);
  assert.equal(result.output.reason, "non_official_source");
});

test("blank images and unsupported types fail closed", () => {
  assert.equal(classifyRow({ ...base, image: "" }).candidate, false);
  assert.equal(classifyRow({ ...base, series_image_url: null }).candidate, false);
  assert.equal(classifyRow({ ...base, variant_type: "mystery" }).candidate, false);
});

test("provisional normal rare and secret are separately counted", () => {
  const rows = ["provisional", "normal", "rare", "secret"].map((variant_type, index) => ({
    ...base,
    id: `v-${index + 1}`,
    variant_type,
    review_required: variant_type === "provisional",
  }));
  const report = buildParentImageCopyAudit(rows);

  assert.equal(report.candidate_count, 4);
  assert.deepEqual(report.by_variant_type, {
    provisional: 1,
    normal: 1,
    rare: 1,
    secret: 1,
  });
  assert.equal(report.review_required_count, 1);
  assert.equal(report.safety.database_writes, 0);
});

test("candidate digest is deterministic regardless of input order", () => {
  const a = [
    { ...base, id: "v-b" },
    { ...base, id: "v-a" },
  ];
  const b = [...a].reverse();

  const first = buildParentImageCopyAudit(a);
  const second = buildParentImageCopyAudit(b);

  assert.equal(first.candidate_sha256, second.candidate_sha256);
  assert.deepEqual(first.candidates.map((item) => item.id), ["v-a", "v-b"]);
});

test("rejected rows never enter candidate digest population", () => {
  const report = buildParentImageCopyAudit([
    base,
    { ...base, id: "v-2", source_type: "other" },
    { ...base, id: "v-3", image: "https://img.example/variant.jpg" },
  ]);
  assert.equal(report.candidate_count, 1);
  assert.equal(report.rejected.length, 2);
});
