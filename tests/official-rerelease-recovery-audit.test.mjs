import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildOfficialRereleaseRecoveryAudit,
  validateOfficialRereleaseRecoveryAudit,
} from "../lib/domain/official-rerelease-recovery-audit.js";

const counts = { series: 10, variants: 20, restock_events: 0, import_issues: 0 };

test("schedule rerelease with stored canonical release plans an event insert without database writes", () => {
  const record = rereleaseRecord();
  const report = validateOfficialRereleaseRecoveryAudit(buildOfficialRereleaseRecoveryAudit({
    scheduleRecords: [record],
    catalog: { series: [series(record.id)], restock_events: [] },
    databaseBefore: counts,
    databaseAfter: counts,
    observedAt: "2026-09-19T00:00:00.000Z",
    workflow: { run_id: "1", head_sha: "a".repeat(40), event_name: "workflow_dispatch" },
    source: { ok: true, schedule_pages: 13, records: 1, issues: 0 },
  }));
  assert.equal(report.final_verdict, "OFFICIAL_RERELEASE_RECOVERY_AUDIT_READY");
  assert.equal(report.totals.rerelease_discovered, 1);
  assert.equal(report.totals.restock_event_inserts, 1);
  assert.equal(report.database.writes, 0);
  assert.equal(report.candidates[0].state, "eligible");
  assert.equal(report.candidates[0].operation, "insert");
  assert.equal(report.candidates[0].canonical_release.release_date, "2024-03-01");
});

test("missing canonical series is blocked without inventing release history", () => {
  const report = buildOfficialRereleaseRecoveryAudit({
    scheduleRecords: [rereleaseRecord()],
    catalog: { series: [], restock_events: [] },
    databaseBefore: counts,
    databaseAfter: counts,
    observedAt: "2026-09-19T00:00:00.000Z",
    workflow: { run_id: "1", head_sha: "a".repeat(40), event_name: "workflow_dispatch" },
    source: { ok: true, schedule_pages: 13, records: 1, issues: 0 },
  });
  assert.equal(report.totals.blocked, 1);
  assert.deepEqual(report.candidates[0].blockers, ["series_missing"]);
  assert.equal(report.database.writes, 0);
});

test("production count drift blocks the read-only audit", () => {
  const report = buildOfficialRereleaseRecoveryAudit({
    scheduleRecords: [rereleaseRecord()],
    catalog: { series: [series("gashapon-1")], restock_events: [] },
    databaseBefore: counts,
    databaseAfter: { ...counts, variants: 21 },
    observedAt: "2026-09-19T00:00:00.000Z",
    workflow: { run_id: "1", head_sha: "a".repeat(40), event_name: "workflow_dispatch" },
    source: { ok: true, schedule_pages: 13, records: 1, issues: 0 },
  });
  assert.equal(report.final_verdict, "OFFICIAL_RERELEASE_RECOVERY_AUDIT_BLOCKED");
  assert.ok(report.blockers.includes("production_database_delta_detected"));
});

test("partial schedule source blocks the recovery audit", () => {
  const report = buildOfficialRereleaseRecoveryAudit({
    scheduleRecords: [rereleaseRecord()],
    catalog: { series: [series("gashapon-1")], restock_events: [] },
    databaseBefore: counts,
    databaseAfter: counts,
    observedAt: "2026-09-19T00:00:00.000Z",
    workflow: { run_id: "1", head_sha: "a".repeat(40), event_name: "workflow_dispatch" },
    source: { ok: true, schedule_pages: 13, records: 1, issues: 1 },
  });
  assert.equal(report.final_verdict, "OFFICIAL_RERELEASE_RECOVERY_AUDIT_BLOCKED");
  assert.ok(report.blockers.includes("source_incomplete"));
});

test("workflow is dispatch-only and exposes no Production write credential", () => {
  const workflow = fs.readFileSync(".github/workflows/gacha-official-rerelease-recovery-audit.yml", "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /schedule:/);
  assert.match(workflow, /INGESTION_WRITE_DISABLED: "true"/);
  assert.doesNotMatch(workflow, /SUPABASE_DB_URL/);
  assert.doesNotMatch(workflow, /ingest:/);
  assert.doesNotMatch(workflow, /db:upsert/);
});

function rereleaseRecord() {
  return {
    id: "gashapon-1",
    name: "sample",
    official_url: "https://gashapon.jp/products/detail.php?jan_code=1",
    raw: {
      is_restock: true,
      schedule: {
        year: 2026,
        release_date: null,
        release_month: "9月",
        release_week: "第3週",
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
