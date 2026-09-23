import test from "node:test";
import assert from "node:assert/strict";
import { buildOfficialVariantWriteValues } from "../lib/domain/official-apply-contract.js";

const SERIES = {
  id: "series-1",
  slug: "series-1",
  name: "Example Series",
  image_url: "https://images.example/series.jpg",
  released: true,
  price: 400,
};

test("official variant writes never copy the parent series image into the variant image field", () => {
  const row = buildOfficialVariantWriteValues({
    id: "variant-1",
    name: "Example Variant",
  }, SERIES);

  assert.equal(row.image, null);
});

test("official variant writes preserve a genuine variant image", () => {
  const row = buildOfficialVariantWriteValues({
    id: "variant-2",
    name: "Example Variant 2",
    image_url: "https://images.example/variant-2.jpg",
  }, SERIES);

  assert.equal(row.image, "https://images.example/variant-2.jpg");
});
