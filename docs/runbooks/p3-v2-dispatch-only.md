# P3 V2 dispatch-only operation

Status: current operator guidance for #339 Phase B1

`.github/workflows/gacha-market-p3-bounded-seed-v2-auto.yml` is intentionally **dispatch-only** after #339 Phase B1.

## Current trigger contract

- `workflow_dispatch` is retained for an explicitly authorized manual auto-canary.
- The former `17 */3 * * *` schedule is retired.
- No Repository Variable or Secret should be changed merely because the schedule is absent.
- `P3_BOUNDED_SEED_V2_AUTO_ENABLED=false` remains the canonical safe state unless a later lane-specific approval says otherwise.
- The generic `.github/workflows/gacha-market-bounded-auto.yml` lane is separate and is not changed by Phase B1.

Removing the schedule prevents a disabled P3 lane from allocating a runner every three hours only to perform checkout, Node setup, npm install, exact-main verification, and then stop at the disabled gate.

## Manual path

A manual `workflow_dispatch` remains approval-bound. Do not dispatch it as a validation technique for schedule retirement.

The existing manual contract remains unchanged:

- main-only exact-SHA verification;
- exact canary confirmation input;
- fixed bounded P3 V2 limits;
- strict single-item matching and provider identity rules;
- sanitized artifact scan/upload gating;
- existing Production/write authorization semantics.

Phase B1 does not authorize provider execution or Production writes.

## Defensive dormant schedule logic

The workflow/domain code may retain fail-closed handling for `GITHUB_EVENT_NAME=schedule` as defensive compatibility evidence. With no top-level schedule trigger, normal GitHub configuration cannot reach that path automatically.

Do not remove or weaken the dormant safety path merely to simplify the file unless a separate reviewed change proves it is unnecessary.

## Future automatic reactivation

Restoring automatic P3 execution requires a new, separately reviewed workflow change. It must not be reactivated only by changing a Variable.

A future proposal must separately review and explicitly approve:

1. restoring a schedule trigger and its cadence;
2. the then-current P3 safety/cap/provider contract;
3. exact-main and approval semantics;
4. expected Actions/resource cost;
5. Production/provider execution authorization.

## Historical evidence

Documents and history snapshots describing earlier scheduled P3 throughput remain historical evidence and should not be rewritten solely to erase the former cron. When they conflict with current operation, this runbook and the current workflow trigger block describe the active state.
