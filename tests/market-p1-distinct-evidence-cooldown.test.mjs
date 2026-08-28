import assert from "node:assert/strict";
import test from "node:test";
import { planPriorityOneDistinctEvidenceQueries } from "../lib/fetchers/market-p1-distinct-evidence-query-planner.js";

const now = new Date("2026-08-28T17:10:00.000Z");

function fixture() {
  const variant = {
    id: "tarts-y901539-おやすみ",
    series_id: "tarts-y901539",
    name: "おやすみ",
    slug: "tarts-y901539-おやすみ",
    variant_type: "normal",
    release_date: "2026-06-01",
  };
  const series = {
    id: "tarts-y901539",
    name: "Curious George おやすみマスコット",
    release_date: "2026-06-01",
  };
  const catalog = {
    variants: [variant],
    series: [series],
    variantById: new Map([[variant.id, variant]]),
    seriesById: new Map([[series.id, series]]),
  };
  const coverageRows = [{
    variantId: variant.id,
    seriesId: series.id,
    variantType: "normal",
    priority: 1,
    priorityReason: "one_active_listing_from_listing_guide",
    released: true,
    activeCount: 2,
    eligibleListingCount: 2,
    coverageState: "near_listing_guide",
    lastCollectionAttemptAt: "2026-08-28T16:10:00.000Z",
  }];
  return { catalog, coverageRows };
}

test("P1 distinct planner defaults to no cooldown for bounded manual progression", () => {
  const { catalog, coverageRows } = fixture();
  const plan = planPriorityOneDistinctEvidenceQueries(catalog, coverageRows, { limit: 5, now });
  assert.deepEqual(plan.selected.map((entry) => entry.variantId), ["tarts-y901539-おやすみ"]);
  assert.equal(plan.summary.cooldown_hours, 0);
  assert.equal(plan.summary.skipped_cooldown, 0);
});

test("P1 distinct planner still honors an explicitly requested cooldown", () => {
  const { catalog, coverageRows } = fixture();
  const plan = planPriorityOneDistinctEvidenceQueries(catalog, coverageRows, { limit: 5, now, cooldownHours: 24 });
  assert.equal(plan.selected.length, 0);
  assert.equal(plan.summary.cooldown_hours, 24);
  assert.equal(plan.summary.skipped_cooldown, 1);
});
