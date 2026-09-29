import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  decodeDiscoveryFacetParam,
  discoveryFacetHref,
  discoveryFacetIdentifier,
  discoveryFacetLookupCandidates,
  discoveryFacetPageHref,
  findPublicDiscoveryFacet,
} from "../lib/domain/discovery-facets.js";
import { categoryDiscoveryHref, decodeCategoryDiscoveryParam } from "../lib/domain/category-discovery.js";
import { getStaticDiscoveryFacet } from "../lib/domain/discovery-static-manifest.js";
import { getStaticCategoryFacet } from "../lib/domain/category-static-manifest.js";

const ROOT = process.cwd();
const source = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

test("published facet identifier preserves exact database identity", () => {
  for (const value of [
    "ジュラシック・ワールド",
    "ちいかわ",
    "スター・ウォーズ",
    "Disney",
    "DISNEY",
    "バンダイ",
    "ガシャポン",
    "アイカツ！",
    "EstherBunny（エスターバニー）",
    "Re：ゼロから始める異世界生活",
    "UNO™",
    "100% literal",
    "Collector's Edition",
  ]) {
    assert.equal(discoveryFacetIdentifier(value), value);
    const href = discoveryFacetHref("franchise", value);
    const segment = href.split("/").at(-1);
    assert.equal(decodeDiscoveryFacetParam(segment), value);
  }
});

test("Unicode compatibility forms are display concerns and never merged as identifiers", () => {
  assert.notEqual("アイカツ！", "アイカツ!");
  assert.equal(discoveryFacetIdentifier("アイカツ！"), "アイカツ！");
  assert.equal(discoveryFacetIdentifier("アイカツ!"), "アイカツ!");
  const facets = [
    { name: "Disney", series_count: 29, variant_count: 164 },
    { name: "DISNEY", series_count: 3, variant_count: 9 },
  ];
  assert.equal(findPublicDiscoveryFacet(facets, "Disney"), facets[0]);
  assert.equal(findPublicDiscoveryFacet(facets, "DISNEY"), facets[1]);
  assert.equal(findPublicDiscoveryFacet(facets, "disney"), null);
});

test("literal percent wins before one legacy decode and href never double-encodes normal UTF-8", () => {
  assert.deepEqual(discoveryFacetLookupCandidates("%E3%83%90%E3%83%B3%E3%83%80%E3%82%A4"), [
    "%E3%83%90%E3%83%B3%E3%83%80%E3%82%A4",
    "バンダイ",
  ]);
  assert.deepEqual(discoveryFacetLookupCandidates("100%値"), ["100%値"]);
  assert.deepEqual(discoveryFacetLookupCandidates("100%25"), ["100%25", "100%"]);
  assert.equal(discoveryFacetHref("brand", "バンダイ"), "/brands/%E3%83%90%E3%83%B3%E3%83%80%E3%82%A4");
  assert.doesNotMatch(discoveryFacetHref("brand", "バンダイ"), /%25E3/i);
  assert.equal(discoveryFacetHref("franchise", "100%25"), "/franchises/100%2525");
  assert.equal(decodeDiscoveryFacetParam("100%2525"), "100%25");
  assert.equal(decodeDiscoveryFacetParam("%E3%82%B8%E3%83%A5%E3%83%A9%E3%82%B7%E3%83%83%E3%82%AF%E3%83%BB%E3%83%AF%E3%83%BC%E3%83%AB%E3%83%89"), "ジュラシック・ワールド");
  assert.equal(decodeCategoryDiscoveryParam("%E3%82%AC%E3%82%B7%E3%83%A3%E3%83%9D%E3%83%B3"), "ガシャポン");
});

test("published membership distinguishes valid, unpublished, and nonexistent facets", () => {
  assert.ok(getStaticDiscoveryFacet("franchise", "ジュラシック・ワールド"));
  assert.ok(getStaticDiscoveryFacet("brand", "バンダイ"));
  assert.ok(getStaticCategoryFacet("ガシャポン"));
  assert.equal(getStaticDiscoveryFacet("franchise", "definitely-not-a-published-facet"), null);
  assert.equal(getStaticDiscoveryFacet("brand", "キタンクラブ"), null);
  assert.equal(getStaticCategoryFacet("カプキャラ"), null);
});

test("malformed identifiers fail closed before lookup", () => {
  for (const value of ["", " leading", "trailing ", "line\nbreak", "x".repeat(121)]) {
    assert.equal(discoveryFacetIdentifier(value), "");
    assert.deepEqual(discoveryFacetLookupCandidates(value), []);
  }
});

test("pagination keeps the exact facet identity stable", () => {
  const name = "アイカツ！";
  assert.equal(discoveryFacetPageHref("franchise", name, 1), discoveryFacetHref("franchise", name));
  assert.equal(discoveryFacetPageHref("franchise", name, 2), `${discoveryFacetHref("franchise", name)}/page/2`);
  assert.equal(decodeURIComponent(discoveryFacetPageHref("franchise", name, 200).split("/")[2]), name);
});

test("publication, detail, route, API, and sitemap all share exact-match helpers", () => {
  const series = source("lib/series.js");
  const targeted = source("lib/targeted-discovery-series-page.js");
  const repository = source("lib/data/supabase-gacha-repository.js");
  const api = source("app/api/public-discovery/route.js");
  const sitemap = source("app/sitemap.js");
  const franchiseRoute = source("app/franchises/[name]/page.js");
  const brandRoute = source("app/brands/[name]/page.js");

  assert.match(series, /STATIC_FRANCHISE_FACETS/);
  assert.match(series, /STATIC_BRAND_FACETS/);
  assert.match(series, /STATIC_CATEGORY_FACETS/);
  assert.match(series, /discoveryFacetIdentifier\(item\[facetType\]\) === facetName/);
  assert.match(series, /exactIdentifier: true/);
  assert.match(targeted, /\.eq\(type, value\)/);
  assert.match(repository, /\.eq\(type, value\)/);
  assert.doesNotMatch(targeted, /\.ilike\(|\.like\(/);
  assert.match(franchiseRoute, /decodeDiscoveryFacetParam/);
  assert.match(brandRoute, /decodeDiscoveryFacetParam/);
  assert.doesNotMatch(franchiseRoute, /normalizeDiscoveryFacetName/);
  assert.doesNotMatch(brandRoute, /normalizeDiscoveryFacetName/);
  assert.match(franchiseRoute, /if \(!getStaticDiscoveryFacet\("franchise", name\)\) notFound\(\)/);
  assert.match(brandRoute, /if \(!getStaticDiscoveryFacet\("brand", name\)\) notFound\(\)/);
  assert.match(api, /const identifier = discoveryFacetIdentifier\(rawName\)/);
  assert.doesNotMatch(api, /rawName.*\.trim\(\)/);
  assert.match(api, /getStaticDiscoveryFacet/);
  assert.match(api, /getStaticCategoryFacet/);
  assert.match(api, /return NextResponse\.json\(\{ error: "not_found" \}, \{ status: 404 \}\)/);
  assert.match(api, /getTargetedPublicDiscoverySeriesPage/);
  assert.match(sitemap, /discoveryFacetHref\("franchise", facet\.name\)/);
  assert.match(sitemap, /discoveryFacetHref\("brand", facet\.name\)/);
  assert.match(sitemap, /categoryDiscoveryHref\(facet\.name\)/);
});

test("category canonical URL remains shared and encoded once", () => {
  const name = "ガシャポン";
  assert.equal(categoryDiscoveryHref(name), "/categories/%E3%82%AC%E3%82%B7%E3%83%A3%E3%83%9D%E3%83%B3");
  assert.doesNotMatch(categoryDiscoveryHref(name), /%25E3/i);

  const detailRoute = source("app/categories/[name]/page.js");
  const paginationRoute = source("app/categories/[name]/page/[page]/page.js");
  assert.match(detailRoute, /decodeCategoryDiscoveryParam/);
  assert.match(detailRoute, /path: categoryDiscoveryHref\(name\)/);
  assert.match(paginationRoute, /decodeCategoryDiscoveryParam/);
  assert.match(paginationRoute, /categoryDiscoveryPageHref\(name, page\)/);
  assert.match(detailRoute, /if \(!getStaticCategoryFacet\(name\)\) notFound\(\)/);
  assert.match(paginationRoute, /if \(page > totalPages\) permanentRedirect\(categoryDiscoveryPageHref\(name, totalPages\)\)/);
});

test("facet integrity path does not depend on market, stock, social, or writes", () => {
  const domain = source("lib/domain/discovery-facets.js");
  const targeted = source("lib/targeted-discovery-series-page.js");
  const publication = source("lib/data/public-sitemap-identifiers.js");
  assert.doesNotMatch(domain, /market|stock|reaction|affiliate|ranking/i);
  assert.doesNotMatch(targeted, /marketListings|stockReports|xReactions|restockEvents/);
  assert.doesNotMatch(publication, /insert\(|update\(|upsert\(|delete\(/i);
});


test("runtime publication uses the same audited static facet manifest as root sitemap", () => {
  const series = source("lib/series.js");
  const discovery = series.slice(
    series.indexOf("export async function getPublicDiscoveryFacets"),
    series.indexOf("export async function getPublicCategoryCatalogPage"),
  );
  const rootSitemap = series.slice(
    series.indexOf("export async function getPublicRootSitemapIdentifiers"),
    series.indexOf("export async function getVariantObserverSitemapShardCount"),
  );
  assert.match(discovery, /getStaticPublicDiscoveryFacets\(\)/);
  assert.match(rootSitemap, /getStaticPublicDiscoveryFacets\(\)/);
  assert.doesNotMatch(discovery, /loadCachedPublicDiscoveryParents|fetchPublicDiscoveryParentRows/);
});

test("franchise and brand out-of-range pages redirect to the exact final canonical identity", () => {
  for (const [type, file] of [
    ["franchise", "app/franchises/[name]/page/[page]/page.js"],
    ["brand", "app/brands/[name]/page/[page]/page.js"],
  ]) {
    const route = source(file);
    assert.match(route, new RegExp(`getStaticDiscoveryFacet\\("${type}", name\\)`));
    assert.match(route, new RegExp(`page > totalPages\\) permanentRedirect\\(discoveryFacetPageHref\\("${type}", name, totalPages\\)\\)`));
  }
});
