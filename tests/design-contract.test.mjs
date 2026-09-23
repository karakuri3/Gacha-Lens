import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const read = async (relative) => readFile(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");

test("Gacha Lens design contract is wired into the app", async () => {
  const [contract, layout, page, card, discoveryCard, seriesDetail, variantDetail, css, detailCss, consumerCss, polishCss] = await Promise.all([
    read("DESIGN.md"),
    read("app/layout.js"),
    read("app/page.js"),
    read("components/SeriesCard.js"),
    read("components/DiscoverySeriesCard.js"),
    read("app/series/group/[slug]/page.js"),
    read("app/series/[slug]/page.js"),
    read("app/product-design.css"),
    read("app/product-detail-design.css"),
    read("app/consumer-r1.css"),
    read("app/consumer-r1-polish.css"),
  ]);

  assert.match(contract, /Collector Editorial — SELECTED/);
  assert.match(contract, /Object first/);
  assert.match(layout, /import "\.\/product-design\.css";/);
  assert.match(layout, /import "\.\/product-detail-design\.css";/);
  assert.match(layout, /import "\.\/consumer-r1\.css";/);
  assert.match(layout, /import "\.\/consumer-r1-polish\.css";/);
  assert.doesNotMatch(layout, /AppSidebar/);
  assert.match(css, /font-variant-numeric:\s*tabular-nums/);
  assert.match(css, /\.dashboard-panel\s*\{[\s\S]*box-shadow:\s*none;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);

  // R1 moves the public shell away from a dashboard: global search stays in the
  // header, while home goes directly into real series shelves and release context.
  assert.equal(page.includes("home-catalog-search"), false);
  assert.equal(page.includes("consumer-home-search"), false);
  assert.match(page, /新作ガチャを探す/);
  assert.match(page, /getParentSeriesCatalogPage/);
  assert.match(page, /DiscoverySeriesCard/);
  assert.match(page, /month: currentMonth/);
  assert.match(page, /month: nextMonth/);
  assert.match(page, /release: "released"/);
  assert.doesNotMatch(page, /getRankingSeries|PriceTrendChart|dashboard-panel|dashboard-ranking|dashboard-mini-table/);
  assert.doesNotMatch(page, /CAPSULE TOY DISCOVERY|>DISCOVER<|>BROWSE</);
  assert.match(discoveryCard, /<ProductImage/);
  assert.match(discoveryCard, /item=\{item\}/);
  assert.match(discoveryCard, /相場データ収集中/);
  assert.match(consumerCss, /\.consumer-discovery-grid/);
  assert.match(consumerCss, /object-fit:\s*contain/);
  assert.match(polishCss, /Keep the first viewport focused on finding real objects/);
  assert.match(polishCss, /backdrop-filter:\s*none/);

  // Catalog results are object/evidence records, not nested KPI-card grids.
  // The value is normalized before filtering so placeholder numerics such as
  // 注目度 0点 are treated as absence rather than as market evidence.
  assert.match(card, /className="product-evidence"/);
  assert.equal(card.includes('className="metric-grid"'), false);
  assert.match(card, /const value = String\(metric\?\.value \?\? ""\)\.trim\(\)/);
  assert.match(card, /"0点"/);
  assert.match(card, /!unavailable\.has\(value\)/);
  assert.match(card, /!value\.includes\("データ不足"\)/);
  assert.match(css, /\.catalog-results-head ~ \.grid--cards \.product-card\s*\{[\s\S]*border-radius:\s*0/);
  assert.match(css, /\.product-evidence__row\s*\{/);

  // Parent-series detail must hide absent evidence instead of promoting missing
  // values as KPI cards. The page is a collector record with flat evidence rows.
  assert.match(seriesDetail, /const heroEvidence = buildSeriesHeroEvidence/);
  assert.match(seriesDetail, /heroEvidence\.length \?/);
  assert.match(seriesDetail, /stock !== "未取得"/);
  assert.match(seriesDetail, /completeValue !== "データ不足"/);
  assert.match(seriesDetail, /className="detail-evidence-list"/);
  assert.match(seriesDetail, /className="collector-detail-section collector-lineup-section"/);
  assert.equal(seriesDetail.includes('className="card panel" style={{ marginTop: 24 }}'), false);
  assert.match(detailCss, /\.collector-detail-hero \.detail-image\s*\{[\s\S]*box-shadow:\s*none/);
  assert.match(detailCss, /\.collector-evidence-row\s*\{[\s\S]*border-bottom:/);
  assert.match(detailCss, /\.collector-lineup-list > a\s*\{[\s\S]*border-radius:\s*0/);

  // Variant detail follows the same evidence-first rule. Official price and
  // release metadata stay in facts; missing market/stock values do not become
  // prominent KPI cards, and zero-value attention scores are omitted.
  assert.match(variantDetail, /visibleDetailMetrics\(buildReleasedCustomerMetrics\(item\), \["定価", "注目度"\]\)/);
  assert.match(variantDetail, /まだ在庫の実観測はありません。未取得を在庫状態として扱いません。/);
  assert.equal(variantDetail.includes("PRICE PULSE"), false);
  assert.match(css, /\.detail-hero\s*\{[\s\S]*border-radius:\s*0\s*!important/);
  assert.match(css, /\.detail-evidence-grid \.metric\s*\{[\s\S]*border-radius:\s*0/);

  for (const forbidden of ["linear-gradient(", "radial-gradient(", "backdrop-filter:", "text-shadow:"]) {
    assert.equal(css.includes(forbidden), false, `product design layer must not introduce ${forbidden}`);
    assert.equal(detailCss.includes(forbidden), false, `product detail design layer must not introduce ${forbidden}`);
  }
});
