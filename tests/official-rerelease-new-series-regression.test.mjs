import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOfficialRereleaseEvent,
  resolveCanonicalOfficialRelease,
  sanitizeOfficialRereleaseEvent,
} from "../lib/domain/official-rerelease.js";

test("new month-precision rerelease keeps the official original year in event evidence", () => {
  const record = {
    id: "gashapon-4549660515777000",
    name: "【箱売】機動戦士ガンダム MOBILE SUIT ENSEMBLE 15",
    official_url: "https://gashapon.jp/products/detail.php?jan_code=4549660515777000",
    release_date: "",
    release_month: "10月",
    release_week: "未定",
    raw: {
      rerelease: {
        is_rerelease: true,
        evidence_source: "gashapon_detail_note",
        evidence_text: "※この商品は再販商品です。2020年10月に発売した商品と同じものです。",
        source_parser: "gashapon_detail_page",
        original_release: {
          year: 2020,
          month: 10,
          release_date: null,
          release_month: "10月",
          release_week: "未定",
          precision: "month",
        },
        current_schedule: {
          year: 2026,
          release_date: null,
          release_month: "9月",
          release_week: "第4週",
          precision: "week",
        },
      },
    },
  };

  const resolved = resolveCanonicalOfficialRelease(record, null);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.source, "official_original_release_evidence");
  assert.deepEqual(resolved.canonical, {
    year: 2020,
    month: 10,
    release_date: null,
    release_month: "10月",
    release_week: "未定",
    precision: "month",
  });

  // buildOfficialReadOnlyAudit uses the resolved fetch record as the series
  // identity object when the series is new. This exact shape previously made
  // event canonical_release collapse to null after sanitization.
  const rerelease = buildOfficialRereleaseEvent({
    record: resolved.record,
    series: resolved.record,
    observedAt: "2026-09-01T07:56:07.652Z",
  });

  assert.equal(rerelease.blocker, null);
  assert.equal(rerelease.event.series_id, record.id);
  assert.deepEqual(rerelease.event.raw.canonical_release, resolved.canonical);
  assert.equal(rerelease.event.raw.canonical_source, "official_original_release_evidence");

  const sanitized = sanitizeOfficialRereleaseEvent(rerelease.event, "insert");
  assert.deepEqual(sanitized.evidence.canonical_release, resolved.canonical);
  assert.equal(sanitized.evidence.canonical_source, "official_original_release_evidence");
  assert.deepEqual(sanitized.evidence.rerelease_schedule, {
    year: 2026,
    release_date: null,
    release_month: "9月",
    release_week: "第4週",
    precision: "week",
  });
});
