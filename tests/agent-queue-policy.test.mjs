import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  planAgentQueue as planRawAgentQueue,
  QUEUE_BUILDER_CAP,
  QUEUE_ITEM_CAP,
} from "../scripts/agent-queue-planner.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function planAgentQueue(tasks, options) {
  return planRawAgentQueue(tasks.map((task) => ({ open: true, queueState: "ready", ...task })), options);
}

async function readRepositoryFile(relativePath) {
  return (await readFile(path.join(repositoryRoot, relativePath), "utf8")).replaceAll("\r\n", "\n");
}

test("Queue policy is authoritative, one-shot, bounded, resumable, and safety preserving", async () => {
  const [agents, queuePolicy, agentOs, releasePolicy] = await Promise.all([
    readRepositoryFile("AGENTS.md"),
    readRepositoryFile("docs/AGENT_QUEUE.md"),
    readRepositoryFile("docs/AGENT_OS.md"),
    readRepositoryFile("docs/PRODUCTION_RELEASE_POLICY.md"),
  ]);

  for (const text of [
    "docs/AGENT_QUEUE.md",
    "Gacha Lens続けて",
    "QUEUE / ORCHESTRATOR ENTRY",
  ]) assert.ok(agents.includes(text), `AGENTS.md missing ${text}`);

  for (const text of [
    "Status: authoritative Queue / Orchestrator v1 policy",
    "## One-shot entry contract",
    "## Deterministic selection algorithm",
    "## Duplicate prevention and durable resume",
    "## Concurrency and ownership",
    "## Continuation and terminal outcomes",
    "resume-existing",
    "human-bound",
    "queue-exhausted",
    "two Builders",
    "workflow dispatches: 0",
    "Production DB actions: 0",
    "Secrets / Variables changes: 0",
    "paid operations: 0",
    "destructive actions: 0",
  ]) assert.ok(queuePolicy.includes(text), `Queue policy missing ${text}`);

  assert.ok(agentOs.includes("docs/AGENT_QUEUE.md"));
  assert.ok(agentOs.includes("Queue / Orchestrator v1"));
  assert.ok(releasePolicy.includes("Standing Production Release Gate"));
});

test("existing owned work resumes before verification repair and new work", () => {
  const plan = planAgentQueue([
    { number: 30, contractComplete: true, safety: "eligible", queuePriority: 0, ownedPaths: ["docs/new.md"] },
    { number: 20, contractComplete: true, safety: "eligible", queueState: "verification", activeClaims: ["pr:20"], ownedPaths: ["tests/repair.test.mjs"] },
    { number: 10, contractComplete: true, safety: "eligible", queueState: "working", activeClaims: ["branch:codex/10"], ownedPaths: ["scripts/resume.mjs"] },
    { number: 5, contractComplete: true, safety: "eligible", queueState: "ready", needsRepair: true, activeClaims: ["pr:5"], ownedPaths: ["docs/repair.md"] },
  ]);

  assert.equal(plan.outcome, "resume-existing");
  assert.deepEqual(plan.orderedIssues, [10, 5, 20, 30]);
  assert.equal(plan.builderSlots[0].number, 10);
});

test("ranking is deterministic across explicit priority, TODO rank, dependency value, and Issue number", () => {
  const tasks = [
    { number: 44, contractComplete: true, safety: "eligible", todoRank: 1, dependencyUnblocking: false, ownedPaths: ["docs/d.md"] },
    { number: 41, contractComplete: true, safety: "eligible", queuePriority: 2, ownedPaths: ["docs/a.md"] },
    { number: 43, contractComplete: true, safety: "eligible", todoRank: 1, dependencyUnblocking: true, ownedPaths: ["docs/c.md"] },
    { number: 42, contractComplete: true, safety: "eligible", queuePriority: 2, ownedPaths: ["docs/b.md"] },
  ];
  const plan = planAgentQueue(tasks);
  const reversedPlan = planAgentQueue([...tasks].reverse());

  assert.deepEqual(plan.orderedIssues, [41, 42, 43, 44]);
  assert.deepEqual(reversedPlan.orderedIssues, plan.orderedIssues);
  assert.deepEqual(plan.builderSlots.map(({ number }) => number), [41, 42]);
});

test("an explicit human Issue scope limits the queue before lifecycle ranking", () => {
  const plan = planAgentQueue([
    { number: 45, contractComplete: true, safety: "eligible", queueState: "working", activeClaims: ["branch:45"], ownedPaths: ["docs/other.md"] },
    { number: 46, contractComplete: true, safety: "eligible", todoRank: 10, ownedPaths: ["docs/requested.md"] },
  ], { explicitIssues: [46] });

  assert.deepEqual(plan.orderedIssues, [46]);
  assert.deepEqual(plan.deferred, [{ number: 45, reason: "outside-explicit-scope" }]);
});

test("human-bound work is reported while unrelated eligible work continues", () => {
  const plan = planAgentQueue([
    { number: 50, contractComplete: true, safety: "human-bound", boundaryReason: "workflow-dispatch", queuePriority: 0 },
    { number: 51, contractComplete: true, safety: "eligible", todoRank: 2, ownedPaths: ["docs/safe.md"] },
  ]);

  assert.equal(plan.outcome, "selected");
  assert.deepEqual(plan.builderSlots.map(({ number }) => number), [51]);
  assert.deepEqual(plan.humanBound, [{ number: 50, reason: "workflow-dispatch" }]);
});

test("queue exhaustion and human-bound are distinct terminal outcomes", () => {
  assert.equal(planAgentQueue([]).outcome, "queue-exhausted");
  assert.equal(planAgentQueue([
    { number: 60, contractComplete: true, safety: "human-bound", queuePriority: 0 },
  ]).outcome, "human-bound");
});

test("offline CLI reads normalized JSON from stdin and returns a plan", () => {
  const result = spawnSync(
    process.execPath,
    [path.join(repositoryRoot, "scripts/agent-queue-planner.mjs")],
    { input: JSON.stringify({ tasks: [] }), encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).outcome, "queue-exhausted");
});

test("duplicate or ambiguous claims fail closed instead of starting duplicate work", () => {
  assert.throws(() => planAgentQueue([
    { number: 70, contractComplete: true, safety: "eligible", todoRank: 0 },
    { number: 70, contractComplete: true, safety: "eligible", todoRank: 0 },
  ]), /Duplicate queue item/);

  const plan = planAgentQueue([
    { number: 71, contractComplete: true, safety: "eligible", queueState: "working", activeClaims: ["branch:a", "pr:b"], todoRank: 0 },
  ]);
  assert.equal(plan.outcome, "repository-ambiguous");
  assert.deepEqual(plan.deferred, [{ number: 71, reason: "ambiguous-multiple-claims" }]);

  const repairWithoutClaim = planAgentQueue([
    { number: 72, contractComplete: true, safety: "eligible", needsRepair: true, todoRank: 0 },
  ]);
  assert.equal(repairWithoutClaim.outcome, "repository-ambiguous");
  assert.deepEqual(repairWithoutClaim.deferred, [{ number: 72, reason: "active-state-without-durable-claim" }]);
});

test("Builder allocation never exceeds two and serializes overlapping or unknown ownership", () => {
  assert.equal(QUEUE_BUILDER_CAP, 2);
  assert.throws(() => planAgentQueue([], { maxBuilders: 3 }), /between 1 and 2/);

  const overlap = planAgentQueue([
    { number: 80, contractComplete: true, safety: "eligible", queuePriority: 0, ownedPaths: ["docs"] },
    { number: 81, contractComplete: true, safety: "eligible", queuePriority: 1, ownedPaths: ["docs/TODO.md"] },
    { number: 82, contractComplete: true, safety: "eligible", queuePriority: 2, ownedPaths: ["tests/queue.test.mjs"] },
  ]);
  assert.deepEqual(overlap.builderSlots.map(({ number }) => number), [80, 82]);

  const unknown = planAgentQueue([
    { number: 83, contractComplete: true, safety: "eligible", queuePriority: 0 },
    { number: 84, contractComplete: true, safety: "eligible", queuePriority: 1, ownedPaths: ["docs/safe.md"] },
  ]);
  assert.deepEqual(unknown.builderSlots.map(({ number }) => number), [83]);
});

test("incomplete, blocked, unclassified, and unauthorized-priority work is deferred", () => {
  const plan = planAgentQueue([
    { number: 90, contractComplete: false, safety: "eligible", todoRank: 0 },
    { number: 91, contractComplete: true, safety: "eligible", todoRank: 1, blockedBy: [89] },
    { number: 92, contractComplete: true, safety: "ambiguous", todoRank: 2 },
    { number: 93, contractComplete: true, safety: "eligible", ownedPaths: ["docs/no-authority.md"] },
  ]);

  assert.equal(plan.outcome, "repository-ambiguous");
  assert.deepEqual(plan.deferred.map(({ reason }) => reason), [
    "incomplete-contract",
    "blocked-dependency",
    "unclassified-or-ambiguous-safety",
    "missing-authoritative-priority",
  ]);
});

test("offline planning input is bounded and human-bound reason output is allowlisted", () => {
  assert.throws(
    () => planAgentQueue(Array.from({ length: QUEUE_ITEM_CAP + 1 }, (_, index) => ({ number: index + 1 }))),
    /cannot exceed 500 items/,
  );

  const plan = planAgentQueue([
    { number: 94, contractComplete: true, safety: "human-bound", boundaryReason: "untrusted free text", todoRank: 0 },
  ]);
  assert.deepEqual(plan.humanBound, [{ number: 94, reason: "human-approval-required" }]);
});

test("missing or invalid mandatory normalization fields fail closed", () => {
  const plan = planRawAgentQueue([
    { number: 95, queueState: "ready", contractComplete: true, safety: "eligible", todoRank: 0 },
    { number: 96, open: true, contractComplete: true, safety: "eligible", todoRank: 1 },
    { number: 97, open: true, queueState: "invented", contractComplete: true, safety: "eligible", todoRank: 2 },
    { number: 98, open: false, queueState: "ready", contractComplete: true, safety: "eligible", todoRank: 3 },
    { number: 99, open: true, queueState: "done", contractComplete: true, safety: "eligible", todoRank: 4 },
  ]);

  assert.equal(plan.outcome, "queue-exhausted");
  assert.deepEqual(plan.orderedIssues, []);
  assert.deepEqual(plan.deferred, [
    { number: 95, reason: "missing-open-state" },
    { number: 96, reason: "invalid-queue-state" },
    { number: 97, reason: "invalid-queue-state" },
  ]);
});
