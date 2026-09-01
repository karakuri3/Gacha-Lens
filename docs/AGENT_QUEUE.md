# Gacha Lens Agent Queue / Orchestrator v1

Status: authoritative Queue / Orchestrator v1 policy

This policy defines a bounded, resumable queue run for repository work. It lets a fresh Codex session discover and continue eligible work without the human naming every Issue. It does not run when Codex is absent, create a background daemon, or expand any permission in `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AUTO_MERGE_POLICY.md`, or `docs/PRODUCTION_RELEASE_POLICY.md`.

When this policy conflicts with a safety boundary, the stricter boundary wins. Queue position never creates authority.

## One-shot entry contract

The short instruction `Gacha Lens続けて。Agent Queueを自律実行し、真のStop Conditionだけ戻して。` starts one bounded queue run.

The Lead must interpret it as an instruction to:

1. verify repository, remote, base, branch, worktree, open Issue, and open PR state;
2. read `AGENTS.md`, Agent OS, this policy, both standing gates, and the canonical project docs;
3. resume durable in-progress work before creating duplicate work;
4. normalize candidate Issues into the eligibility fields below;
5. select deterministically, execute, verify, review, and update durable GitHub state;
6. merge and allow the normal Git-triggered Vercel Production release only when both standing gates pass;
7. continue to the next independently safe bounded item while the session and repository remain healthy; and
8. return only for a true Stop Condition, a terminal queue outcome, or an unavoidable session/tool limit.

The instruction does not authorize Production DB/data/schema actions, workflow dispatch, Secrets / Variables changes, paid operations, destructive actions, auth/security changes, a Production-capable workflow or gate change, or a major product decision.

## Sources and normalization

The Lead reads all open Issues and PRs, local and remote `codex/` branches, and registered worktrees. Labels are optional hints in v1; the queue must work when no queue labels exist.

Each candidate is normalized before ranking with at least:

- Issue number and open/closed state;
- complete Task Contract status;
- safety classification: `eligible`, `human-bound`, or `ambiguous`;
- queue lifecycle state: `backlog`, `ready`, `working`, `verification`, or `done`;
- durable active claims, such as an Issue-linked branch, worktree, or PR;
- explicit queue priority when authoritative metadata exists;
- `docs/TODO.md` rank or active parent-Issue rank;
- dependency and dependency-unblocking status; and
- proposed owned paths when parallel editing is considered.

Normalization is evidence gathering, not authority creation. Open state, lifecycle state, active-claim state, blocked dependencies, and dependency-unblocking status must be explicit; missing values must not imply `open`, `ready`, no claim, or no dependency. Other missing metadata may be derived only from an explicit human instruction, a complete Issue contract, canonical TODO order, an active parent Issue, or durable existing work. Otherwise the item remains deferred.

The pure helper `scripts/agent-queue-planner.mjs` consumes already-normalized, sanitized offline JSON (at most 500 items and 1 MB of stdin). It does not call GitHub, mutate labels, start agents, write files, merge, deploy, or access Production. The Lead remains responsible for validating the normalization against live repository evidence.

## Eligibility and safety classification

An item is eligible only when all of these are true:

- it is open and not already done;
- the Lead can establish every Agent Task Contract field;
- the outcome is bounded, safe, reversible in Git, and non-Production before merge;
- rollback and file/worktree ownership are clear;
- no unresolved dependency blocks it;
- its priority comes from an authoritative source; and
- no Agent OS, Auto-Merge, Production Release, or task-specific Stop Condition applies.

Examples normally eligible are bounded code, tests, docs, non-Production tooling, a child task clearly authorized by a TODO/parent Issue, and read-only investigation needed to make an existing task executable.

Classify as `human-bound` when necessary work requires any existing approval boundary, including:

- Production DB actions: writes, migrations, backfills, cleanup, schema, seed, or reset;
- workflow dispatches;
- Secrets / Variables or credential changes;
- paid operations;
- destructive actions or irreversible/shared-history operations;
- direct pushes to `main`;
- ineligible Production release or manual Production deployment;
- Production-capable workflow, schedule, ingestion, or gate changes;
- authentication/authorization or security-boundary changes; or
- an unresolved major product/specification decision.

Classify as `ambiguous` and defer when safety, rollback, ownership, contract completeness, priority authority, or repository state cannot be established confidently. Never convert ambiguity to eligibility merely to keep the queue busy.

An ineligible item does not block an unrelated eligible item. Report it in the run ledger and continue unless it is a dependency of all remaining work.

## Deterministic selection algorithm

After normalization and fail-closed filtering, sort eligible items using this stable order:

1. restrict candidates to an Issue/task scope explicitly named by the current human instruction, when present;
2. an already-owned `working` item (`resume-existing`);
3. an existing `verification` or review-repair item;
4. explicit authoritative queue priority, lower rank first;
5. `docs/TODO.md` or active parent-Issue rank, lower rank first;
6. dependency-unblocking work before otherwise equal work; and
7. lower Issue number as the final stable tie-breaker.

Do not use timestamps, API return order, agent preference, randomness, or inferred business direction as a tie-breaker. When a candidate has neither existing ownership nor authoritative queue/TODO/parent priority, defer it as `missing-authoritative-priority`.

The Lead records the normalized candidates, skipped reasons, ordered Issues, selected work, base SHA, and active claims in the Issue or PR. This is the auditable queue-run ledger.

## Duplicate prevention and durable resume

Before creating a branch or worktree, inspect:

- open PR head branches and linked Issues;
- local and remote `codex/` branches;
- every registered worktree;
- Issue comments/body for a recorded branch, worktree, frozen commit, validation state, or Stop Condition; and
- completed/failed CI for an existing head SHA.

Exactly one matching durable claim means resume that work. More than one conflicting claim is `ambiguous-multiple-claims` and fails closed until the Lead can reconcile it without destructive cleanup or shared-history rewriting. A `working` or `verification` state without one durable claim is also ambiguous.

Never delete, reset, overwrite, or silently abandon an older branch/worktree to make the queue appear clean. Never start a duplicate because a previous chat is unavailable.

At every handoff or session/usage interruption, persist:

- Issue and PR numbers;
- branch and worktree path;
- verified base SHA and frozen head SHA;
- owner/role and owned paths;
- current lifecycle state;
- completed validation and remaining checks;
- Reviewer/Verifier findings;
- exact Stop Condition or next safe action; and
- safety counts.

GitHub/repository state is authoritative for resume; chat memory is not.

## Concurrency and ownership

Queue v1 permits at most two Builders. The cap applies across the whole queue run unless a later explicit human instruction changes it.

Parallel Builders are optional and require:

- separate branches and worktrees;
- one editing owner per worktree;
- disjoint, explicitly recorded path ownership;
- no unresolved dependency between the slots; and
- a Lead-owned integration order.

Unknown or overlapping ownership is serialized. Directory/file prefix overlap counts as overlap. Read-only Scouts may run concurrently when they do not generate or mutate files. Independent Verifier and Reviewer roles do not edit the frozen Builder worktree.

The planner may propose at most two disjoint queue-item slots. For decomposition inside one Issue, the Lead applies the stricter Agent OS worktree protocol and records child ownership separately. The Lead must not maximize agent count for its own sake or silently discard a frozen Builder result.

## Execution lifecycle

For each selected Issue:

1. confirm or complete the Task Contract and safety classification;
2. create or resume the dedicated `codex/` branch/worktree from the verified base;
3. record the durable claim before substantial implementation;
4. investigate and implement within the assigned ownership;
5. run focused tests and freeze the Builder commit;
6. integrate dependency-ordered Builder results;
7. run the full Agent Done Gate;
8. obtain an independent Verifier and independent Reviewer when required by the task;
9. create/update a Draft PR with the ledger, validation, findings, rollback, and safety counts;
10. repair ordinary failures autonomously and revalidate;
11. apply the Auto-Merge Gate and Standing Production Release Gate;
12. if both pass, mark ready, squash merge, allow only the normal Git-triggered Vercel release, verify the exact deployment, and complete the Issue; and
13. refresh live queue state before selecting another item.

A queue run must never dispatch a workflow as validation. Required checks run through their normal PR triggers only.

## Continuation and terminal outcomes

Continue without asking `continue?` when the next item is independently eligible and bounded, no Stop Condition applies, and repository/session/tool state remains healthy.

Use these distinct outcomes:

- `resume-existing`: one safe durable claim is resumed before new work;
- `selected`: at least one eligible item is selected, while skipped items remain reported;
- `human-bound`: no eligible item can proceed and at least one item requires human authority;
- `repository-ambiguous`: no eligible item can proceed because ownership or safety state is contradictory or cannot be classified confidently;
- `queue-exhausted`: no eligible work remains after closed/done/deferred items are accounted for; this is a successful terminal result, not a failure.

Stop and report when all remaining work is human-bound, repository state is unsafe/ambiguous, a true Agent OS Stop Condition blocks necessary work, or a session/agent/tool limit prevents reliable continuation. A routine test, lint, build, Preview, CI, or review failure enters the repair loop and is not itself terminal.

Queue v1 is bounded by the current Codex run. It makes no claim of persistent background execution while Codex is not running.

## Required evidence per completed item

The PR and Issue must contain:

- selection/ranking and duplicate-check evidence;
- base/head SHAs, branch/worktree, and owned paths;
- acceptance-criterion mapping;
- focused tests, full regression, lint, applicable typecheck, build, and diff checks;
- exact-head Preview and required-check status when release is expected;
- independent Verifier and Reviewer results;
- complete Auto-Merge and Production Release gate disposition;
- rollback path;
- `Production actions before merge: 0`;
- `Production DB actions: 0`;
- `workflow dispatches: 0`;
- `Secrets / Variables changes: 0`;
- `paid operations: 0`;
- `destructive actions: 0`; and
- `direct main pushes: 0`.

Normal Vercel Production deployment after an eligible merge is recorded separately from `Production actions before merge`; it is allowed only through `docs/PRODUCTION_RELEASE_POLICY.md`.

## Offline planning and smoke check

Run focused policy tests with:

```sh
npm run test:agent-queue
```

For a read-only/offline plan, pipe normalized JSON to:

```sh
npm run agent:queue-plan
```

The smoke scenario must demonstrate an existing durable claim, at least one eligible item, at least one intentionally human-bound item, deterministic ordering, no more than two disjoint Builder slots, and distinct `resume-existing`, `human-bound`, and `queue-exhausted` outcomes. Live GitHub inspection supplies evidence for normalization; the helper itself remains offline and side-effect free.
