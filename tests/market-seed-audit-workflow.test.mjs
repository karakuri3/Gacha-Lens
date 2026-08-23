import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  buildPriorityThreeSeedReadOnlyDiagnostic,
  isNonAuthoritativeManualMarketAudit,
  sanitizeManualMarketAuditDiagnostic,
} from "../lib/domain/manual-market-audit-diagnostic.js";

const root = process.cwd();
const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "gacha-market-seed-audit.yml"), "utf8");
const manualWorkflow = fs.readFileSync(path.join(root, ".github", "workflows", "gacha-market-manual-audit.yml"), "utf8");
const backfill = fs.readFileSync(path.join(root, "scripts", "market-backfill.mjs"), "utf8");

test("Priority 3 seed workflow is workflow_dispatch only", () => {
  assert.match(workflow, /^on:\s*\r?\n\s+workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s+(schedule|push|pull_request|workflow_run|repository_dispatch):/m);
});

test("Priority 3 seed workflow exposes only a bounded limit input", () => {
  const inputBlock = workflow.match(/inputs:([\s\S]*?)\r?\n\r?\njobs:/)?.[1] ?? "";
  assert.match(inputBlock, /^\s+limit:/m);
  assert.doesNotMatch(inputBlock, /^\s+(mode|task|priority|release|source_scope|execute_sources):/m);
  for (const value of ["1", "2", "3", "4", "5"]) assert.match(inputBlock, new RegExp(`- "${value}"`));
});

test("Priority 3 seed workflow fixes the read-only retrieval contract", () => {
  assert.match(workflow, /--mode=dry-run/);
  assert.match(workflow, /--priority=3/);
  assert.match(workflow, /--release=released/);
  assert.match(workflow, /--source-scope=planner-apis/);
  assert.match(workflow, /--execute-sources/);
  assert.match(workflow, /--read-only-seed-audit/);
  assert.doesNotMatch(workflow, /manual-diagnostic-priority-fallback/);
  assert.match(workflow, /--expected-priority=3/);
});

test("Priority 3 seed workflow has no Production write path and verifies zero delta", () => {
  assert.match(workflow, /MARKET_BACKFILL_WRITE_DISABLED:\s*"true"/);
  assert.match(workflow, /manual-market-audit-guard\.mjs compare/);
  assert.match(workflow, /manual-market-audit-guard\.mjs verify/);
  assert.match(workflow, /manual-market-audit-guard\.mjs scan/);
  assert.match(backfill, /market-seed-query-plan\.json/);
  assert.match(backfill, /market-seed-query-plan\.md/);
  assert.doesNotMatch(workflow, /canary-write|--mode=write|db:upsert|bounded-persist|cleanup|migration/i);
  assert.match(backfill, /MARKET_BACKFILL_WRITE_DISABLED === "true" && options\.mode !== "dry-run"/);
});

test("Priority 3 seed audits are sanitized and non-authoritative", () => {
  const diagnostic = buildPriorityThreeSeedReadOnlyDiagnostic();
  assert.deepEqual(sanitizeManualMarketAuditDiagnostic(diagnostic), diagnostic);
  assert.equal(isNonAuthoritativeManualMarketAudit({ manual_diagnostic: diagnostic }), true);
});

test("existing Priority 1 Manual Audit remains unchanged", () => {
  assert.match(manualWorkflow, /--priority=1/);
  assert.match(manualWorkflow, /--manual-diagnostic-priority-fallback/);
  assert.doesNotMatch(manualWorkflow, /--priority=3|--read-only-seed-audit/);
});
