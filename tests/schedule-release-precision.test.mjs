import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  compareScheduleReleaseItems,
  normalizeExplicitReleaseWeek,
  releaseScheduleLabel,
  resolveReleasePrecision,
  scheduleReleaseWeek,
  SCHEDULE_RELEASE_WEEKS,
} from "../lib/domain/release-precision.js";
import { parseOfficialDetailDocument } from "../lib/fetchers/official-fetcher.js";

const schedulePage = fs.readFileSync(new URL("../app/schedule/page.js", import.meta.url), "utf8");
const gashaponFixture = fs.readFileSync(new URL("./fixtures/official/gashapon-detail.html", import.meta.url), "utf8");
const takaratomyFixture = fs.readFileSync(new URL("./fixtures/official/takaratomy-detail.html", import.meta.url), "utf8");

const bandaiUrl = "https://gashapon.jp/products/detail.php?jan_code=4582769866364000";
const tartsUrl = "https://www.takaratomy-arts.co.jp/items/item.html?n=Y900001";

test("explicit official weeks are the only week-group evidence", () => {
  assert.equal(normalizeExplicitReleaseWeek("第1週"), "第1週");
  assert.equal(normalizeExplicitReleaseWeek("第2週"), "第2週");
  assert.equal(normalizeExplicitReleaseWeek("第5週"), "第5週");
  assert.equal(normalizeExplicitReleaseWeek("第6週"), "第6週");
  assert.equal(normalizeExplicitReleaseWeek("未定"), "");
  assert.deepEqual(SCHEDULE_RELEASE_WEEKS, ["第1週", "第2週", "第3週", "第4週", "第5週", "第6週"]);
});

test("synthetic Bandai first-of-month never becomes a week or exact-day label", () => {
  const item = {
    release_date: "2026-09-01",
    release_month: "9月",
    release_week: "",
    official_url: bandaiUrl,
  };
  assert.equal(scheduleReleaseWeek(item), "");
  assert.equal(resolveReleasePrecision(item), "month");
  assert.equal(releaseScheduleLabel(item), "2026年9月・週未定");
});

test("Bandai explicit week remains trusted even with synthetic first-of-month", () => {
  const item = {
    release_date: "2026-09-01",
    release_month: "9月",
    release_week: "第2週",
    official_url: bandaiUrl,
  };
  assert.equal(scheduleReleaseWeek(item), "第2週");
  assert.equal(resolveReleasePrecision(item), "week");
  assert.equal(releaseScheduleLabel(item), "2026年9月 第2週");
});

test("explicit unknown stays in the unknown group", () => {
  const item = {
    release_date: "2026-09-01",
    release_month: "9月",
    release_week: "未定",
    official_url: bandaiUrl,
  };
  assert.equal(scheduleReleaseWeek(item), "");
  assert.equal(resolveReleasePrecision(item), "month");
  assert.equal(releaseScheduleLabel(item), "2026年9月・週未定");
});

test("month-only provider remains month precision without inventing a week", () => {
  const item = {
    release_month: "2026-08",
    release_week: null,
    release_date: null,
    official_url: "https://www.qualia-45.jp/product/view/2024",
  };
  assert.equal(scheduleReleaseWeek(item), "");
  assert.equal(resolveReleasePrecision(item), "month");
  assert.equal(releaseScheduleLabel(item), "2026年8月・週未定");
});

test("true exact-date evidence from a non-Bandai provider keeps day precision", () => {
  const item = {
    release_date: "2026-08-17",
    release_month: "8月",
    release_week: "第3週",
    official_url: tartsUrl,
  };
  assert.equal(scheduleReleaseWeek(item), "第3週");
  assert.equal(resolveReleasePrecision(item), "exact_date");
  assert.equal(releaseScheduleLabel(item), "2026/08/17");
});

test("missing-week ordering is deterministic by name then stable identity", () => {
  const rows = [
    { id: "b", name: "ベータ" },
    { id: "z", name: "アルファ" },
    { id: "a", name: "アルファ" },
  ];
  assert.deepEqual(rows.sort(compareScheduleReleaseItems).map((row) => row.id), ["a", "z", "b"]);
});

test("Bandai detail parser preserves sixth-week official evidence", () => {
  const body = gashaponFixture.replace("2026年8月第2週", "2026年9月 第6週");
  const parsed = parseOfficialDetailDocument(body, bandaiUrl).record;
  assert.equal(parsed.release_month, "9月");
  assert.equal(parsed.release_week, "第6週");
  assert.equal(parsed.release_date, "2026-09-01");
});

test("Bandai detail parser preserves explicit unknown instead of fabricating a week", () => {
  const body = gashaponFixture.replace("2026年8月第2週", "2026年9月未定");
  const parsed = parseOfficialDetailDocument(body, bandaiUrl).record;
  assert.equal(parsed.release_month, "9月");
  assert.equal(parsed.release_week, "未定");
  assert.equal(parsed.release_date, "2026-09-01");
});

test("Takara Tomy Arts exact-date contract remains intact", () => {
  const parsed = parseOfficialDetailDocument(takaratomyFixture, tartsUrl).record;
  assert.equal(parsed.release_month, "8月");
  assert.equal(parsed.release_week, "第3週");
  assert.equal(parsed.release_date, "2026-08-17");
});

test("Schedule source contains no date-to-week fallback", () => {
  assert.match(schedulePage, /scheduleReleaseWeek/);
  assert.match(schedulePage, /releaseScheduleLabel/);
  assert.match(schedulePage, /発売時期未定/);
  assert.doesNotMatch(schedulePage, /Math\.ceil\(Number\(match\[1\]\) \/ 7\)/);
  assert.doesNotMatch(schedulePage, /function seriesScheduleWeek/);
});
