import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const component = fs.readFileSync("components/ProductImage.js", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

test("ProductImage owns the contain/center contract independent of stylesheet order", () => {
  assert.match(component, /const CONTAINED_IMAGE_STYLE = Object\.freeze\(\{[\s\S]*objectFit: "contain"[\s\S]*objectPosition: "center"[\s\S]*\}\);/);
  assert.match(component, /style=\{CONTAINED_IMAGE_STYLE\}/);
});

test("fill-image containers remain positioned and overflow-safe", () => {
  assert.match(css, /\.product-image\s*\{[\s\S]*position:\s*relative;[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /\.detail-image\s*\{[\s\S]*position:\s*relative;/);
  assert.match(css, /\.dashboard-spotlight__image\s*\{[^}]*position:\s*relative;/);
  assert.match(css, /\.dashboard-rank-tile__image\s*\{[^}]*position:\s*relative;[^}]*overflow:\s*hidden;/);
});
