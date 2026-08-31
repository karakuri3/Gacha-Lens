import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "gacha-market-p2-merchant-identity-diagnostic.yml"), "utf8");
const runner = fs.readFileSync(path.join(root, "scripts", "market-p2-merchant-identity-diagnostic.mjs"), "utf8");

function extractNamedStep(source, stepName) {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const start = lines.findIndex((line) => {
    const match = line.match(/^(\s*)-\s+name:\s*(.+?)\s*$/);
    return match?.[2] === stepName;
  });
  if (start === -1) return null;

  const stepIndent = lines[start].match(/^\s*/)[0].length;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (!lines[index].trim()) continue;
    if (lines[index].match(/^\s*/)[0].length <= stepIndent) {
      end = index;
      break;
    }
  }

  return {
    text: lines.slice(start, end).join("\n"),
    outside: [...lines.slice(0, start), ...lines.slice(end)].join("\n"),
  };
}

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
  const diagnosticStep = extractNamedStep(workflow, "Run read-only Priority 2 merchant identity diagnostic");
  assert.ok(diagnosticStep, "the named diagnostic step must exist");
  assert.notEqual(diagnosticStep.text.trim(), "", "the named diagnostic step must be non-empty");
  assert.notEqual(diagnosticStep.outside.trim(), "", "the workflow outside the diagnostic step must be non-empty");
  const secretBackedEnvNames = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "RAKUTEN_APPLICATION_ID",
    "RAKUTEN_ACCESS_KEY",
    "YAHOO_SHOPPING_APP_ID",
    "YAHOO_SHOPPING_FETCH_ENABLED",
  ];
  for (const name of secretBackedEnvNames) {
    assert.match(diagnosticStep.text, new RegExp(`^\\s+${name}:\\s*\\$\\{\\{\\s*secrets\\.${name}\\s*\\}\\}\\s*$`, "m"));
    assert.doesNotMatch(diagnosticStep.outside, new RegExp(`\\b${name}\\b`));
  }
  assert.doesNotMatch(diagnosticStep.outside, /\$\{\{\s*secrets\./);
});

test("diagnostic step extraction is newline- and run-scalar-independent", () => {
  for (const newline of ["\n", "\r\n"]) {
    for (const run of ["run: echo diagnostic", "run: |", "run: >-"]) {
      const fixture = [
        "steps:",
        "  - name: Before",
        "    run: echo before",
        "  - name: Diagnostic",
        "    env:",
        "      SCOPED_CREDENTIAL: value",
        `    ${run}`,
        "      echo diagnostic",
        "  - name: After",
        "    run: echo after",
      ].join(newline);
      const extracted = extractNamedStep(fixture, "Diagnostic");
      assert.ok(extracted);
      assert.match(extracted.text, /SCOPED_CREDENTIAL/);
      assert.doesNotMatch(extracted.outside, /SCOPED_CREDENTIAL/);
    }
  }
});
