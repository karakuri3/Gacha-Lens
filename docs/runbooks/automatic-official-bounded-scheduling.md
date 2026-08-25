# Automatic official catalog scheduling

`Gacha Official Bounded Automatic Production` runs once per day at `02:27 UTC`
(`11:27 JST`). The minute is separated from the market automation windows at
`:17` and `:47`.

## Default state

Merging the workflow does not authorize Production writes. Both repository
variables below are required:

- `OFFICIAL_BOUNDED_AUTO_ENABLED=true`
- `OFFICIAL_BOUNDED_AUTO_APPROVAL=APPROVE_OFFICIAL_BOUNDED_AUTO_V1`

When the enable variable is absent or not exactly `true`, the scheduled run
creates a sanitized disabled artifact and performs no provider fetch and no
database write. An enabled gate with a missing, stale, or malformed approval
fails closed. The approval is bound to the reviewed automatic policy version,
so unrelated main revisions do not require a rebind. Any behavior-changing
automatic policy revision must increment the approval version and receive a new
explicit approval. Every run still verifies that its checkout exactly matches
the current `origin/main` revision before provider access or writes.

## Execution boundary

An enabled run performs these phases in order:

1. Verify the checked-out SHA is the current `origin/main` SHA.
2. Run the existing read-only official live audit.
3. Validate all sources, apply contracts, review state, and bounded totals.
4. Apply the accepted operations in one PostgreSQL transaction.
5. Verify every target row and the exact before/after count delta.
6. Secret-scan and upload the audit and automatic result.

The automatic caps reuse the established live-audit envelope:

- at most 4 series writes per run;
- at most 40 variant writes per run;
- at most 4 official restock-event writes per run.

The automatic live collector inspects at most two Bandai and two Takara Tomy
Arts detail pages per run. It deterministically prioritizes official identities
that are absent from the current catalog, then progresses to the next unseen
identities on later runs. If every discovered identity is already known, it
uses the established upcoming/recent/market-interest refresh ordering. Manual
official audits retain that established ordering. Four series and forty
variants therefore cover the reviewed daily collection envelope while treating
larger changes as an incident rather than silently approving them.

## Fail-closed policy

The entire batch is blocked when any required source fails, source identity is
unexpected, the audit is incomplete, the current main SHA differs, an apply
contract is malformed, a cap is exceeded, a row precondition drifts, or a
candidate is provisional or review-required.

Automatic deletes and cleanup are never permitted. Provisional replacement and
other delete candidates are reported by the audit and block the automatic
batch; they require a separate reviewed operation. The workflow does not call
the legacy ingestion workflow and shares its concurrency group with the manual
official bounded writer so the two write paths cannot overlap.

## Activation boundary

Setting or changing either repository variable is a Production approval action.
Do not activate the gate until the Draft PR has been reviewed, merged, and the
policy version has been named in a separate explicit approval. No workflow
dispatch is needed or permitted for this schedule-only workflow.
