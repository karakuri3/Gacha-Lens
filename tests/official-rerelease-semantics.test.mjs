import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildOfficialReadOnlyAudit, validateOfficialReadOnlyAudit } from "../lib/domain/official-read-only-audit.js";
import {
  buildOfficialRereleaseEvent,
  mergeOfficialRecordEvidence,
  resolveCanonicalOfficialRelease,
} from "../lib/domain/official-rerelease.js";
import {
  assertLegacyOfficialRecordsSafe,
  loadExistingRealVariantSeriesIdsStrict,
} from "../lib/domain/official-upsert-safety.js";
import {
  isSeriesLevelRestockEvent,
  resolveRestockEventPresentation,
} from "../lib/domain/restock-event-presentation.js";
import { normalizeRestockEvent } from "../lib/domain/source-normalizers.js";
import {
  mergeOfficialRecords,
  parseOfficialDetailDocument,
  parseOfficialSourceDocument,
} from "../lib/fetchers/official-fetcher.js";

const fixture = (name) => fs.readFileSync(`tests/fixtures/official/${name}`, "utf8");
const detailUrl = "https://gashapon.jp/products/detail.php?jan_code=4570000000002000";

test("normal official product keeps its current canonical release semantics", () => {
  const parsed = parseOfficialDetailDocument(fixture("gashapon-detail.html"), detailUrl).record;
  const resolved = resolveCanonicalOfficialRelease(parsed, null);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.source, "current_official_release");
  assert.deepEqual(pick(resolved.record, ["release_date", "release_month", "release_week"]), {
    release_date: "2026-08-01",
    release_month: "8月",
    release_week: "第2週",
  });
});

test("Gashapon rerelease note captures original month without inventing a first-day date", () => {
  const parsed = parseOfficialDetailDocument(fixture("gashapon-rerelease-detail.html"), detailUrl).record;
  assert.equal(parsed.raw.rerelease.is_rerelease, true);
  assert.deepEqual(parsed.raw.rerelease.original_release, {
    year: 2020,
    month: 9,
    release_date: null,
    release_month: "9月",
    release_week: "未定",
    precision: "month",
  });
  assert.deepEqual(parsed.raw.rerelease.current_schedule, {
    year: 2026,
    release_date: null,
    release_month: "8月",
    release_week: "第4週",
    precision: "week",
  });
  assert.equal(parsed.release_date, "");
  assert.equal(parsed.release_month, "9月");
  assert.equal(parsed.release_week, "未定");
});

test("existing canonical release is preserved while a 2026 official rerelease becomes one series event", () => {
  const record = parseOfficialDetailDocument(fixture("gashapon-rerelease-detail.html"), detailUrl).record;
  const existing = existingSeries(record, { release_date: "2020-09-17", release_month: "9月", release_week: "第3週" });
  const input = auditInput(record, existing);
  const report = buildOfficialReadOnlyAudit(input);
  assert.equal(report.plan.blockers.length, 0);
  assert.equal(report.plan.candidates[0].operation, "none");
  assert.deepEqual(report.plan.candidates[0].canonical_release, {
    year: 2020,
    month: 9,
    release_date: "2020-09-17",
    release_month: "9月",
    release_week: "第3週",
    precision: "day",
    source: "existing_catalog",
  });
  assert.equal(report.plan.would_insert.restock_events, 1);
  assert.equal(report.plan.candidates[0].restock_event.variant_id, null);
  assert.equal(report.plan.candidates[0].restock_event.series_id, record.id);
});

test("schedule restock evidence survives detail merge and preserves an existing canonical release", () => {
  const schedule = scheduleRecord();
  const detail = parseOfficialDetailDocument(fixture("gashapon-detail.html"), detailUrl).record;
  const merged = mergeOfficialRecords([schedule], [detail])[0];
  const existing = existingSeries(merged, { release_date: "2021-04-15", release_month: "4月", release_week: "第3週" });
  const resolved = resolveCanonicalOfficialRelease(merged, existing);
  assert.equal(merged.raw.rerelease.signals.includes("schedule_restock_badge"), true);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.record.release_date, "2021-04-15");
});

test("schedule-only restock without existing canonical or original evidence blocks all unsafe upserts", () => {
  const merged = mergeOfficialRecordEvidence(scheduleRecord(), parseOfficialDetailDocument(fixture("gashapon-detail.html"), detailUrl).record);
  const input = auditInput(merged, null);
  input.catalog.series = [];
  input.catalog.variants = [];
  const report = buildOfficialReadOnlyAudit(input);
  assert.ok(report.plan.blockers.some((reason) => reason.startsWith("rerelease_canonical_release_unresolved")));
  assert.equal(report.plan.candidate_count, 0);
  assert.equal(report.plan.would_insert.series, 0);
  assert.equal(report.plan.would_insert.restock_events, 0);
});

test("same official rerelease evidence is deterministic and an existing identical event is a no-op", () => {
  const record = parseOfficialDetailDocument(fixture("gashapon-rerelease-detail.html"), detailUrl).record;
  const existing = existingSeries(record, { release_date: "2020-09-17", release_month: "9月", release_week: "第3週" });
  const first = buildOfficialRereleaseEvent({ record, series: existing, observedAt: "2026-08-16T00:00:00.000Z" }).event;
  const second = buildOfficialRereleaseEvent({ record, series: existing, observedAt: "2026-08-17T00:00:00.000Z" }).event;
  assert.equal(first.id, second.id);

  const input = auditInput(record, existing);
  input.catalog.restock_events = [first];
  const report = buildOfficialReadOnlyAudit(input);
  assert.equal(report.plan.would_insert.restock_events, 0);
  assert.equal(report.plan.would_update.restock_events, 0);
  assert.equal(report.totals.restock_event_unchanged, 1);
  assert.equal(report.plan.candidates[0].restock_event.operation, "none");
});

test("official rerelease events have an independent bounded audit cap", () => {
  const record = parseOfficialDetailDocument(fixture("gashapon-rerelease-detail.html"), detailUrl).record;
  const input = auditInput(record, existingSeries(record));
  input.limits = {
    max_series_upserts: 4,
    max_variant_upserts: 40,
    max_restock_event_upserts: 0,
    max_issues: 8,
  };
  const report = buildOfficialReadOnlyAudit(input);
  assert.ok(report.plan.blockers.includes("restock_event_change_cap_exceeded"));
  assert.equal(report.plan.limits.max_restock_event_upserts, 0);
});

test("legacy official upsert fails closed on catalog read errors and rerelease records", async () => {
  await assert.rejects(
    loadExistingRealVariantSeriesIdsStrict(async () => { throw new Error("database unavailable"); }),
    /official upsert stopped/,
  );
  const record = parseOfficialDetailDocument(fixture("gashapon-rerelease-detail.html"), detailUrl).record;
  assert.throws(() => assertLegacyOfficialRecordsSafe([record]), /cannot persist rerelease semantics/);
});

test("series-level official rerelease presentation uses the series URL without pretending to be a variant", () => {
  const series = {
    id: "series-1",
    slug: "series-1",
    series_slug: "series-1",
    name: "監査シリーズ",
    image_url: "/series.jpg",
    variants: [{ id: "variant-1", slug: "variant-1", name: "単品A", image: "/variant.jpg" }],
  };
  const event = {
    id: "event-1",
    series_id: "series-1",
    variant_id: null,
    matched_variant_id: null,
    raw: { rerelease_schedule: { release_month: "8月", release_week: "第4週" } },
  };
  const presentation = resolveRestockEventPresentation(series, event);
  assert.equal(isSeriesLevelRestockEvent(event), true);
  assert.equal(presentation.scope, "series");
  assert.equal(presentation.href, "/series/group/series-1");
  assert.equal(presentation.name, "監査シリーズ");
  assert.equal(presentation.rerelease_schedule, "8月 第4週");
});

test("series-level official events remain public and retain scheduled evidence after DB normalization", () => {
  const series = { id: "series-1", slug: "series-1", name: "監査シリーズ" };
  const event = {
    id: "event-1",
    series_id: series.id,
    variant_id: null,
    matched_variant_id: null,
    source_type: "official_site",
    event_type: "restock",
    event_label: "再販",
    classification_reason: "official_rerelease_evidence",
    classification_keywords: ["再販商品"],
    reported_at: "2026-08-16T00:00:00.000Z",
    confidence: 1,
    review_required: false,
    raw: { rerelease_schedule: { year: 2026, release_month: "8月", release_week: "第4週" } },
  };
  const normalized = normalizeRestockEvent(event, { series: [series], variants: [] });
  assert.equal(normalized.review_required, false);
  assert.equal(normalized.event_label, "再販");
  assert.equal(normalized.source_weight, 1);
  assert.deepEqual(normalized.raw, event.raw);
});

test("existing variant-level restock presentation still uses the variant URL", () => {
  const series = {
    id: "series-1",
    slug: "series-1",
    name: "監査シリーズ",
    variants: [{ id: "variant-1", slug: "variant-1", name: "単品A", image: "/variant.jpg" }],
  };
  const presentation = resolveRestockEventPresentation(series, { series_id: "series-1", variant_id: "variant-1" });
  assert.equal(presentation.scope, "variant");
  assert.equal(presentation.href, "/series/variant-1");
  assert.equal(presentation.name, "単品A");
});

test("official audit v3 remains zero-write and rejects legacy v1/v2 authorization", () => {
  const record = parseOfficialDetailDocument(fixture("gashapon-rerelease-detail.html"), detailUrl).record;
  const report = validateOfficialReadOnlyAudit(buildOfficialReadOnlyAudit(auditInput(record, existingSeries(record))));
  assert.equal(report.schema_version, 3);
  assert.equal(report.database.writes, 0);
  assert.deepEqual(report.plan.would_delete, { series: 0, variants: 0, restock_events: 0, import_issues: 0 });
  assert.throws(() => validateOfficialReadOnlyAudit({ ...report, schema_version: 1 }), /schema is invalid/);
  assert.throws(() => validateOfficialReadOnlyAudit({ ...report, schema_version: 2 }), /schema is invalid/);
});

function scheduleRecord() {
  const html = fixture("gashapon-schedule-card.html")
    .replaceAll("4570000000001000", "4570000000002000")
    .replace("<span class=\"c-card__price--main\">", "<span class=\"c-card__resale\">再入荷</span><span class=\"c-card__price--main\">");
  const parsed = parseOfficialSourceDocument(html, "https://gashapon.jp/schedule/?ym=202608");
  const record = parsed.records[0];
  return {
    ...record,
    id: "gashapon-4570000000002000",
    official_url: detailUrl,
    raw: { ...record.raw, is_restock: true },
  };
}

function existingSeries(record, release = {}) {
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    franchise: record.franchise,
    brand: record.brand,
    category: record.category,
    release_date: "2020-09-17",
    release_month: "9月",
    release_week: "第3週",
    price: record.price,
    image_url: record.image_url,
    official_url: record.official_url,
    is_released: true,
    source_type: "official_site",
    ...release,
  };
}

function auditInput(record, existing) {
  const counts = {
    series: 100,
    variants: 200,
    restock_events: 0,
    import_issues: 10,
    review_required: 5,
    provisional_variants: 5,
  };
  return {
    snapshot: {
      fetched_at: "2026-08-16T00:00:00.000Z",
      sources: [
        source("gashapon_schedule", 1, 1),
        source("gashapon_products", 0, 1),
        source("takaratomy_search", 1, 1),
      ],
      discovery_records: [record],
      formal_records: [record],
      issue_codes: [],
    },
    catalog: {
      series: existing ? [existing] : [],
      variants: existing ? record.variants.map((variant) => ({
        ...variant,
        series_id: record.id,
        image: variant.image_url,
        official_url: record.official_url,
        price: record.price,
        brand: record.brand,
        release_date: existing.release_date,
        release_month: existing.release_month,
        release_week: existing.release_week,
        released: true,
        source_type: "official_site",
        review_required: false,
      })) : [],
      restock_events: [],
    },
    databaseBefore: counts,
    databaseAfter: { ...counts },
    workflow: { run_id: "123", head_sha: "a".repeat(40), event_name: "local" },
  };
}

function source(name, records, discoveredUrls) {
  return {
    source: name,
    provider: name.startsWith("takaratomy") ? "takaratomy_arts" : "gashapon",
    url: name.startsWith("takaratomy")
      ? "https://www.takaratomy-arts.co.jp/items/gacha/search.html"
      : "https://gashapon.jp/schedule/",
    http_success: true,
    http_status: 200,
    parser_success: true,
    records,
    discovered_urls: discoveredUrls,
    detail_attempts: name === "gashapon_schedule" ? 1 : 0,
    detail_successes: name === "gashapon_schedule" ? 1 : 0,
    detail_failures: 0,
    formal_lineups: name === "gashapon_schedule" ? 1 : 0,
    zero_lineups: 0,
    issue_codes: [],
    freshness: { state: "current", latest_release_date: "2026-08-24", age_days: 0 },
  };
}

function pick(value, keys) {
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}
