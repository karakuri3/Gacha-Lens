import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(".github/workflows/a9r-postflight-proof.yml", "utf8");

test("A9R workflow exposes PR validation and gated workflow_dispatch", () => {
  assert.match(workflow, /^on:\s*\n\s+pull_request:/m);
  assert.match(workflow, /\n\s+workflow_dispatch:\s*\n/);
  assert.match(workflow, /expected_main_sha:\s*\n[\s\S]*?required:\s*true/);
  assert.match(workflow, /confirmation:\s*\n[\s\S]*?required:\s*true/);
  assert.match(workflow, /APPROVE_A9R_POST_MERGE_PROOF/);
});

test("PR validation section cannot reach fixed Production origins", () => {
  const dispatchJob = workflow.indexOf("\n  post-merge-proof:");
  assert.ok(dispatchJob > 0);
  const validation = workflow.slice(0, dispatchJob);
  assert.match(validation, /if: github\.event_name == 'pull_request'/);
  assert.doesNotMatch(validation, /gacha-lens\.senpingxingzuo\.workers\.dev/);
  assert.doesNotMatch(validation, /gacha-lens-public\.senpingxingzuo\.workers\.dev/);
  assert.doesNotMatch(validation, /--origin/);
});

test("dispatch controller fixes origins and atomic main confirmation gate", () => {
  assert.match(workflow, /APP_ORIGIN: https:\/\/gacha-lens\.senpingxingzuo\.workers\.dev/);
  assert.match(workflow, /PUBLIC_ORIGIN: https:\/\/gacha-lens-public\.senpingxingzuo\.workers\.dev/);
  assert.match(workflow, /\[\[ "\$expected" =~ \^\[0-9a-f\]\{40\}\$ \]\]/);
  assert.match(workflow, /\[\[ "\$dispatch_ref" == "main" \]\]/);
  assert.match(workflow, /\[\[ "\$checked_branch" == "main" \]\]/);
  assert.match(workflow, /\[\[ "\$checked_sha" == "\$expected" \]\]/);
  assert.match(workflow, /\[\[ "\$fresh_main_sha" == "\$expected" \]\]/);
  assert.match(workflow, /\[\[ "\$CONFIRMATION" == "APPROVE_A9R_POST_MERGE_PROOF" \]\]/);
});

test("dispatch execution has exactly two App passes and two Public passes", () => {
  assert.equal((workflow.match(/--surface app/g) ?? []).length, 2);
  assert.equal((workflow.match(/--only release_source,ranking/g) ?? []).length, 2);
  assert.equal((workflow.match(/--surface public/g) ?? []).length, 2);
  assert.match(workflow, /App proof failed; Public requests remain NOT_RUN/);
  assert.match(workflow, /public_first_rc=0[\s\S]*public_repeat_rc=0/);
});


test("dispatch artifact path is runner-runtime derived before initialization", () => {
  const dispatchStart = workflow.indexOf("\n  post-merge-proof:");
  assert.ok(dispatchStart > 0);
  const dispatch = workflow.slice(dispatchStart);
  const envStart = dispatch.indexOf("\n    env:");
  const stepsStart = dispatch.indexOf("\n    steps:");
  assert.ok(envStart > 0 && stepsStart > envStart);
  const jobEnv = dispatch.slice(envStart, stepsStart);
  assert.doesNotMatch(jobEnv, /\$\{\{\s*runner\./, "runner context must not appear in post-merge-proof job-level env");
  assert.doesNotMatch(jobEnv, /A9R_OUT:/, "A9R_OUT must not be assigned in job-level env");

  const pathStep = dispatch.indexOf("- name: Establish controller artifact path");
  const initStep = dispatch.indexOf("- name: Initialize controller artifact");
  assert.ok(pathStep > stepsStart && initStep > pathStep, "runtime path must be established before artifact initialization");
  assert.match(dispatch.slice(pathStep, initStep), /echo "A9R_OUT=\$\{RUNNER_TEMP\}\/gacha-a9r-post-merge" >> "\$GITHUB_ENV"/);
  assert.match(dispatch, /path: \$\{\{ runner\.temp \}\}\/gacha-a9r-post-merge/);
});

test("controller artifact and immutable proof settings are explicit", () => {
  for (const name of ["app-first", "app-repeat", "public-first", "public-repeat", "controller-status.json"]) {
    assert.ok(workflow.includes(name), `missing ${name}`);
  }
  assert.match(workflow, /if: always\(\)[\s\S]*actions\/upload-artifact@v4/);
  assert.match(workflow, /retry:\s*0/);
  assert.match(workflow, /timeout_ms:\s*20000/);
});

test("dispatch workflow contains no mutation or credential path", () => {
  for (const forbidden of [
    /wrangler\s+deploy/i,
    /wrangler\s+versions\s+upload/i,
    /git\s+push/i,
    /git\s+commit/i,
    /git\s+(?:checkout|switch)\s+-[bBcC]/i,
    /gh\s+workflow\s+run/i,
    /repository_dispatch/i,
    /secrets\./i,
    /vars\./i,
    /SUPABASE_SERVICE_ROLE_KEY/,
    /RAKUTEN_APPLICATION_ID/,
    /YAHOO_SHOPPING_APP_ID/,
  ]) {
    assert.doesNotMatch(workflow, forbidden);
  }
});
