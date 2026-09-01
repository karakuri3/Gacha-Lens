import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDataScaleScoreboard,
  renderDataScaleScoreboardHuman,
} from "../lib/domain/data-scale-scoreboard.js";

const NOW = "2026-09-01T09:30:00.000Z";
const MAIN = "3e633b1fe591aadd5e02e409104aa0214457c527";

function listing(index, overrides = {}) {
  const provider = overrides.provider ?? (index % 2 ? "rakuten_ichiba" : "yahoo_shopping");
  const source = provider === "rakuten_ichiba" ? "rakuten" : "yahoo_shopping";
  return {
    id: `listing-${index}`,
    variant_id: overrides.variant_id ?? `variant-${index}`,
    series_id: overrides.series_id ?? `series-${index}`,
    listing_type: "single",
    status: "active",
    source,
    source_url: `https://example.com/${index}`,
    review_required: false,
    created_at: "2026-09-01T08:00:00.000Z",
    listed_at: "2026-09-01T08:00:00.000Z",
    last_observed_at: "2026-09-01T08:00:00.000Z",
    raw: { provider },
    ...overrides,
  };
}

function observation(listingId, index, overrides = {}) {
  return {
    id: `obs-${listingId}-${index}`,
    listing_id: listingId,
    variant_id: overrides.variant_id ?? listingId.replace("listing", "variant"),
    price: 500,
    status: "active",
    source: "rakuten",
    observed_at: new Date(Date.parse(NOW) - index * 60_000).toISOString(),
    raw: {},
    ...overrides,
  };
}

test("current-like 107/107 baseline exposes history as P0 bottleneck", () => {
  const variants = Array.from({ length: 23_808 }, (_, index) => ({ id: `variant-${index + 1}` }));
  const listings = Array.from({ length: 107 }, (_, index) => listing(index + 1));
  const observations = listings.map((row, index) => observation(row.id, index + 1, { variant_id: row.variant_id }));

  const snapshot = buildDataScaleScoreboard({
    series: Array.from({ length: 10_241 }, (_, index) => ({ id: `series-${index}` })),
    variants,
    marketListings: listings,
    marketObservations: observations,
    stockReports: [],
    restockEvents: [],
    outboundClicks: [],
    socialAuthorized: false,
  }, { now: NOW, mainSha: MAIN });

  assert.equal(snapshot.panels.data.market_breadth.listings_total.value, 107);
  assert.equal(snapshot.panels.data.history.observations_total.value, 107);
  assert.equal(snapshot.panels.data.history.listings_with_1_observation.value, 107);
  assert.equal(snapshot.panels.data.history.listings_reobserved_total.value, 0);
  assert.equal(snapshot.panels.data.history.reobservation_rate.value, 0);
  assert.equal(snapshot.panels.data.signals.stock.value.total, 0);
  assert.equal(snapshot.panels.data.signals.restock.value.total, 0);
  assert.equal(snapshot.panels.data.signals.social.state, "not_instrumented");
  assert.equal(snapshot.bottleneck.label, "history_not_enabled");
  assert.match(renderDataScaleScoreboardHuman(snapshot), /P0 Bottleneck history_not_enabled/);
});

test("known listings with zero observations are included in history distribution", () => {
  const listings = [listing(1), listing(2), listing(3)];
  const snapshot = buildDataScaleScoreboard({
    variants: [{ id: "variant-1" }, { id: "variant-2" }, { id: "variant-3" }],
    marketListings: listings,
    marketObservations: [observation("listing-1", 1)],
  }, { now: NOW });

  assert.equal(snapshot.panels.data.history.listings_with_0_observations.value, 2);
  assert.equal(snapshot.panels.data.history.listings_with_1_observation.value, 1);
  assert.deepEqual(snapshot.panels.data.history.observations_per_listing_distribution.value, {
    p50: 0,
    p90: 1,
    max: 1,
  });
});

test("depth keeps 10+ distinct listings for one variant instead of treating 3 as complete", () => {
  const listings = Array.from({ length: 12 }, (_, index) => listing(index + 1, {
    variant_id: "variant-deep",
    series_id: "series-deep",
  }));
  const snapshot = buildDataScaleScoreboard({
    variants: [{ id: "variant-deep" }, { id: "variant-empty" }],
    marketListings: listings,
    marketObservations: listings.map((row, index) => observation(row.id, index + 1, { variant_id: "variant-deep" })),
  }, { now: NOW });

  const depth = snapshot.panels.data.market_depth;
  assert.equal(depth.variants_0_fresh.value, 1);
  assert.equal(depth.variants_1_fresh.value, 0);
  assert.equal(depth.variants_3_4_fresh.value, 0);
  assert.equal(depth.variants_10_plus_fresh.value, 1);
  assert.equal(depth.covered_variant_listing_distribution.value.max, 12);
});

test("repeated observations accumulate and outcome instrumentation stays separate", () => {
  const row = listing(1);
  const observations = [
    observation(row.id, 3, { raw: {} }),
    observation(row.id, 2, { raw: { market_reobservation: { outcome: "unchanged" } } }),
    observation(row.id, 1, { price: 650, raw: { market_reobservation: { outcome: "price_changed" } } }),
  ];
  const snapshot = buildDataScaleScoreboard({
    variants: [{ id: row.variant_id }],
    marketListings: [row],
    marketObservations: observations,
  }, { now: NOW });

  const history = snapshot.panels.data.history;
  assert.equal(history.observations_total.value, 3);
  assert.equal(history.listings_reobserved_total.value, 1);
  assert.equal(history.reobservation_rate.value, 100);
  assert.deepEqual(history.reobservation_outcomes.value, { price_changed: 1, unchanged: 1 });
});

test("zero, unavailable, and not-instrumented remain distinct", () => {
  const snapshot = buildDataScaleScoreboard({
    variants: [],
    marketListings: [],
    marketObservations: [],
    stockReports: [],
    restockEvents: [],
    socialAuthorized: false,
  }, { now: NOW });

  assert.deepEqual(snapshot.panels.data.market_breadth.listings_total, { state: "available", value: 0 });
  assert.deepEqual(snapshot.panels.data.signals.stock, {
    state: "available",
    value: { total: 0, distinct_variants: 0, fresh_24h: 0, fresh_7d: 0, fresh_30d: 0 },
  });
  assert.equal(snapshot.panels.data.signals.social.state, "not_instrumented");
  assert.equal(snapshot.panels.traffic.state, "unavailable");
  assert.equal(snapshot.panels.revenue.state, "unavailable");
  assert.equal(snapshot.data_as_of, null);
});

test("invalid external metrics become unavailable rather than available-null", () => {
  const snapshot = buildDataScaleScoreboard({
    traffic: { state: "available", impressions_7d: Number.NaN },
    revenue: { state: "not_instrumented" },
  }, { now: NOW });

  assert.equal(snapshot.panels.traffic.state, "available");
  assert.equal(snapshot.panels.traffic.impressions_7d.state, "unavailable");
  assert.equal(snapshot.panels.revenue.state, "not_instrumented");
});

test("affiliate eligible click share is explicitly provider+variant eligible, not revenue", () => {
  const affiliate = listing(1, {
    variant_id: "variant-a",
    raw: {
      provider: "rakuten_ichiba",
      affiliate_url: "https://hb.afl.rakuten.co.jp/example",
      affiliate_url_source: "rakuten_api",
      affiliate_url_contract: "contract",
      source_documentation: "https://example.com/docs",
    },
  });
  const ordinary = listing(2, { variant_id: "variant-b", provider: "yahoo_shopping" });
  const clicks = [
    { variant_id: "variant-a", provider: "rakuten", clicked_at: "2026-09-01T09:00:00Z" },
    { variant_id: "variant-b", provider: "yahoo", clicked_at: "2026-09-01T09:00:00Z" },
  ];
  const snapshot = buildDataScaleScoreboard({
    marketListings: [affiliate, ordinary],
    marketObservations: [],
    outboundClicks: clicks,
  }, { now: NOW });

  assert.equal(snapshot.panels.click.clicks_30d.value, 2);
  assert.equal(snapshot.panels.click.affiliate_eligible_click_share_30d.value, 50);
});

test("sold_out is not counted as completed-sale evidence", () => {
  const snapshot = buildDataScaleScoreboard({
    marketListings: [
      listing(1, { status: "sold_out" }),
      listing(2, { status: "sold" }),
      listing(3, { status: "active" }),
    ],
    marketObservations: [],
  }, { now: NOW });

  assert.equal(snapshot.panels.data.market_breadth.completed_sale_evidence_count.value, 1);
});

test("daily and weekly deltas compare only available comparable metrics", () => {
  const baseInput = {
    variants: [{ id: "variant-1" }],
    marketListings: [listing(1)],
    marketObservations: [observation("listing-1", 1)],
    outboundClicks: [],
  };
  const previousDay = buildDataScaleScoreboard(baseInput, { now: NOW });
  const current = buildDataScaleScoreboard({
    ...baseInput,
    marketListings: [listing(1), listing(2)],
    marketObservations: [
      observation("listing-1", 1),
      observation("listing-1", 2),
      observation("listing-2", 1),
    ],
    outboundClicks: [{ variant_id: "variant-1", provider: "rakuten", clicked_at: "2026-09-01T09:00:00Z" }],
  }, { now: NOW, previousDay, previousWeek: previousDay });

  assert.equal(current.trends.day.listings_total.value, 1);
  assert.equal(current.trends.day.observations_total.value, 2);
  assert.equal(current.trends.day.listings_reobserved_total.value, 1);
  assert.equal(current.trends.week.clicks_7d.value, 1);
});

test("once history is healthy the next bottleneck advances to depth or source coverage", () => {
  const variants = Array.from({ length: 100 }, (_, index) => ({ id: `variant-${index + 1}` }));
  const listings = Array.from({ length: 10 }, (_, index) => listing(index + 1));
  const observations = listings.flatMap((row, index) => [
    observation(row.id, index * 2 + 2, { variant_id: row.variant_id }),
    observation(row.id, index * 2 + 1, { variant_id: row.variant_id }),
  ]);
  const snapshot = buildDataScaleScoreboard({
    variants,
    marketListings: listings,
    marketObservations: observations,
    stockReports: [],
    restockEvents: [],
  }, { now: NOW });

  assert.equal(snapshot.panels.data.history.reobservation_rate.value, 100);
  assert.equal(snapshot.bottleneck.label, "depth_insufficient");
});
