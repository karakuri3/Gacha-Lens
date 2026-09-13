import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const read = async (relative) => readFile(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");

test("Gacha Lens design contract is wired into the app", async () => {
  const [contract, layout, css] = await Promise.all([
    read("DESIGN.md"),
    read("app/layout.js"),
    read("app/product-design.css"),
  ]);

  assert.match(contract, /Collector Editorial — SELECTED/);
  assert.match(contract, /Object first/);
  assert.match(layout, /import "\.\/product-design\.css";/);
  assert.match(css, /font-variant-numeric:\s*tabular-nums/);
  assert.match(css, /\.dashboard-panel\s*\{[\s\S]*box-shadow:\s*none;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);

  for (const forbidden of ["linear-gradient(", "radial-gradient(", "backdrop-filter:", "text-shadow:"]) {
    assert.equal(css.includes(forbidden), false, `product design layer must not introduce ${forbidden}`);
  }
});
