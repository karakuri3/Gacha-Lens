import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOfficialSeriesWriteValues,
  buildOfficialVariantWriteValues,
} from "../lib/domain/official-apply-contract.js";

const SERIES = {
  id: "series-1",
  slug: "series-1",
  name: "Example Series",
  image_url: "https://images.example/series.jpg",
  released: true,
  price: 400,
  brand: "Example Brand",
  release_month: "2026-09",
  official_url: "https://example.test/series-1",
};

test("GL-048: genuine variant image is stored instead of parent artwork", () => {
  const row = buildOfficialVariantWriteValues({
    id: "variant-1",
    name: "Example Variant 1",
    image_url: "https://images.example/variant-1.jpg",
  }, SERIES);

  assert.equal(row.image, "https://images.example/variant-1.jpg");
});

test("GL-048: parent series artwork is never copied into a new variant image field", () => {
  const row = buildOfficialVariantWriteValues({
    id: "variant-2",
    name: "Example Variant 2",
  }, SERIES);

  assert.equal(row.image, null);
  assert.notEqual(row.image, SERIES.image_url);
});

test("GL-048: existing genuine variant image survives an image-less official refresh", () => {
  const existing = {
    id: "variant-3",
    image: "https://images.example/variant-3-existing.jpg",
  };
  const row = buildOfficialVariantWriteValues({
    id: "variant-3",
    name: "Example Variant 3",
  }, SERIES, existing);

  assert.equal(row.image, existing.image);
  assert.notEqual(row.image, SERIES.image_url);
});

test("GL-048: series artwork remains stored on the series contract", () => {
  const row = buildOfficialSeriesWriteValues(SERIES);

  assert.equal(row.image_url, SERIES.image_url);
});

test("GL-048: normal and provisional variants keep their basic ingestion contract", () => {
  const normal = buildOfficialVariantWriteValues({
    id: "variant-normal",
    name: "Normal Variant",
    variant_type: "normal",
  }, SERIES);
  const provisional = buildOfficialVariantWriteValues({
    id: "variant-provisional",
    name: "Provisional Variant",
    variant_type: "provisional",
  }, SERIES);

  for (const row of [normal, provisional]) {
    assert.equal(row.series_id, SERIES.id);
    assert.equal(row.released, true);
    assert.equal(row.price, SERIES.price);
    assert.equal(row.brand, SERIES.brand);
    assert.equal(row.release_month, SERIES.release_month);
    assert.equal(row.official_url, SERIES.official_url);
    assert.equal(row.source_type, "official_site");
    assert.equal(row.review_required, false);
    assert.equal(row.image, null);
  }
  assert.equal(normal.variant_type, "normal");
  assert.equal(provisional.variant_type, "provisional");
});
