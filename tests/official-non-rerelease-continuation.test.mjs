import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflowPath = ".github/workflows/gacha-official-non-rerelease-continuation-once.yml";
const markerPath = ".github/ops/gacha-official-non-rerelease-continuation-20260919.token";
const workflow = fs.readFileSync(workflowPath, "utf8");
const marker = fs.readFileSync(markerPath, "utf8").trim();

test("Phase A2 continuation is one-time, exact-main and owner-gated by merge", () => {
  assert.equal(marker, "APPROVE_GACHA_OFFICIAL_NON_RERELEASE_CONTINUATION_20260919");
  assert.match(workflow, /push:/);
  assert.match(workflow, /branches:\s*\n\s*- main/);
  assert.match(workflow, /gacha-official-non-rerelease-continuation-20260919\.token/);
  assert.match(workflow, /APPROVE_GACHA_OFFICIAL_NON_RERELEASE_CONTINUATION_20260919/);
  assert.match(workflow, /git rev-parse origin\/main/);
  assert.doesNotMatch(workflow, /schedule:/);
  assert.doesNotMatch(workflow, /workflow_dispatch:/);
});

test("Phase A2 keeps rerelease semantics fail-closed outside the exact one-time skip scope", () => {
  assert.match(workflow, /OFFICIAL_RERELEASE_POLICY: skip/);
  assert.match(workflow, /OFFICIAL_RERELEASE_SKIP_CONFIRMATION: APPROVE_OFFICIAL_RERELEASE_SKIP_FOR_ONE_TIME_RECOVERY_V1/);
  assert.match(workflow, /npm run ingest:official/);
  assert.match(workflow, /rereleaseRecordsSkipped/);
  assert.doesNotMatch(workflow, /OFFICIAL_BOUNDED_AUTO_ENABLED:\s*true/);
  assert.doesNotMatch(workflow, /SUPABASE_DB_URL/);
});

test("Phase A2 is official-only and does not repeat stock or X writes", () => {
  assert.doesNotMatch(workflow, /npm run ingest:stock/);
  assert.doesNotMatch(workflow, /npm run ingest:x/);
  assert.doesNotMatch(workflow, /X_BEARER_TOKEN/);
  assert.doesNotMatch(workflow, /STOCK_RAW_FEED/);
});

test("Phase A2 is bounded and cannot report completion with residual detail backlog", () => {
  assert.match(workflow, /OFFICIAL_DETAIL_FETCH_LIMIT: 500/);
  assert.match(workflow, /seq 1 28/);
  assert.match(workflow, /remainingDetails/);
  assert.match(workflow, /final-remaining\.txt/);
  assert.match(workflow, /backlogExhausted: remaining === 0/);
  assert.match(workflow, /Require backlog exhaustion for Phase A completion/);
  assert.match(workflow, /test "\$\{remaining\}" -le 0/);
});

test("Phase A2 preserves reviewable before-after evidence and uploads it even on failure", () => {
  for (const table of ["series", "variants", "provisional_variants", "restock_events", "import_issues"]) {
    assert.match(workflow, new RegExp(table));
  }
  assert.match(workflow, /summary\.json/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /if: \$\{\{ always\(\) \}\}/);
});
