# Official Source Expansion Diagnostic

`Gacha Official Source Expansion Diagnostic` is a manual, read-only diagnostic for the Kitan Club and Qualia public product pages. It samples only a bounded number of current or archive products and never produces an apply contract or a persistence command.

The workflow has only `workflow_dispatch`; it has no schedule and no database credential. Each execution requires separate approval. `CURRENT` and `BACKFILL_SAMPLE` both keep the provider request budget at five detail pages or fewer, run sequentially, and use a timeout plus at most one retry. `BACKFILL_SAMPLE` selects one Kitan year archive (2010-2026) and one Qualia year/month archive (2019-2026); its artifact returns a deterministic provider cursor for the next approved sample. It never performs a full backfill.

The sanitized artifact records parser success, request and parsing metrics, deterministic diagnostic identities, and image candidates. A candidate image is evidence only: it is not downloaded, rehosted, or persisted. The workflow has no database access, so it reports structural write isolation rather than a measured database delta. A parser failure, access failure, blocked response, or ambiguous lineup is reported as a diagnostic failure and is not eligible for any catalog update.

This workflow is not an approval source for bounded writes. Kitan Club and Qualia remain outside the automatic official catalog workflow until a separately reviewed production integration is approved. The orphaned run `30688709185` remains unrelated and permanently excluded from any rollout source.
