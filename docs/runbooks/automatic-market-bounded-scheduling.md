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

Merging this workflow installs the `17,47 * * * *` schedule trigger on the
default branch. Therefore, Ready/merge requires separate explicit approval for
installing the automatic schedule trigger. The master gate remains disabled,
so merge alone performs no Production ingestion or database writes.

Actual automatic Production ingestion requires a later, separate explicit
Production activation approval. That approval must cover fresh main/policy
verification, read-back of the five arming Variables, and finally setting
`AUTOMATIC_MARKET_BOUNDED_AUTO_ENABLED=true` as the last step.

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

## Practical throughput budget (2026-11)

The display rule in `lib/domain/market-evidence.js` needs at least three distinct
active listings per variant observed within 30 days. The original once-per-day,
two-row policy could not reach or maintain that, so `market-bounded` now uses:

| Field | Before | Now |
|---|---|---|
| `priority` | `1` | `all` (priority 1 -> 5 order; variants one listing short of the guide come first) |
| `minimum_interval_minutes` | 720 | 40 (with the `17,47` schedule this allows at most one run per hour) |
| `max_runs_per_24_hours` | 1 | 24 |
| `max_selected_variants` / `limit` | 5 | 5 (unchanged) |
| `max_persistence_candidates` / `max_listing_writes` / `max_observation_writes` | 2 | 10 |
| `max_review_required_writes` | 0 | 0 (unchanged) |

`market-shadow` keeps its once-per-day 720-minute throttle and only changes to
`priority=all` so the simulation exercises the same variant order.

Daily ceiling: 24 runs x 5 variants = 120 variant searches, at most
24 x 10 = 240 listing writes and 240 observation writes. Per run the request
budget is unchanged: at most 5 root queries x 3 attempts per provider plus one
affiliate request per root, paced at 1.2 s (Rakuten) and 1.0 s (Yahoo!
Shopping), i.e. roughly 40 planned requests per run and about 960 per day
across both providers before retries.

Scheduled bounded runs now record `selected_variant_ids` in their durable
`ingestion_runs` summary so the 24-hour per-variant collection cooldown applies,
and the variant tie-break rotation bucket changes hourly so runs that persist
nothing do not re-query the same variants all day.

Any policy edit changes the policy digest, so the approval string must be
recomputed from the merged `main` before arming.
