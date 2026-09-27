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

test("aggregate facet summary avoids loading variant bodies and signal tables", () => {
  const helper = source("lib/targeted-discovery-series-page.js");
  assert.match(helper, /variants!inner\(count\)/);
  assert.match(helper, /embeddedVariantCount/);
  assert.match(helper, /countPublicVariantsForFacet/);
  assert.doesNotMatch(helper, /fetchPublicVariantsBySeriesIds|fetchSignalsForCatalog|marketListings|stockReports|restockEvents|xReactions/);
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
