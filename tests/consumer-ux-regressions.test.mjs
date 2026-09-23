import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function read(file) {
  return fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
}

test("consumer catalog density and image semantics stay intentional", () => {
  const productImage = read("components/ProductImage.js");
  const seriesDetail = read("app/series/group/[slug]/page.js");
  const designCss = read("app/product-design.css");
  const globalCss = read("app/globals.css");

  assert.equal(productImage.includes("シリーズ画像"), false);
  assert.equal(seriesDetail.includes("lineup-grid__series-fallback"), false);
  assert.match(seriesDetail, /fallbackSrc=""/);
  assert.match(seriesDetail, /emptyLabel="単品画像なし"/);

  assert.match(designCss, /@media \(min-width: 1200px\)[\s\S]*grid-template-columns:\s*repeat\(5,/);
  assert.match(designCss, /@media \(max-width: 720px\)[\s\S]*grid-template-columns:\s*repeat\(2,/);

  assert.match(globalCss, /\.header-menu > nav a span\s*\{[\s\S]*display:\s*inline/);
  assert.match(globalCss, /\.header-menu summary span/);
});
