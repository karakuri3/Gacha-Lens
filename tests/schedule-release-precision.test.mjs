import assert from "node:assert/strict";
import test from "node:test";
import { compareReleaseWeeks, compareScheduleItems, normalizeExplicitReleaseWeek, releaseTiming } from "../lib/domain/release-precision.js";

test("explicit release weeks are trusted", () => {
  assert.equal(normalizeExplicitReleaseWeek("第1週"), "第1週");
  assert.equal(normalizeExplicitReleaseWeek("第2週"), "第2週");
  assert.equal(normalizeExplicitReleaseWeek("第5週"), "第5週");
  assert.equal(normalizeExplicitReleaseWeek("第6週"), "第6週");
});

test("explicit provider weeks sort numerically without a fixed 1-5 ceiling", () => {
  assert.deepEqual(["第6週", "第2週", "第10週", "第1週"].sort(compareReleaseWeeks), ["第1週", "第2週", "第6週", "第10週"]);
});

test("Bandai legacy sixth-week evidence remains explicit", () => {
  const timing = releaseTiming({ release_date: "2021-05-01", release_month: "5月", release_week: "第6週" });
  assert.deepEqual(timing, { precision: "week", week: "第6週", group: "第6週", label: "2021年5月 第6週" });
});

test("synthetic first-of-month never creates a week", () => {
  const timing = releaseTiming({ release_date: "2026-09-01", release_month: "9月", release_week: "" });
  assert.equal(timing.week, "");
  assert.equal(timing.group, "undated");
  assert.equal(timing.label, "2026年9月・週未定");
});

test("explicit unknown week remains unknown", () => {
  const timing = releaseTiming({ release_date: "2026-09-01", release_month: "9月", release_week: "未定" });
  assert.equal(timing.precision, "month");
  assert.equal(timing.group, "undated");
  assert.equal(timing.label, "2026年9月・週未定");
});

test("official week is shown without pretending the synthetic day is exact", () => {
  const timing = releaseTiming({ release_date: "2026-09-01", release_month: "9月", release_week: "第2週" });
  assert.deepEqual(timing, { precision: "week", week: "第2週", group: "第2週", label: "2026年9月 第2週" });
});

test("real non-first exact date is preserved when no week evidence exists", () => {
  assert.equal(releaseTiming({ release_date: "2026-09-17", release_week: "" }).label, "2026/09/17");
});

test("explicit exact-date precision preserves a genuine first-day release", () => {
  assert.equal(releaseTiming({ release_date: "2026-09-01", release_precision: "exact_date" }).label, "2026/09/01");
});

test("month-only providers remain month precision", () => {
  assert.equal(releaseTiming({ release_month: "2026-08" }).label, "2026年8月・週未定");
});

test("unknown ordering is deterministic", () => {
  const rows = [{ name: "B", id: "2" }, { name: "A", id: "9" }, { name: "A", id: "1" }];
  assert.deepEqual(rows.sort(compareScheduleItems).map((row) => row.id), ["1", "9", "2"]);
});
