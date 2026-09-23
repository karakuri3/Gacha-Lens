import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const boundary = fs.readFileSync("components/IntentPrefetchBoundary.js", "utf8");
const layout = fs.readFileSync("app/layout.js", "utf8");
const card = fs.readFileSync("components/SeriesCard.js", "utf8");

test("product navigation keeps viewport auto-prefetch disabled", () => {
  assert.match(card, /prefetch=\{false\}/);
});

test("product navigation warms only after explicit user intent", () => {
  assert.match(boundary, /^"use client";/);
  assert.match(boundary, /useRouter/);
  assert.match(boundary, /router\.prefetch\(href\)/);
  assert.match(boundary, /onPointerOver=\{warmTarget\}/);
  assert.match(boundary, /onFocusCapture=\{warmTarget\}/);
  assert.match(boundary, /onTouchStartCapture=\{warmTarget\}/);
  assert.match(boundary, /href\.startsWith\("\/series\/"\)/);
  assert.match(boundary, /warmed\.current\.has\(href\)/);
  assert.match(boundary, /a\.product-card\[href\]/);
});

test("root content installs one delegated prefetch boundary without extra layout nesting", () => {
  assert.match(layout, /IntentPrefetchBoundary from "@\/components\/IntentPrefetchBoundary"/);
  assert.match(layout, /<IntentPrefetchBoundary className="app-content">/);
  assert.match(layout, /<\/IntentPrefetchBoundary>/);
  assert.doesNotMatch(layout, /<div className="app-content">/);
});
