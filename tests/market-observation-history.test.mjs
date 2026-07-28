import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildPriceHistoryRows,
  dedupeMarketObservationsByListingDay,
} from "../lib/domain/market-observation-history.js";

function observation(id, overrides = {}) {
  return {
    id,
    listing_id: Object.hasOwn(overrides, "listing_id") ? overrides.listing_id : "listing-1",
    price: Object.hasOwn(overrides, "price") ? overrides.price : 1000,
    status: Object.hasOwn(overrides, "status") ? overrides.status : "active",
    observed_at: Object.hasOwn(overrides, "observed_at") ? overrides.observed_at : "2026-07-28T01:00:00.000Z",
    created_at: overrides.created_at,
    raw: overrides.raw,
    seller: overrides.seller,
    credential: overrides.credential,
  };
}

test("canary and normal observations for one listing day count once", () => {
  const rows = dedupeMarketObservationsByListingDay([
    observation("market-canary-marker", {
      observed_at: "2026-07-28T01:00:00.000Z",
      raw: { canary_audit_run_id: "30278197797" },
      seller: "private-seller",
      credential: "private-token",
    }),
    observation("market-normal-daily", { observed_at: "2026-07-28T02:00:00.000Z" }),
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "market-normal-daily");
  assert.doesNotMatch(JSON.stringify(rows), /raw|seller|credential|private/i);
});

test("latest observation supplies price and normalized status", () => {
  const rows = dedupeMarketObservationsByListingDay([
    observation("older", { price: 900, status: "active", observed_at: "2026-07-28T01:00:00Z" }),
    observation("newer", { price: 1300, status: "SOLD", observed_at: "2026-07-28T05:00:00Z" }),
  ]);

  assert.deepEqual([rows[0].price, rows[0].status], [1300, "sold"]);
});

test("daily aggregate uses deduped average, high, low, count and sold values", () => {
  const rows = buildPriceHistoryRows([
    observation("listing-1-old", { price: 800, observed_at: "2026-07-28T01:00:00Z" }),
    observation("listing-1-new", { price: 1000, status: "SOLD", observed_at: "2026-07-28T02:00:00Z" }),
    observation("listing-2", { listing_id: "listing-2", price: 1501, status: "active" }),
  ]);

  assert.deepEqual(rows, [{
    date: "2026-07-28",
    average: 1251,
    high: 1501,
    low: 1000,
    count: 2,
    sold: 1,
  }]);
});

test("the same listing remains once on each different UTC day", () => {
  const rows = dedupeMarketObservationsByListingDay([
    observation("day-1", { observed_at: "2026-07-27T23:59:59Z" }),
    observation("day-2", { observed_at: "2026-07-28T00:00:00Z" }),
  ]);
  assert.deepEqual(rows.map((row) => row.date), ["2026-07-28", "2026-07-27"]);
});

test("different listings on the same day both remain", () => {
  const rows = dedupeMarketObservationsByListingDay([
    observation("first", { listing_id: "listing-1" }),
    observation("second", { listing_id: "listing-2" }),
  ]);
  assert.equal(rows.length, 2);
});

test("same-time ID tie-break is independent of input order", () => {
  const input = [
    observation("a", { price: 900, status: "active" }),
    observation("b", { price: 1200, status: "sold" }),
  ];
  const forward = dedupeMarketObservationsByListingDay(input);
  const reversed = dedupeMarketObservationsByListingDay([...input].reverse());

  assert.deepEqual(forward, reversed);
  assert.deepEqual([forward[0].id, forward[0].price, forward[0].status], ["b", 1200, "sold"]);
});

test("legacy daily-ID canary marker and normal observation count once", () => {
  const rows = dedupeMarketObservationsByListingDay([
    observation("market-observation-legacy", { observed_at: "2026-07-28T01:00:00Z" }),
    observation("market-observation-normal", { observed_at: "2026-07-28T02:00:00Z" }),
  ]);
  assert.equal(rows.length, 1);
});

test("new canary marker and normal observation count once", () => {
  const rows = dedupeMarketObservationsByListingDay([
    observation("market-canary-observation-new", { observed_at: "2026-07-28T01:00:00Z" }),
    observation("market-observation-normal", { observed_at: "2026-07-28T02:00:00Z" }),
  ]);
  assert.equal(rows.length, 1);
});

test("invalid timestamps are excluded and a valid created_at is a safe fallback", () => {
  const rows = dedupeMarketObservationsByListingDay([
    observation("invalid", { observed_at: "not-a-date", created_at: "also-invalid" }),
    observation("fallback", { observed_at: "", created_at: "2026-07-28T03:00:00Z" }),
  ]);
  assert.deepEqual(rows.map((row) => row.id), ["fallback"]);
});

test("null, nonnumeric, zero and negative prices are excluded", () => {
  const rows = dedupeMarketObservationsByListingDay([
    observation("null", { listing_id: "a", price: null }),
    observation("nonnumeric", { listing_id: "b", price: "not-a-number" }),
    observation("zero", { listing_id: "c", price: 0 }),
    observation("negative", { listing_id: "d", price: -1 }),
    observation("valid", { listing_id: "e", price: "1250" }),
  ]);
  assert.deepEqual(rows.map((row) => [row.id, row.price]), [["valid", 1250]]);
});

test("missing listing IDs never merge with each other", () => {
  const rows = dedupeMarketObservationsByListingDay([
    observation("unlinked-a", { listing_id: null }),
    observation("unlinked-b", { listing_id: "" }),
  ]);
  assert.equal(rows.length, 2);
});

test("price history is date-descending and capped at thirty days", () => {
  const observations = Array.from({ length: 35 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 6, 1 + index, 12));
    return observation(`day-${index}`, {
      listing_id: `listing-${index}`,
      observed_at: date.toISOString(),
      price: 1000 + index,
    });
  });
  const rows = buildPriceHistoryRows(observations, { maxDays: 99 });

  assert.equal(rows.length, 30);
  assert.equal(rows[0].date, "2026-08-04");
  assert.equal(rows.at(-1).date, "2026-07-06");
});

test("PriceHistoryTable uses the shared helper while PriceTrendChart remains separate", async () => {
  const [table, chart] = await Promise.all([
    readFile(new URL("../components/PriceHistoryTable.js", import.meta.url), "utf8"),
    readFile(new URL("../components/PriceTrendChart.js", import.meta.url), "utf8"),
  ]);
  assert.match(table, /buildPriceHistoryRows/);
  assert.doesNotMatch(table, /function buildRows/);
  assert.match(chart, /function buildTimeline/);
  assert.doesNotMatch(chart, /market-observation-history/);
});
