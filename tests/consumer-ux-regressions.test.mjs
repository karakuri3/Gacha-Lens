import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function read(file) {
  return fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
}

test("consumer catalog density and image semantics stay intentional", () => {
  const productImage = read("components/ProductImage.js");
  const seriesCard = read("components/SeriesCard.js");
  const catalogPage = read("app/series/page.js");
  const variantDetail = read("app/series/[slug]/page.js");
  const seriesDetail = read("app/series/group/[slug]/page.js");
  const designCss = read("app/product-design.css");
  const globalCss = read("app/globals.css");

  assert.equal(productImage.includes("シリーズ画像"), false);
  assert.match(seriesCard, /series\.image_scope === "series_fallback" \? ""/);
  assert.match(seriesCard, /fallbackSrc=""/);
  assert.match(seriesCard, /"単品画像なし"/);
  assert.equal(variantDetail.includes("lineup-grid__series-fallback"), false);
  assert.match(variantDetail, /fallbackSrc=""/);
  assert.match(variantDetail, /emptyLabel="単品画像なし"/);
  assert.equal(seriesDetail.includes("lineup-grid__series-fallback"), false);
  assert.match(seriesDetail, /fallbackSrc=""/);
  assert.match(seriesDetail, /emptyLabel="単品画像なし"/);

  assert.match(designCss, /@media \(min-width: 1200px\)[\s\S]*grid-template-columns:\s*repeat\(5,/);
  assert.match(designCss, /@media \(max-width: 720px\)[\s\S]*grid-template-columns:\s*repeat\(2,/);
  assert.match(catalogPage, /<details className="catalog-filter-shell" open=\{advancedFilterActive\}>/);
  assert.match(catalogPage, /絞り込み・並び替え/);
  assert.match(designCss, /details\.catalog-filter-shell:not\(\[open\]\) > \.catalog-filter-form/);
  assert.match(designCss, /\.catalog-filter-summary/);

  assert.match(globalCss, /\.header-menu > nav a span\s*\{[\s\S]*display:\s*inline/);
  assert.match(globalCss, /\.header-menu summary span/);
  assert.match(globalCss, /min-width:\s*74px/);
  assert.match(globalCss, /white-space:\s*nowrap/);
});
