# Ingestion execution safety

Production ingestion remains disabled by default. Enabling the Production workflow does not authorize writes by itself.

## Kill switch

Scheduled writes require the repository variable `AUTOMATIC_INGESTION_WRITE_ENABLED` to be exactly `true`. Missing values and values such as `1`, `yes`, or `on` are disabled. This change does not create or modify that variable.

The fixed schedule contract is:

| Schedule | Task |
|---|---|
| `7 * * * *` | `official` |
| `17,47 * * * *` | `market` |
| `37 * * * *` | `stock` |

Unknown schedules, task mismatches, and scheduled `all` runs fail closed.

## Manual Production approval

A manual full write requires the exact input `APPROVE_PRODUCTION_WRITE:<task>:<main-sha>`. The approval is read directly from the GitHub event payload and is never copied into logs, `ingestion_runs`, or artifacts. Manual `all` writes are prohibited. Existing canary approval rules are unchanged.

## Preflight gates

Before a Production mutation, `scripts/ingestion-execution-guard.mjs preflight` verifies the main SHA, execution contract, kill switch or manual approval, durable run store, all nine Production counts, same-task concurrency, and the circuit breaker.

Same-task `running` rows at most 30 minutes old block as concurrent. Older or invalid rows block as stale and are never repaired automatically. The circuit opens after two consecutive failures or at least three failures among the latest six completed mutation runs. Dry-runs, read-only checks, running, cancelled, and unknown results do not count.

## Durable logging and database deltas

Scheduled and manual full writes must create the `running` row before starting child ingestion. Failure to create it stops the write. Failure to persist the final state fails the job and prevents further Production processing. Dry-run logging remains best effort.

Before and after snapshots include `market_listings`, `market_listing_observations`, `import_issues`, `ingestion_runs`, `review_required`, `series`, `variants`, `stock_reports`, and `restock_events`. Missing counts, negative deltas, or positive deltas outside the task allowlist fail verification. No automatic rollback is performed for a delta alert.

## Artifacts

Every Production mutation attempt creates `ingestion-run-report-<run-id>` with sanitized JSON and Markdown. A blocked preflight still uploads the report and fails the job without ingestion or cleanup. Reports contain allowlisted metadata only, omit the approval value, headers, environment, seller data, raw responses, credentials, URLs, and stacks, and are scanned before upload.

## Read-only check

`Gacha Ingestion Safety Check` is a `workflow_dispatch`-only workflow. It reads Production counts and safety state, creates `ingestion-safety-check-<run-id>`, and cannot call ingestion, cleanup, migrations, or write entry points. `INGESTION_WRITE_DISABLED` and `MARKET_BACKFILL_WRITE_DISABLED` stay true.

Each safety check requires a separate explicit approval naming the merged main SHA and one task. It does not authorize enabling the Production workflow or any Production write.

## Block response

Use the report reason code to resolve the underlying condition. Never delete stale rows, close the circuit, enable a schedule, or change the kill switch automatically. Re-run only under a new explicit approval after the cause is reviewed.

Before any future Production workflow enablement, confirm exact main SHA, zero queued/running new ingestion runs, a closed circuit, available snapshots and durable logging, and `AUTOMATIC_INGESTION_WRITE_ENABLED=false` unless a separate automatic-write approval is granted.
