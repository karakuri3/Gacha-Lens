import assert from "node:assert/strict";
import test from "node:test";

import { planAgentQueue } from "../scripts/agent-queue-planner.mjs";

function task(number, ownedPaths, queuePriority = number) {
  return {
    number,
    open: true,
    queueState: "ready",
    activeClaims: [],
    blockedBy: [],
    dependencyUnblocking: false,
    contractComplete: true,
    safety: "eligible",
    queuePriority,
    ownedPaths,
  };
}

test("owned-path aliases are canonicalized before Builder overlap checks", () => {
  const plan = planAgentQueue([
    task(1, ["AGENTS.md"], 0),
    task(2, ["docs/../AGENTS.md"], 1),
    task(3, ["tests/safe.test.mjs"], 2),
  ]);

  assert.deepEqual(plan.builderSlots.map(({ number }) => number), [1, 3]);
  assert.deepEqual(plan.builderSlots[0].ownedPaths, ["AGENTS.md"]);
});

test("Windows case aliases are serialized before Builder allocation", () => {
  const plan = planAgentQueue([
    task(4, ["AGENTS.md"], 0),
    task(5, ["agents.md"], 1),
    task(6, ["tests/safe.test.mjs"], 2),
  ]);

  assert.deepEqual(plan.builderSlots.map(({ number }) => number), [4, 6]);
});

test("repository-root ownership serializes every other Builder", () => {
  const plan = planAgentQueue([
    task(10, ["docs/.."], 0),
    task(11, ["tests/safe.test.mjs"], 1),
  ]);

  assert.deepEqual(plan.builderSlots.map(({ number }) => number), [10]);
  assert.deepEqual(plan.builderSlots[0].ownedPaths, ["."]);
});

test("owned paths cannot escape the repository, alias Win32 names, or become absolute", () => {
  for (const ownedPath of [
    "../outside",
    "docs/../../outside",
    "/etc/passwd",
    "C:\\repo\\file.txt",
    "C:drive-relative.txt",
    "\\\\server\\share\\file.txt",
    "docs/file.",
    "docs/.hidden.",
    "docs/file ",
    "docs/NUL.txt",
    "docs/a:b.txt",
  ]) {
    assert.throws(
      () => planAgentQueue([task(20, [ownedPath], 0)]),
      /repository-relative|escape the repository root|whitespace|Windows-safe|device names/,
      ownedPath,
    );
  }
});

test("redundant separators and dot segments resolve to one canonical ownership path", () => {
  const plan = planAgentQueue([
    task(30, ["./docs//signals/./model.js", "docs/signals/model.js"], 0),
  ]);

  assert.deepEqual(plan.builderSlots[0].ownedPaths, ["docs/signals/model.js"]);
});
