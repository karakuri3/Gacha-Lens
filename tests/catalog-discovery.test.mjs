import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildCatalogHref,
  catalogMonthRange,
  formatCatalogMonth,
  normalizeCatalogMonth,
  normalizeSearchText,
  parseCatalogQuery,
  recordMatchesCatalogQuery,
  shiftCatalogMonth,
} from "../lib/domain/catalog-query.js";

const seriesPage = read("app/series/page.js");
const schedulePage = read("app/schedule/page.js");
const categoriesPage = read("app/categories/page.js");
const homePage = read("app/page.js");
const repository = read("lib/data/supabase-gacha-repository.js");
const css = read("app/globals.css");

const variant = {
  id: "v1",
  slug: "astro-boy-atom",
  series_id: "s1",
  name: "アトム",
  series_name: "鉄腕アトム フィギュア",
  franchise: "鉄腕アトム",
  brand: "BANDAI",
  category: "フィギュア",
  tags: ["classic"],
  released: false,
  release_date: "2026-08-12",
  variant_type: "normal",
};

test("1 empty query defaults to series discovery", () => assert.deepEqual(parseCatalogQuery({}), {
  q: "", scope: "series", release: "all", category: "", month: "", sort: "newest", page: 1, legacyMode: "",
}));
test("2 invalid scope uses series", () => assert.equal(parseCatalogQuery({ scope: "other" }).scope, "series"));
test("3 invalid release uses all", () => assert.equal(parseCatalogQuery({ release: "later" }).release, "all"));
test("4 zero and negative pages use one", () => {
  assert.equal(parseCatalogQuery({ page: 0 }).page, 1);
  assert.equal(parseCatalogQuery({ page: -8 }).page, 1);
});
test("5 invalid month is ignored", () => assert.equal(normalizeCatalogMonth("2026-13"), ""));
test("6 search uses NFKC", () => assert.equal(normalizeSearchText(" ＡＢＣ１２３ "), "ABC123"));
test("7 repeated whitespace is collapsed", () => assert.equal(normalizeSearchText("  鉄腕　 アトム  "), "鉄腕 アトム"));
test("8 URL round trip preserves filters", () => {
  const href = buildCatalogHref(parseCatalogQuery({ q: "アトム", scope: "series", release: "upcoming", category: "フィギュア", month: "2026-08", sort: "price_asc", page: 3 }), {}, { resetPage: false });
  const url = new URL(href, "https://example.test");
  assert.equal(url.searchParams.get("q"), "アトム");
  assert.equal(url.searchParams.get("scope"), null);
  assert.equal(url.searchParams.get("page"), "3");
});
test("9 filter changes reset page", () => assert.equal(new URL(buildCatalogHref({ page: 8 }, { release: "released" }), "https://example.test").searchParams.get("page"), null));
test("9a series default is canonical without a scope parameter", () => assert.equal(buildCatalogHref({}, {}), "/series"));
test("9b explicit variant scope is preserved in catalog URLs", () => assert.equal(buildCatalogHref({}, { scope: "variant" }), "/series?scope=variant"));
test("9c legacy signal filters remain variant-first without an explicit scope", () => assert.equal(parseCatalogQuery({ filter: "market" }).scope, "variant"));

test("10 variant name is searchable", () => assert.equal(recordMatchesCatalogQuery(variant, { q: "アトム" }), true));
test("11 parent series name searches variants", () => assert.equal(recordMatchesCatalogQuery(variant, { q: "鉄腕アトム フィギュア" }), true));
test("12 franchise is searchable", () => assert.equal(recordMatchesCatalogQuery(variant, { q: "鉄腕アトム" }), true));
test("13 brand is searchable", () => assert.equal(recordMatchesCatalogQuery(variant, { q: "bandai" }), true));
test("14 category is searchable", () => assert.equal(recordMatchesCatalogQuery(variant, { q: "フィギュア" }), true));
test("15 ASCII search is case insensitive", () => assert.equal(recordMatchesCatalogQuery(variant, { q: "BaNdAi" }), true));
test("16 provisional variant is excluded", () => assert.equal(recordMatchesCatalogQuery({ ...variant, variant_type: "provisional" }, {}), false));
test("17 parent series search returns series", () => assert.equal(recordMatchesCatalogQuery({ ...variant, name: "鉄腕アトム フィギュア" }, { q: "鉄腕アトム" }, "series"), true));
test("18 provisional-only parent remains in series scope", () => assert.equal(recordMatchesCatalogQuery({ ...variant, variant_type: "series" }, {}, "series"), true));
test("19 repository errors are thrown instead of converted to zero", () => assert.match(repository, /throw new Error\(`Supabase catalog page fetch failed/));
test("20 public catalog has no sample fallback", () => assert.doesNotMatch(seriesPage, /mock-gacha|sample fixture|mockSeries/));

test("21 item query uses exact total count", () => assert.match(repository, /select\(relationSelect, \{ count: "exact" \}\)/));
test("22 released filter is applied", () => assert.match(repository, /eq\("released", true\)/));
test("23 upcoming filter is applied", () => assert.match(repository, /eq\("released", false\)/));
test("24 category contract matches filtering", () => assert.equal(recordMatchesCatalogQuery(variant, { category: "フィギュア" }), true));
test("25 month filter matches release month", () => assert.equal(recordMatchesCatalogQuery(variant, { month: "2026-08" }), true));
test("26 combined filters use AND semantics", () => {
  assert.equal(recordMatchesCatalogQuery(variant, { q: "アトム", release: "upcoming", category: "フィギュア", month: "2026-08" }), true);
  assert.equal(recordMatchesCatalogQuery(variant, { q: "アトム", release: "released", category: "フィギュア", month: "2026-08" }), false);
});
test("27 page outside range is clamped by repository", () => assert.match(repository, /page > lastPage/));
test("28 blank and meaningless categories are removed", () => assert.match(repository, /isMeaningfulCategory/));

test("29 previous and next month calculation works", () => assert.equal(shiftCatalogMonth("2026-08", 1), "2026-09"));
test("30 December advances to next January", () => assert.equal(shiftCatalogMonth("2026-12", 1), "2027-01"));
test("31 January returns to previous December", () => assert.equal(shiftCatalogMonth("2026-01", -1), "2025-12"));
test("32 schedule uses parent series data and series links", () => {
  assert.match(schedulePage, /getParentSeriesCatalogPage/);
  assert.match(schedulePage, /getUpcomingParentSeriesScheduleMonths/);
  assert.match(schedulePage, /seriesHref\(item\)/);
  assert.doesNotMatch(schedulePage, /getSeriesCatalogPage/);
  assert.doesNotMatch(schedulePage, /variantHref\(item\)/);
});
test("33 undated series are kept out of week groups without deriving a variant date", () => {
  assert.match(schedulePage, /const undatedItems = items\.filter/);
  assert.match(schedulePage, /item\.release_week \|\| item\.schedule_week/);
  assert.match(schedulePage, /item\.release_date \|\| item\.releaseDate/);
  assert.doesNotMatch(schedulePage, /item\.variant_type/);
});
test("34 schedule metrics do not include market or profit labels", () => {
  assert.doesNotMatch(schedulePage, /market_evidence|profit_estimate|利益目安|参考相場/);
});

test("35 home search submits to series query", () => {
  assert.match(homePage, /<form action="\/series" method="get" role="search">/);
  assert.match(homePage, /name="q"/);
  assert.match(homePage, /name="scope" value="series"/);
});
test("35a home upcoming module is series-first while market ranking stays variant-first", () => {
  assert.match(homePage, /getRankingSeries\("released", "variant"\)/);
  assert.match(homePage, /getRankingSeries\("upcoming", "series"\)/);
  assert.match(homePage, /href=\{seriesHref\(item\)\}/);
});
test("36 zero result message is present", () => assert.match(seriesPage, /条件に一致する商品が見つかりませんでした/));
test("37 clear filter action is present", () => assert.match(seriesPage, /条件をすべてクリア/));
test("38 free search and filtered category pages are noindex", () => assert.match(seriesPage, /query\.q \|\| query\.category \? \{ index: false, follow: true \}/));
test("39 category link uses encoded URL builder", () => assert.match(categoriesPage, /buildCatalogHref\(\{\}, \{ category: category\.name \}\)/));
test("40 mobile filter has bounded columns", () => {
  assert.match(css, /\.catalog-filter-grid \{ grid-template-columns: 1fr 1fr; \}/);
  assert.match(css, /minmax\(0, 1fr\)/);
});
test("41 series scope is the first active discovery tab", () => {
  const seriesTab = seriesPage.indexOf('scope: "series"');
  const variantTab = seriesPage.indexOf('scope: "variant"');
  assert.ok(seriesTab >= 0 && variantTab >= 0 && seriesTab < variantTab);
  assert.match(seriesPage, /entityLabel = query\.scope === "series" \? "シリーズ" : "単品"/);
});

test("month range is half-open", () => assert.deepEqual(catalogMonthRange("2026-08"), { start: "2026-08-01", end: "2026-09-01" }));
test("Japanese month label is stable", () => assert.equal(formatCatalogMonth("2026-08"), "2026年8月"));

function read(file) {
  return fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
}
