# Manual market audit workflow

`Gacha Market Manual Audit` isolates human-approved market dry-runs from the scheduled Production ingestion workflow.

## Safety contract

- The only trigger is `workflow_dispatch`; there is no schedule or automatic trigger.
- The workflow always runs `task=market`, `mode=dry-run`, `source_scope=planner-apis`, `execute_sources=true`, `priority=1`, and `release=released`.
- The only operator input is a limit from 1 through 5.
- `MARKET_BACKFILL_WRITE_DISABLED=true` rejects canary and normal write modes before their handlers run.
- Production counts are captured before and after the audit. Any difference fails the workflow.
- The audit must be complete, untruncated, use unique candidate keys, exclude blocked variants, and declare zero database writes.
- The artifact is scanned for configured credential values and token-shaped content before upload.
- Every execution requires separate, explicit approval. Creating this workflow does not authorize a dispatch.

Current RLS permits the required catalog reads through `service_role`, so the workflow still receives that credential. The workflow does not call a mutation command, and its fixed command, process-level write guard, and before/after count check provide defense in depth. Replacing this with a dedicated read-only database credential requires a separately reviewed database role and is outside this schema-free phase.

## Reviewing an artifact

1. Open the approved `Gacha Market Manual Audit` Run.
2. Download `market-candidate-audit-<RUN_ID>`.
3. Confirm the audit JSON reports `mode=dry-run`, `source_scope=planner-apis`, `report_complete=true`, `truncated_count=0`, and zero database writes.
4. Review every candidate's target variant and parent series, listing type, price, status, confidence, reason, and evidence checks.
5. Treat `review_required=true`, confidence below `0.8`, unresolved labels, edition conflicts, set signals, and target conflicts as blocked.
6. Use the read-only rollout plan only as a review aid. It does not authorize a write.

Canary writes remain a separate workflow operation and require a separate approval naming the exact source audit Run and candidate keys.

## Environment loading

The workflow receives its configuration through GitHub Actions Secrets and does not require a checked-out `.env.local` file. Manual audit scripts load `.env.local` only when it exists, preserve existing `process.env` values when it does not, and fail closed for read or parse failures other than a missing file.

## Permanently excluded evidence

Run `30688709185` is an orphaned queued Run with zero jobs and no artifact:

```text
audit_source_authorized: false
canary_source_authorized: false
permanently_excluded_from_rollout: true
reason: orphaned queued run with zero jobs and no artifact
```

The following historical audits must not be used as canary sources:

```text
30532684353
30565886734
30572554031
30655163177
30688709185
30694540362
```

Run `30694540362` failed before the market dry-run because the GitHub runner did not contain `.env.local`. It produced no artifact or candidates and is permanently excluded:

```text
audit_source_authorized: false
canary_source_authorized: false
permanently_excluded_from_rollout: true
reason: failed before market dry-run and produced no artifact
```

Do not operate on the stuck Run from this workflow. GitHub Support follow-up remains a separate, deferred task.
