import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readRepositoryFile(relativePath) {
  const content = await readFile(path.join(repositoryRoot, relativePath), "utf8");
  return content.replaceAll("\r\n", "\n");
}

test("AGENTS.md preserves the Next.js rule and exposes Agent OS hard boundaries", async () => {
  const agents = await readRepositoryFile("AGENTS.md");
  const preservedNextRule = `<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in \`node_modules/next/dist/docs/\` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->`;

  assert.ok(agents.startsWith(preservedNextRule));

  for (const requiredText of [
    "AUTONOMOUSLY ALLOWED",
    "HUMAN APPROVAL REQUIRED",
    "AUTONOMOUS CONTINUATION",
    "STOP CONDITIONS",
    "AGENT DONE GATE",
    "AGENT TASK CONTRACT",
    "MULTI-AGENT AND WORKTREE RULES",
    "Any GitHub Actions `workflow_dispatch`",
    "Never touch `supabase/.temp/cli-latest`",
    "docs/AUTO_MERGE_POLICY.md",
    "docs/PRODUCTION_RELEASE_POLICY.md",
    "docs/VERCEL_COST_CONTROL.md",
    "docs/AGENT_QUEUE.md",
    "QUEUE / ORCHESTRATOR ENTRY",
    "COST-AWARE PUSH / CLOUDFLARE PREVIEW POLICY",
    "normal Cloudflare Production application release triggered by an eligible merge",
  ]) {
    assert.match(agents, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.ok(!agents.includes("normal Vercel Production deployment triggered by an eligible merge"));
});

test("Agent OS defines the complete operating contract", async () => {
  const agentOs = await readRepositoryFile("docs/AGENT_OS.md");

  for (const requiredHeading of [
    "## 3. Autonomy boundary",
    "## 4. Autonomous execution loop",
    "## 5. Stop conditions",
    "## 6. Agent Task Contract",
    "## 7. Multi-Agent roles",
    "## 8. Multi-Agent branch and worktree protocol",
    "## 9. Agent Done Gate",
    "## 11. GitHub as the task queue",
    "## 13. Future non-Production automation extension points",
  ]) {
    assert.ok(agentOs.includes(requiredHeading), `Missing ${requiredHeading}`);
  }

  for (const contractField of [
    "## Goal",
    "## Context",
    "## Scope",
    "## Acceptance Criteria",
    "## Constraints",
    "## Validation",
    "## Stop Conditions",
    "## Done Definition",
  ]) {
    assert.ok(agentOs.includes(contractField), `Missing task field ${contractField}`);
  }

  for (const queueState of [
    "Backlog",
    "Ready for Agent",
    "Agent Working",
    "Verification",
    "Ready for Human",
    "Done",
  ]) {
    assert.ok(agentOs.includes(queueState), `Missing queue state ${queueState}`);
  }

  assert.ok(agentOs.includes("docs/AGENT_QUEUE.md"));
  assert.ok(agentOs.includes("Queue / Orchestrator v1"));
  assert.ok(agentOs.includes("normal Git-triggered Cloudflare Production application release"));
  assert.ok(!agentOs.includes("normal Git-triggered Vercel release"));
  assert.ok(!agentOs.includes("resulting normal Vercel release"));
});

test("Agent Queue release wording follows the Cloudflare standing gate", async () => {
  const queue = await readRepositoryFile("docs/AGENT_QUEUE.md");

  for (const requiredText of [
    "normal Git-triggered Cloudflare Production application release",
    "exact-head Cloudflare Preview/version plus runtime/cache/security proof applicable to the diff",
    "Normal Cloudflare Production application release after an eligible merge",
    "docs/PRODUCTION_RELEASE_POLICY.md",
  ]) {
    assert.ok(queue.includes(requiredText), `Missing Agent Queue Cloudflare release text: ${requiredText}`);
  }

  assert.ok(!queue.includes("normal Git-triggered Vercel Production release"));
  assert.ok(!queue.includes("Normal Vercel Production deployment after an eligible merge"));
});

test("Auto-Merge Policy allows routine safe merges while preserving hard stops", async () => {
  const agents = await readRepositoryFile("AGENTS.md");
  const policy = await readRepositoryFile("docs/AUTO_MERGE_POLICY.md");

  assert.ok(agents.includes("Marking an eligible PR ready and merging it to `main`"));

  for (const requiredText of [
    "## Auto-Merge Gate",
    "required GitHub status checks",
    "Production actions before merge: 0",
    "workflow dispatches: 0",
    "Secrets / Variables changes: 0",
    "paid operations: 0",
    "destructive or irreversible actions: 0",
    "direct `main` pushes: 0",
    "docs/PRODUCTION_RELEASE_POLICY.md",
    "docs/VERCEL_COST_CONTROL.md",
    "normal Cloudflare release",
    "exact-head Cloudflare Preview/version/runtime/cache/security evidence",
    "## Always require human approval",
    "changes to Agent OS, Auto-Merge, or Production Release safety/approval boundaries",
  ]) {
    assert.ok(policy.includes(requiredText), `Missing auto-merge policy text: ${requiredText}`);
  }

  assert.ok(!policy.includes("eligible normal Vercel release"));
});

test("Standing Production Release Policy allows only gated normal Cloudflare releases", async () => {
  const agents = await readRepositoryFile("AGENTS.md");
  const policy = await readRepositoryFile("docs/PRODUCTION_RELEASE_POLICY.md");
  const costControl = await readRepositoryFile("docs/VERCEL_COST_CONTROL.md");

  assert.ok(agents.includes("normal Cloudflare Production application release triggered by an eligible merge"));

  for (const requiredText of [
    "Status: authoritative standing approval for low-risk Cloudflare Production releases",
    "## Standing Production Release Gate",
    "exact-head repository CI / code-quality checks",
    "exact-head Cloudflare non-Production build / Preview or exact version artifact",
    "runtime / cache / security proof appropriate to the diff",
    "failed or stale deployed-source pin",
    "Production database writes/migrations/backfills/cleanup/schema actions: 0",
    "Secrets / Variables changes: 0",
    "workflow dispatches: 0",
    "paid operations: 0",
    "destructive or irreversible actions: 0",
    "no authentication/authorization policy change",
    "no payment/billing behavior change",
    "docs/VERCEL_COST_CONTROL.md",
    "Vercel deployment status is treated as informational/non-authoritative",
    "## Always require human approval",
    "existing reviewed Cloudflare application release path",
  ]) {
    assert.ok(policy.includes(requiredText), `Missing production release policy text: ${requiredText}`);
  }

  for (const requiredText of [
    "Status: Production hosting migrated to Cloudflare on 2026-09-05.",
    "routine Git pushes/PRs must not create Vercel builds",
    "Vercel is **not** the Production runtime for `gachalens.com`.",
    "Normal application Preview/Production validation now belongs to the Cloudflare release path and repository CI.",
  ]) {
    assert.ok(costControl.includes(requiredText), `Missing Vercel cost-control invariant: ${requiredText}`);
  }

  assert.ok(!policy.includes("Vercel Preview for the exact PR head SHA is successful"));
  assert.ok(!policy.includes("normal Vercel Production deployment caused by merging the PR"));
});

test("Issue and PR templates require the Agent contract and Cloudflare release evidence", async () => {
  const issueTemplate = await readRepositoryFile(".github/ISSUE_TEMPLATE/agent-task.yml");
  const prTemplate = await readRepositoryFile(".github/pull_request_template.md");

  for (const issueField of [
    "id: goal",
    "id: context",
    "id: scope",
    "id: acceptance_criteria",
    "id: constraints",
    "id: validation",
    "id: stop_conditions",
    "id: done_definition",
  ]) {
    assert.ok(issueTemplate.includes(issueField), `Missing Issue field ${issueField}`);
  }

  for (const gate of [
    "Acceptance Criteria satisfied",
    "Focused tests pass",
    "Regression tests pass",
    "Lint passes",
    "Typecheck passes",
    "Build passes",
    "No unexpected changes",
    "No secrets are included",
    "Production actions before merge are 0",
    "Production DB actions are 0",
    "Destructive actions are 0",
    "Paid operations are 0",
    "No unresolved major reviewer findings",
    "No material conflict with canonical docs",
    "Auto-Merge Gate",
    "Standing Production Release Gate",
    "Cloudflare exact-head validation",
    "Vercel status",
    "Normal Cloudflare Production application release expected after merge",
  ]) {
    assert.ok(prTemplate.includes(gate), `Missing PR gate ${gate}`);
  }

  assert.ok(prTemplate.includes("informational/non-authoritative while `docs/VERCEL_COST_CONTROL.md` routine-build skip is active"));
  assert.ok(!prTemplate.includes("Normal Vercel Production release expected after merge"));
  assert.ok(!prTemplate.includes("| Vercel Preview |"));
});

test("package scripts provide focused and aggregate Agent validation entry points", async () => {
  const packageJson = JSON.parse(await readRepositoryFile("package.json"));

  assert.equal(packageJson.scripts.test, "node --test");
  assert.equal(
    packageJson.scripts["test:agent-os"],
    "node --test tests/agent-os-policy.test.mjs",
  );
  assert.equal(
    packageJson.scripts["test:agent-queue"],
    "node --test tests/agent-queue-policy.test.mjs tests/agent-queue-path-safety.test.mjs",
  );
  assert.equal(packageJson.scripts["agent:queue-plan"], "node scripts/agent-queue-planner.mjs");
});
