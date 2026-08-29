<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:agent-os-v1 -->
# Gacha Lens Agent OS v1

Read `docs/AGENT_OS.md` before planning or changing this repository. Also read `docs/AUTO_MERGE_POLICY.md` and the canonical project state in `docs/HANDOFF.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, and `docs/TODO.md`. Repository-specific safety decisions in those files override general autonomy below. For merge decisions, `docs/AUTO_MERGE_POLICY.md` is the explicit repository exception and overrides older lower-precedence statements that require a human to perform every safe merge.

## AUTONOMOUSLY ALLOWED

- Repository and code investigation, including read-only GitHub inspection.
- Creating a task-specific branch and worktree from the latest verified `origin/main`.
- Safe, reversible, non-Production code, test, and documentation changes within the accepted task scope.
- Focused tests, regression tests, lint, applicable typecheck, build, and `git diff --check`.
- Reviewed tests/tooling may remove only disposable artifacts they created under an exact verified temporary/generated path.
- Failure diagnosis, bounded self-repair, re-validation, diff inspection, and self-review.
- Creating and updating a Draft PR for the task branch.
- Marking an eligible PR ready and merging it to `main` only when every condition in `docs/AUTO_MERGE_POLICY.md` passes.

## HUMAN APPROVAL REQUIRED

- Direct push to `main` or history rewriting of a shared branch.
- Any merge that is not eligible under `docs/AUTO_MERGE_POLICY.md`.
- Production deploys, Production DB writes, Production migrations, or Production gate changes.
- Any GitHub Actions `workflow_dispatch`, including read-only diagnostics.
- Repository or hosting Secrets / Variables changes.
- External-service paid operations.
- Repository, data, worktree, or external-state cleanup/delete unless explicitly and narrowly approved in the task; irreversible or destructive actions.
- Major product or specification changes.
- Changes to Agent OS safety/approval boundaries unless the current human request explicitly authorizes that policy change.

## AUTONOMOUS CONTINUATION

For a safe failure such as a test, lint, build, ordinary implementation, or review failure, do not stop merely because it failed. Investigate the cause, form an evidence-based repair, make the smallest safe correction, and re-run the relevant validation. Repeat while each iteration is safe and provides a new reasonable path. Separate regressions caused by the task from known baseline or environment failures and record the evidence.

## STOP CONDITIONS

Return to the human only when Production access, a destructive operation, a Secrets / Variables change, a paid operation, an ineligible merge, or a major product decision is required; requirements are materially ambiguous and no safe assumption exists; specifications conflict in a way that changes product direction; or reasonable safe self-repair paths have been exhausted with evidence.

## AGENT DONE GATE

Before claiming completion, apply the gate in `docs/AGENT_OS.md`: confirm acceptance criteria, focused and regression tests, lint, applicable typecheck, build, `git diff --check`, expected diff only, secret and Production safety, no destructive actions, no unresolved major review findings, and no material conflict with canonical docs. A check may be `N/A` only with a concrete reason. Never collapse a known baseline/environment limitation into an unexplained “failed”. If the task is eligible for autonomous merge, also apply the Auto-Merge Gate in `docs/AUTO_MERGE_POLICY.md`.

## AGENT TASK CONTRACT

Every agent task must state: Goal, Context, Scope, Acceptance Criteria, Constraints, Validation, Stop Conditions, and Done Definition. Use `.github/ISSUE_TEMPLATE/agent-task.yml` or the contract in `docs/AGENT_OS.md`.

## MULTI-AGENT AND WORKTREE RULES

- The Lead / Orchestrator owns decomposition, assignment, integration, and the final Done Gate.
- Scouts research read-only; Builders implement and run focused tests; Verifiers independently run regression and static/build checks; Reviewers independently assess correctness, regression risk, security, maintainability, and requirement coverage.
- One task equals one branch and one worktree. Do not let multiple agents edit the same worktree concurrently.
- Parallel Builders must own disjoint files or use separate branches/worktrees. Serialize overlapping files. The Lead resolves integration and re-validates the combined diff.
- Re-fetch and compare `origin/main` before work and before PR merge. Reconcile a stale base without force-pushing shared history.

## REPOSITORY HARD STOPS

- Never touch `supabase/.temp/cli-latest`.
- Do not dispatch workflows, deploy, migrate, change Secrets / Variables, or perform Production writes in autonomous work.
- Never bypass the Auto-Merge Gate or use direct `main` pushes as a substitute for PR merge.
- Keep `.github/workflows/gacha-ingestion.yml` disabled and do not casually change existing Production-capable workflows or automatic ingestion semantics.
<!-- END:agent-os-v1 -->
