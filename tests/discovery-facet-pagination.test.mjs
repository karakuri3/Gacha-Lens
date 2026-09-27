import assert from "node:assert/strict";
import test from "node:test";
import {
  discoveryFacetPageHref,
  normalizeDiscoveryFacetPage,
  paginatePublicDiscoveryFacetSeries,
} from "../lib/domain/discovery-facets.js";

test("invalid discovery page values normalize to the final public page", () => {
  const parents = Array.from({ length: 61 }, (_, index) => ({ id: `s${index}`, slug: `series-${index}` }));
  const result = paginatePublicDiscoveryFacetSeries(parents, { page: "999", pageSize: 60 });
  assert.equal(result.page, 2);
  assert.deepEqual(result.items, [{ id: "s60", slug: "series-60" }]);
  assert.equal(normalizeDiscoveryFacetPage("not-a-page"), 1);
});

test("discovery page hrefs omit the first-page query and keep later pages canonical", () => {
  assert.equal(discoveryFacetPageHref("franchise", "Title", 1), "/franchises/Title");
  assert.equal(discoveryFacetPageHref("brand", "Maker", 2), "/brands/Maker?page=2");
});
