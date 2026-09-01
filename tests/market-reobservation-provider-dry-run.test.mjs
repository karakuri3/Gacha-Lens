import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildMarketplaceListingId } from "../lib/domain/market-canary-write.js";
import {
  enforceProviderPacing,
  runMarketReobservationProviderDryRun,
} from "../scripts/market-reobservation-provider-dry-run.mjs";

const NOW = "2026-09-01T10:30:00.000Z";

function listing(index, provider = "rakuten_ichiba", overrides = {}) {
  const sourceListingId = provider === "rakuten_ichiba" ? `shop:item-${index}` : `shop_item-${index}`;
  const publicUrl = provider === "rakuten_ichiba"
    ? `https://item.rakuten.co.jp/shop/item-${index}/`
    : `https://store.shopping.yahoo.co.jp/shop/item-${index}.html`;
  const source = provider === "rakuten_ichiba" ? "rakuten" : "yahoo_shopping";
  return {
    id: buildMarketplaceListingId({ provider, sourceListingId, publicUrl, title: `Item ${index}` }),
    variant_id: `variant-${index}`,
    matched_variant_id: `variant-${index}`,
    series_id: `series-${index}`,
    title: `Item ${index}`,
    listing_type: "single",
    market_review_type: "single",
    price: 500 + index,
    status: "active",
    source,
    source_type: "marketplace",
    source_url: publicUrl,
    listed_at: "2026-08-01T00:00:00.000Z",
    last_observed_at: "2026-08-31T00:00:00.000Z",
    review_required: false,
    created_at: "2026-08-01T00:00:00.000Z",
    raw: { provider, source_listing_id: sourceListingId, public_url: publicUrl },
    ...overrides,
  };
}

function seenRead(row) {
  return {
    result: {
      outcome: "seen",
      provider: row.raw.provider,
      source_listing_id: row.raw.source_listing_id,
      public_url: row.source_url,
      price: row.price,
      status: row.status,
      reason: "fixture_exact_read",
    },
    diagnostics: {
      attempt_count: 1,
      retry_count: 0,
      final_status: 200,
      failure_category: null,
      rate_limited: false,
      timed_out: false,
      recovered_after_retry: false,
    },
  };
}

test("runner reads listings once, filters unsafe lifecycle rows and emits dry-run only", async () => {
  const rows = [
    listing(1),
    listing(2, "yahoo_shopping"),
    listing(3, "rakuten_ichiba", { review_required: true }),
    listing(4, "rakuten_ichiba", { status: "sold" }),
  ];
  const readCalls = [];
  const providerCalls = [];
  const artifact = await runMarketReobservationProviderDryRun({
    now: NOW,
    limit: 25,
    fetchRows: async (table, options) => {
      readCalls.push({ table, options });
      return rows;
    },
    providerRead: async (row) => {
      providerCalls.push(row.id);
      return seenRead(row);
    },
    sleep: async () => {},
  });

  assert.deepEqual(readCalls.map((entry) => entry.table), ["market_listings"]);
  assert.match(readCalls[0].options.select, /raw/);
  assert.equal(artifact.eligible_listing_count, 2);
  assert.equal(artifact.due_listing_count, 2);
  assert.equal(providerCalls.length, 2);
  assert.equal(artifact.projected_writes.observation_inserts, 2);
  assert.equal(artifact.projected_writes.listing_updates, 2);
  assert.equal(artifact.production_actions, 0);
  assert.equal(artifact.kind, "market_reobservation_exact_provider_dry_run");
});

test("default observation key is deterministic for the same UTC hour", async () => {
  const row = listing(1);
  const options = {
    now: NOW,
    fetchRows: async () => [row],
    providerRead: async () => seenRead(row),
    sleep: async () => {},
  };
  const first = await runMarketReobservationProviderDryRun(options);
  const retry = await runMarketReobservationProviderDryRun(options);
  assert.equal(first.observation_key, "reobs-v1:20260901T10");
  assert.equal(retry.observation_key, first.observation_key);
  assert.deepEqual(retry.projected_writes, first.projected_writes);
});

test("runner limit is an operational bound and does not redefine collection completion", async () => {
  const rows = Array.from({ length: 40 }, (_, index) => listing(index + 1));
  const artifact = await runMarketReobservationProviderDryRun({
    now: NOW,
    limit: 7,
    fetchRows: async () => rows,
    providerRead: async (row) => seenRead(row),
    sleep: async () => {},
  });
  assert.equal(artifact.eligible_listing_count, 40);
  assert.equal(artifact.due_listing_count, 7);
  assert.equal(artifact.selected_limit, 7);
  assert.equal(artifact.projected_writes.observation_inserts, 7);
});

test("provider pacing is tracked independently per provider", async () => {
  let nowMs = 10_000;
  const waits = [];
  const last = new Map();
  const clock = () => nowMs;
  const sleep = async (ms) => {
    waits.push(ms);
    nowMs += ms;
  };

  assert.equal(await enforceProviderPacing("rakuten_ichiba", last, { clock, sleep }), 0);
  last.set("rakuten_ichiba", clock());
  assert.equal(await enforceProviderPacing("yahoo_shopping", last, { clock, sleep }), 0);
  last.set("yahoo_shopping", clock());
  assert.equal(await enforceProviderPacing("rakuten_ichiba", last, { clock, sleep }), 1200);
  last.set("rakuten_ichiba", clock());
  assert.equal(await enforceProviderPacing("yahoo_shopping", last, { clock, sleep }), 0, "Rakuten wait also advances elapsed Yahoo time");
  assert.deepEqual(waits, [1200]);
});

test("provider exception becomes provider_error and never creates a projected write", async () => {
  const row = listing(1);
  const artifact = await runMarketReobservationProviderDryRun({
    now: NOW,
    fetchRows: async () => [row],
    providerRead: async () => {
      throw new Error("secret provider failure details");
    },
    sleep: async () => {},
  });

  assert.equal(artifact.outcome_counts.provider_error, 1);
  assert.equal(artifact.projected_writes.observation_inserts, 0);
  assert.equal(artifact.projected_writes.listing_updates, 0);
  assert.equal(artifact.provider_read_summary.failure_categories.provider_read_exception, 1);
  assert.doesNotMatch(JSON.stringify(artifact), /secret provider failure details/);
});

test("runner source has no Production write helper or write mode", () => {
  const source = fs.readFileSync(new URL("../scripts/market-reobservation-provider-dry-run.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /upsertRows|deleteRowsByIds|apply_migration|market:bounded-persist/);
  assert.doesNotMatch(source, /--write|--apply|production[_-]?write/i);
  assert.match(source, /production_actions:\s*0/);
});
