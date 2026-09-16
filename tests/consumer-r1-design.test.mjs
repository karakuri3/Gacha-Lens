import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const source = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("R1 public shell removes the permanent dashboard sidebar and loads the consumer layer", () => {
  const layout = source("app/layout.js");
  assert.doesNotMatch(layout, /AppSidebar/);
  assert.match(layout, /import "\.\/consumer-r1\.css"/);
  assert.match(layout, /consumer-app-frame/);
});

test("R1 header makes search and compact consumer navigation primary", () => {
  const header = source("components/Header.js");
  assert.match(header, /consumer-primary-nav/);
  assert.match(header, /ガチャを探す/);
  assert.match(header, /発売予定/);
  assert.match(header, /カテゴリ/);
  assert.match(header, /相場/);
  assert.match(header, /consumer-global-search/);
  assert.match(header, /ガチャ名・作品・メーカーで検索/);
});

test("R1 homepage is image-led discovery instead of a market dashboard", () => {
  const home = source("app/page.js");
  assert.match(home, /DiscoverySeriesCard/);
  assert.match(home, /getParentSeriesCatalogPage/);
  assert.match(home, /次に回したいガチャを、見つける。/);
  assert.match(home, /今月/);
  assert.match(home, /来月/);
  assert.match(home, /発売中/);
  assert.doesNotMatch(home, /PriceTrendChart/);
  assert.doesNotMatch(home, /dashboard-panel|dashboard-ranking|dashboard-mini-table/);
});

test("canonical discovery card keeps official facts first and market evidence truthful", () => {
  const card = source("components/DiscoverySeriesCard.js");
  assert.match(card, /ProductImage/);
  assert.match(card, /seriesHref/);
  assert.match(card, /formatYen/);
  assert.match(card, /formatSchedule/);
  assert.match(card, /hasPriceRankingEvidence/);
  assert.match(card, /相場データ収集中/);
});

test("R1 discovery grid is four-column desktop, three-column medium, two-column mobile", () => {
  const css = source("app/consumer-r1.css");
  assert.match(css, /\.consumer-discovery-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,/s);
  assert.match(css, /@media \(max-width: 1100px\)[\s\S]*?\.consumer-discovery-grid\s*\{[^}]*repeat\(3,/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.consumer-discovery-grid\s*\{[^}]*repeat\(2,/);
  assert.match(css, /\.consumer-discovery-card__media img\s*\{[^}]*object-fit:\s*contain;/s);
});
