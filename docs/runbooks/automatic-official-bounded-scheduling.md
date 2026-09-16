# Automatic official catalog scheduling

`Gacha Official Bounded Automatic Production` runs once per day at `02:27 UTC`
(`11:27 JST`). The minute is separated from the market automation windows at
`:17` and `:47`.

## Default state

Merging the workflow does not authorize Production writes. Both repository
variables below are required:

- `OFFICIAL_BOUNDED_AUTO_ENABLED=true`
- `OFFICIAL_BOUNDED_AUTO_APPROVAL=APPROVE_OFFICIAL_BOUNDED_AUTO_V1`

The scheduled job now performs a lightweight direct-Node pre-gate immediately
after checkout. When the enable variable is absent or not exactly `true`, the
run creates a sanitized disabled artifact and skips `actions/setup-node`, npm
cache restore, `npm ci`, provider fetches, and database access. If the lane is
enabled but the approval is missing, stale, or malformed, the pre-gate fails
closed before dependency setup.

Only an exactly armed run proceeds to dependency setup. It then verifies that
its checkout exactly matches the current `origin/main` revision and runs the
existing full gate again with that verified main SHA before any provider access
or writes. The approval remains bound to the reviewed automatic policy version,
so unrelated main revisions do not require a rebind. Any behavior-changing
automatic policy revision must increment the approval version and receive a new
explicit approval.

## Execution boundary

An armed run performs these phases in order:

1. Pass the lightweight false-by-default pre-gate.
2. Set up Node dependencies and verify the checked-out SHA is the current `origin/main` SHA.
3. Re-run the existing full automatic gate with the verified main SHA.
4. Run the existing read-only official live audit.
5. Validate all sources, apply contracts, review state, and bounded totals.
6. Apply the accepted operations in one PostgreSQL transaction.
7. Verify every target row and the exact before/after count delta.
8. Secret-scan and upload the audit and automatic result.

Disabled or unarmed runs stop before dependency setup and still secret-scan,
upload, and verify their sanitized terminal result. No provider request or
Production database write is used to validate the early-gate path.

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
