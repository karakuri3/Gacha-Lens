import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPriorityThreeSeedQueryPlanArtifact,
  renderPriorityThreeSeedQueryPlanMarkdown,
} from "../lib/domain/market-seed-audit.js";

function plan() {
  return {
    selected: [{
      variantId: "variant-a",
      variantName: "Variant A",
      seriesId: "series-a",
      seriesName: "Series A",
      priority: 3,
      priorityReason: "released_no_evidence",
    }],
    queries: [{
      variant_id: "variant-a",
      series_id: "series-a",
      priority: 3,
      priority_reason: "released_no_evidence",
      query: "Series A Variant A ガチャ",
      fallback_queries: ["Variant A ガチャ", "series a variant a ガチャ"],
    }],
  };
}

test("Priority 3 seed query plan keeps an allowlisted primary and fallback plan", () => {
  const artifact = buildPriorityThreeSeedQueryPlanArtifact(plan());
  assert.equal(artifact.priority, 3);
  assert.equal(artifact.selected_variant_count, 1);
  assert.equal(artifact.query_attempt_count, 2);
  assert.deepEqual(artifact.selected_variants[0].fallback_queries, ["Variant A ガチャ"]);
  assert.match(renderPriorityThreeSeedQueryPlanMarkdown(artifact), /Primary query/);
});

test("Priority 3 seed query plans reject non-P3 selection and secret-shaped fields", () => {
  const invalidPriority = plan();
  invalidPriority.queries[0].priority = 1;
  assert.throws(() => buildPriorityThreeSeedQueryPlanArtifact(invalidPriority), /invalid selection/);

  const secret = plan();
  secret.queries[0].secret = "must-not-persist";
  assert.throws(() => buildPriorityThreeSeedQueryPlanArtifact(secret), /forbidden field/);
});
