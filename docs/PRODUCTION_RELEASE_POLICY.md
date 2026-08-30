# Gacha Lens Standing Production Release Policy

Status: authoritative standing approval for low-risk Vercel Production releases

This policy implements the user's standing preference that routine, well-validated releases should not stop for a repeated "Production deploy OK?" acknowledgement when the only Production action is the normal Vercel deployment caused by merging an eligible pull request.

This is a narrow exception. It does not authorize Production database changes, Secrets / Variables changes, workflow dispatches, paid actions, destructive operations, or major product/specification decisions.

## Default

Use a pull request. Never direct-push autonomous work to `main`.

An Agent may merge an eligible PR and allow the normal Vercel Production deployment triggered by that merge without asking the human again only when both the Auto-Merge Gate and the Standing Production Release Gate below pass in full.

Do not invoke a manual Vercel production deployment as a substitute for the normal Git-triggered release unless a task explicitly authorizes that exact action.

## Standing Production Release Gate

Every item must be true and evidenced in the PR, Preview, CI, or repository state:

- the Auto-Merge Gate in `docs/AUTO_MERGE_POLICY.md` passes
- Vercel Preview for the exact PR head SHA is successful
- the PR is bounded, reviewed, reversible in Git, and has an explicit rollback path
- no unresolved blocking/major reviewer finding remains
- no task-induced test, lint, typecheck, build, or Preview regression remains
- Production database writes/migrations/backfills/cleanup/schema actions: 0
- Secrets / Variables changes: 0
- workflow dispatches: 0
- paid operations: 0
- destructive or irreversible actions: 0
- direct `main` pushes: 0
- no new or materially changed Production-capable workflow, schedule, cron, ingestion lane, or deployment gate
- no authentication/authorization policy change, credential scope expansion, or security-boundary weakening
- no payment/billing behavior change
- no new write-capable external integration or material expansion of external side effects
- no major product/specification decision or unresolved material ambiguity
- the deployment is the repository's normal Vercel Production deployment caused by merging the PR
- the release can be rolled back by reverting the merge or using the existing hosting rollback path

## Changes normally eligible

When the full gate passes, the standing approval may cover:

- documentation-only changes
- tests and non-Production developer tooling
- presentation/UI changes with no new privileged or write-capable behavior
- bounded application bug fixes or feature changes that use existing approved data/write paths and pass Preview/CI/review
- refactors that preserve externally observable behavior and pass the complete validation gate

Eligibility is determined by evidence, not by filename alone.

## Always require human approval

Stop before merge/release when any of these apply:

- Production database migration, schema change, backfill, cleanup, seed, reset, or data mutation outside already-approved normal application behavior
- Secrets / Variables changes or credential changes
- GitHub Actions `workflow_dispatch`
- a new or materially changed Production-capable workflow, cron, deployment gate, or automatic ingestion lane
- enabling a previously disabled Production-capable workflow or rollout
- authentication/authorization architecture changes or meaningful security-boundary weakening
- payment, billing, purchase, or external paid action
- destructive cleanup, irreversible action, broad deletion, or shared-history rewrite
- direct push to `main`
- major product/specification decision or unresolved material ambiguity
- a release whose risk cannot be confidently classified or whose rollback path is unclear
- a task that explicitly requires human release approval
- changes to Agent OS, Auto-Merge, or Production Release safety/approval boundaries unless the current explicit human request authorizes that exact policy change

## Release procedure

1. Re-fetch and inspect current `main` and confirm the PR base is safe.
2. Confirm the complete Agent Done Gate and Auto-Merge Gate.
3. Confirm Vercel Preview and required GitHub checks are successful for the exact head SHA.
4. Apply this Standing Production Release Gate.
5. Mark the PR ready if needed, then merge using the repository-safe method, normally squash.
6. Allow the normal Vercel Production deployment triggered by the merge.
7. Observe the resulting deployment status when tooling permits.
8. If the deployment fails, diagnose without changing Production data/secrets. Use a safe rollback/revert path when clearly available; otherwise stop at the smallest real approval boundary.
9. Record the merge SHA, deployment disposition, and any rollback action in the task result.

A failed Preview, required check, or Production deployment is not permission to bypass the gate. Repair safely or stop at a true boundary.
