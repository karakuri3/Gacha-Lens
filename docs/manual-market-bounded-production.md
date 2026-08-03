# Manual bounded Production workflow

`Gacha Market Bounded Manual Production` is a manually approved, one-Run path for the existing `market-bounded` contract. It exists because GitHub did not create two narrowly enabled scheduled Runs. The scheduled Production workflow and its schedule-only arming gate remain unchanged.

The manual and scheduled workflows share the `gacha-ingestion` concurrency group. The manual path also checks both workflow names through the read-only GitHub Actions API before preflight and immediately before persistence. Known orphaned Run `30688709185` is excluded from blocking but is never operated on.

## Safety boundary

- Trigger: `workflow_dispatch` only.
- Fixed task: market.
- Fixed market contract: limit 5, priority 1, released products, planner APIs, live source execution.
- Maximum eligible candidates: 2. Three or more fails the whole Run without truncation.
- Maximum physical writes: two listings, two observations, and one durable ingestion Run.
- `import_issues`, review-required rows, catalog rows, stock rows, and restock rows must not change.
- Operation-derived expected deltas, bounded persistence deltas, and the independent nine-table before/after snapshot must match exactly.
- The existing candidate key, URL identity, idempotency, post-write verification, and compensating rollback code is reused.
- Every audit and plan is generated fresh in the same Run. Past artifacts cannot authorize this path.
- Both `INGESTION_WRITE_DISABLED` and `MARKET_BACKFILL_WRITE_DISABLED` are enabled for the fresh dry-run. Only the separately gated bounded persistence command can write.

The manual approval format is distinct from the scheduled approval format:

```text
APPROVE_MARKET_BOUNDED_MANUAL:<policy_digest>:<head_sha>:<approval_nonce>
```

The nonce must be 32-64 lowercase hexadecimal characters. It is parsed in memory from the GitHub Actions Secret `AUTOMATIC_INGESTION_BOUNDED_APPROVAL`; it is not a workflow input or Repository Variable. The Secret is injected only into the steps that verify, claim, persist, and scan the approval. The workflow fails closed before source fetch when the Secret is empty and applies an explicit `add-mask` without printing the value. Creating or changing the Secret value requires separate explicit approval. The approval value and raw nonce must never be placed in logs, summaries, artifacts, database rows, PR text, or comments.

Before any marketplace source fetch, the nonce is hashed in memory with SHA-256. Only `approval_nonce_sha256` is stored in the allowlisted claim Artifact and, after a successful bounded write, the durable ingestion summary. The claim Artifact is named `manual-bounded-approval-claim-<nonce_sha256>`. A claim from another Run or attempt fails closed with `manual_bounded_approval_already_consumed`. Claim creation, upload, and API verification must all succeed before source fetch begins. Run attempts other than `1` are rejected.

## Required dispatch inputs

- `expected_main_sha`
- `expected_policy_digest`
- `confirmation`, exactly `APPROVE_ONE_MANUAL_MARKET_BOUNDED_RUN`

These are the workflow's only three inputs. The approval parser requires an exact, case-sensitive match with no leading/trailing whitespace, newline, or extra separator.

The existing rollout Repository Variables must be armed separately under an explicit Production approval. This workflow never changes Variables and never enables or disables another workflow.

`AUTOMATIC_INGESTION_ROLLOUT_STAGE` must be exactly `market-bounded`. The fixed workflow stage cannot override a missing, disabled, or different configured stage.

Expired and unexpired approval-claim Artifacts both consume their nonce fingerprint. Claim Artifacts from prior Runs are also converted to sanitized manual-attempt history for the minimum interval and 24-hour throttle; active Run rows remain a separate concurrency input. Incomplete GitHub pagination or metadata fails closed.

## Artifact review

The Run uploads `market-bounded-manual-result-<run_id>`. Review the manual preflight, approval claim, fresh candidate audit, bounded plan, persistence preview, bounded result, Production count delta, rollback result, and secret scan before accepting the Run. A successful result requires the exact main and policy identities, a fresh plan, complete candidate identity checks, exact agreement between operation, persistence, and snapshot deltas, zero forbidden table deltas, and zero secret findings. Final verification repeats the exact delta check against the files being uploaded.

The final Artifact is uploaded only after the secret scan succeeds. Final verification runs after the scan and before upload. A sanitized failure result may still be uploaded when final verification fails, but no final or failure Artifact is uploaded when the secret scan fails.

Failed persistence results include a sanitized `failure_diagnostic`. It records only an allowlisted checkpoint, stable checkpoint reason, safe upstream reason, allowlisted error category, whether persistence was invoked, and rollback state. Raw exception messages, stacks, environment values, approval material, nonce material, URLs, HTTP responses, database rows, and candidate raw data are excluded from both JSON and Markdown artifacts.

The approval used by Run `30761206126` is consumed and must never be reused. Its raw approval and nonce are intentionally not documented.

Creating, merging, or reviewing the code does not authorize dispatch. Every manual bounded Production dispatch and its temporary Repository Variable configuration requires a separate explicit approval.
