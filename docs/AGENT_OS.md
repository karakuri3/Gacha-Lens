# Gacha Lens Agent OS v1

Status: repository operating policy

Agent OS v1 is the safe, reviewable development loop for Gacha Lens. It allows an agent to carry a bounded, non-Production task through validation and a Draft PR without asking for approval at every ordinary engineering step. Agent OS alone does not authorize a merge or release: an autonomous merge must pass `docs/AUTO_MERGE_POLICY.md`, and its normal Git-triggered Vercel release must also pass `docs/PRODUCTION_RELEASE_POLICY.md`. Production DB actions, workflow dispatches, Secrets / Variables changes, paid operations, destructive work, and other standing exclusions remain unauthorized.

## 1. Instruction and source precedence

Use this order when instructions overlap:

1. platform/system safety rules and the current explicit human request
2. the nearest applicable `AGENTS.md`
3. durable repository decisions in `docs/DECISIONS.md`
4. current operational boundaries in `docs/HANDOFF.md` and `docs/STATUS.md`
5. ordered product work in `docs/TODO.md`
6. this Agent OS operating model and the task contract

General autonomy never weakens a repository-specific approval boundary. In particular, Gacha Lens requires explicit human approval for every `workflow_dispatch`, including workflows described as read-only.

## 2. Start and resume protocol

Before implementation, the Lead / Orchestrator must:

1. Read `AGENTS.md`, this file, `docs/HANDOFF.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, and the task contract. For a queue run, also read `docs/AGENT_QUEUE.md`.
2. Inspect `package.json`, relevant tests, `.github/`, and the validation commands that currently exist.
3. Run read-only Git checks for the current branch, status, remotes, and all worktrees.
4. Fetch `origin/main` without checking it out over another task, record the verified base SHA, and inspect recent changes relevant to the task.
5. Inspect existing branches/worktrees for partial work before starting over.
6. Create a dedicated `codex/<task-name>` branch and worktree from the verified `origin/main`.
7. Record the Goal, scope boundaries, acceptance criteria, validation plan, and stop conditions.

Never update, clean, reset, delete, or reuse another active task's branch or worktree. Do not advance the local `main` checkout merely to create a task branch; branch directly from verified `origin/main`.

## 3. Autonomy boundary

### Autonomously allowed

Within an accepted, safe, reversible, non-Production task, an agent may:

- inspect repository code, history, documentation, Issues, PRs, and CI results read-only
- create a task branch/worktree and local temporary build/test output
- change code, tests, documentation, and non-Production developer tooling within scope
- install lockfile-pinned dependencies in the task worktree
- run focused tests, regression tests, lint, applicable typecheck, build, and diff checks
- allow reviewed tests/tooling to remove only disposable artifacts they created under an exact verified OS-temporary or ignored generated path
- diagnose ordinary failures and iteratively repair the task branch
- inspect the complete diff and perform self-review
- commit and push the task branch
- create a Draft PR and update that Draft PR in response to safe review findings
- update the assigned Issue/PR queue state for the task using the conventions below

All autonomous actions must remain attributable in Git history or the Draft PR and must be reversible without Production mutation.

The disposable-artifact exception exists so reviewed tests can manage their own fixtures. It does not authorize repository/worktree cleanup, deletion of user data, external-state cleanup, or broad path/glob deletion.

### Human approval required

Stop before performing any of the following:

- direct push to `main`, history rewriting, or any PR readiness/merge excluded by `docs/AUTO_MERGE_POLICY.md`
- manual Production deployment/promotion, gate change, or any release excluded by `docs/PRODUCTION_RELEASE_POLICY.md`
- Production database write, migration, reset, seed, backfill, cleanup, or schema operation
- GitHub Actions `workflow_dispatch`
- Repository, Vercel, Supabase, or other service Secrets / Variables changes
- Production gate, schedule, or write-capable workflow changes
- external-service paid operations or purchases
- repository, data, worktree, or external-state delete/cleanup unless explicitly and narrowly approved in the task
- irreversible actions, force pushes to shared branches, or destructive Git/filesystem commands
- material scope expansion or a major product/specification decision

Read-only Production inspection may still be restricted by the current task or repository docs. Never use Production credentials merely to make a test or build pass.

### Absolute Gacha Lens constraints

- Never touch `supabase/.temp/cli-latest`.
- Keep `.github/workflows/gacha-ingestion.yml` disabled.
- Do not casually change the existing F0 official automatic lane or P3 V2 market lane.
- Do not enable Kitan or Qualia automatic rollout without approval.
- Do not rerun completed Kitan/Qualia canaries.
- Do not weaken the strict single-item market matcher to increase coverage.
- Do not scrape Mercari or Amazon.

## 4. Autonomous execution loop

The default lifecycle is:

`investigate -> plan -> implement -> focused test -> regression/static/build validation -> repair -> revalidate -> self-review -> independent review when available -> Draft PR`

For any safe failure:

1. Capture the exact command, exit status, and useful error output without exposing secrets.
2. Decide whether it is task-induced, an existing baseline issue, or an environment/tooling limitation.
3. Form a specific hypothesis supported by repository evidence.
4. Make the smallest in-scope correction.
5. Re-run the narrowest failing check, then the broader affected checks.
6. Continue while the next attempt is safe and based on a materially new hypothesis.

Do not ask the human to fix ordinary code, test, lint, build, or review failures. Do not repeat the same failing action without learning or changing anything.

### Baseline and environment failure classification

When a check fails, do not label the entire task “failed” without separation:

- **Task regression:** the failure appears only on the task branch or is causally linked to the diff. Repair it before completion.
- **Baseline issue:** the same command fails on the verified base under the same safe environment. Record base SHA, command, and matching evidence. Do not modify unrelated product code to hide it.
- **Environment limitation:** the check requires unavailable non-Production infrastructure or credentials. Record what is missing and why Production credentials were not used.
- **Flake:** re-run only when the failure is plausibly nondeterministic; record both runs and investigate repeated failures.

Reproducing on the base must use a disposable/read-only worktree and must not disturb another task.

## 5. Stop conditions

Return to the human only if one or more conditions hold:

- a Production operation is required
- a destructive or irreversible operation is required
- a Secrets / Variables change is required
- a paid operation is required
- the requirement is materially ambiguous and no safe, reversible assumption is available
- two authoritative specifications conflict and choosing one would change product direction
- safe, reasonable self-repair approaches have been exhausted and the blocking evidence is documented

A test failure, lint failure, build failure, ordinary implementation error, or review finding is not by itself a stop condition.

When stopping, report the exact boundary, evidence already gathered, safe attempts made, and the smallest human decision or authorization needed.

## 6. Agent Task Contract

Every task must have this contract before implementation:

```md
## Goal
One measurable outcome.

## Context
Relevant product state, prior decisions, base SHA, Issue/PR, and evidence.

## Scope
Included files/systems and explicit out-of-scope work.

## Acceptance Criteria
- Observable condition 1
- Observable condition 2

## Constraints
Safety, compatibility, ownership, time/cost, and repository-specific rules.

## Validation
Focused tests, regression tests, lint, typecheck status, build environment,
diff/safety checks, and review method.

## Stop Conditions
Task-specific additions to the repository stop conditions.

## Done Definition
Required artifacts, evidence, documentation, commit/push state, and Draft PR.
```

The contract can live in an Issue created with `.github/ISSUE_TEMPLATE/agent-task.yml`, a user instruction containing all fields, or a checked-in task document. Missing details may be filled with safe, explicit assumptions only when they do not alter product direction.

## 7. Multi-Agent roles

### Lead / Orchestrator

- owns the task contract, decomposition, dependency graph, and safety boundary
- assigns non-overlapping work and records branch/worktree ownership
- decides integration order and resolves cross-agent findings
- verifies the base before the PR and makes the final Done decision
- is the only role that integrates parallel implementation branches

### Scout / Research

- performs repository, history, design, dependency, and risk investigation
- identifies relevant files, existing tests, canonical decisions, and likely failure modes
- is read-only unless separately reassigned as a Builder after its Scout work ends
- reports evidence and recommended boundaries, not speculative implementation

### Builder

- owns an explicitly bounded file set on one task branch/worktree
- implements the smallest change that satisfies the contract
- writes or updates focused tests and runs them before handoff
- does not concurrently edit a file owned by another Builder

### Verifier

- validates a frozen commit independently of the Builder
- runs focused/regression tests, lint, applicable typecheck, build, and diff checks
- separates regression, baseline, environment, and flake failures
- reports commands, results, and gaps without silently repairing the implementation

### Reviewer

- independently reviews correctness, regression risk, security, maintainability, and requirement coverage
- inspects the full diff and affected canonical docs
- classifies findings by severity and identifies blocking findings
- does not approve its own unverified assumptions

For a small task, one agent may perform multiple roles sequentially, but the PR must disclose that verification/review was not independent. For higher-risk changes, Builder and Reviewer must be different agents or humans.

## 8. Multi-Agent branch and worktree protocol

### Ownership

- Default: one task = one branch = one worktree.
- A worktree has one active editing owner at a time.
- Read-only Scouts may inspect a worktree, but must not write generated files or run commands that mutate it while a Builder is active.
- Parallel Builders use separate branches/worktrees and disjoint file ownership.

### Overlapping files

If two subtasks need the same file, the Lead must choose one of:

1. serialize the subtasks in one worktree
2. designate one file owner and have the other agent provide a patch/design note only
3. create dependency-ordered branches and integrate the earlier branch before the later work begins

Do not rely on after-the-fact conflict resolution as the normal coordination mechanism.

### Integration

The Lead:

1. freezes each Builder commit and collects focused-test evidence
2. reviews each diff before integration
3. cherry-picks or merges in dependency order into the task integration branch
4. resolves conflicts using the task contract and canonical docs
5. runs the full Done Gate on the combined result

### Stale main and PR base

- Fetch and compare `origin/main` at task start and immediately before PR creation/update.
- If the base moved, inspect the intervening commits for overlap and policy changes.
- Rebase only an unshared local branch. For a pushed/shared branch, prefer a non-destructive merge from `origin/main` unless the human explicitly authorizes history rewriting.
- After reconciliation, repeat affected tests and the complete Done Gate.
- The Draft PR base must be `main`, and its recorded base SHA must match the latest verified `origin/main` at PR creation time.

## 9. Agent Done Gate

The Lead must record every gate as `PASS`, `FAIL`, or `N/A — <reason>`. Completion requires no unexplained failures.

| Gate | Required evidence |
| --- | --- |
| Acceptance Criteria satisfied | criterion-by-criterion evidence in the Draft PR |
| Focused tests pass | exact commands and results for changed behavior/policy |
| Regression tests pass | current aggregate command, or affected suites with a justified limitation |
| Lint passes | `npm run lint` |
| Typecheck passes | configured command; currently `N/A` because this repository is JavaScript-only and has no typecheck script |
| Build passes | `npm run build` using non-Production inputs/infrastructure |
| Diff whitespace passes | `git diff --check origin/main...HEAD` |
| No unexpected changes | `git status --short` plus full name/status and diff review |
| No secrets | review added lines and secret-scan output; never print secret values |
| No Production changes | path/semantic review and explicit `Production actions: 0` |
| No destructive actions | explicit action log `destructive actions: 0` |
| No paid operations | explicit action log `paid operations: 0` |
| No unresolved major reviewer findings | independent review report or disclosed self-review |
| No canonical-doc conflict | compare with HANDOFF/STATUS/DECISIONS/TODO |

Current safe validation inventory:

```sh
npm ci
npm run test:agent-os              # focused Agent OS policy test
npm test                           # all tests discovered by node:test
npm run lint
npm run build                      # only with non-Production configuration
git diff --check origin/main...HEAD
git status --short
git diff --name-status origin/main...HEAD
git diff origin/main...HEAD
```

`next build` does not replace the separate ESLint command in Next.js 16. The repository currently has no standalone typecheck. Do not invent a passing typecheck or add TypeScript solely to satisfy the checklist.

The build can require catalog data during static generation. Use disposable local Supabase when available, as the existing foundation CI does. If it is unavailable, run the build once in the secret-free environment, classify the result, and do not introduce or reuse Production credentials.

The following command families are not general validation and may connect to external/Production systems or write data: `db:*`, `ingest:*`, `fetch:*`, `official:*`, `market:*`, cleanup scripts, remote audits, and GitHub workflow dispatches. Run them only when the task contract and human approval explicitly permit them.

## 10. Self-review and reviewer handoff

Self-review the final diff as if it were an external PR:

- trace every acceptance criterion to code/docs/tests
- look for accidental scope expansion, dead configuration, fragile assumptions, and missing rollback notes
- inspect security boundaries, credential handling, external calls, database behavior, and workflow triggers
- confirm tests assert behavior rather than merely file presence where feasible
- confirm docs use one authoritative rule rather than contradictory copies

The Reviewer receives the task contract, base SHA, head SHA, changed-file list, validation results, known failures, and explicit safety counts. Any correctness, security, Production-safety, or requirement-coverage finding rated major/blocking returns to the repair loop.

## 11. GitHub as the task queue

Agent OS uses Issues for task contracts and Draft PRs for execution evidence. `docs/AGENT_QUEUE.md` is the single authoritative Queue / Orchestrator v1 policy for discovery, deterministic selection, duplicate prevention, two-Builder concurrency, continuation, terminal outcomes, and durable resume. That policy is an operating procedure inside the autonomy boundary above and grants no new authority.

Queue labels are optional conventions; Queue v1 must work without them:

| State | Proposed label | Entry condition | Exit condition |
| --- | --- | --- | --- |
| Backlog | `agent:backlog` | idea exists but contract is incomplete | contract is complete and prioritized |
| Ready for Agent | `agent:ready` | bounded contract and safety boundary exist | Agent claims the task and records branch/worktree |
| Agent Working | `agent:working` | dedicated branch/worktree exists | implementation reaches frozen verification commit |
| Verification | `agent:verification` | Builder handoff and focused tests exist | Verifier/Reviewer finish with no blocking findings |
| Ready for Human | `agent:human-ready` | A real human-only boundary remains | human authorizes, rejects, or redirects |
| Done | `agent:done` | eligible gated merge or explicit closure completes | terminal |

Rules:

- Exactly one queue-state label should apply to an Agent task.
- Existing product labels such as `bug`, `documentation`, or `enhancement` may coexist.
- The Issue remains the task contract; the Draft PR links it and contains validation/review evidence.
- Agents may advance only reversible working states for their assigned task. A Draft PR may advance to merge readiness and merge without a routine human acknowledgement only when `docs/AUTO_MERGE_POLICY.md` passes; a resulting normal Vercel release also requires `docs/PRODUCTION_RELEASE_POLICY.md` to pass.
- A requested change moves the task back to `Agent Working`; a validation failure moves it no further than `Verification` until repaired.
- Label creation/project-board setup is a separate repository-administration action. Agent OS v1 defines the convention but does not mutate repository settings.

PRs should remain Draft through autonomous repair. Use a `codex/` branch, link the Issue, preserve an explicit rollback path, and fill every applicable section of `.github/pull_request_template.md`.

## 12. Documentation ownership

- `AGENTS.md`: mandatory entry point and hard boundaries
- `docs/AGENT_OS.md`: detailed Agent OS operating policy
- `docs/AGENT_QUEUE.md`: authoritative bounded queue selection, continuation, and durable-resume procedure
- `docs/AUTO_MERGE_POLICY.md`: sole standing route for an eligible autonomous PR merge
- `docs/PRODUCTION_RELEASE_POLICY.md`: sole standing route for the normal Git-triggered Vercel Production release
- `docs/DECISIONS.md`: durable product and operating decisions
- `docs/HANDOFF.md`: fresh-thread operational handoff and live approval boundary
- `docs/STATUS.md`: compact live-state snapshot
- `docs/TODO.md`: ordered product and operational work
- Agent Issue: task-specific contract
- Draft PR: implementation, validation, review, and safety evidence

When docs disagree, do not silently choose whichever permits more autonomy. Apply the precedence above, preserve the stricter safety boundary, and fix material drift in the same Draft PR when in scope.

## 13. Future non-Production automation extension points

Queue / Orchestrator v1 is a bounded procedure executed by a live Codex session plus a pure offline planner. It is not a daemon, hosted service, workflow chain, or persistent background process. Future automations may be proposed as separate reviewed changes:

- **Issue triage:** validate contract completeness, suggest labels/state, and never auto-start ambiguous work.
- **CI failure diagnosis:** read CI artifacts, classify regression/baseline/environment, and post a proposed repair plan.
- **PR review:** run independent requirement/security/regression review and publish findings without merging.
- **Docs drift check:** compare AGENTS, Agent OS, canonical decisions, task templates, and current validation commands.
- **Maintenance:** identify dependency/docs/test debt and create bounded backlog Issues; no automatic dependency upgrade or paid action.

Every future automation must have least-privilege permissions, bounded inputs, idempotent/reversible outputs, a dry-run mode, sanitized logs/artifacts, concurrency controls, and an explicit kill switch. Queue v1 does not alter the existing merge/release gates. Production credentials, Production DB actions, workflow dispatch chaining, secret mutation, paid actions, and destructive cleanup remain outside autonomous automation.

## 14. Long-running experiment progression

The increasing-risk Agent OS experiments are complete through Queue / Orchestrator v1 design:

1. completed: long-running documentation-only task (#108)
2. completed: bounded non-Production code task (#112)
3. completed: Scout / Builder / independent Verifier and Reviewer task (#114)
4. completed: two disjoint parallel Builders with Lead integration (#118)
5. current phase: bounded, offline-tested Queue / Orchestrator v1 (#121)
6. next experiment: start a fresh session with only the documented one-shot instruction and observe selection through a true terminal outcome

Record elapsed time, interventions, repair loops, validation coverage, review findings, and any stop-condition ambiguity. Do not progress to Production-connected automation through this experiment sequence.
