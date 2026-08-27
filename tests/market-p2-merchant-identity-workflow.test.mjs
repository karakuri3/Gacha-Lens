import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "gacha-market-p2-merchant-identity-diagnostic.yml"), "utf8");
const runner = fs.readFileSync(path.join(root, "scripts", "market-p2-merchant-identity-diagnostic.mjs"), "utf8");

test("Priority 2 merchant identity workflow is dispatch-only and pins its diagnostic contract", () => {
  assert.match(workflow, /^on:\s*\r?\n\s+workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s+(schedule|push|pull_request|workflow_run|repository_dispatch):/m);
  assert.match(workflow, /Gacha Market P2 Merchant Identity Read-Only Diagnostic/);
  for (const value of ["5", "10", "15", "20", "25"]) assert.match(workflow, new RegExp(`- "${value}"`));
  assert.match(runner, /priority_2_distinct_exact_diagnostic/);
  assert.match(workflow, /MARKET_BACKFILL_WRITE_DISABLED:\s*"true"/);
  assert.match(runner, /GITHUB_EVENT_NAME !== "workflow_dispatch"/);
  assert.match(runner, /GITHUB_REF !== "refs\/heads\/main"/);
});

test("Priority 2 merchant identity workflow has no persistence path and preserves a sanitized artifact boundary", () => {
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /manual-market-audit-guard\.mjs scan/);
  assert.doesNotMatch(workflow, /canary-write|--mode=write|upsert|delete|cleanup|migration/i);
  assert.doesNotMatch(runner, /upsertRows|deleteRowsByIds|spawn\(|run-ingestion/);
  assert.match(runner, /database_writes: 0/);
  assert.match(runner, /buildMarketplaceStorefrontEvidenceByCandidateKey/);
  assert.match(runner, /fetchRowCount\("market_listings", \{ listing_type: "eq\.complete_set" \}\)/);
});

test("Production credentials are scoped to the diagnostic step only", () => {
  const jobEnv = workflow.match(/\n    env:\n([\s\S]*?)\n    steps:/)?.[1] ?? "";
  const diagnosticEnv = workflow.match(/- name: Run read-only Priority 2 merchant identity diagnostic[\s\S]*?env:\n([\s\S]*?)\n        run:/)?.[1] ?? "";
  assert.doesNotMatch(jobEnv, /SUPABASE_SERVICE_ROLE_KEY|RAKUTEN_ACCESS_KEY|YAHOO_SHOPPING_APP_ID/);
  assert.match(diagnosticEnv, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(diagnosticEnv, /RAKUTEN_ACCESS_KEY/);
  assert.match(diagnosticEnv, /YAHOO_SHOPPING_APP_ID/);
});
