import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const source = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("public catalog navigation uses full-document requests so edge-cached HTML can serve clicks", () => {
  for (const relativePath of [
    "components/DiscoveryFacetPages.js",
    "app/categories/page.js",
    "components/SeriesCard.js",
  ]) {
    const text = source(relativePath);
    assert.doesNotMatch(text, /from ["']next\/link["']/);
    assert.match(text, /<a\b/);
  }

  const discovery = source("components/DiscoveryFacetPages.js");
  assert.match(discovery, /<a key=\{facet\.name\} href=\{discoveryFacetHref\(type, facet\.name\)\}/);
  assert.match(discovery, /href=\{categoryDiscoveryPageHref\(facet\.name,/);

  const categories = source("app/categories/page.js");
  assert.match(categories, /href=\{categoryDiscoveryHref\(category\.name\)\}/);

  const card = source("components/SeriesCard.js");
  assert.match(card, /href=\{isSeries \? seriesHref\(series\) : variantHref\(series\)\}/);
});

test("Worker keeps Next internal RSC requests out of shared HTML cache while document routes remain cacheable", () => {
  const worker = source("worker/index.js");

  assert.match(worker, /function isNextInternalRequest\(request\)/);
  assert.match(worker, /"rsc"/);
  assert.match(worker, /"next-router-state-tree"/);
  assert.match(worker, /return !isNextInternalRequest\(request\)/);
  assert.match(worker, /isDiscoveryDocumentPath/);
  assert.match(worker, /isSeriesDetailCachePath/);
});
