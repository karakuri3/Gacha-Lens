import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEffectiveReleaseQueryPlan,
  effectiveReleaseState,
  jstCalendarDate,
  releaseCalendarDate,
  releaseDateAtJstStart,
} from "../lib/domain/release-state.js";

const BEFORE_JST_RELEASE_DAY = new Date("2026-09-14T14:59:59.999Z");
const AT_JST_RELEASE_DAY = new Date("2026-09-14T15:00:00.000Z");
const AFTER_JST_RELEASE_DAY = new Date("2026-09-15T03:00:00.000Z");

test("JST calendar date changes at 00:00 Asia/Tokyo instead of UTC midnight", () => {
  assert.equal(jstCalendarDate(BEFORE_JST_RELEASE_DAY), "2026-09-14");
  assert.equal(jstCalendarDate(AT_JST_RELEASE_DAY), "2026-09-15");
});

test("persisted false ages monotonically to released at the JST release day", () => {
  const row = { released: false, release_date: "2026-09-15" };
  assert.equal(effectiveReleaseState(row, { now: BEFORE_JST_RELEASE_DAY }), false);
  assert.equal(effectiveReleaseState(row, { now: AT_JST_RELEASE_DAY }), true);
  assert.equal(effectiveReleaseState(row, { now: AFTER_JST_RELEASE_DAY }), true);
});

test("persisted true remains released even when the canonical date is future-dated", () => {
  assert.equal(effectiveReleaseState({ released: true, release_date: "2027-01-01" }, { now: AT_JST_RELEASE_DAY }), true);
});

test("null or ambiguous release dates keep the explicit persisted state", () => {
  assert.equal(effectiveReleaseState({ released: false, release_date: null }, { now: AT_JST_RELEASE_DAY }), false);
  assert.equal(effectiveReleaseState({ released: true, release_date: "not-a-date" }, { now: AT_JST_RELEASE_DAY }), true);
});

test("variant state falls back to parent release metadata only when the variant does not supply it", () => {
  const parent = { is_released: false, release_date: "2026-09-15" };
  assert.equal(effectiveReleaseState({}, { parent, now: AT_JST_RELEASE_DAY }), true);
  assert.equal(effectiveReleaseState({ released: false, release_date: "2026-10-01" }, { parent: { ...parent, is_released: true }, now: AT_JST_RELEASE_DAY }), false);
});

test("date-only values remain calendar dates and map to JST start-of-day", () => {
  assert.equal(releaseCalendarDate("2026-09-15"), "2026-09-15");
  assert.equal(releaseCalendarDate("2026-02-30"), "");
  assert.equal(releaseDateAtJstStart("2026-09-15")?.toISOString(), "2026-09-14T15:00:00.000Z");
});

test("released PostgREST plan includes persisted true plus aged false rows", () => {
  assert.deepEqual(buildEffectiveReleaseQueryPlan({
    state: "released",
    booleanColumn: "released",
    now: AT_JST_RELEASE_DAY,
  }), {
    today: "2026-09-15",
    eq: null,
    or: "released.eq.true,and(released.eq.false,release_date.lte.2026-09-15)",
  });
});

test("upcoming PostgREST plan keeps only explicit false rows whose date is future or absent", () => {
  assert.deepEqual(buildEffectiveReleaseQueryPlan({
    state: "upcoming",
    booleanColumn: "is_released",
    now: AT_JST_RELEASE_DAY,
  }), {
    today: "2026-09-15",
    eq: ["is_released", false],
    or: "release_date.gt.2026-09-15,release_date.is.null",
  });
});

test("query-plan helper rejects unsafe column identifiers and ignores all-state requests", () => {
  assert.throws(() => buildEffectiveReleaseQueryPlan({ state: "released", booleanColumn: "released)" }), /safe identifiers/);
  assert.equal(buildEffectiveReleaseQueryPlan({ state: "all" }), null);
});
