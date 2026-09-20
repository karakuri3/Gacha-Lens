import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildOfficialRereleaseRecoveryAudit,
  validateOfficialRereleaseRecoveryAudit,
} from "../lib/domain/official-rerelease-recovery-audit.js";

const counts = {
  series: 10,
  variants: 20,
  provisional_variants: 2,
  restock_events: 0,
  import_issues: 1,
};

test("post-A3 rerelease residual plans event insert with zero database writes", () => {
  const record = rereleaseRecord();
  const report = validateOfficialRereleaseRecoveryAudit(buildOfficialRereleaseRecoveryAudit({
    residual: residual({ rereleaseRecords: [record] }),
    catalog: { series: [series(record.id)], restock_events: [] },
    databaseBefore: counts,
    databaseAfter: counts,
    observedAt: "2026-09-20T00:00:00.000Z",
    workflow: workflow(),
    scan: scan(),
  }));

  assert.equal(report.final_verdict, "OFFICIAL_RERELEASE_RECOVERY_AUDIT_READY");
  assert.equal(report.residual.safe_records, 0);
  assert.equal(report.residual.rerelease_records, 1);
  assert.equal(report.plan.restock_event_inserts, 1);
  assert.equal(report.plan.planned_database_writes, 1);
  assert.equal(report.database.writes, 0);
  assert.match(report.plan.plan_digest, /^sha256:[0-9a-f]{64}$/);
});

test("plan digest is stable across observation timestamps", () => {
  const record = rereleaseRecord();
  const base = {
    residual: residual({ rereleaseRecords: [record] }),
    catalog: { series: [series(record.id)], restock_events: [] },
    databaseBefore: counts,
    databaseAfter: counts,
    workflow: workflow(),
    scan: scan(),
  };
  const left = buildOfficialRereleaseRecoveryAudit({
    ...base,
    observedAt: "2026-09-20T00:00:00.000Z",
  });
  const right = buildOfficialRereleaseRecoveryAudit({
    ...base,
    observedAt: "2026-09-20T01:00:00.000Z",
  });
  assert.equal(left.plan.plan_digest, right.plan.plan_digest);
});

test("remaining Phase A3 safe residual blocks Phase B audit", () => {
  const record = rereleaseRecord();
  const safe = { ...record, id: "gashapon-safe", raw: {} };
  const report = buildOfficialRereleaseRecoveryAudit({
    residual: residual({ safeRecords: [safe], rereleaseRecords: [record] }),
    catalog: { series: [series(record.id)], restock_events: [] },
    databaseBefore: counts,
    databaseAfter: counts,
    observedAt: "2026-09-20T00:00:00.000Z",
    workflow: workflow(),
    scan: scan({ known_priority_urls: 2, detail_fetch_limit: 2, detail_fetched: 2 }),
  });
  assert.equal(report.final_verdict, "OFFICIAL_RERELEASE_RECOVERY_AUDIT_BLOCKED");
  assert.ok(report.blockers.includes("phase_a3_safe_residual_remaining"));
});

test("database drift blocks read-only audit", () => {
  const record = rereleaseRecord();
  const report = buildOfficialRereleaseRecoveryAudit({
    residual: residual({ rereleaseRecords: [record] }),
    catalog: { series: [series(record.id)], restock_events: [] },
    databaseBefore: counts,
    databaseAfter: { ...counts, variants: counts.variants + 1 },
    observedAt: "2026-09-20T00:00:00.000Z",
    workflow: workflow(),
    scan: scan(),
  });
  assert.equal(report.final_verdict, "OFFICIAL_RERELEASE_RECOVERY_AUDIT_BLOCKED");
  assert.ok(report.blockers.includes("production_database_delta_detected"));
});

test("non-Gashapon rerelease semantics remain fail-closed", () => {
  const record = {
    ...rereleaseRecord(),
    id: "takara-rerelease",
    official_url: "https://www.takaratomy-arts.co.jp/items/item.html?n=1",
  };
  const report = buildOfficialRereleaseRecoveryAudit({
    residual: residual({ rereleaseRecords: [record] }),
    catalog: {
      series: [{
        ...series(record.id),
        official_url: record.official_url,
      }],
      restock_events: [],
    },
    databaseBefore: counts,
    databaseAfter: counts,
    observedAt: "2026-09-20T00:00:00.000Z",
    workflow: workflow(),
    scan: scan(),
  });
  assert.equal(report.final_verdict, "OFFICIAL_RERELEASE_RECOVERY_AUDIT_BLOCKED");
  assert.ok(report.blockers.includes("rerelease_provider_not_reviewed"));
});

test("workflow is dispatch-only, long-scan bounded, exact-main guarded, and has no DB write credential", () => {
  const workflowText = fs.readFileSync(".github/workflows/gacha-official-rerelease-recovery-audit.yml", "utf8");
  const runner = fs.readFileSync("scripts/official-rerelease-recovery-audit.mjs", "utf8");

  assert.match(workflowText, /workflow_dispatch:/);
  assert.doesNotMatch(workflowText, /schedule:/);
  assert.match(workflowText, /timeout-minutes:\s*150/);
  assert.match(workflowText, /cancel-in-progress:\s*false/);
  assert.match(workflowText, /INGESTION_WRITE_DISABLED: "true"/);
  assert.match(workflowText, /MARKET_BACKFILL_WRITE_DISABLED: "true"/);
  assert.doesNotMatch(workflowText, /SUPABASE_DB_URL/);
  assert.match(workflowText, /Verify exact current main before residual scan/);
  assert.match(workflowText, /Verify exact main remained unchanged through residual scan/);
  assert.match(workflowText, /steps\.scan\.outcome == 'success'/);
  assert.match(runner, /scanOfficialPhaseA3Residuals/);
  assert.match(runner, /allowEmptyPlan:\s*true/);
  assert.doesNotMatch(runner, /fetchOfficialRaw\(/);
  assert.doesNotMatch(runner, /SUPABASE_DB_URL/);
});

function residual({ safeRecords = [], rereleaseRecords = [], unresolvedRecords = [] } = {}) {
  return {
    knownUndetailedRecords: [...safeRecords, ...rereleaseRecords, ...unresolvedRecords],
    safeRecords,
    rereleaseRecords,
    unresolvedRecords,
  };
}

function rereleaseRecord() {
  return {
    id: "gashapon-1",
    name: "sample",
    official_url: "https://gashapon.jp/products/detail.php?jan_code=1",
    raw: {
      rerelease: {
        is_rerelease: true,
        current_schedule: {
          year: 2026,
          release_month: "9月",
          release_week: "第3週",
        },
        original_release: {
          year: 2024,
          month: 3,
          release_month: "3月",
          release_week: "未定",
          precision: "month",
        },
        evidence_source: "gashapon_detail_note",
        evidence_text: "再販商品",
        source_parser: "gashapon_detail_page",
      },
    },
  };
}

function series(id) {
  return {
    id,
    name: "sample",
    release_date: "2024-03-01",
    release_month: "3月",
    release_week: "第1週",
    official_url: "https://gashapon.jp/products/detail.php?jan_code=1",
  };
}

function workflow() {
  return {
    run_id: "1",
    head_sha: "a".repeat(40),
    event_name: "workflow_dispatch",
  };
}

function scan(overrides = {}) {
  return {
    known_priority_urls: 1,
    detail_fetch_limit: 1,
    detail_fetched: 1,
    held_shared_detailed_urls: 0,
    held_unsupported_provider_urls: 0,
    priority_scan_complete: true,
    fetch_issues: 0,
    ...overrides,
  };
}
