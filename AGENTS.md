<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:agent-os-v1 -->
# Gacha Lens Agent OS v1

Read `docs/AGENT_OS.md` before planning or changing this repository. For a queue run, also read `docs/AGENT_QUEUE.md`; it is an operating procedure inside these existing permissions, not a grant of additional authority. When evaluating or adopting an external AI/development technique, also read `docs/TECHNOLOGY_INTELLIGENCE.md` and route the idea through its evidence/delta/measurement gate before integrating it. Also read `docs/AUTO_MERGE_POLICY.md`, `docs/PRODUCTION_RELEASE_POLICY.md`, and the canonical project state in `docs/HANDOFF.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, and `docs/TODO.md`. Repository-specific safety decisions in those files override general autonomy below. For merge/release decisions, the Auto-Merge and Production Release policies are the explicit repository exceptions and override older lower-precedence statements that require a human to perform every safe merge or routine Vercel release.

## AUTONOMOUSLY ALLOWED

- Repository and code investigation, including read-only GitHub inspection.
- Creating a task-specific branch and worktree from the latest verified `origin/main`.
- Safe, reversible, non-Production code, test, and documentation changes within the accepted task scope.
- Focused tests, regression tests, lint, applicable typecheck, build, and `git diff --check`.
- Reviewed tests/tooling may remove only disposable artifacts they created under an exact verified temporary/generated path.
- Failure diagnosis, bounded self-repair, re-validation, diff inspection, and self-review.
- Creating and updating a Draft PR for the task branch.
- Marking an eligible PR ready and merging it to `main` only when every condition in `docs/AUTO_MERGE_POLICY.md` passes.
- Allowing the normal Vercel Production deployment triggered by an eligible merge only when every condition in `docs/PRODUCTION_RELEASE_POLICY.md` also passes.

## HUMAN APPROVAL REQUIRED

- Direct push to `main` or history rewriting of a shared branch.
- Any merge that is not eligible under `docs/AUTO_MERGE_POLICY.md`.
- Any Production deployment/release that is not eligible under `docs/PRODUCTION_RELEASE_POLICY.md`.
- Production DB writes, Production migrations, Production gate changes, or other direct Production mutation outside the eligible normal Vercel release.
- Any GitHub Actions `workflow_dispatch`, including read-only diagnostics.
- Repository or hosting Secrets / Variables changes.
- External-service paid operations.
- Repository, data, worktree, or external-state cleanup/delete unless explicitly and narrowly approved in the task; irreversible or destructive actions.
- Major product or specification changes.
- Changes to Agent OS, Auto-Merge, or Production Release safety/approval boundaries unless the current human request explicitly authorizes that policy change.

## AUTONOMOUS CONTINUATION

For a safe failure such as a test, lint, build, ordinary implementation, Preview, or review failure, do not stop merely because it failed. Investigate the cause, form an evidence-based repair, make the smallest safe correction, and re-run the relevant validation. Repeat while each iteration is safe and provides a new reasonable path. Separate regressions caused by the task from known baseline or environment failures and record the evidence.

## STOP CONDITIONS

Return to the human only when an ineligible Production action, a destructive operation, a Secrets / Variables change, a paid operation, an ineligible merge/release, or a major product decision is required; requirements are materially ambiguous and no safe assumption exists; specifications conflict in a way that changes product direction; or reasonable safe self-repair paths have been exhausted with evidence.

## AGENT DONE GATE

Before claiming completion, apply the gate in `docs/AGENT_OS.md`: confirm acceptance criteria, focused and regression tests, lint, applicable typecheck, build, `git diff --check`, expected diff only, secret and Production safety, no destructive actions, no unresolved major review findings, and no material conflict with canonical docs. A check may be `N/A` only with a concrete reason. Never collapse a known baseline/environment limitation into an unexplained “failed”. If the task is eligible for autonomous merge, also apply `docs/AUTO_MERGE_POLICY.md`. If that merge triggers Vercel Production, also apply `docs/PRODUCTION_RELEASE_POLICY.md`.

## AGENT TASK CONTRACT

Every agent task must state: Goal, Context, Scope, Acceptance Criteria, Constraints, Validation, Stop Conditions, and Done Definition. Use `.github/ISSUE_TEMPLATE/agent-task.yml` or the contract in `docs/AGENT_OS.md`.

## QUEUE / ORCHESTRATOR ENTRY

The short instruction `Gacha Lens続けて。Agent Queueを自律実行し、真のStop Conditionだけ戻して。` requests one bounded, resumable run of the existing Agent OS lifecycle using the selection and checkpoint procedure in `docs/AGENT_QUEUE.md`.

The Queue procedure must resume durable existing work before creating a duplicate, select only complete tasks authorized by canonical priority, use no more than two disjoint Builders, and persist Issue/PR/branch/worktree/frozen-commit state for another session. It may skip an unrelated human-bound item while eligible work remains, but it never converts that item into authorized work.

The short instruction grants no new permission. Every HUMAN APPROVAL REQUIRED item and REPOSITORY HARD STOP above remains unchanged. The run ends at a true Stop Condition, a human-bound dependency, queue exhaustion, repository ambiguity, or an unavoidable session/tool limit.

## MULTI-AGENT AND WORKTREE RULES

- The Lead / Orchestrator owns decomposition, assignment, integration, and the final Done Gate.
- Scouts research read-only; Builders implement and run focused tests; Verifiers independently run regression and static/build checks; Reviewers independently assess correctness, regression risk, security, maintainability, and requirement coverage.
- One task equals one branch and one worktree. Do not let multiple agents edit the same worktree concurrently.
- Parallel Builders must own disjoint files or use separate branches/worktrees. Serialize overlapping files. The Lead resolves integration and re-validates the combined diff.
- Re-fetch and compare `origin/main` before work and before PR merge. Reconcile a stale base without force-pushing shared history.

## REPOSITORY HARD STOPS

- Never touch `supabase/.temp/cli-latest`.
- Do not dispatch workflows, migrate Production data/schema, change Secrets / Variables, or perform direct Production writes in autonomous work.
- Do not manually invoke or bypass release controls for Production; only the normal Vercel deployment caused by an eligible merge may proceed under `docs/PRODUCTION_RELEASE_POLICY.md`.
- Never bypass the Auto-Merge or Production Release Gate or use direct `main` pushes as a substitute for PR merge.
- Keep `.github/workflows/gacha-ingestion.yml` disabled and do not casually change existing Production-capable workflows or automatic ingestion semantics.
<!-- END:agent-os-v1 -->
