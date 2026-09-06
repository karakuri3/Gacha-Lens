import assert from "node:assert/strict";
import test from "node:test";
import { authorizeOfficialAutomaticWrite } from "../lib/domain/official-bounded-auto.js";
import { buildOfficialReadOnlyAudit } from "../lib/domain/official-read-only-audit.js";

// Sanitized replay fixture reconstructed only from F0 scheduled run #12 artifact 34018590471.
// It preserves the exact affected series, five variants, source counters, database counters,
// original 2020-10 release evidence, and 2026-09 week-4 rerelease schedule.
const HEAD = "83b0b36e5d0172f3ea6964206edad6480a13b4bb";
const SERIES_ID = "gashapon-4549660515777000";
const RECORD = {
  "id": "gashapon-4549660515777000",
  "slug": "gashapon-4549660515777000",
  "name": "【箱売】機動戦士ガンダム MOBILE SUIT ENSEMBLE 15",
  "franchise": "【箱売】機動戦士ガンダム",
  "brand": "バンダイ",
  "category": "ガシャポン",
  "release_date": "",
  "release_month": "10月",
  "release_week": "未定",
  "price": 550,
  "image_url": "https://bandai-a.akamaihd.net/bc/img/model/xl/1000256891_1.jpg",
  "official_url": "https://gashapon.jp/products/detail.php?jan_code=4549660515777000",
  "released": true,
  "source_type": "official_site",
  "review_required": false,
  "variants": [
    {
      "id": "gashapon-4549660515777000-ガンダムエクシア",
      "slug": "gashapon-4549660515777000-ガンダムエクシア",
      "name": "ガンダムエクシア",
      "variant_type": "normal",
      "image": "https://bandai-a.akamaihd.net/bc/img/model/xl/1000256891_2.jpg",
      "released": true,
      "price": 550,
      "brand": "バンダイ",
      "release_month": "10月",
      "release_week": "未定",
      "official_url": "https://gashapon.jp/products/detail.php?jan_code=4549660515777000",
      "source_type": "official_site",
      "review_required": false,
      "release_date": ""
    },
    {
      "id": "gashapon-4549660515777000-ガンダムデュナメス",
      "slug": "gashapon-4549660515777000-ガンダムデュナメス",
      "name": "ガンダムデュナメス",
      "variant_type": "normal",
      "image": "https://bandai-a.akamaihd.net/bc/img/model/xl/1000256891_3.jpg",
      "released": true,
      "price": 550,
      "brand": "バンダイ",
      "release_month": "10月",
      "release_week": "未定",
      "official_url": "https://gashapon.jp/products/detail.php?jan_code=4549660515777000",
      "source_type": "official_site",
      "review_required": false,
      "release_date": ""
    },
    {
      "id": "gashapon-4549660515777000-リゼル",
      "slug": "gashapon-4549660515777000-リゼル",
      "name": "リゼル",
      "variant_type": "normal",
      "image": "https://bandai-a.akamaihd.net/bc/img/model/xl/1000256891_4.jpg",
      "released": true,
      "price": 550,
      "brand": "バンダイ",
      "release_month": "10月",
      "release_week": "未定",
      "official_url": "https://gashapon.jp/products/detail.php?jan_code=4549660515777000",
      "source_type": "official_site",
      "review_required": false,
      "release_date": ""
    },
    {
      "id": "gashapon-4549660515777000-リゼル拡張セット",
      "slug": "gashapon-4549660515777000-リゼル拡張セット",
      "name": "リゼル拡張セット",
      "variant_type": "normal",
      "image": "https://bandai-a.akamaihd.net/bc/img/model/xl/1000256891_5.jpg",
      "released": true,
      "price": 550,
      "brand": "バンダイ",
      "release_month": "10月",
      "release_week": "未定",
      "official_url": "https://gashapon.jp/products/detail.php?jan_code=4549660515777000",
      "source_type": "official_site",
      "review_required": false,
      "release_date": ""
    },
    {
      "id": "gashapon-4549660515777000-ms武器セット",
      "slug": "gashapon-4549660515777000-ms武器セット",
      "name": "MS武器セット",
      "variant_type": "normal",
      "image": "https://bandai-a.akamaihd.net/bc/img/model/xl/1000256891_6.jpg",
      "released": true,
      "price": 550,
      "brand": "バンダイ",
      "release_month": "10月",
      "release_week": "未定",
      "official_url": "https://gashapon.jp/products/detail.php?jan_code=4549660515777000",
      "source_type": "official_site",
      "review_required": false,
      "release_date": ""
    }
  ],
  "raw": {
    "rerelease": {
      "is_rerelease": true,
      "evidence_source": "gashapon_detail_note",
      "evidence_text": "って異なる場合があります。 ※この商品は再販商品です。2020年10月に発売した商品と同じものです。 機動戦士ガンダムシリーズ特設ページはこちら 機動戦士ガンダム モビルスーツ アンサンブル特設ページはこちら おすすめガシャポン ® まちぼうけ ウルトラマンの場合2 ガシャポン 400 円 機動戦士ガンダム ならぶんです。～なりきりハロ～ ガシャポン 300 円 転生したらスライムだった件 カプセルフィギュアコレクション2 ガシャポン 500 円 僕のヒーローアカデミア すわ",
      "source_parser": "gashapon_detail_page",
      "original_release": {
        "year": 2020,
        "month": 10,
        "release_date": null,
        "release_month": "10月",
        "release_week": "未定",
        "precision": "month"
      },
      "current_schedule": {
        "year": 2026,
        "release_date": null,
        "release_month": "9月",
        "release_week": "第4週",
        "precision": "week"
      }
    }
  }
};
const SOURCES = [
  {
    "source": "gashapon_schedule",
    "provider": "gashapon",
    "url": "https://gashapon.jp/schedule/?ym=202609",
    "http_success": true,
    "http_status": 200,
    "parser_success": true,
    "records": 173,
    "discovered_urls": 173,
    "detail_attempts": 2,
    "detail_successes": 2,
    "detail_failures": 0,
    "formal_lineups": 2,
    "zero_lineups": 0,
    "issue_codes": [],
    "freshness": {
      "state": "current",
      "latest_release_date": "2026-09-01",
      "age_days": 5
    }
  },
  {
    "source": "gashapon_products",
    "provider": "gashapon",
    "url": "https://gashapon.jp/products/",
    "http_success": true,
    "http_status": 200,
    "parser_success": true,
    "records": 0,
    "discovered_urls": 500,
    "detail_attempts": 0,
    "detail_successes": 0,
    "detail_failures": 0,
    "formal_lineups": 0,
    "zero_lineups": 0,
    "issue_codes": [],
    "freshness": {
      "state": "unknown",
      "latest_release_date": null,
      "age_days": null
    }
  },
  {
    "source": "takaratomy_search",
    "provider": "takaratomy_arts",
    "url": "https://www.takaratomy-arts.co.jp/items/gacha/search.html?order=release&p=1&sort=0",
    "http_success": true,
    "http_status": 200,
    "parser_success": true,
    "records": 40,
    "discovered_urls": 40,
    "detail_attempts": 2,
    "detail_successes": 2,
    "detail_failures": 0,
    "formal_lineups": 2,
    "zero_lineups": 0,
    "issue_codes": [],
    "freshness": {
      "state": "current",
      "latest_release_date": "2026-08-31",
      "age_days": 6
    }
  }
];
const COUNTS = {
  "series": 10241,
  "variants": 23808,
  "restock_events": 0,
  "import_issues": 133,
  "review_required": 7535,
  "provisional_variants": 7535
};

test("run #12 rerelease artifact shape stays canonical through read-only audit and automatic prepare", () => {
  const report = buildOfficialReadOnlyAudit({
    snapshot: {
      fetched_at: "2026-09-06T07:14:36.688Z",
      sources: SOURCES,
      discovery_records: [RECORD],
      formal_records: [RECORD],
      issue_codes: [],
    },
    catalog: { series: [], variants: [], restock_events: [] },
    databaseBefore: COUNTS,
    databaseAfter: { ...COUNTS },
    workflow: { run_id: "34018590471", head_sha: HEAD, event_name: "schedule" },
  });

  assert.equal(report.final_verdict, "OFFICIAL_READ_ONLY_PLAN_READY");
  assert.deepEqual(report.plan.blockers, []);
  assert.equal(report.plan.candidate_count, 1);
  assert.equal(report.plan.candidates[0].series_id, SERIES_ID);
  assert.equal(report.plan.candidates[0].variant_count, 5);
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
  assert.equal(authorization.proposal.variants.insert, 5);
  assert.equal(authorization.proposal.restock_events.insert, 1);
  assert.equal(authorization.proposal.database_writes, 7);
});
