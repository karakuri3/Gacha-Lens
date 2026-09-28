import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  catalogMonthFilterExpression,
} from "../lib/domain/catalog-query.js";
import {
  SCHEDULE_PAGE_SIZE,
  adjacentScheduleMonths,
  buildScheduleHref,
  currentJstCatalogMonth,
  groupScheduleMonthsByYear,
  isSchedulePageOutOfRange,
  parseSchedulePage,
  schedulePageRange,
  scheduleTotalPages,
} from "../lib/domain/schedule-pagination.js";

const schedulePage = read("app/schedule/page.js");
const repository = read("lib/data/supabase-gacha-repository.js");
const series = read("lib/series.js");
const sitemap = read("app/sitemap.js");

test("schedule page size is bounded at 60", () => {
  assert.equal(SCHEDULE_PAGE_SIZE, 60);
  assert.match(schedulePage, /pageSize:\s*SCHEDULE_PAGE_SIZE/);
  assert.doesNotMatch(schedulePage, /pageSize:\s*120/);
});

test("month with fewer than 120 rows remains complete", () => {
  assert.equal(scheduleTotalPages(59), 1);
  assert.equal(scheduleTotalPages(119), 2);
});

test("month with exactly 120 rows spans two bounded pages", () => {
  assert.equal(scheduleTotalPages(120), 2);
  assert.deepEqual(schedulePageRange(1), { from: 0, to: 59 });
  assert.deepEqual(schedulePageRange(2), { from: 60, to: 119 });
});

test("month with 121 rows exposes the 121st row on page three", () => {
  assert.equal(scheduleTotalPages(121), 3);
  assert.deepEqual(schedulePageRange(3), { from: 120, to: 179 });
});

test("200-plus month stays bounded and complete", () => {
  assert.equal(scheduleTotalPages(217), 4);
  assert.deepEqual(schedulePageRange(4), { from: 180, to: 239 });
});

test("page ranges have no duplicate or missing positions", () => {
  const total = 217;
  const seen = [];
  for (let page = 1; page <= scheduleTotalPages(total); page += 1) {
    const { from, to } = schedulePageRange(page);
    for (let index = from; index <= Math.min(to, total - 1); index += 1) seen.push(index);
  }
  assert.equal(seen.length, total);
  assert.equal(new Set(seen).size, total);
  assert.deepEqual(seen, Array.from({ length: total }, (_, index) => index));
});

test("first middle and final page URLs round-trip", () => {
  assert.equal(buildScheduleHref("2026-07", 1), "/schedule?month=2026-07");
  assert.equal(buildScheduleHref("2026-07", 2), "/schedule?month=2026-07&page=2");
  assert.equal(buildScheduleHref("2026-07", 4), "/schedule?month=2026-07&page=4");
});

test("out-of-range and empty-month extra pages are rejected", () => {
  assert.equal(isSchedulePageOutOfRange(4, 217), false);
  assert.equal(isSchedulePageOutOfRange(5, 217), true);
  assert.equal(isSchedulePageOutOfRange(1, 0), false);
  assert.equal(isSchedulePageOutOfRange(2, 0), true);
  assert.match(schedulePage, /isSchedulePageOutOfRange[\s\S]*notFound\(\)/);
});

test("invalid or explosive page parameters do not become crawlable page states", () => {
  assert.deepEqual(parseSchedulePage(undefined), { page: 1, valid: true });
  assert.deepEqual(parseSchedulePage("1"), { page: 1, valid: true });
  assert.deepEqual(parseSchedulePage("0"), { page: 1, valid: false });
  assert.deepEqual(parseSchedulePage("-2"), { page: 1, valid: false });
  assert.deepEqual(parseSchedulePage("abc"), { page: 1, valid: false });
  assert.deepEqual(parseSchedulePage("1001"), { page: 1, valid: false });
});

test("page-one canonical omits page=1 while later pages self-canonicalize", () => {
  assert.equal(buildScheduleHref("2026-09", 1), "/schedule?month=2026-09");
  assert.equal(buildScheduleHref("2026-09", 2), "/schedule?month=2026-09&page=2");
  assert.match(schedulePage, /path:\s*buildScheduleHref\(selectedMonth, page\)/);
  assert.match(schedulePage, /pageLabel = page > 1/);
});

test("current-month landing is JST based and does not jump to an arbitrary data month", () => {
  assert.equal(currentJstCatalogMonth(new Date("2026-09-30T14:59:59.000Z")), "2026-09");
  assert.equal(currentJstCatalogMonth(new Date("2026-09-30T15:00:00.000Z")), "2026-10");
  assert.match(schedulePage, /const selectedMonth = requestedMonth \|\| currentMonth/);
  assert.doesNotMatch(schedulePage, /availableMonths\.find\(\(month\) => month >= currentMonth\)/);
});

test("previous and next navigation only links real archive months", () => {
  assert.deepEqual(
    adjacentScheduleMonths(["2026-07", "2026-09", "2026-11"], "2026-09"),
    { previous: "2026-07", next: "2026-11" },
  );
  assert.deepEqual(
    adjacentScheduleMonths(["2026-07", "2026-09"], "2026-08"),
    { previous: "2026-07", next: "2026-09" },
  );
  assert.match(schedulePage, /adjacentScheduleMonths\(availableMonths, selectedMonth\)/);
});

test("archive months are grouped by year instead of one unbounded horizontal row", () => {
  assert.deepEqual(groupScheduleMonthsByYear(["2025-12", "2026-01", "2026-08"]), [
    { year: "2026", months: ["2026-08", "2026-01"] },
    { year: "2025", months: ["2025-12"] },
  ]);
  assert.match(schedulePage, /<details className="card schedule-archive">/);
  assert.match(schedulePage, /archiveYears\.map/);
});

test("month filter accepts date range, Japanese null fallback, and canonical null fallback", () => {
  const expression = catalogMonthFilterExpression("2026-08");
  assert.match(expression, /release_date\.gte\.2026-08-01/);
  assert.match(expression, /release_date\.lt\.2026-09-01/);
  assert.match(expression, /release_date\.is\.null,release_month\.eq\.8月/);
  assert.match(expression, /release_date\.is\.null,release_month\.eq\.2026-08/);
  assert.doesNotMatch(expression, /release_month\.eq\.9月/);
  assert.equal(catalogMonthFilterExpression("2026-13"), "");
});

test("shared parent and variant catalog month reads reuse the strict three-form filter", () => {
  assert.match(repository, /export function applyMonthFilter\(query, month\)/);
  assert.match(repository, /catalogMonthFilterExpression\(month\)/);
  assert.match(repository, /query = applyMonthFilter\(query, options\.month\)/);
});

test("schedule uses a lightweight parent summary query rather than full signal enrichment", () => {
  const start = repository.indexOf("export async function fetchSupabaseParentSeriesSchedulePage");
  const end = repository.indexOf("export async function fetchSupabaseParentSeriesScheduleMonths", start);
  const source = repository.slice(start, end);
  assert.match(source, /variants\(count\)/);
  assert.match(source, /count:\s*"exact"/);
  assert.match(source, /\.range\(range\.from, range\.to\)/);
  assert.doesNotMatch(source, /fetchSignalsForCatalog|fetchRowsIn/);
});

test("schedule page ordering has a unique deterministic id tiebreaker", () => {
  const start = repository.indexOf("export async function fetchSupabaseParentSeriesSchedulePage");
  const end = repository.indexOf("export async function fetchSupabaseParentSeriesScheduleMonths", start);
  const source = repository.slice(start, end);
  const date = source.indexOf('.order("release_date"');
  const week = source.indexOf('.order("release_week"');
  const name = source.indexOf('.order("name"');
  const id = source.indexOf('.order("id"');
  assert.ok(date >= 0 && week > date && name > week && id > name);
});

test("archive discovery is based on all series release data, never upcoming booleans", () => {
  const start = repository.indexOf("export async function fetchSupabaseParentSeriesScheduleMonths");
  const end = repository.indexOf("export function collectParentSeriesScheduleMonths", start);
  const source = repository.slice(start, end);
  assert.match(source, /\.from\(TABLE_MAP\.series\)/);
  assert.match(source, /id,release_date,release_month/);
  assert.doesNotMatch(source, /applyEffectiveReleaseFilter|is_released|upcoming/);
  assert.match(source, /MAX_SCHEDULE_MONTH_DISCOVERY_ROWS/);
});

test("archive discovery only invents no year: date-backed and canonical null months are accepted strictly", () => {
  const start = repository.indexOf("function strictScheduleMonthFromRow");
  const end = repository.indexOf("function applyScheduleVariantCountFilter", start);
  const source = repository.slice(start, end);
  assert.match(source, /normalizeCatalogMonth/);
  assert.doesNotMatch(source, /getFullYear|getMonth|月\)/);
});

test("schedule no longer depends on transient upcoming month discovery", () => {
  assert.match(schedulePage, /getParentSeriesScheduleMonths/);
  assert.doesNotMatch(schedulePage, /getUpcomingParentSeriesScheduleMonths/);
  assert.match(series, /fetchSupabaseParentSeriesScheduleMonths/);
});

test("past archives remain durable through internal links and the sitemap", () => {
  assert.match(schedulePage, /月別アーカイブ/);
  assert.match(schedulePage, /group\.months\.map/);
  assert.match(sitemap, /getParentSeriesScheduleMonths/);
  assert.match(sitemap, /scheduleMonths\.map/);
  assert.match(sitemap, /\/schedule\?month=\$\{month\}/);
});

test("sitemap contains only real month URLs and not the non-canonical schedule alias", () => {
  assert.doesNotMatch(sitemap, /\{ path: "\/schedule",/);
  assert.match(sitemap, /getParentSeriesScheduleMonths\(\)/);
  assert.doesNotMatch(sitemap, /shiftCatalogMonth|Array\.from\([^\n]*month/);
});

test("empty or unsupported query states are noindex while keeping valid month navigation", () => {
  assert.match(schedulePage, /noIndex:\s*invalidMonth \|\| !pageRequest\.valid \|\| hasUnsupportedParams \|\| !hasData \|\| outOfRange/);
  assert.match(schedulePage, /発売情報はまだありません/);
  assert.match(schedulePage, /データがある前後の月/);
});

test("pagination exposes prev and next links only within finite real pages", () => {
  assert.match(schedulePage, /totalPages > 1/);
  assert.match(schedulePage, /buildScheduleHref\(selectedMonth, page - 1\)/);
  assert.match(schedulePage, /buildScheduleHref\(selectedMonth, page \+ 1\)/);
  assert.match(schedulePage, /page < totalPages/);
});

test("monthly schedule links to the same complete month in the series catalog", () => {
  assert.match(schedulePage, /href=\{\`\/series\?month=\$\{selectedMonth\}&sort=newest\`\}/);
  assert.doesNotMatch(schedulePage, /\/series\?release=upcoming&month=/);
});

test("monthly schedule copy describes release information rather than future-only results", () => {
  assert.match(schedulePage, /ガチャ新作・発売情報/);
  assert.match(schedulePage, /発売シリーズ/);
  assert.match(schedulePage, /発売情報はまだありません/);
});

function read(file) {
  return fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
}
