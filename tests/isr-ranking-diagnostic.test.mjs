import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("app/diagnostics/isr-ranking/[tab]/[scope]/page.js", "utf8");
const production = fs.readFileSync("app/ranking/page.js", "utf8");

test("ranking ISR diagnostic uses path params and on-demand ISR without searchParams", () => {
  assert.match(source, /export const revalidate = 300/);
  assert.match(source, /export const dynamicParams = true/);
  assert.match(source, /generateStaticParams\(\)/);
  assert.doesNotMatch(source, /searchParams/);
  assert.doesNotMatch(source, /force-dynamic/);
  assert.match(source, /getRankingSeries\(tab, scope\)/);
  assert.match(source, /isr-ranking-path-params-v1/);
});

test("diagnostic does not alter the production ranking route contract", () => {
  assert.match(production, /export const dynamic = "force-dynamic"/);
  assert.match(production, /export const revalidate = 0/);
  assert.match(production, /RankingPage\(\{ searchParams \}\)/);
});
