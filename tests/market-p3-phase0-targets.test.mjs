import assert from "node:assert/strict";
import test from "node:test";
import {
  bindApprovedP3TargetPlan,
  parseApprovedP3TargetVariantIds,
} from "../lib/domain/market-p3-phase0-targets.js";

function fixture(size = 10) {
  const series = [];
  const variants = [];
  const selected = [];
  const queries = [];
  for (let index = 1; index <= size; index += 1) {
    const variantId = `variant-${index}`;
    const seriesId = `series-${index}`;
    series.push({
      id: seriesId,
      name: `Series ${index}`,
      source_type: "official_site",
      official_url: `https://official.example/series/${index}`,
    });
    variants.push({
      id: variantId,
      slug: variantId,
      series_id: seriesId,
      name: `Variant ${index}`,
      variant_type: "regular",
      source_type: "official_site",
      official_url: `https://official.example/variant/${index}`,
      review_required: false,
    });
    selected.push({
      variantId,
      seriesId,
      released: true,
      priority: 3,
      eligibleListingCount: 0,
      coverageState: "no_evidence",
    });
    queries.push({
      variant_id: variantId,
      series_id: seriesId,
      query_profile: "priority_3_seed_strict",
      query: `Series ${index} Variant ${index} ガチャ`,
    });
  }
  return {
    ids: variants.map((entry) => entry.id),
    catalog: {
      series,
      variants,
      seriesById: new Map(series.map((entry) => [entry.id, entry])),
      variantById: new Map(variants.map((entry) => [entry.id, entry])),
    },
    plan: {
      selected: [...selected].reverse(),
      queries: [...queries].reverse(),
      summary: {},
    },
  };
}

test("approved target parser requires an exact unique bounded JSON cohort", () => {
  const value = fixture();
  assert.deepEqual(
    parseApprovedP3TargetVariantIds(JSON.stringify(value.ids), { limit: 10 }),
    value.ids,
  );
  assert.throws(() => parseApprovedP3TargetVariantIds(JSON.stringify(value.ids.slice(0, 9)), { limit: 10 }));
  assert.throws(() => parseApprovedP3TargetVariantIds(JSON.stringify([...value.ids.slice(0, 9), value.ids[0]]), { limit: 10 }));
  assert.throws(() => parseApprovedP3TargetVariantIds("not-json", { limit: 10 }));
  assert.throws(() => parseApprovedP3TargetVariantIds(JSON.stringify(value.ids), { limit: 5 }));
});

test("approved target binding restores exact approved order before provider access", () => {
  const value = fixture();
  const bound = bindApprovedP3TargetPlan({
    approvedTargetVariantIds: value.ids,
    limit: 10,
    plan: value.plan,
    catalog: value.catalog,
  });
  assert.deepEqual(bound.selected.map((entry) => entry.variantId), value.ids);
  assert.deepEqual(bound.queries.map((entry) => entry.variant_id), value.ids);
  assert.equal(bound.summary.approved_target_binding, true);
  assert.equal(bound.summary.approved_target_count, 10);
  assert.equal(bound.summary.distinct_series_selected, 10);
});

test("approved target binding fails closed if any target is no longer review-safe or uncovered", () => {
  for (const mutate of [
    (value) => { value.catalog.variants[0].review_required = true; },
    (value) => { value.catalog.variants[0].variant_type = "provisional"; },
    (value) => { value.catalog.variants[0].source_type = "other"; },
    (value) => { value.catalog.series[0].official_url = ""; },
    (value) => { value.plan.selected.find((entry) => entry.variantId === "variant-1").released = false; },
    (value) => { value.plan.selected.find((entry) => entry.variantId === "variant-1").priority = 2; },
    (value) => { value.plan.selected.find((entry) => entry.variantId === "variant-1").eligibleListingCount = 1; },
    (value) => { value.plan.selected.find((entry) => entry.variantId === "variant-1").coverageState = "near_listing_guide"; },
  ]) {
    const value = fixture();
    mutate(value);
    assert.throws(() => bindApprovedP3TargetPlan({
      approvedTargetVariantIds: value.ids,
      limit: 10,
      plan: value.plan,
      catalog: value.catalog,
    }));
  }
});

test("approved target binding fails closed on ambiguous parent-variant identity or duplicate series", () => {
  {
    const value = fixture();
    const duplicateSeries = {
      id: "series-duplicate",
      name: value.catalog.series[0].name,
      source_type: "official_site",
      official_url: "https://official.example/series/duplicate",
    };
    const duplicateVariant = {
      ...value.catalog.variants[0],
      id: "variant-duplicate",
      slug: "variant-duplicate",
      series_id: duplicateSeries.id,
      official_url: "https://official.example/variant/duplicate",
    };
    value.catalog.series.push(duplicateSeries);
    value.catalog.variants.push(duplicateVariant);
    value.catalog.seriesById.set(duplicateSeries.id, duplicateSeries);
    value.catalog.variantById.set(duplicateVariant.id, duplicateVariant);
    assert.throws(() => bindApprovedP3TargetPlan({
      approvedTargetVariantIds: value.ids,
      limit: 10,
      plan: value.plan,
      catalog: value.catalog,
    }));
  }
  {
    const value = fixture();
    value.catalog.variants[1].series_id = "series-1";
    const row = value.plan.selected.find((entry) => entry.variantId === "variant-2");
    row.seriesId = "series-1";
    const query = value.plan.queries.find((entry) => entry.variant_id === "variant-2");
    query.series_id = "series-1";
    assert.throws(() => bindApprovedP3TargetPlan({
      approvedTargetVariantIds: value.ids,
      limit: 10,
      plan: value.plan,
      catalog: value.catalog,
    }));
  }
});
