import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "gacha-market-p2-distinct-evidence-diagnostic.yml"), "utf8");
const runner = fs.readFileSync(path.join(root, "scripts", "market-p2-distinct-evidence-diagnostic.mjs"), "utf8");

test("Priority 2 distinct evidence workflow is dispatch-only and pins its diagnostic contract", () => {
  assert.match(workflow, /^on:\s*\r?\n\s+workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s+(schedule|push|pull_request|workflow_run|repository_dispatch):/m);
  assert.match(workflow, /Gacha Market P2 Distinct Evidence Read-Only Diagnostic/);
  for (const value of ["5", "10", "15", "20", "25"]) assert.match(workflow, new RegExp(`- "${value}"`));
  assert.match(runner, /priority_2_distinct_exact_diagnostic/);
  assert.match(workflow, /MARKET_BACKFILL_WRITE_DISABLED:\s*"true"/);
  assert.match(runner, /GITHUB_EVENT_NAME !== "workflow_dispatch"/);
  assert.match(runner, /GITHUB_REF !== "refs\/heads\/main"/);
});

test("Priority 2 distinct evidence workflow has no persistence path and preserves a sanitized artifact boundary", () => {
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /manual-market-audit-guard\.mjs scan/);
  assert.doesNotMatch(workflow, /canary-write|--mode=write|upsert|delete|cleanup|migration/i);
  assert.doesNotMatch(runner, /upsertRows|deleteRowsByIds|spawn\(|run-ingestion/);
  assert.match(runner, /database_writes: 0/);
  assert.match(runner, /fetchRowCount\("market_listings", \{ listing_type: "eq\.complete_set" \}\)/);
});
