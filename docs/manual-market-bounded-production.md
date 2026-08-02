# Manual bounded Production workflow

`Gacha Market Bounded Manual Production` is a manually approved, one-Run path for the existing `market-bounded` contract. It exists because GitHub did not create two narrowly enabled scheduled Runs. The scheduled Production workflow and its schedule-only arming gate remain unchanged.

## Safety boundary

- Trigger: `workflow_dispatch` only.
- Fixed task: market.
- Fixed market contract: limit 5, priority 1, released products, planner APIs, live source execution.
- Maximum eligible candidates: 2. Three or more fails the whole Run without truncation.
- Maximum physical writes: two listings, two observations, and one durable ingestion Run.
- `import_issues`, review-required rows, catalog rows, stock rows, and restock rows must not change.
- The existing candidate key, URL identity, idempotency, post-write verification, and compensating rollback code is reused.
- Every audit and plan is generated fresh in the same Run. Past artifacts cannot authorize this path.

The manual approval format is distinct from the scheduled approval format:

```text
APPROVE_MARKET_BOUNDED_MANUAL:<policy_digest>:<head_sha>:<approval_nonce>
```

The nonce must be 32-64 lowercase hexadecimal characters. The approval value and nonce must never be placed in logs, summaries, artifacts, database rows, PR text, or comments. Artifacts store only the `bounded_approval_valid` boolean.

## Required dispatch inputs

- `expected_main_sha`
- `expected_policy_digest`
- `approval_nonce`
- `confirmation`, exactly `APPROVE_ONE_MANUAL_MARKET_BOUNDED_RUN`

The existing rollout Repository Variables must be armed separately under an explicit Production approval. This workflow never changes Variables and never enables or disables another workflow.

## Artifact review

The Run uploads `market-bounded-manual-result-<run_id>`. Review the manual preflight, fresh candidate audit, bounded plan, persistence preview, bounded result, Production count delta, rollback result, and secret scan before accepting the Run. A successful result requires the exact main and policy identities, a fresh plan, complete candidate identity checks, zero forbidden table deltas, and zero secret findings.

Creating, merging, or reviewing the code does not authorize dispatch. Every manual bounded Production dispatch and its temporary Repository Variable configuration requires a separate explicit approval.
