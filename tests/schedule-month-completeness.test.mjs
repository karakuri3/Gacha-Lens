import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  MAX_SCHEDULE_PAGE,
  SCHEDULE_PAGE_SIZE,
  currentScheduleMonth,
  groupScheduleArchiveMonths,
  isCanonicalSchedulePageValue,
  normalizeSchedulePage,
  scheduleArchiveNeighbors,
  scheduleHref,
  schedulePageWindow,
} from "../lib/domain/schedule-query.js";

const repository = fs.readFileSync(new URL("../lib/data/supabase-gacha-repository.js", import.meta.url), "utf8");
const schedulePage = fs.readFileSync(new URL("../app/schedule/page.js", import.meta.url), "utf8");
const sitemap = fs.readFileSync(new URL("../app/sitemap.js", import.meta.url), "utf8");

test("schedule page size is bounded at 60", () => assert.equal(SCHEDULE_PAGE_SIZE, 60));
test("current month landing follows JST at the UTC month boundary", () => {
  assert.equal(currentScheduleMonth(new Date("2026-09-30T14:59:59.999Z")), "2026-09");
  assert.equal(currentScheduleMonth(new Date("2026-09-30T15:00:00.000Z")), "2026-10");
});
function syntheticSchedulePages(total) {
  const ids = Array.from({ length: total }, (_, index) => `series-${String(index + 1).padStart(4, "0")}`);
  return Array.from({ length: Math.ceil(total / SCHEDULE_PAGE_SIZE) }, (_, index) =>
    ids.slice(index * SCHEDULE_PAGE_SIZE, (index + 1) * SCHEDULE_PAGE_SIZE)
  );
}

for (const total of [59, 120, 121, 217]) {
  test(`bounded schedule pagination reaches all ${total} series exactly once`, () => {
    const pages = syntheticSchedulePages(total);
    const reached = pages.flat();
    assert.equal(reached.length, total);
    assert.equal(new Set(reached).size, total);
    assert.deepEqual(reached, [...reached].sort());
    assert.equal(pages.every((page) => page.length <= SCHEDULE_PAGE_SIZE), true);
  });
}

test("first page canonical omits page", () => assert.equal(scheduleHref("2026-09", 1), "/schedule?month=2026-09"));
test("middle page canonical preserves page", () => assert.equal(scheduleHref("2026-09", 2), "/schedule?month=2026-09&page=2"));
test("page zero and malformed values normalize to one", () => {
  assert.equal(normalizeSchedulePage(0), 1);
  assert.equal(normalizeSchedulePage("abc"), 1);
});
test("arbitrary huge page input is bounded", () => {
  assert.equal(normalizeSchedulePage("999999999"), MAX_SCHEDULE_PAGE);
  assert.equal(isCanonicalSchedulePageValue("999999999"), false);
});
test("page window is bounded around the selected page", () => {
  assert.deepEqual(schedulePageWindow(1, 4), [1, 2, 3, 4]);
  assert.deepEqual(schedulePageWindow(3, 10), [1, 2, 3, 4, 5]);
  assert.deepEqual(schedulePageWindow(10, 10), [6, 7, 8, 9, 10]);
});
test("empty-month neighbors point only to real archive months", () => {
  assert.deepEqual(scheduleArchiveNeighbors("2026-05", ["2026-03", "2026-04", "2026-08"]), {
    previous: "2026-04",
    next: "2026-08",
  });
});
test("archive grouping exposes only normalized real months", () => {
  assert.deepEqual(groupScheduleArchiveMonths(["2026-09", "bad", "2026-08", "2025-12"]), [
    { year: "2026", months: ["2026-09", "2026-08"] },
    { year: "2025", months: ["2025-12"] },
  ]);
});
test("month filter accepts date range, Japanese fallback and canonical fallback", () => {
  const start = repository.indexOf("function applyMonthFilter");
  const end = repository.indexOf("function applyCatalogSort", start);
  const source = repository.slice(start, end);
  assert.match(source, /release_date\.gte\.\$\{range\.start\}/);
  assert.match(source, /release_month\.eq\.\$\{monthNumber\}月/);
  assert.match(source, /release_month\.eq\.\$\{month\}/);
});
test("dedicated schedule query avoids signal fanout", () => {
  const start = repository.indexOf("export async function fetchSupabaseParentSeriesSchedulePage");
  const end = repository.indexOf("export async function fetchSupabaseParentSeriesCatalogPage", start);
  const source = repository.slice(start, end);
  assert.match(source, /Math\.min\(60/);
  assert.match(source, /count: "exact"/);
  assert.match(source, /order\("id", \{ ascending: true \}\)/);
  assert.doesNotMatch(source, /fetchSignalsForCatalog/);
});
test("schedule source uses URL-reproducible pagination and redirects noncanonical pages", () => {
  assert.match(schedulePage, /page: requestedPage/);
  assert.match(schedulePage, /SchedulePagination/);
  assert.match(schedulePage, /catalogPage\.page !== requestedPage/);
  assert.match(schedulePage, /redirect\(scheduleHref/);
});
test("past archives remain in durable internal navigation", () => {
  assert.match(schedulePage, /groupScheduleArchiveMonths\(availableMonths\)/);
  assert.match(schedulePage, /発売月アーカイブ/);
  assert.match(schedulePage, /group\.months\.map/);
});
test("sitemap publishes only discovered schedule months", () => {
  assert.match(sitemap, /getParentSeriesScheduleMonths/);
  assert.match(sitemap, /scheduleMonths\.map/);
  assert.doesNotMatch(sitemap, /path: "\/schedule"/);
});
test("empty month copy remains truthful and navigable", () => {
  assert.match(schedulePage, /発売情報はまだありません/);
  assert.match(schedulePage, /前の発売月/);
  assert.match(schedulePage, /次の発売月/);
  assert.match(schedulePage, /scheduleArchiveNeighbors/);
  assert.match(schedulePage, /発売月アーカイブ/);
});
test("metadata is self-canonical and noindexes invalid or empty month requests", () => {
  assert.match(schedulePage, /path: scheduleHref\(month, page\)/);
  assert.match(schedulePage, /noIndex: hasUnknownParams \|\| invalidMonth \|\| invalidPage \|\| emptyMonth/);
});

test("metadata empty-month check stays bounded and does not rescan the full archive", () => {
  const start = schedulePage.indexOf("export async function generateMetadata");
  const end = schedulePage.indexOf("export default async function SchedulePage", start);
  const source = schedulePage.slice(start, end);
  assert.match(source, /getParentSeriesSchedulePage/);
  assert.match(source, /pageSize: 1/);
  assert.match(source, /metadataPage\.total === 0/);
  assert.doesNotMatch(source, /getParentSeriesScheduleMonths/);
});
