## Outcome

Describe the completed outcome, not only the files changed.

## Task contract

- Issue / contract:
- Goal:
- In scope:
- Out of scope:
- Acceptance Criteria evidence:

## Changes

-

## Safety

- Base SHA:
- Branch / worktree:
- Production actions: 0
- destructive actions: 0
- secrets changes: 0
- paid operations: 0
- workflow dispatches: 0
- direct main pushes: 0
- Existing Production-capable workflows changed: no
- Rollback:

## Validation

| Check | Result | Evidence / command |
| --- | --- | --- |
| Focused tests |  |  |
| Regression tests |  |  |
| Lint |  | `npm run lint` |
| Typecheck |  | Command or `N/A — reason` |
| Build |  | `npm run build` with non-Production inputs |
| Diff whitespace |  | `git diff --check origin/main...HEAD` |
| Unexpected changes |  | status + name/status + full diff reviewed |
| Secret scan |  | added lines reviewed; values not printed |
| Canonical docs |  | AGENTS / AUTO_MERGE_POLICY / HANDOFF / STATUS / DECISIONS / TODO checked |
| Required GitHub checks |  | all required head-SHA checks successful |

## Failure classification / known issues

For each non-pass result, classify it as task regression, baseline issue, environment limitation, or flake. Include comparison evidence and do not use Production credentials to bypass an environment limitation.

## Review

- Self-review completed:
- Independent Verifier:
- Independent Reviewer:
- Blocking/major findings remaining: 0
- Requirement coverage notes:
- Security and regression-risk notes:

## Agent Done Gate

- [ ] Acceptance Criteria satisfied
- [ ] Focused tests pass
- [ ] Regression tests pass, or a concrete unchanged limitation is recorded
- [ ] Lint passes
- [ ] Typecheck passes, or is correctly marked N/A
- [ ] Build passes, or a verified unchanged environment limitation is recorded
- [ ] `git diff --check` passes
- [ ] No unexpected changes
- [ ] No secrets are included
- [ ] Production actions are 0
- [ ] Destructive actions are 0
- [ ] Secrets / Variables changes are 0
- [ ] Paid operations are 0
- [ ] Workflow dispatches are 0
- [ ] Direct main pushes are 0
- [ ] No unresolved major reviewer findings
- [ ] No material conflict with canonical docs

## Merge disposition

- [ ] Auto-Merge Gate in `docs/AUTO_MERGE_POLICY.md` passes in full; Agent may mark ready and merge without routine human acknowledgement
- [ ] OR human approval is required because an Auto-Merge Gate exclusion/stop condition applies
