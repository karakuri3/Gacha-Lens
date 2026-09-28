import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRecordShape, normalizeStoredRecordShape } from "../lib/data/gacha-repository.js";
import { recordMatchesCatalogQuery } from "../lib/domain/catalog-query.js";
import {
  buildEffectiveReleaseQueryPlan,
  buildEffectiveVariantReleaseQueryPlan,
  effectiveReleaseState,
  jstCalendarDate,
  releaseCalendarDate,
  releaseDateAtJstStart,
} from "../lib/domain/release-state.js";
import {
  applyEffectiveReleaseFilter,
  applyEffectiveVariantReleaseFilter,
  withEffectiveVariantReleaseRelations,
} from "../lib/data/supabase-gacha-repository.js";

const BEFORE_JST_RELEASE_DAY = new Date("2026-09-14T14:59:59.999Z");
const AT_JST_RELEASE_DAY = new Date("2026-09-14T15:00:00.000Z");
const DURING_JST_RELEASE_DAY = new Date("2026-09-15T00:30:00.000Z");
const AFTER_JST_RELEASE_DAY = new Date("2026-09-15T03:00:00.000Z");
const PRODUCTION_AUDIT_NOW = new Date("2026-09-28T00:00:00.000Z");

const STALE_PRODUCTION_VARIANTS = Object.freeze([
  ["gashapon-4570118233042000-パンどろぼう-すりすり", "gashapon-4570118233042000", "2026-08-01"],
  ["gashapon-4570118233042000-パンどろぼうa", "gashapon-4570118233042000", "2026-08-01"],
  ["gashapon-4570118233042000-パンどろぼうb", "gashapon-4570118233042000", "2026-08-01"],
  ["gashapon-4582769776601000-jaehee", "gashapon-4582769776601000", "2026-09-01"],
  ["gashapon-4582769776601000-riku", "gashapon-4582769776601000", "2026-09-01"],
  ["gashapon-4582769776601000-ryo", "gashapon-4582769776601000", "2026-09-01"],
  ["gashapon-4582769776601000-sakuya", "gashapon-4582769776601000", "2026-09-01"],
  ["gashapon-4582769776601000-sion", "gashapon-4582769776601000", "2026-09-01"],
  ["gashapon-4582769776601000-yushi", "gashapon-4582769776601000", "2026-09-01"],
  ["gashapon-4582769979477000-provisional", "gashapon-4582769979477000", "2026-09-01"],
  ["gashapon-4582770068344000-no-207", "gashapon-4582770068344000", "2026-08-01"],
  ["gashapon-4582770068344000-no-253", "gashapon-4582770068344000", "2026-08-01"],
  ["gashapon-4582770068344000-no-295", "gashapon-4582770068344000", "2026-08-01"],
  ["gashapon-4582770068344000-no-314", "gashapon-4582770068344000", "2026-08-01"],
  ["gashapon-4582770068344000-no-316", "gashapon-4582770068344000", "2026-08-01"],
  ["gashapon-4582770068344000-no-673", "gashapon-4582770068344000", "2026-08-01"],
  ["gashapon-4582770121827000-all", "gashapon-4582770121827000", "2026-09-01"],
  ["gashapon-4582770121827000-chaehyun", "gashapon-4582770121827000", "2026-09-01"],
  ["gashapon-4582770121827000-dayeon", "gashapon-4582770121827000", "2026-09-01"],
  ["gashapon-4582770121827000-hikaru", "gashapon-4582770121827000", "2026-09-01"],
  ["gashapon-4582770121827000-huening-bahiyyih", "gashapon-4582770121827000", "2026-09-01"],
  ["gashapon-4582770121827000-xiaoting", "gashapon-4582770121827000", "2026-09-01"],
  ["gashapon-4582770121827000-yujin", "gashapon-4582770121827000", "2026-09-01"],
]);

test("JST calendar date changes at 00:00 Asia/Tokyo instead of UTC midnight", () => {
  assert.equal(jstCalendarDate(BEFORE_JST_RELEASE_DAY), "2026-09-14");
  assert.equal(jstCalendarDate(AT_JST_RELEASE_DAY), "2026-09-15");
  assert.equal(jstCalendarDate(new Date("2026-09-14T23:59:59.999Z")), "2026-09-15");
});

test("persisted false + yesterday is released", () => {
  assert.equal(effectiveReleaseState({ released: false, release_date: "2026-09-14" }, { now: AT_JST_RELEASE_DAY }), true);
});

test("persisted false + today flips exactly at 00:00 JST and stays released during the day", () => {
  const row = { released: false, release_date: "2026-09-15" };
  assert.equal(effectiveReleaseState(row, { now: BEFORE_JST_RELEASE_DAY }), false);
  assert.equal(effectiveReleaseState(row, { now: AT_JST_RELEASE_DAY }), true);
  assert.equal(effectiveReleaseState(row, { now: DURING_JST_RELEASE_DAY }), true);
  assert.equal(effectiveReleaseState(row, { now: AFTER_JST_RELEASE_DAY }), true);
});

test("persisted false + tomorrow remains upcoming", () => {
  assert.equal(effectiveReleaseState({ released: false, release_date: "2026-09-16" }, { now: AT_JST_RELEASE_DAY }), false);
});

test("persisted true remains released even when the canonical date is a future rerelease date", () => {
  assert.equal(effectiveReleaseState({ released: true, release_date: "2027-01-01" }, { now: AT_JST_RELEASE_DAY }), true);
});

test("null or invalid release dates preserve explicit persisted state", () => {
  assert.equal(effectiveReleaseState({ released: false, release_date: null }, { now: AT_JST_RELEASE_DAY }), false);
  assert.equal(effectiveReleaseState({ released: true, release_date: null }, { now: AT_JST_RELEASE_DAY }), true);
  assert.equal(effectiveReleaseState({ released: false, release_date: "not-a-date" }, { now: AT_JST_RELEASE_DAY }), false);
  assert.equal(effectiveReleaseState({ released: true, release_date: "not-a-date" }, { now: AT_JST_RELEASE_DAY }), true);
});

test("variant own authoritative future date beats a released parent", () => {
  const parent = { is_released: true, release_date: "2026-09-01" };
  const variant = { released: false, release_date: "2026-10-01" };
  assert.equal(effectiveReleaseState(variant, { parent, now: AT_JST_RELEASE_DAY }), false);
});

test("variant without release date falls back to parent date", () => {
  const parent = { is_released: false, release_date: "2026-09-01" };
  assert.equal(effectiveReleaseState({ released: false }, { parent, now: AT_JST_RELEASE_DAY }), true);
});

test("date-only values remain calendar dates and map to JST start-of-day", () => {
  assert.equal(releaseCalendarDate("2026-09-15"), "2026-09-15");
  assert.equal(releaseCalendarDate("2026-02-30"), "");
  assert.equal(releaseDateAtJstStart("2026-09-15")?.toISOString(), "2026-09-14T15:00:00.000Z");
});

test("public record normalization derives effective series and variant booleans without mutating stored input", () => {
  const records = {
    series: [{ id: "s1", is_released: false, release_date: "2026-09-15" }],
    variants: [{ id: "v1", series_id: "s1", released: false, release_date: "2026-09-15" }],
  };
  const before = normalizeRecordShape(records, { now: BEFORE_JST_RELEASE_DAY });
  const at = normalizeRecordShape(records, { now: AT_JST_RELEASE_DAY });

  assert.equal(before.series[0].is_released, false);
  assert.equal(before.variants[0].released, false);
  assert.equal(at.series[0].is_released, true);
  assert.equal(at.variants[0].released, true);
  assert.equal(records.series[0].is_released, false);
  assert.equal(records.variants[0].released, false);
});

test("stored record normalization preserves persisted booleans for ingestion and write planning", () => {
  const stored = normalizeStoredRecordShape({
    series: [{ id: "s1", is_released: false, release_date: "2026-09-15" }],
    variants: [{ id: "v1", series_id: "s1", released: false, release_date: "2026-09-15" }],
  });
  assert.equal(stored.series[0].is_released, false);
  assert.equal(stored.variants[0].released, false);
});

test("catalog released/upcoming matching uses the same effective semantics", () => {
  const stale = { released: false, release_date: "2026-09-01", variant_type: "normal" };
  const future = { released: false, release_date: "2026-10-01", variant_type: "normal" };
  assert.equal(recordMatchesCatalogQuery(stale, { release: "released" }, "variant", PRODUCTION_AUDIT_NOW), true);
  assert.equal(recordMatchesCatalogQuery(stale, { release: "upcoming" }, "variant", PRODUCTION_AUDIT_NOW), false);
  assert.equal(recordMatchesCatalogQuery(future, { release: "released" }, "variant", PRODUCTION_AUDIT_NOW), false);
  assert.equal(recordMatchesCatalogQuery(future, { release: "upcoming" }, "variant", PRODUCTION_AUDIT_NOW), true);
});

test("released PostgREST plan includes persisted true, aged false, and aged null boolean rows", () => {
  assert.deepEqual(buildEffectiveReleaseQueryPlan({
    state: "released",
    booleanColumn: "released",
    now: AT_JST_RELEASE_DAY,
  }), {
    today: "2026-09-15",
    eq: null,
    or: "released.eq.true,and(released.eq.false,release_date.lte.2026-09-15),and(released.is.null,release_date.lte.2026-09-15)",
  });
});

test("upcoming PostgREST plan matches false/null booleans with future or absent dates", () => {
  assert.deepEqual(buildEffectiveReleaseQueryPlan({
    state: "upcoming",
    booleanColumn: "is_released",
    now: AT_JST_RELEASE_DAY,
  }), {
    today: "2026-09-15",
    eq: null,
    or: "and(is_released.eq.false,release_date.gt.2026-09-15),and(is_released.eq.false,release_date.is.null),and(is_released.is.null,release_date.gt.2026-09-15),and(is_released.is.null,release_date.is.null)",
  });
});

test("pure effective state and server released/upcoming semantics agree including nullable booleans", () => {
  const rows = [
    { released: true, release_date: "2026-10-01" },
    { released: false, release_date: "2026-09-14" },
    { released: false, release_date: "2026-09-15" },
    { released: false, release_date: "2026-09-16" },
    { released: false, release_date: null },
    { released: null, release_date: "2026-09-14" },
    { released: null, release_date: "2026-09-16" },
    { released: null, release_date: null },
  ];
  for (const row of rows) {
    const pure = effectiveReleaseState(row, { now: AT_JST_RELEASE_DAY });
    assert.equal(serverReleased(row, "2026-09-15"), pure, JSON.stringify(row));
    assert.equal(serverUpcoming(row, "2026-09-15"), !pure, JSON.stringify(row));
  }
});

test("series PostgREST filter emits the row-level effective plan", () => {
  const series = queryRecorder();
  applyEffectiveReleaseFilter(series, "upcoming", "is_released", "release_date", AT_JST_RELEASE_DAY);
  assert.deepEqual(series.calls, [[
    "or",
    "and(is_released.eq.false,release_date.gt.2026-09-15),and(is_released.eq.false,release_date.is.null),and(is_released.is.null,release_date.gt.2026-09-15),and(is_released.is.null,release_date.is.null)",
  ]]);
});

test("variant query plan preserves own-date authority and parent fallback", () => {
  const released = buildEffectiveVariantReleaseQueryPlan({ state: "released", now: AT_JST_RELEASE_DAY });
  const upcoming = buildEffectiveVariantReleaseQueryPlan({ state: "upcoming", now: AT_JST_RELEASE_DAY });

  assert.equal(released.today, "2026-09-15");
  assert.equal(released.parentFilters.length, 4);
  assert.equal(
    released.or,
    [
      "released.eq.true",
      "and(released.eq.false,release_date.lte.2026-09-15)",
      "and(released.eq.false,release_date.is.null,release_parent_past.not.is.null)",
      "and(released.is.null,release_parent_true.not.is.null)",
      "and(released.is.null,release_parent_not_true.not.is.null,release_date.lte.2026-09-15)",
      "and(released.is.null,release_parent_not_true.not.is.null,release_date.is.null,release_parent_past.not.is.null)",
    ].join(","),
  );
  assert.equal(
    upcoming.or,
    [
      "and(released.eq.false,release_date.gt.2026-09-15)",
      "and(released.eq.false,release_date.is.null,release_parent_future_or_null.not.is.null)",
      "and(released.is.null,release_parent_not_true.not.is.null,release_date.gt.2026-09-15)",
      "and(released.is.null,release_parent_not_true.not.is.null,release_date.is.null,release_parent_future_or_null.not.is.null)",
    ].join(","),
  );
});

test("variant pure state and parent-aware server semantics agree", () => {
  const cases = [
    [{ released: true, release_date: "2026-10-01" }, { is_released: false, release_date: "2026-10-01" }],
    [{ released: false, release_date: "2026-09-14" }, { is_released: false, release_date: "2026-10-01" }],
    [{ released: false, release_date: "2026-09-16" }, { is_released: true, release_date: "2026-09-01" }],
    [{ released: false, release_date: null }, { is_released: false, release_date: "2026-09-14" }],
    [{ released: false, release_date: null }, { is_released: true, release_date: "2026-09-16" }],
    [{ released: false, release_date: null }, { is_released: false, release_date: null }],
    [{ released: null, release_date: "2026-10-01" }, { is_released: true, release_date: "2026-10-01" }],
    [{ released: null, release_date: "2026-09-14" }, { is_released: false, release_date: "2026-10-01" }],
    [{ released: null, release_date: null }, { is_released: false, release_date: "2026-09-14" }],
    [{ released: null, release_date: null }, { is_released: false, release_date: "2026-09-16" }],
    [{ released: null, release_date: null }, { is_released: null, release_date: null }],
  ];

  for (const [variant, parent] of cases) {
    const pure = effectiveReleaseState(variant, { parent, now: AT_JST_RELEASE_DAY });
    assert.equal(serverVariantReleased(variant, parent, "2026-09-15"), pure, JSON.stringify({ variant, parent }));
    assert.equal(serverVariantUpcoming(variant, parent, "2026-09-15"), !pure, JSON.stringify({ variant, parent }));
  }
});

test("variant Supabase filter emits empty-embed parent aliases plus one top-level OR", () => {
  const query = queryRecorder();
  applyEffectiveVariantReleaseFilter(query, "released", AT_JST_RELEASE_DAY);
  assert.deepEqual(query.calls, [
    ["eq", "release_parent_true.is_released", true],
    ["or", "is_released.eq.false,is_released.is.null", { referencedTable: "release_parent_not_true" }],
    ["lte", "release_parent_past.release_date", "2026-09-15"],
    ["or", "release_date.gt.2026-09-15,release_date.is.null", { referencedTable: "release_parent_future_or_null" }],
    ["or", [
      "released.eq.true",
      "and(released.eq.false,release_date.lte.2026-09-15)",
      "and(released.eq.false,release_date.is.null,release_parent_past.not.is.null)",
      "and(released.is.null,release_parent_true.not.is.null)",
      "and(released.is.null,release_parent_not_true.not.is.null,release_date.lte.2026-09-15)",
      "and(released.is.null,release_parent_not_true.not.is.null,release_date.is.null,release_parent_past.not.is.null)",
    ].join(",")],
  ]);
  const select = withEffectiveVariantReleaseRelations("id,release_date");
  for (const alias of [
    "release_parent_true:series()",
    "release_parent_not_true:series()",
    "release_parent_past:series()",
    "release_parent_future_or_null:series()",
  ]) assert.ok(select.includes(alias));
});

test("the 2026-09-28 Production stale-variant fixture ages all 23 rows to released", () => {
  assert.equal(STALE_PRODUCTION_VARIANTS.length, 23);
  const counts = new Map();
  for (const [id, seriesId, releaseDate] of STALE_PRODUCTION_VARIANTS) {
    assert.equal(effectiveReleaseState({ id, series_id: seriesId, released: false, release_date: releaseDate }, { now: PRODUCTION_AUDIT_NOW }), true, id);
    counts.set(seriesId, (counts.get(seriesId) ?? 0) + 1);
  }
  assert.deepEqual([...counts.entries()], [
    ["gashapon-4570118233042000", 3],
    ["gashapon-4582769776601000", 6],
    ["gashapon-4582769979477000", 1],
    ["gashapon-4582770068344000", 6],
    ["gashapon-4582770121827000", 7],
  ]);
});

test("query-plan helper rejects unsafe column identifiers and ignores all-state requests", () => {
  assert.throws(() => buildEffectiveReleaseQueryPlan({ state: "released", booleanColumn: "released)" }), /safe identifiers/);
  assert.equal(buildEffectiveReleaseQueryPlan({ state: "all" }), null);
});

function serverReleased(row, today) {
  return row.released === true
    || ((row.released === false || row.released == null) && typeof row.release_date === "string" && row.release_date <= today);
}

function serverUpcoming(row, today) {
  return (row.released === false || row.released == null)
    && (row.release_date == null || row.release_date > today);
}

function serverVariantReleased(variant, parent, today) {
  if (variant.released === true) return true;
  if (variant.released === false) {
    if (variant.release_date != null) return variant.release_date <= today;
    return parent?.release_date != null && parent.release_date <= today;
  }
  if (parent?.is_released === true) return true;
  if (variant.release_date != null) return variant.release_date <= today;
  return parent?.release_date != null && parent.release_date <= today;
}

function serverVariantUpcoming(variant, parent, today) {
  return !serverVariantReleased(variant, parent, today);
}

function queryRecorder() {
  return {
    calls: [],
    eq(...args) {
      this.calls.push(["eq", ...args]);
      return this;
    },
    or(...args) {
      this.calls.push(["or", ...args]);
      return this;
    },
    lte(...args) {
      this.calls.push(["lte", ...args]);
      return this;
    },
  };
}
