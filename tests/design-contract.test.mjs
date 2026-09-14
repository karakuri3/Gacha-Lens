import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const read = async (relative) => readFile(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");

test("Gacha Lens design contract is wired into the app", async () => {
  const [contract, layout, page, css] = await Promise.all([
    read("DESIGN.md"),
    read("app/layout.js"),
    read("app/page.js"),
    read("app/product-design.css"),
  ]);

  assert.match(contract, /Collector Editorial — SELECTED/);
  assert.match(contract, /Object first/);
  assert.match(layout, /import "\.\/product-design\.css";/);
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

  for (const forbidden of ["linear-gradient(", "radial-gradient(", "backdrop-filter:", "text-shadow:"]) {
    assert.equal(css.includes(forbidden), false, `product design layer must not introduce ${forbidden}`);
  }
});
