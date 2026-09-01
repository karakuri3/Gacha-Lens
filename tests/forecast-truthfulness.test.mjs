import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateUpcomingVariantForecast,
  classifyForecastEvidence,
  deriveOfficialForecastAxes,
  FORECAST_MIN_EVIDENCE_FAMILIES,
} from "../lib/domain/forecast-score.js";
import {
  buildUpcomingCustomerMetrics,
  customerTags,
  hasEvidenceBackedForecast,
  opportunityScore,
  priceUpsideScore,
  scarcityScore,
} from "../lib/domain/public-display-clean.js";

function metadataVariant(overrides = {}) {
  const variant = {
    id: "variant-1",
    name: "限定 ミニチュア シークレット Hero",
    tags: ["全種", "限定"],
    signals: { preorder: 99, x: 99 },
    ...overrides,
  };
  return {
    ...variant,
    axes: variant.axes ?? deriveOfficialForecastAxes({
      variant,
      parent: { name: "Example Collection", category: "ミニチュア" },
      siblingCount: 7,
    }),
  };
}

test("metadata-only heuristics cannot create a public expectation score", () => {
  const variant = metadataVariant();
  const forecast = calculateUpcomingVariantForecast({ variant });

  assert.equal(FORECAST_MIN_EVIDENCE_FAMILIES, 2);
  assert.equal(forecast.evidence_status, "insufficient_evidence");
  assert.deepEqual(forecast.evidence_families, ["catalog_identity"]);
  assert.equal(forecast.total, null);
  assert.ok(forecast.complete > 0);
  assert.ok(forecast.ace > 0);
  assert.ok(forecast.compatibility > 0);
  assert.ok(forecast.limited > 0);
  assert.equal(forecast.preorder, 0, "manual preorder signal is not treated as observed market evidence");
  assert.equal(forecast.x, 0, "manual X signal is not treated as an observed X reaction");
});

test("catalog plus an observed preorder market family can pass the evidence gate", () => {
  const forecast = calculateUpcomingVariantForecast({
    variant: metadataVariant(),
    marketListings: [{ id: "pre-1", status: "pre_release", price: 1200, confidence: 0.9 }],
  });

  assert.equal(forecast.evidence_status, "ready");
  assert.deepEqual(forecast.evidence_families, ["catalog_identity", "preorder_market"]);
  assert.ok(Number.isFinite(forecast.total));
  assert.ok(forecast.preorder > 0);
});

test("catalog plus an observed authorized social family can pass the evidence gate", () => {
  const forecast = calculateUpcomingVariantForecast({
    variant: metadataVariant(),
    xReactions: [{
      id: "x-1",
      source_type: "x_api",
      confidence: 0.95,
      likes: 200,
      reposts: 50,
      quotes: 10,
      intent_tags: ["attention"],
    }],
  });

  assert.equal(forecast.evidence_status, "ready");
  assert.deepEqual(forecast.evidence_families, ["catalog_identity", "authorized_social"]);
  assert.ok(Number.isFinite(forecast.total));
  assert.ok(forecast.x > 0);
});

test("availability is visible as supporting evidence but does not silently masquerade as X demand", () => {
  const forecast = calculateUpcomingVariantForecast({
    variant: metadataVariant(),
    restockEvents: [{ id: "restock-1", source_type: "official", confidence: 1 }],
    stockReports: [{ id: "stock-1", source_type: "official", confidence: 1 }],
  });
  const evidence = classifyForecastEvidence({
    variant: metadataVariant(),
    restockEvents: [{ id: "restock-1", confidence: 1 }],
  });

  assert.equal(forecast.evidence_status, "insufficient_evidence");
  assert.equal(forecast.x, 0);
  assert.deepEqual(evidence.supporting_families, ["availability"]);
});

test("two observed exact-match families can qualify even when catalog identity is unavailable to the pure function", () => {
  const forecast = calculateUpcomingVariantForecast({
    variant: { axes: { complete: 50, ace: 50, compatibility: 50, limited: 50 } },
    marketListings: [{ id: "pre-2", status: "pre_release", price: 900, confidence: 0.9 }],
    xReactions: [{ id: "x-2", confidence: 0.9, likes: 10, reposts: 2, quotes: 0, intent_tags: [] }],
  });

  assert.equal(forecast.evidence_status, "ready");
  assert.deepEqual(forecast.evidence_families, ["preorder_market", "authorized_social"]);
  assert.ok(Number.isFinite(forecast.total));
});

test("public upcoming metrics and tags fail closed while evidence is insufficient", () => {
  const item = {
    variant_type: "single",
    price: 500,
    forecast_score: null,
    forecast_breakdown: {
      evidence_status: "insufficient_evidence",
      complete: 90,
      ace: 90,
      compatibility: 90,
      limited: 90,
      preorder: 0,
      x: 0,
    },
    complete_set_score: 90,
    ace_character_score: 90,
    limitedness_score: 90,
    trend_score: 90,
  };

  const metrics = buildUpcomingCustomerMetrics(item);
  const scoreMetrics = metrics.filter((metric) => ["先行注目度", "話題化期待", "入手難度", "注目度"].includes(metric.label));

  assert.equal(hasEvidenceBackedForecast(item), false);
  assert.ok(scoreMetrics.every((metric) => metric.value === "算出待ち"));
  assert.deepEqual(customerTags(item, false), []);
  assert.equal(opportunityScore(item), null);
  assert.equal(priceUpsideScore(item), null);
  assert.equal(scarcityScore(item), null);
});

test("public score helpers work once the forecast explicitly passes the evidence gate", () => {
  const item = {
    variant_type: "single",
    forecast_score: 80,
    forecast_breakdown: { evidence_status: "ready", preorder: 70 },
    complete_set_score: 75,
    ace_character_score: 85,
    limitedness_score: 65,
    trend_score: 40,
  };

  assert.equal(hasEvidenceBackedForecast(item), true);
  assert.ok(Number.isFinite(opportunityScore(item)));
  assert.ok(Number.isFinite(priceUpsideScore(item)));
  assert.ok(Number.isFinite(scarcityScore(item)));
  assert.ok(customerTags(item, false).length > 0);
});

test("legacy positive sample fixtures remain renderable only when no explicit evidence status exists", () => {
  assert.equal(hasEvidenceBackedForecast({ forecast_score: 70 }), true);
  assert.equal(hasEvidenceBackedForecast({
    forecast_score: 70,
    forecast_breakdown: { evidence_status: "insufficient_evidence" },
  }), false);
});
