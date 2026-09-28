import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  collectPublicParentDiscoveryFacets,
  decodeDiscoveryFacetParam,
  discoveryFacetHref,
  discoveryFacetLookupCandidates,
  discoveryFacetPageHref,
  findPublicDiscoveryFacet,
  isValidDiscoveryFacetRouteInput,
} from "../lib/domain/discovery-facets.js";
import {
  collectPublicParentCategoryFacets,
  categoryDiscoveryHref,
  categoryDiscoveryPageHref,
  decodeCategoryDiscoveryParam,
} from "../lib/domain/category-discovery.js";

const source = (path) => fs.readFileSync(path, "utf8");
const parent = (id, overrides = {}) => ({
  id,
  slug: `series-${id}`,
  franchise: "ジュラシック・ワールド",
  brand: "バンダイ",
  category: "ガシャポン",
  variants: [{ count: 1 }],
  ...overrides,
});

test("published identity stays exact across NFKC-compatible franchise values", () => {
  const rows = [
    parent("a1", { franchise: "それいけ！アンパンマン" }),
    parent("a2", { franchise: "それいけ！アンパンマン" }),
    parent("b1", { franchise: "それいけ!アンパンマン" }),
    parent("b2", { franchise: "それいけ!アンパンマン" }),
    parent("c1", { franchise: "五等分の花嫁∬" }),
    parent("c2", { franchise: "五等分の花嫁∬" }),
  ];
  const { franchises } = collectPublicParentDiscoveryFacets(rows);
  assert.deepEqual(
    new Set(franchises.map((facet) => facet.name)),
    new Set(["それいけ!アンパンマン", "それいけ！アンパンマン", "五等分の花嫁∬"]),
  );
});

test("published franchise, brand, and category counts equal exact detail rows", () => {
  const rows = [parent("1"), parent("2", { variants: [{ count: 3 }] })];
  const discovery = collectPublicParentDiscoveryFacets(rows);
  const categories = collectPublicParentCategoryFacets(rows);
  assert.deepEqual(discovery.franchises[0], { name: "ジュラシック・ワールド", series_count: 2, variant_count: 4 });
  assert.deepEqual(discovery.brands[0], { name: "バンダイ", series_count: 2, variant_count: 4 });
  assert.equal(categories[0].name, "ガシャポン");
  assert.equal(categories[0].series_count, 2);
  assert.equal(categories[0].variant_count, 4);
});

test("one-series public category remains a valid published detail identity", () => {
  const categories = collectPublicParentCategoryFacets([parent("1", { category: "フィギュア" })]);
  assert.equal(categories.length, 1);
  assert.equal(categories[0].name, "フィギュア");
  assert.equal(categoryDiscoveryHref(categories[0].name), `/categories/${encodeURIComponent("フィギュア")}`);
});

test("Japanese and ASCII canonical hrefs use one encodeURIComponent layer", () => {
  for (const [type, name] of [
    ["franchise", "ジュラシック・ワールド"],
    ["franchise", "ちいかわ"],
    ["franchise", "スター・ウォーズ"],
    ["franchise", "Disney"],
    ["brand", "バンダイ"],
  ]) {
    const href = discoveryFacetHref(type, name);
    const prefix = type === "brand" ? "/brands/" : "/franchises/";
    assert.equal(href, `${prefix}${encodeURIComponent(name)}`);
    assert.equal(decodeURIComponent(href.slice(prefix.length)), name);
    if (/[^\x00-\x7f]/.test(name)) assert.ok(!href.includes("%25E3"));
  }
});

test("URL transport preserves full-width symbols, spaces, apostrophe, percent and non-ASCII UTF-8", () => {
  for (const name of [
    "それいけ！アンパンマン",
    "ＡＢＣ＆１２３",
    "space name",
    "Collector's Item",
    "100% capsule",
    "スター・ウォーズ",
  ]) {
    const href = discoveryFacetHref("franchise", name);
    const segment = href.slice("/franchises/".length);
    assert.equal(decodeURIComponent(segment), name);
    assert.ok(discoveryFacetLookupCandidates(segment).includes(name));
  }
});

test("encoded transport decodes once and literal percent remains raw-first", () => {
  const encoded = encodeURIComponent("ジュラシック・ワールド");
  assert.deepEqual(discoveryFacetLookupCandidates(encoded), [encoded, "ジュラシック・ワールド"]);
  assert.deepEqual(discoveryFacetLookupCandidates("100%25"), ["100%25", "100%"]);
  assert.equal(decodeDiscoveryFacetParam("100%25"), "100%25");
  assert.equal(decodeCategoryDiscoveryParam("100%25"), "100%25");
});

test("legacy normalized name fallback is unique-only and exact match wins", () => {
  const one = [{ name: "それいけ！アンパンマン", series_count: 2, variant_count: 2 }];
  assert.equal(findPublicDiscoveryFacet(one, "それいけ!アンパンマン")?.name, "それいけ！アンパンマン");
  const exactAndWide = [...one, { name: "それいけ!アンパンマン", series_count: 2, variant_count: 2 }];
  assert.equal(findPublicDiscoveryFacet(exactAndWide, "それいけ!アンパンマン")?.name, "それいけ!アンパンマン");
  const ambiguous = [
    { name: "ＡＢＣ", series_count: 2, variant_count: 2 },
    { name: "ABC", series_count: 2, variant_count: 2 },
  ];
  assert.equal(findPublicDiscoveryFacet(ambiguous, "abc"), null);
});

test("pagination hrefs retain the same exact identity", () => {
  const name = "それいけ！アンパンマン";
  assert.equal(discoveryFacetPageHref("franchise", name, 1), discoveryFacetHref("franchise", name));
  assert.equal(discoveryFacetPageHref("franchise", name, 3), `${discoveryFacetHref("franchise", name)}/page/3`);
  assert.equal(categoryDiscoveryPageHref("ガシャポン", 2), `${categoryDiscoveryHref("ガシャポン")}/page/2`);
});

test("genuinely nonexistent and malformed route input fail closed", () => {
  assert.equal(findPublicDiscoveryFacet([{ name: "Disney" }], "Does Not Exist"), null);
  assert.equal(isValidDiscoveryFacetRouteInput(""), false);
  assert.equal(isValidDiscoveryFacetRouteInput("\u0000bad"), false);
  assert.deepEqual(discoveryFacetLookupCandidates("\u0000bad"), []);
  assert.deepEqual(discoveryFacetLookupCandidates("x".repeat(3000)), []);
});

test("index metadata sitemap and detail share canonical href helpers", () => {
  const sitemap = source("app/sitemap.js");
  assert.match(sitemap, /discoveryFacetHref\("franchise", facet\.name\)/);
  assert.match(sitemap, /discoveryFacetHref\("brand", facet\.name\)/);
  assert.match(sitemap, /categoryDiscoveryHref\(facet\.filter_value \?\? facet\.name\)/);
  assert.match(source("app/franchises/[name]/page.js"), /discoveryFacetHref\("franchise", name\)/);
  assert.match(source("app/brands/[name]/page.js"), /discoveryFacetHref\("brand", name\)/);
  assert.match(source("app/categories/[name]/page.js"), /categoryDiscoveryHref\(name\)/);
  assert.match(source("app/categories/page.js"), /getPublicDiscoveryFacets/);
  assert.match(source("app/franchises/[name]/page.js"), /const name = decodeDiscoveryFacetParam\(\(await params\)\.name\)/);
  assert.match(source("app/brands/[name]/page.js"), /const name = decodeDiscoveryFacetParam\(\(await params\)\.name\)/);
  assert.match(source("app/categories/[name]/page.js"), /const name = decodeCategoryDiscoveryParam\(\(await params\)\.name\)/);
});

test("targeted detail reads stay exact and broad fallback is miss-only", () => {
  const targeted = source("lib/targeted-discovery-series-page.js");
  assert.match(targeted, /\.eq\(type, value\)/);
  assert.ok(targeted.indexOf("for (const value of candidates)") < targeted.indexOf("const facets = await getPublicDiscoveryFacets()"));
  assert.doesNotMatch(targeted, /\.ilike\(|\.like\(/);
});

test("facet detail does not depend on market stock social fanout", () => {
  for (const path of ["lib/targeted-discovery-series-page.js", "lib/targeted-category-series-page.js"]) {
    const text = source(path);
    assert.doesNotMatch(text, /marketListings|stockReports|restockEvents|xReactions|fetchSignalsForCatalog/);
  }
});

test("live all-published audit is bounded and write-free", () => {
  const audit = source("scripts/discovery-facet-integrity-audit.mjs");
  assert.match(audit, /MAX_ROWS = 50000/);
  assert.match(audit, /published_total/);
  assert.doesNotMatch(audit, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
  assert.match(audit, /production_write_count: 0/);
});
