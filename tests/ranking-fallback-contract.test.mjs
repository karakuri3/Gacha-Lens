import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function read(file) {
  return fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
}

test("released ranking never turns active asking prices into sold-price ranking", () => {
  const page = read("app/ranking/page.js");
  const css = read("app/globals.css");

  assert.match(page, /hasPriceRankingEvidence\(item\)/);
  assert.match(page, /成約価格が3件以上確認できた商品だけを相場ランキングに掲載します/);
  assert.match(page, /出品価格ウォッチ/);
  assert.match(page, /売れた価格ではないため、相場ランキングとは分けて表示しています/);
  assert.match(page, /listing\?\.status === "active"/);
  assert.doesNotMatch(page, /eligibleForPriceRanking\s*=\s*true/);
  assert.match(css, /\.listing-watch__list/);
  assert.match(css, /\.listing-watch-row__facts/);
});
