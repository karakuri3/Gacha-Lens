import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeDiscoveryFacetParam,
  discoveryFacetHref,
  discoveryFacetLookupCandidates,
  normalizeDiscoveryFacetName,
} from "../lib/domain/discovery-facets.js";

test("long double-encoded Japanese discovery params survive route normalization", () => {
  const name = "ジュラシック・ワールド";
  const href = discoveryFacetHref("franchise", name);
  const segment = href.split("/").at(-1);
  const decodedOnce = decodeURIComponent(segment);

  assert.ok(segment.length > 120, "fixture must cross the historical pre-decode truncation boundary");
  assert.equal(normalizeDiscoveryFacetName(name), name);
  assert.equal(decodeDiscoveryFacetParam(segment), segment, "raw edge-safe route value must not be truncated to display-name length");
  assert.equal(discoveryFacetLookupCandidates(decodeDiscoveryFacetParam(segment)).at(-1), name);
  assert.equal(discoveryFacetLookupCandidates(decodeDiscoveryFacetParam(decodedOnce)).at(-1), name);
});

test("route input remains bounded independently from the 120-character facet-name contract", () => {
  const oversized = `%25E3`.repeat(1000);
  const preserved = decodeDiscoveryFacetParam(oversized);
  assert.equal(preserved.length, 2400);
  assert.ok(normalizeDiscoveryFacetName("あ".repeat(200)).length <= 120);
});
