import assert from "node:assert/strict";
import test from "node:test";
import { classifyVariantMarketCoverage } from "../lib/domain/market-coverage.js";

const parentSeries = Object.freeze({
  id: "s-release-boundary",
  slug: "release-boundary",
  name: "発売境界シリーズ",
  franchise: "発売境界",
  is_released: false,
  release_date: "2026-09-15",
});

const variant = Object.freeze({
  id: "v-release-boundary",
  slug: "release-boundary-item",
  series_id: parentSeries.id,
  name: "発売境界アイテム",
  variant_type: "normal",
  released: false,
  release_date: "2026-09-15",
});

test("market coverage keeps stale persisted false upcoming before JST release day", () => {
  const row = classifyVariantMarketCoverage({
    variant,
    parentSeries,
    now: new Date("2026-09-14T14:59:59.999Z"),
  });
  assert.equal(row.released, false);
  assert.equal(row.releaseDate, "2026-09-14T15:00:00.000Z");
  assert.equal(row.priorityReason, "releasing_within_60_days");
});

test("market coverage ages stale persisted false to released exactly at 00:00 JST", () => {
  const row = classifyVariantMarketCoverage({
    variant,
    parentSeries,
    now: new Date("2026-09-14T15:00:00.000Z"),
  });
  assert.equal(row.released, true);
  assert.equal(row.releaseDate, "2026-09-14T15:00:00.000Z");
  assert.equal(row.priorityReason, "recently_released_without_market_evidence");
});

test("market coverage preserves explicit released=true even with a future canonical date", () => {
  const row = classifyVariantMarketCoverage({
    variant: { ...variant, released: true, release_date: "2026-10-01" },
    parentSeries,
    now: new Date("2026-09-14T15:00:00.000Z"),
  });
  assert.equal(row.released, true);
});
