import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = (path) => fs.readFileSync(path, "utf8");

test("public discovery API routes brand/franchise reads through aggregate summaries", () => {
  const api = source("app/api/public-discovery/route.js");
  assert.match(api, /getTargetedPublicDiscoverySeriesPage/);
  assert.doesNotMatch(api, /getPublicDiscoveryFacetSeriesPage/);
  assert.match(api, /pageSize: 60/);
});

test("bounded facet summaries use child IDs to enforce public-parent existence", () => {
  for (const path of [
    "lib/targeted-discovery-series-page.js",
    "lib/targeted-category-series-page.js",
  ]) {
    const helper = source(path);
    assert.match(helper, /variants!inner\(id\)/);
    assert.match(helper, /embeddedVariantCount/);
    assert.doesNotMatch(helper, /variants!inner\(count\)/);
  }

  const discovery = source("lib/targeted-discovery-series-page.js");
  assert.match(discovery, /countPublicVariantsForFacet/);
  assert.doesNotMatch(discovery, /fetchPublicVariantsBySeriesIds|fetchSignalsForCatalog|marketListings|stockReports|restockEvents|xReactions/);
});

test("aggregate facet summary keeps public child filters and bounded page size", () => {
  const helper = source("lib/targeted-discovery-series-page.js");
  assert.match(helper, /Math\.min\(60,/);
  assert.match(helper, /variant_type\.is\.null,variant_type\.neq\.provisional/);
  assert.match(helper, /not\("variants\.series_id", "is", null\)/);
  assert.match(helper, /not\("variants\.slug", "is", null\)/);
  assert.match(helper, /not\("variants\.name", "is", null\)/);
});

test("facet series summaries retain SeriesCard identity and lineup fields", () => {
  const helper = source("lib/targeted-discovery-series-page.js");
  for (const contract of [
    /series_id: series\.id/,
    /series_slug: series\.slug/,
    /series_name: series\.name/,
    /entity_type: "series"/,
    /variant_count: variantCount/,
    /lineup_count: variantCount/,
    /image_scope: "series"/,
    /effectiveReleaseState\(series\)/,
  ]) assert.match(helper, contract);
});
