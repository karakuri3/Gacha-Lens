# Automatic ingestion rollout

## Phase 6-D bounded persistence

`market-bounded` now has a dedicated, maximum-two-row persistence implementation. It remains unreachable unless the automatic write switch, bounded persistence switch, policy digest, and exact head-bound approval are all configured. Defaults remain disabled and empty.

The market audit byte digest and canonical plan digest are verified in the same scheduled Run, and plans expire after 15 minutes. Candidate safety, listing identity, write budgets, post-write rows, database deltas, and rollback are revalidated fail closed. See [market-bounded-persistence.md](./market-bounded-persistence.md).

The Rollout Simulation workflow stops at `market-bounded-persistence-preview`; it never invokes the persistence runner and always reports zero Production writes.

Automatic Production ingestion uses a reviewed policy with three explicit stages. The policy lives at `config/automatic-ingestion-rollout-policy.json`; its SHA-256 digest binds any future bounded-write authorization to the exact policy on `main`.

## Stages

| Stage | Automatic run | Production write | Purpose |
|---|---|---|---|
| `disabled` | No | No | Default and current Production state |
| `market-shadow` | Market only | No | Read-only market dry-run, diagnostics, and write prediction |
| `market-bounded` | Market only | Policy-gated | Bounded-write readiness and prediction; Phase 6-C does not invoke persistence |

An absent `AUTOMATIC_INGESTION_ROLLOUT_STAGE` resolves to `disabled`. Unknown values are validation failures rather than aliases for disabled. Official, stock, `all`, and manual bounded-write runs are not enabled by this policy.

## Policy digest and kill switch

`market-bounded` requires all of the following before a Production workflow may get as far as a bounded plan:

- `AUTOMATIC_INGESTION_WRITE_ENABLED=true`
- `AUTOMATIC_INGESTION_ROLLOUT_STAGE=market-bounded`
- `AUTOMATIC_INGESTION_ROLLOUT_POLICY_DIGEST` exactly equal to the SHA-256 of the policy file on the checked-out `main`

Workflow enablement alone grants nothing. Phase 6-C creates or changes none of these variables. Persistence remains separately approval-gated and is not called by the rollout simulation.

## Market shadow

The fixed shadow contract is `task=market`, `mode=dry-run`, `limit=5`, `priority=1`, `release=released`, `source_scope=planner-apis`, and `execute_sources=true`. It reuses the sanitized market candidate audit and request diagnostics. Listings, observations, import issues, `ingestion_runs`, cleanup, migrations, canary writes, and normal writes remain prohibited.

Shadow output predicts `would_write` values. These values are neither candidate approval nor permission to persist data.

## Throttle

For the same stage and task, a run is blocked when another same-task row is running, when a running row is stale, when a completed shadow exists in the previous 720 minutes, or when one shadow already exists in the previous 24 hours. Production `ingestion_runs` and read-only GitHub artifact metadata are both checked. If either data source is unavailable, the rollout fails closed.

## Automatic candidate eligibility

Only active single listings from `rakuten_ichiba` or `yahoo_shopping` can be predicted as eligible. Candidates must be accepted without review, have confidence at least `0.86`, include variant and parent-series evidence, and have no set, multi-variant, explicit-label, or edition conflict. Candidate keys must be unique lowercase 16-character hexadecimal values. Invalid price, provider, variant, or series identity is excluded.

Human-reviewed canary rules remain unchanged and are not reused as automatic approval.

## Budget

The bounded policy permits at most five selected variants, 20 candidates, two auto-eligible candidates, two listing writes, two observation writes, and zero review-required writes. Exceeding any budget rejects the whole plan. Candidates are never silently truncated to fit.

## Simulation workflow

`Gacha Ingestion Rollout Simulation` has only a `workflow_dispatch` trigger and accepts `market-shadow` or `market-bounded`. The task and market contract are fixed internally. `INGESTION_WRITE_DISABLED`, `MARKET_BACKFILL_WRITE_DISABLED`, and `AUTOMATIC_INGESTION_WRITE_ENABLED=false` are fixed for the job.

The workflow verifies exact `main`, reads the Production snapshot, concurrency, circuit and throttle state, runs the market dry-run, creates the prediction plan, compares all nine Production counts, scans secrets, and uploads `ingestion-shadow-report-<run-id>`. It has no persistence, cleanup, migration, or workflow-control step. Every dispatch requires separate explicit approval naming the merged `main` SHA and stage.

## Artifacts

The shadow artifact includes sanitized JSON and Markdown for the shadow report, bounded prediction plan, candidate audit, and request diagnostics. It omits credentials, headers, cookies, raw responses, credential-bearing URLs, environment listings, approval values, and stacks.

## Approval boundary

Changing any rollout variable, enabling the Production workflow, dispatching the simulation, or authorizing a Production write is a separate operation. Before any Production workflow enablement, confirm exact `main`, policy digest, disabled write switch unless specifically approved, zero new queued/running runs, a closed circuit, available durable run storage, complete snapshots, and unchanged schedules.

The normal response to uncertainty is fail-closed, not automatic repair or rollback. Official and stock rollout remain unauthorized.
