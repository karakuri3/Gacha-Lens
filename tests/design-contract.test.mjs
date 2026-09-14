import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const read = async (relative) => readFile(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");

test("Gacha Lens design contract is wired into the app", async () => {
  const [contract, layout, page, card, seriesDetail, css, detailCss] = await Promise.all([
    read("DESIGN.md"),
    read("app/layout.js"),
    read("app/page.js"),
    read("components/SeriesCard.js"),
    read("app/series/group/[slug]/page.js"),
    read("app/product-design.css"),
    read("app/product-detail-design.css"),
  ]);

  assert.match(contract, /Collector Editorial — SELECTED/);
  assert.match(contract, /Object first/);
  assert.match(layout, /import "\.\/product-design\.css";/);
  assert.match(layout, /import "\.\/product-detail-design\.css";/);
  assert.match(css, /font-variant-numeric:\s*tabular-nums/);
  assert.match(css, /\.dashboard-panel\s*\{[\s\S]*box-shadow:\s*none;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);

  // The global header already owns search. Home should move immediately into
  // collector context + real objects instead of repeating a generic hero search.
  assert.equal(page.includes("home-catalog-search"), false);
  assert.equal(page.includes("TODAY&apos;S PICK"), false);
  assert.match(page, /className="home-context-nav"/);

  // Do not render empty market chrome just because a dashboard template has a slot.
  assert.match(page, /highPriceItems\.length \?/);
  assert.match(page, /upcoming\.length \?/);
  assert.match(page, /stockMoves\.length \?/);
  assert.match(page, /MarketEmptyState/);

  // Stock/circulation UI must use the canonical fresh-signal flags produced by
  // buildAvailabilitySummary. A stray latest_status field would admit rows that
  // stockStatusLabel can only render as 未取得.
  assert.match(page, /summary\.has_stock_signal \|\| summary\.has_restock_signal/);
  assert.equal(page.includes("summary.latest_status"), false);

  // Primary market anchors should not promote missing values as if they were evidence.
  assert.match(page, /function rankingPrimaryEvidence/);
  assert.match(page, /schedule !== "未定"/);
  assert.match(page, /stock !== "未取得"/);
  assert.match(page, /sellThrough !== "データ不足"/);

  // Catalog results are object/evidence records, not nested KPI-card grids.
  assert.match(card, /className="product-evidence"/);
  assert.equal(card.includes('className="metric-grid"'), false);
  assert.match(card, /!unavailable\.has\(metric\.value\)/);
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

  for (const forbidden of ["linear-gradient(", "radial-gradient(", "backdrop-filter:", "text-shadow:"]) {
    assert.equal(css.includes(forbidden), false, `product design layer must not introduce ${forbidden}`);
    assert.equal(detailCss.includes(forbidden), false, `product detail design layer must not introduce ${forbidden}`);
  }
});
