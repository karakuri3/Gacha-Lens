import path from "node:path";
import { pathToFileURL } from "node:url";

export const QUEUE_BUILDER_CAP = 2;
export const QUEUE_ITEM_CAP = 500;
export const QUEUE_STDIN_BYTE_CAP = 1_000_000;

const ACTIVE_STATES = new Set(["working", "verification"]);
const QUEUE_STATES = new Set(["backlog", "ready", "working", "verification", "done"]);
const AMBIGUOUS_DEFER_REASONS = new Set([
  "active-state-without-durable-claim",
  "ambiguous-multiple-claims",
  "unclassified-or-ambiguous-safety",
]);
const BOUNDARY_REASONS = new Set([
  "auth-security-change",
  "destructive-action",
  "ineligible-merge-release",
  "major-product-decision",
  "paid-operation",
  "production-db-action",
  "production-gate-change",
  "secrets-variables-change",
  "workflow-dispatch",
]);

function asFiniteRank(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function normalizedPaths(paths = []) {
  return [...new Set(paths.map((value) => String(value).replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "")).filter(Boolean))].sort();
}

function pathsOverlap(leftPaths, rightPaths) {
  return leftPaths.some((left) => rightPaths.some(
    (right) => left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`),
  ));
}

function queueRank(task) {
  const hasClaim = task.activeClaims.length === 1;
  const isResume = task.queueState === "working" || (
    hasClaim && task.queueState !== "verification" && task.needsRepair !== true
  );
  const isRepair = task.queueState === "verification" || task.needsRepair === true;
  const queuePriority = asFiniteRank(task.queuePriority);
  const authoritativeRank = asFiniteRank(task.todoRank) ?? asFiniteRank(task.parentRank);

  if (isResume) return [0, 0, task.dependencyUnblocking ? 0 : 1, task.number];
  if (isRepair) return [1, 0, task.dependencyUnblocking ? 0 : 1, task.number];
  if (queuePriority !== null) return [2, queuePriority, task.dependencyUnblocking ? 0 : 1, task.number];
  if (authoritativeRank !== null) return [3, authoritativeRank, task.dependencyUnblocking ? 0 : 1, task.number];
  return null;
}

function compareRanks(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function normalizeTask(task) {
  if (!Number.isInteger(task.number) || task.number <= 0) {
    throw new TypeError("Every queue item requires a positive integer Issue number.");
  }

  return {
    ...task,
    activeClaims: Array.isArray(task.activeClaims) ? [...new Set(task.activeClaims.filter(Boolean).map(String))].sort() : [],
    blockedBy: Array.isArray(task.blockedBy) ? [...new Set(task.blockedBy)] : [],
    ownedPaths: normalizedPaths(task.ownedPaths),
    queueState: task.queueState,
    safety: task.safety ?? "ambiguous",
  };
}

export function planAgentQueue(tasks, options = {}) {
  if (!Array.isArray(tasks)) throw new TypeError("tasks must be an array.");
  if (tasks.length > QUEUE_ITEM_CAP) throw new RangeError(`tasks cannot exceed ${QUEUE_ITEM_CAP} items.`);

  const maxBuilders = options.maxBuilders ?? QUEUE_BUILDER_CAP;
  if (!Number.isInteger(maxBuilders) || maxBuilders < 1 || maxBuilders > QUEUE_BUILDER_CAP) {
    throw new RangeError(`maxBuilders must be between 1 and ${QUEUE_BUILDER_CAP}.`);
  }

  const completedIssues = new Set(options.completedIssues ?? []);
  const explicitIssues = options.explicitIssues === undefined ? null : new Set(options.explicitIssues);
  const seenIssues = new Set();
  const candidates = [];
  const humanBound = [];
  const deferred = [];

  for (const rawTask of tasks) {
    const task = normalizeTask(rawTask);
    if (seenIssues.has(task.number)) {
      throw new Error(`Duplicate queue item for Issue #${task.number}.`);
    }
    seenIssues.add(task.number);

    if (task.open === false) continue;
    if (task.open !== true) {
      deferred.push({ number: task.number, reason: "missing-open-state" });
      continue;
    }
    if (!QUEUE_STATES.has(task.queueState)) {
      deferred.push({ number: task.number, reason: "invalid-queue-state" });
      continue;
    }
    if (task.queueState === "done") continue;
    if (explicitIssues && !explicitIssues.has(task.number)) {
      deferred.push({ number: task.number, reason: "outside-explicit-scope" });
      continue;
    }
    if (task.activeClaims.length > 1) {
      deferred.push({ number: task.number, reason: "ambiguous-multiple-claims" });
      continue;
    }
    if ((ACTIVE_STATES.has(task.queueState) || task.needsRepair === true) && task.activeClaims.length !== 1) {
      deferred.push({ number: task.number, reason: "active-state-without-durable-claim" });
      continue;
    }
    if (task.contractComplete !== true) {
      deferred.push({ number: task.number, reason: "incomplete-contract" });
      continue;
    }
    if (task.safety === "human-bound") {
      humanBound.push({
        number: task.number,
        reason: BOUNDARY_REASONS.has(task.boundaryReason) ? task.boundaryReason : "human-approval-required",
      });
      continue;
    }
    if (task.safety !== "eligible") {
      deferred.push({ number: task.number, reason: "unclassified-or-ambiguous-safety" });
      continue;
    }

    const unresolvedDependencies = task.blockedBy.filter((number) => !completedIssues.has(number));
    if (unresolvedDependencies.length > 0) {
      deferred.push({ number: task.number, reason: "blocked-dependency", blockedBy: unresolvedDependencies });
      continue;
    }

    const rank = queueRank(task);
    if (rank === null) {
      deferred.push({ number: task.number, reason: "missing-authoritative-priority" });
      continue;
    }
    candidates.push({ task, rank });
  }

  candidates.sort((left, right) => compareRanks(left.rank, right.rank));
  humanBound.sort((left, right) => left.number - right.number);
  deferred.sort((left, right) => left.number - right.number);

  const builderSlots = [];
  for (const candidate of candidates) {
    if (builderSlots.length >= maxBuilders) break;
    if (builderSlots.length > 0 && (candidate.task.ownedPaths.length === 0 || builderSlots.some(
      (slot) => slot.ownedPaths.length === 0 || pathsOverlap(slot.ownedPaths, candidate.task.ownedPaths),
    ))) {
      continue;
    }
    builderSlots.push({
      number: candidate.task.number,
      ownedPaths: candidate.task.ownedPaths,
      resumeClaim: candidate.task.activeClaims[0] ?? null,
    });
  }

  let outcome = "selected";
  if (builderSlots.length === 0) {
    if (deferred.some(({ reason }) => AMBIGUOUS_DEFER_REASONS.has(reason))) outcome = "repository-ambiguous";
    else outcome = humanBound.length > 0 ? "human-bound" : "queue-exhausted";
  }
  else if (builderSlots[0].resumeClaim) outcome = "resume-existing";

  return {
    outcome,
    orderedIssues: candidates.map(({ task }) => task.number),
    builderSlots,
    humanBound,
    deferred,
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  process.stdin.setEncoding("utf8");
  let serializedInput = "";
  for await (const chunk of process.stdin) {
    serializedInput += chunk;
    if (Buffer.byteLength(serializedInput, "utf8") > QUEUE_STDIN_BYTE_CAP) {
      throw new RangeError(`stdin cannot exceed ${QUEUE_STDIN_BYTE_CAP} bytes.`);
    }
  }
  const input = JSON.parse(serializedInput);
  process.stdout.write(`${JSON.stringify(planAgentQueue(input.tasks ?? [], input.options), null, 2)}\n`);
}
