import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const schedulePage = fs.readFileSync(new URL("../app/schedule/page.js", import.meta.url), "utf8");

function catalogRequestBlock() {
  const start = schedulePage.indexOf("const catalogPage = await getParentSeriesCatalogPage({");
  const end = schedulePage.indexOf("const scheduledItems =", start);
  assert.ok(start >= 0 && end > start, "schedule catalog request block must exist");
  return schedulePage.slice(start, end);
}

test("monthly schedule queries the selected month without an upcoming-only filter", () => {
  const block = catalogRequestBlock();
  assert.match(block, /month:\s*selectedMonth/);
  assert.doesNotMatch(block, /release:\s*["']upcoming["']/);
  assert.doesNotMatch(block, /filter\([^\n]*!item\.is_released/);
});

test("monthly schedule links to the same complete month in the series catalog", () => {
  assert.match(schedulePage, /href=\{`\/series\?month=\$\{selectedMonth\}&sort=newest`\}/);
  assert.doesNotMatch(schedulePage, /\/series\?release=upcoming&month=/);
});

test("monthly schedule copy describes release information rather than future-only results", () => {
  assert.match(schedulePage, /ガチャ新作・発売情報/);
  assert.match(schedulePage, /発売シリーズ/);
  assert.match(schedulePage, /発売情報はまだありません/);
});
