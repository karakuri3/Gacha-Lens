import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildOfficialResidualAudit,
  validateOfficialResidualAudit,
} from "../lib/domain/official-residual-audit.js";

const counts = { series: 10, variants: 20, provisional_variants: 2, restock_events: 0, import_issues: 1 };
const known = [
  { id: "safe", official_url: "https://gashapon.jp/products/detail.php?jan_code=1", release_date: "2026-09-01" },
  { id: "rr", official_url: "https://gashapon.jp/products/detail.php?jan_code=2", release_date: "2024-01-01" },
];

test("read-only full scan separates safe and rerelease residuals", () => {
  const report = validateOfficialResidualAudit(buildOfficialResidualAudit({
    knownOfficialRecords: known,
    knownDetailedOfficialUrls: [],
    fetchedRecords: [
      { ...known[0], variants: [{ id: "v1" }], raw: {} },
      { ...known[1], variants: [{ id: "v2" }], raw: { is_restock: true } },
    ],
    detailFetched: 2,
    detailFetchLimit: 100,
    collectorRemainingDetails: 0,
    issues: [],
    databaseBefore: counts,
    databaseAfter: counts,
    observedAt: "2026-09-19T00:00:00.000Z",
    workflow: { run_id: "1", head_sha: "a".repeat(40), event_name: "push" },
  }));
  assert.equal(report.final_verdict, "OFFICIAL_RESIDUAL_AUDIT_NON_RERELEASE_REMAINS");
  assert.equal(report.totals.non_rerelease_parseable, 1);
  assert.equal(report.totals.rerelease_parseable, 1);
  assert.equal(report.scan.scan_complete, true);
  assert.equal(report.database.writes, 0);
});

test("unresolved details block Phase A clear even when no safe parseable rows remain", () => {
  const report = buildOfficialResidualAudit({
    knownOfficialRecords: known,
    knownDetailedOfficialUrls: [],
    fetchedRecords: [{ ...known[1], variants: [{ id: "v2" }], raw: { is_restock: true } }],
    detailFetched: 2,
    detailFetchLimit: 100,
    collectorRemainingDetails: 1,
    issues: [{ message: "parse" }],
    databaseBefore: counts,
    databaseAfter: counts,
  });
  assert.equal(report.final_verdict, "OFFICIAL_RESIDUAL_AUDIT_UNRESOLVED_DETAILS");
});

test("database drift fails closed", () => {
  const report = buildOfficialResidualAudit({
    knownOfficialRecords: [],
    knownDetailedOfficialUrls: [],
    fetchedRecords: [],
    detailFetched: 0,
    detailFetchLimit: 100,
    collectorRemainingDetails: 0,
    issues: [],
    databaseBefore: counts,
    databaseAfter: { ...counts, variants: 21 },
  });
  assert.equal(report.final_verdict, "OFFICIAL_RESIDUAL_AUDIT_BLOCKED_DATABASE_DELTA");
});

test("hitting the fetch cap is conservatively incomplete", () => {
  const report = buildOfficialResidualAudit({
    knownOfficialRecords: [],
    knownDetailedOfficialUrls: [],
    fetchedRecords: [],
    detailFetched: 100,
    detailFetchLimit: 100,
    collectorRemainingDetails: 0,
    issues: [],
    databaseBefore: counts,
    databaseAfter: counts,
  });
  assert.equal(report.final_verdict, "OFFICIAL_RESIDUAL_AUDIT_INCOMPLETE_SCAN");
});

test("workflow is one-time, exact-main and exposes no Production write lane", () => {
  const workflow = fs.readFileSync(".github/workflows/gacha-official-residual-audit-once.yml", "utf8");
  const script = fs.readFileSync("scripts/official-residual-audit.mjs", "utf8");
  assert.match(workflow, /paths:\n\s+- \.github\/ops\/gacha-official-residual-audit-20260919\.token/);
  assert.doesNotMatch(workflow, /schedule:/);
  assert.doesNotMatch(workflow, /workflow_dispatch:/);
  assert.match(workflow, /INGESTION_WRITE_DISABLED: "true"/);
  assert.doesNotMatch(workflow, /SUPABASE_DB_URL/);
  assert.doesNotMatch(workflow, /ingest:/);
  assert.doesNotMatch(workflow, /db:upsert/);
  assert.doesNotMatch(script, /upsertRows|insertRows|deleteRows|apply_migration/);
});
