import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(".github/workflows/a9r-postflight-proof.yml", "utf8");
const exactIssueCommand = /^\/a9r-post-merge ([0-9a-f]{40}) APPROVE_A9R_POST_MERGE_PROOF$/;

function issueCommentAuthorized({
  action = "created",
  issue = "430",
  actor = "karakuri3",
  owner = "karakuri3",
  author = "karakuri3",
  association = "OWNER",
  body,
}) {
  return action === "created"
    && issue === "430"
    && actor === owner
    && author === owner
    && association === "OWNER"
    && exactIssueCommand.test(body);
}

test("A9R workflow exposes PR validation, issue_comment created, and workflow_dispatch", () => {
  assert.match(workflow, /^on:\s*\n\s+pull_request:/m);
  assert.match(workflow, /\n\s+issue_comment:\s*\n\s+types:\s*\[created\]/);
  assert.match(workflow, /\n\s+workflow_dispatch:\s*\n/);
  assert.match(workflow, /expected_main_sha:\s*\n[\s\S]*?required:\s*true/);
  assert.match(workflow, /confirmation:\s*\n[\s\S]*?required:\s*true/);
  assert.match(workflow, /APPROVE_A9R_POST_MERGE_PROOF/);
});

test("issue_comment controller statically gates issue, owner actor, OWNER association, and exact grammar", () => {
  const dispatchStart = workflow.indexOf("\n  post-merge-proof:");
  assert.ok(dispatchStart > 0);
  const dispatch = workflow.slice(dispatchStart);
  assert.match(dispatch, /github\.event_name == 'workflow_dispatch' \|\| github\.event_name == 'issue_comment'/);
  assert.match(dispatch, /COMMENT_ACTION: \$\{\{ github\.event\.action \}\}/);
  assert.match(dispatch, /COMMENT_ISSUE_NUMBER: \$\{\{ github\.event\.issue\.number \}\}/);
  assert.match(dispatch, /COMMENT_AUTHOR_LOGIN: \$\{\{ github\.event\.comment\.user\.login \}\}/);
  assert.match(dispatch, /COMMENT_AUTHOR_ASSOCIATION: \$\{\{ github\.event\.comment\.author_association \}\}/);
  assert.match(dispatch, /COMMENT_BODY: \$\{\{ github\.event\.comment\.body \}\}/);
  assert.match(dispatch, /command_re='\^\/a9r-post-merge \(\[0-9a-f\]\{40\}\) APPROVE_A9R_POST_MERGE_PROOF\$'/);
  assert.match(dispatch, /\[\[ "\$\{COMMENT_ACTION:-\}" == "created" \\/);
  assert.match(dispatch, /&& "\$issue_number" == "430" \\/);
  assert.match(dispatch, /&& "\$comment_actor_login" == "\$REPOSITORY_OWNER" \\/);
  assert.match(dispatch, /&& "\$comment_author_login" == "\$REPOSITORY_OWNER" \\/);
  assert.match(dispatch, /&& "\$comment_author_association" == "OWNER" \\/);
  assert.match(dispatch, /&& "\$comment_grammar_result" == "PASS" \]\]/);
  assert.doesNotMatch(dispatch, /echo "COMMENT_BODY=/, "raw comment body must not be persisted to GITHUB_ENV");
});

test("only the exact one-line issue_comment grammar authorizes", () => {
  const sha = "0123456789abcdef0123456789abcdef01234567";
  const exact = `/a9r-post-merge ${sha} APPROVE_A9R_POST_MERGE_PROOF`;
  assert.equal(issueCommentAuthorized({ body: exact }), true);

  for (const body of [
    `/a9r-post-merge 01234567 APPROVE_A9R_POST_MERGE_PROOF`,
    `/a9r-post-merge ${sha.toUpperCase()} APPROVE_A9R_POST_MERGE_PROOF`,
    `prefix ${exact}`,
    `${exact} suffix`,
    `${exact} `,
    ` ${exact}`,
    `/a9r-post-merge  ${sha} APPROVE_A9R_POST_MERGE_PROOF`,
    `${exact}\nextra`,
    `/a9r-post-merge ${sha} WRONG_CONFIRMATION`,
  ]) {
    assert.equal(issueCommentAuthorized({ body }), false, body);
  }
});

test("issue_comment authorization fails closed for wrong issue, actor, author, association, or action", () => {
  const body = "/a9r-post-merge 0123456789abcdef0123456789abcdef01234567 APPROVE_A9R_POST_MERGE_PROOF";
  assert.equal(issueCommentAuthorized({ body, issue: "431" }), false);
  assert.equal(issueCommentAuthorized({ body, actor: "someone-else" }), false);
  assert.equal(issueCommentAuthorized({ body, author: "someone-else" }), false);
  assert.equal(issueCommentAuthorized({ body, association: "MEMBER" }), false);
  assert.equal(issueCommentAuthorized({ body, action: "edited" }), false);
});

test("controller status records normalized trigger metadata without raw comment body", () => {
  for (const field of [
    "trigger_kind",
    "issue_number",
    "comment_author_login",
    "comment_author_association",
    "parsed_expected_sha",
    "checked_out_sha",
    "fresh_main_sha",
    "confirmation_result",
    "preflight_result",
  ]) {
    assert.ok(workflow.includes(field), `missing controller field ${field}`);
  }
  assert.match(workflow, /echo "TRIGGER_KIND=\$trigger_kind"/);
  assert.match(workflow, /echo "EXPECTED_MAIN_SHA=\$expected_main_sha"/);
  assert.match(workflow, /echo "CONFIRMATION=\$confirmation"/);
  assert.match(workflow, /echo "TRIGGER_CONTRACT_OK=\$trigger_contract_ok"/);
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

test("controller fixes origins and preserves atomic main confirmation gate for both trigger kinds", () => {
  assert.match(workflow, /APP_ORIGIN: https:\/\/gacha-lens\.senpingxingzuo\.workers\.dev/);
  assert.match(workflow, /PUBLIC_ORIGIN: https:\/\/gacha-lens-public\.senpingxingzuo\.workers\.dev/);
  assert.match(workflow, /\[\[ "\$expected" =~ \^\[0-9a-f\]\{40\}\$ \]\]/);
  assert.match(workflow, /\[\[ "\$dispatch_ref" == "main" \]\]/);
  assert.match(workflow, /\[\[ "\$checked_branch" == "main" \]\]/);
  assert.match(workflow, /\[\[ "\$checked_sha" == "\$expected" \]\]/);
  assert.match(workflow, /\[\[ "\$fresh_main_sha" == "\$expected" \]\]/);
  assert.match(workflow, /\[\[ "\$CONFIRMATION" == "APPROVE_A9R_POST_MERGE_PROOF" \]\]/);
  assert.match(workflow, /\[\[ "\$TRIGGER_CONTRACT_OK" == "true" \]\] \|\| preflight_ok=false/);
  assert.match(workflow, /\[\[ "\$ISSUE_NUMBER" == "430" \]\] \|\| preflight_ok=false/);
  assert.match(workflow, /\[\[ "\$COMMENT_ACTOR_LOGIN" == "\$REPOSITORY_OWNER" \]\] \|\| preflight_ok=false/);
  assert.match(workflow, /\[\[ "\$COMMENT_AUTHOR_LOGIN" == "\$REPOSITORY_OWNER" \]\] \|\| preflight_ok=false/);
  assert.match(workflow, /\[\[ "\$COMMENT_AUTHOR_ASSOCIATION" == "OWNER" \]\] \|\| preflight_ok=false/);
  assert.match(workflow, /\[\[ "\$COMMENT_GRAMMAR_RESULT" == "PASS" \]\] \|\| preflight_ok=false/);
  assert.match(workflow, /\[\[ "\$PARSED_EXPECTED_SHA" == "\$expected" \]\] \|\| preflight_ok=false/);
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
    /gh\s+api/i,
    /api\.github\.com\/repos\/.*\/dispatches/i,
    /secrets\./i,
    /vars\./i,
    /SUPABASE_SERVICE_ROLE_KEY/,
    /RAKUTEN_APPLICATION_ID/,
    /YAHOO_SHOPPING_APP_ID/,
  ]) {
    assert.doesNotMatch(workflow, forbidden);
  }
});
