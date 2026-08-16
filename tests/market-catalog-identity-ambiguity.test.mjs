import assert from "node:assert/strict";
import test from "node:test";

import {
  applyMarketCandidateSafety,
  assessMarketCandidate,
  buildCatalogParentVariantIdentityKey,
  buildFormalParentVariantSeriesIds,
  prepareMarketSafetyCatalog,
} from "../lib/domain/market-match-safety.js";
import { buildSanitizedMarketCandidateAudit } from "../lib/domain/market-candidate-audit.js";
import { buildMarketCandidateKey } from "../lib/domain/market-candidate-key.js";
import { buildMarketplaceListingId } from "../lib/domain/market-canary-write.js";

function parent(id, name, franchise = name) {
  return { id, slug: id, name, franchise };
}

function variant(id, seriesId, name, variantType = "normal") {
  return { id, slug: id, series_id: seriesId, name, variant_type: variantType };
}

function catalog(series, variants) {
  return {
    series,
    variants,
    seriesById: new Map(series.map((row) => [row.id, row])),
    variantById: new Map(variants.map((row) => [row.id, row])),
  };
}

function queryFor(parentSeries, targetVariant) {
  return {
    query: `${parentSeries.name} ${targetVariant.name} ガチャ`,
    variant_id: targetVariant.id,
    series_id: parentSeries.id,
  };
}

function assess({ series, variants, targetSeriesId, targetVariantId, title }) {
  const input = catalog(series, variants);
  return assessMarketCandidate(
    { id: "listing", title },
    queryFor(input.seriesById.get(targetSeriesId), input.variantById.get(targetVariantId)),
    input,
  );
}

test("a unique formal parent and variant preserve normal acceptance", () => {
  const series = [parent("series-a", "Example Collection")];
  const variants = [variant("variant-a", "series-a", "Blue Figure")];
  const result = assess({
    series,
    variants,
    targetSeriesId: "series-a",
    targetVariantId: "variant-a",
    title: "【Blue Figure】Example Collection",
  });
  assert.equal(result.accepted, true);
  assert.equal(result.auditChecks.catalogParentVariantIdentityAmbiguous, false);
});

test("the same normalized parent and variant across series IDs fail closed", () => {
  const series = [
    parent("series-a", "Example Collection"),
    parent("series-b", "Example Collection"),
  ];
  const variants = [
    variant("variant-a", "series-a", "Blue Figure"),
    variant("variant-b", "series-b", "Blue Figure"),
  ];
  const result = assess({
    series,
    variants,
    targetSeriesId: "series-a",
    targetVariantId: "variant-a",
    title: "【Blue Figure】Example Collection",
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reviewRequired, true);
  assert.equal(result.reason, "catalog_parent_variant_identity_ambiguous");
  assert.equal(result.auditChecks.catalogParentVariantIdentityAmbiguous, true);
});

test("duplicate parent names with different variants do not create a false collision", () => {
  const series = [
    parent("series-a", "Example Collection"),
    parent("series-b", "Example Collection"),
  ];
  const variants = [
    variant("variant-a", "series-a", "Blue Figure"),
    variant("variant-b", "series-b", "Red Figure"),
  ];
  const result = assess({
    series,
    variants,
    targetSeriesId: "series-a",
    targetVariantId: "variant-a",
    title: "【Blue Figure】Example Collection",
  });
  assert.equal(result.accepted, true);
  assert.equal(result.auditChecks.catalogParentVariantIdentityAmbiguous, false);
});

test("the same variant name under different parent names is not a collision", () => {
  const series = [
    parent("series-a", "First Collection"),
    parent("series-b", "Second Collection"),
  ];
  const variants = [
    variant("variant-a", "series-a", "Blue Figure"),
    variant("variant-b", "series-b", "Blue Figure"),
  ];
  const result = assess({
    series,
    variants,
    targetSeriesId: "series-a",
    targetVariantId: "variant-a",
    title: "【Blue Figure】First Collection",
  });
  assert.equal(result.accepted, true);
  assert.equal(result.auditChecks.catalogParentVariantIdentityAmbiguous, false);
});

test("franchise differences cannot hide a parent and variant collision", () => {
  const series = [
    parent("series-a", "Flower Gift Selections", "Flower Gift"),
    parent("series-b", "Flower Gift Selections", "Different Franchise"),
  ];
  const variants = [
    variant("variant-a", "series-a", "Flower Dome Pink"),
    variant("variant-b", "series-b", "Flower Dome Pink"),
  ];
  const result = assess({
    series,
    variants,
    targetSeriesId: "series-a",
    targetVariantId: "variant-a",
    title: "【Flower Dome Pink】Flower Gift Selections",
  });
  assert.equal(result.reason, "catalog_parent_variant_identity_ambiguous");
  assert.equal(result.auditChecks.catalogParentVariantIdentityAmbiguous, true);
});

test("repository-standard width, punctuation, and spacing normalization collide", () => {
  const series = [
    parent("series-a", "Catalog・World"),
    parent("series-b", "Ｃａｔａｌｏｇ World"),
  ];
  const variants = [
    variant("variant-a", "series-a", "Hero（Pink）"),
    variant("variant-b", "series-b", "Ｈｅｒｏ (Pink)"),
  ];
  const prepared = prepareMarketSafetyCatalog(catalog(series, variants));
  const key = buildCatalogParentVariantIdentityKey(series[0].name, variants[0].name);
  assert.deepEqual([...prepared.formalParentVariantSeriesIds.get(key)].sort(), ["series-a", "series-b"]);
});

test("a provisional duplicate does not create a formal catalog collision", () => {
  const series = [
    parent("series-a", "Example Collection"),
    parent("series-b", "Example Collection"),
  ];
  const variants = [
    variant("variant-a", "series-a", "Blue Figure"),
    variant("variant-b", "series-b", "Blue Figure", "provisional"),
  ];
  const result = assess({
    series,
    variants,
    targetSeriesId: "series-a",
    targetVariantId: "variant-a",
    title: "【Blue Figure】Example Collection",
  });
  assert.equal(result.accepted, true);
  assert.equal(result.auditChecks.catalogParentVariantIdentityAmbiguous, false);
});

test("duplicate variants inside one series keep one series identity", () => {
  const series = [parent("series-a", "Example Collection")];
  const variants = [
    variant("variant-a", "series-a", "Blue Figure"),
    variant("variant-b", "series-a", "Blue Figure"),
  ];
  const index = buildFormalParentVariantSeriesIds({ variants, series });
  const key = buildCatalogParentVariantIdentityKey(series[0].name, variants[0].name);
  assert.deepEqual([...index.get(key)], ["series-a"]);
});

test("sanitized candidate audit exposes only the catalog ambiguity boolean", () => {
  const series = [
    parent("series-a", "Example Collection"),
    parent("series-b", "Example Collection"),
  ];
  const variants = [
    variant("variant-a", "series-a", "Blue Figure"),
    variant("variant-b", "series-b", "Blue Figure"),
  ];
  const input = catalog(series, variants);
  const query = queryFor(series[0], variants[0]);
  const records = [{
    id: "provider-listing",
    title: "【Blue Figure】Example Collection",
    price: 500,
    status: "active",
    source: "yahoo_shopping",
    source_url: "https://store.shopping.yahoo.co.jp/example/item.html",
    raw: { provider: "yahoo_shopping", itemCode: "example_item", query },
  }];
  const safety = applyMarketCandidateSafety({ records, queryPlan: [query], catalog: input });
  const report = buildSanitizedMarketCandidateAudit({
    records: safety.records,
    queryPlan: [query],
    catalog: input,
    runContext: { run_id: "read-only", head_sha: "a".repeat(40) },
    summary: { safety_assessed_records: 1 },
  });
  assert.equal(report.candidates[0].assessment.accepted, false);
  assert.equal(report.candidates[0].assessment.reason, "catalog_parent_variant_identity_ambiguous");
  assert.equal(report.candidates[0].checks.catalog_parent_variant_identity_ambiguous, true);
  assert.equal(JSON.stringify(report).match(/service.?role|access.?key|authorization|cookie/giu), null);
});

test("catalog ambiguity checks do not alter candidate or durable listing identity", () => {
  const identity = {
    provider: "yahoo_shopping",
    listing_id: "example_item",
    public_url: "https://store.shopping.yahoo.co.jp/example/item.html",
    title: "【Blue Figure】Example Collection",
  };
  assert.equal(buildMarketCandidateKey(identity), buildMarketCandidateKey({ ...identity }));
  assert.equal(buildMarketplaceListingId({
    provider: identity.provider,
    sourceListingId: identity.listing_id,
    publicUrl: identity.public_url,
    title: identity.title,
  }), buildMarketplaceListingId({
    provider: identity.provider,
    sourceListingId: identity.listing_id,
    publicUrl: identity.public_url,
    title: identity.title,
  }));
});
