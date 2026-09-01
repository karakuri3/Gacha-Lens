import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSourceCapabilities,
  loadProductionDataScaleScoreboard,
} from "../scripts/data-scale-scoreboard-report.mjs";

const NOW = "2026-09-01T10:00:00.000Z";
const MAIN = "3e633b1fe591aadd5e02e409104aa0214457c527";

function rowsFor(table) {
  const commonTime = "2026-09-01T09:30:00.000Z";
  const rows = {
    series: [{ id: "series-1" }],
    variants: [{ id: "variant-1" }, { id: "variant-2" }],
    market_listings: [{
      id: "listing-1",
      variant_id: "variant-1",
      listing_type: "single",
      status: "active",
      source: "rakuten",
      source_url: "https://item.rakuten.co.jp/example/item-1/",
      last_observed_at: commonTime,
      created_at: commonTime,
      review_required: false,
      raw: { provider: "rakuten_ichiba" },
    }],
    market_listing_observations: [{
      id: "observation-1",
      listing_id: "listing-1",
      variant_id: "variant-1",
      price: 500,
      status: "active",
      source: "rakuten",
      observed_at: commonTime,
      created_at: commonTime,
      raw: {},
    }],
    stock_reports: [{
      id: "stock-review",
      variant_id: "variant-1",
      reported_at: commonTime,
      created_at: commonTime,
      review_required: true,
    }],
    restock_events: [],
    x_reactions: [],
    outbound_clicks: [{
      id: "click-1",
      variant_id: "variant-1",
      provider: "rakuten",
      clicked_at: commonTime,
    }],
    ingestion_runs: [{
      id: "run-1",
      task: "market",
      status: "success",
      started_at: commonTime,
      created_at: commonTime,
    }],
    import_issues: [],
  };
  return rows[table] ?? [];
}

test("Production scoreboard loader uses only the injected read interface in deterministic table order", async () => {
  const calls = [];
  const originalX = process.env.X_FETCH_ENABLED;
  process.env.X_FETCH_ENABLED = "false";

  try {
    const snapshot = await loadProductionDataScaleScoreboard({
      now: NOW,
      mainSha: MAIN,
      fetchRows: async (table, options) => {
        calls.push({ table, options });
        return structuredClone(rowsFor(table));
      },
    });

    assert.deepEqual(calls.map((entry) => entry.table), [
      "series",
      "variants",
      "market_listings",
      "market_listing_observations",
      "stock_reports",
      "restock_events",
      "x_reactions",
      "outbound_clicks",
      "ingestion_runs",
      "import_issues",
    ]);
    assert.ok(calls.every((entry) => typeof entry.options.select === "string" && entry.options.select.length > 0));
    assert.equal(snapshot.panels.data.catalog.series_total.value, 1);
    assert.equal(snapshot.panels.data.catalog.variants_total.value, 2);
    assert.equal(snapshot.panels.data.market_breadth.listings_total.value, 1);
    assert.equal(snapshot.panels.data.history.observations_total.value, 1);
    assert.equal(snapshot.panels.data.signals.stock.value.total, 0, "review-required stock rows are excluded from public signal coverage");
    assert.equal(snapshot.panels.data.signals.social.state, "not_instrumented");
    assert.equal(snapshot.panels.traffic.state, "unavailable");
    assert.equal(snapshot.panels.revenue.state, "unavailable");
  } finally {
    if (originalX === undefined) delete process.env.X_FETCH_ENABLED;
    else process.env.X_FETCH_ENABLED = originalX;
  }
});

test("source capability map keeps Mercari as partnership-required and X activation explicit", () => {
  const originalX = process.env.X_FETCH_ENABLED;
  try {
    process.env.X_FETCH_ENABLED = "false";
    const disabled = buildSourceCapabilities();
    assert.equal(disabled.find((entry) => entry.source === "mercari")?.state, "partnership_required");
    assert.equal(disabled.find((entry) => entry.source === "x")?.state, "not_configured");

    process.env.X_FETCH_ENABLED = "true";
    const enabled = buildSourceCapabilities();
    assert.equal(enabled.find((entry) => entry.source === "x")?.state, "active");
  } finally {
    if (originalX === undefined) delete process.env.X_FETCH_ENABLED;
    else process.env.X_FETCH_ENABLED = originalX;
  }
});
