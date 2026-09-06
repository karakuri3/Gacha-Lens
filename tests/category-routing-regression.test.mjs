import assert from "node:assert/strict";
import test from "node:test";
import {
  categoryDiscoveryLookupCandidates,
  collectPublicCategoryFacets,
  isMeaningfulCategoryFacetName,
} from "../lib/domain/category-discovery.js";

function row(id, seriesId, category) {
  return {
    id,
    slug: id,
    series_id: seriesId,
    name: `Variant ${id}`,
    variant_type: "normal",
    parent: { id: seriesId, slug: `series-${seriesId}`, category },
  };
}

test("stored gacha taxonomy labels remain valid category discovery destinations", () => {
  for (const name of ["ガチャ", "ガシャポン", "カプセルトイ"]) {
    assert.equal(isMeaningfulCategoryFacetName(name), true, `${name} must remain routable`);
  }
});

test("navigation placeholders remain excluded from category discovery", () => {
  for (const name of ["all", "all categories", "category", "categories", "すべて", "全て", "全カテゴリ", "カテゴリ", "カテゴリー", "unknown", "未分類"]) {
    assert.equal(isMeaningfulCategoryFacetName(name), false, `${name} must remain excluded`);
  }
});

test("category lookup accepts both decoded and runtime percent-encoded Japanese params", () => {
  assert.deepEqual(categoryDiscoveryLookupCandidates("ガチャ"), ["ガチャ"]);
  assert.deepEqual(
    categoryDiscoveryLookupCandidates("%E3%82%AC%E3%83%81%E3%83%A3"),
    ["%E3%82%AC%E3%83%81%E3%83%A3", "ガチャ"],
  );
});

test("category lookup preserves raw literal percent escapes before any decoded fallback", () => {
  assert.deepEqual(categoryDiscoveryLookupCandidates("50%20OFF"), ["50%20OFF", "50 OFF"]);
  assert.deepEqual(categoryDiscoveryLookupCandidates("foo%ZZ"), ["foo%ZZ"]);
});

test("stored gacha taxonomy labels can produce public category facets", () => {
  const facets = collectPublicCategoryFacets([
    row("gacha-1", "gacha-series-1", "ガチャ"),
    row("gacha-2", "gacha-series-2", "ガチャ"),
    row("gashapon-1", "gashapon-series-1", "ガシャポン"),
    row("gashapon-2", "gashapon-series-2", "ガシャポン"),
    row("capsule-1", "capsule-series-1", "カプセルトイ"),
    row("capsule-2", "capsule-series-2", "カプセルトイ"),
  ]);

  assert.deepEqual(
    new Set(facets.map((facet) => facet.name)),
    new Set(["ガチャ", "ガシャポン", "カプセルトイ"]),
  );
});
