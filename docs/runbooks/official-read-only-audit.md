# Official read-only audit

`Gacha Official Read-Only Audit` is a manually approved, read-only check of the current Gashapon and Takara Tomy Arts page contracts.

- It has only `workflow_dispatch`; it has no schedule or automatic trigger.
- It fetches the current Gashapon schedule and products index, the first Takara Tomy Arts search page, and at most two detail pages per provider.
- It reads the Production catalog to calculate a bounded plan, but it does not call upsert, delete, cleanup, migration, or ingestion-run writers.
- It verifies exact zero table-count delta before publishing its artifact.
- A parser failure, zero-result source, incomplete lineup, identity conflict, or cap overflow blocks readiness.
- The artifact is `official-read-only-audit-<run-id>` and contains sanitized JSON and Markdown only.

The plan hard caps series, variant, and issue changes independently. It never proposes deletes or provisional cleanup. Replaced provisional rows remain for the explicit `npm run db:cleanup-provisional` maintenance boundary; that command is not part of `scripts/run-official-ingestion.mjs` and must not be run by this audit. The disabled legacy Production workflow is preserved byte-for-byte as reviewed historical evidence and is not the new official audit path.

Any future official Production write workflow requires a separate explicit approval, fresh audit evidence, independently approved caps, and a new write-specific implementation. This read-only workflow must not be treated as write authorization.
