# Automatic market-bounded scheduling

`Gacha Market Bounded Automatic Production` is the schedule-only market-bounded
workflow. It is isolated from the disabled legacy `Gacha ingestion` workflow so
an orphaned legacy queue record cannot block the new bounded concurrency group.

## Current safe state

The workflow is safe to merge while `AUTOMATIC_MARKET_BOUNDED_AUTO_ENABLED` is
missing, empty, or anything other than the exact lowercase value `true`. The
job is then skipped before a runner is assigned: checkout, dependency install,
source fetches, Supabase access, snapshots, persistence, and database writes
are all zero.

Merging this workflow does not authorize or activate it. Every activation is a
separate, explicitly approved Production operation.

## Arming order

1. Keep `AUTOMATIC_MARKET_BOUNDED_AUTO_ENABLED` absent or `false`.
2. Set the existing arming values together: `AUTOMATIC_INGESTION_WRITE_ENABLED=true`, `AUTOMATIC_INGESTION_ROLLOUT_STAGE=market-bounded`, the fresh policy digest, `AUTOMATIC_INGESTION_BOUNDED_PERSISTENCE_ENABLED=true`, and an approval exactly matching `APPROVE_MARKET_BOUNDED:<policy-digest>:<fresh-main-sha>`.
3. Read back all five existing arming values and the master gate. Confirm the
   current main SHA and policy digest before proceeding.
4. Only after an explicit approval, set the master gate to the exact lowercase
   value `true`.
5. To disarm, first set the master gate to `false`, then restore the remaining
   arming values to their disabled or empty values.

Any main change invalidates the approval contract and must fail closed until a
fresh main SHA is reviewed and explicitly approved.

## Boundaries

The workflow handles only scheduled `market` work at `17,47 * * * *`. It does
not support official, stock, `all`, manual writes, canary writes, cleanup, or
migrations. It shares the non-cancelling `gacha-market-bounded-v2` concurrency
group with future manual bounded runs. The legacy `gacha-ingestion` workflow
and its historical orphaned queue remain untouched and disabled.

Durable `ingestion_runs` are the only authoritative throttle history for
market-bounded runs. `rollout_throttled` and
`rollout_daily_budget_exhausted` are successful, zero-write no-ops; they do not
create a fresh throttle timestamp. All other safety failures remain fail-closed.
