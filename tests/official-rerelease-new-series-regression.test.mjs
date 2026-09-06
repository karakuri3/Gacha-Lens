import assert from "node:assert/strict";
import test from "node:test";
import { authorizeOfficialAutomaticWrite } from "../lib/domain/official-bounded-auto.js";
import { buildOfficialReadOnlyAudit } from "../lib/domain/official-read-only-audit.js";

const HEAD = "a".repeat(40);
const SERIES_ID = "gashapon-4549660515777000";
const OFFICIAL_URL = "https://gashapon.jp/products/detail.php?jan_code=4549660515777000";

test("new month-precision rerelease stays canonical through read-only audit and automatic prepare", () => {
  const record = {
    id: SERIES_ID,
    slug: SERIES_ID,
    name: "【箱売】機動戦士ガンダム MOBILE SUIT ENSEMBLE 15",
    franchise: "【箱売】機動戦士ガンダム",
    brand: "バンダイ",
    category: "ガシャポン",
    release_date: "",
    release_month: "10月",
    release_week: "未定",
    price: 550,
    image_url: "https://bandai-a.akamaihd.net/bc/img/model/xl/1000256891_1.jpg",
    official_url: OFFICIAL_URL,
    released: true,
    source_type: "official_site",
    review_required: false,
    variants: [{
      id: `${SERIES_ID}-ガンダムエクシア`,
      slug: `${SERIES_ID}-ガンダムエクシア`,
      name: "ガンダムエクシア",
      variant_type: "normal",
      image: "https://bandai-a.akamaihd.net/bc/img/model/xl/1000256891_2.jpg",
      released: true,
      price: 550,
      brand: "バンダイ",
      release_month: "10月",
      release_week: "未定",
      release_date: "",
      official_url: OFFICIAL_URL,
      source_type: "official_site",
      review_required: false,
    }],
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
  const counts = {
    series: 0,
    variants: 0,
    restock_events: 0,
    import_issues: 0,
    review_required: 0,
    provisional_variants: 0,
  };
  const report = buildOfficialReadOnlyAudit({
    snapshot: {
      fetched_at: "2026-09-06T07:14:36.688Z",
      sources: [
        source("gashapon_schedule", "gashapon", "https://gashapon.jp/schedule/?ym=202609", 1, 1, 1),
        source("gashapon_products", "gashapon", "https://gashapon.jp/products/", 0, 500, 0),
        source("takaratomy_search", "takaratomy_arts", "https://www.takaratomy-arts.co.jp/items/gacha/search.html", 1, 1, 0),
      ],
      discovery_records: [record],
      formal_records: [record],
      issue_codes: [],
    },
    catalog: { series: [], variants: [], restock_events: [] },
    databaseBefore: counts,
    databaseAfter: { ...counts },
    workflow: { run_id: "34018590471", head_sha: HEAD, event_name: "schedule" },
  });

  assert.equal(report.final_verdict, "OFFICIAL_READ_ONLY_PLAN_READY");
  assert.deepEqual(report.plan.blockers, []);
  assert.equal(report.plan.candidate_count, 1);
  assert.deepEqual(report.plan.candidates[0].canonical_release, {
    year: 2020,
    month: 10,
    release_date: null,
    release_month: "10月",
    release_week: "未定",
    precision: "month",
    source: "official_original_release_evidence",
  });
  assert.deepEqual(report.plan.candidates[0].restock_event.evidence.canonical_release, {
    year: 2020,
    month: 10,
    release_date: null,
    release_month: "10月",
    release_week: "未定",
    precision: "month",
  });
  assert.equal(report.plan.candidates[0].restock_event.evidence.canonical_source, "official_original_release_evidence");
  assert.equal(report.plan.candidates[0].restock_event.id, "official-rerelease-a03ff2f86a260bf8c12dc6d7");

  const authorization = authorizeOfficialAutomaticWrite({ report, headSha: HEAD, originMainSha: HEAD });
  assert.equal(authorization.ok, true);
  assert.equal(authorization.decision, "write");
  assert.equal(authorization.proposal.series.insert, 1);
  assert.equal(authorization.proposal.variants.insert, 1);
  assert.equal(authorization.proposal.restock_events.insert, 1);
  assert.equal(authorization.proposal.database_writes, 3);
});

function source(name, provider, url, records, discoveredUrls, formalLineups) {
  return {
    source: name,
    provider,
    url,
    http_success: true,
    http_status: 200,
    parser_success: true,
    records,
    discovered_urls: discoveredUrls,
    detail_attempts: formalLineups,
    detail_successes: formalLineups,
    detail_failures: 0,
    formal_lineups: formalLineups,
    zero_lineups: 0,
    issue_codes: [],
    freshness: { state: "current", latest_release_date: "2026-09-01", age_days: 5 },
  };
}
