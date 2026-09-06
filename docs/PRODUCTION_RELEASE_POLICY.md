# Gacha Lens Standing Production Release Policy

Status: authoritative standing approval for low-risk Cloudflare Production releases

This policy implements the user's standing preference that routine, well-validated releases should not stop for a repeated "Production deploy OK?" acknowledgement when the only Production action is the repository's existing reviewed Cloudflare application release caused by merging an eligible pull request.

Cloudflare is the current Production web runtime and release path. Routine Vercel Git builds are intentionally skipped under `docs/VERCEL_COST_CONTROL.md`; Vercel deployment status is informational and is not release evidence while that documented skip remains active.

This is a narrow exception. It does not authorize Production database changes, Secrets / Variables changes, workflow dispatches, paid actions, destructive operations, authentication-boundary changes, new Production-capable workflows, or major product/specification decisions.

## Default

Use a pull request. Never direct-push autonomous work to `main`.

An Agent may merge an eligible PR and allow the normal Cloudflare Production application release triggered by that merge without asking the human again only when both the Auto-Merge Gate and the Standing Production Release Gate below pass in full.

Do not invoke a manual Cloudflare Production deployment, promotion, workflow dispatch, or release-control bypass as a substitute for the normal reviewed merge-triggered release path unless a task explicitly authorizes that exact action.

Do not re-enable routine Vercel Git builds merely to manufacture a Preview or Production status. `docs/VERCEL_COST_CONTROL.md` remains authoritative for Vercel cost-control state.

## Standing Production Release Gate

Every item must be true and evidenced in the PR, exact-head validation, CI, or repository state:

- the Auto-Merge Gate in `docs/AUTO_MERGE_POLICY.md` passes
- exact-head repository CI / code-quality checks required for the diff are successful
- for application/runtime changes, an exact-head Cloudflare non-Production build / Preview or exact version artifact is successful when such a proof is applicable
- runtime-sensitive changes have the repository's exact-head Cloudflare runtime / cache / security proof appropriate to the diff
- a failed or stale deployed-source pin, runtime proof, cache proof, or security proof is not green and must be repaired and revalidated before release
- a non-runtime documentation/test/tooling-only change may mark Cloudflare Preview/runtime proof `N/A` only with a concrete reason showing there is no application/runtime consequence
- the PR is bounded, reviewed, reversible in Git, and has an explicit rollback path
- no unresolved blocking/major reviewer finding remains
- no task-induced test, lint, typecheck, build, Preview/version, runtime, cache, or security regression remains
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
- the merge-triggered Production consequence is only the repository's existing reviewed Cloudflare application release path
- the release can be rolled back by reverting the merge or using the existing reviewed Cloudflare rollback path
- Vercel deployment status is treated as informational/non-authoritative while the unconditional routine-build skip documented in `docs/VERCEL_COST_CONTROL.md` remains active

## Changes normally eligible

When the full gate passes, the standing approval may cover:

- documentation-only changes
- tests and non-Production developer tooling
- presentation/UI changes with no new privileged or write-capable behavior
- bounded application bug fixes or feature changes that use existing approved data/write paths and pass exact-head Cloudflare/CI/review evidence applicable to the diff
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
3. Confirm required repository checks are successful for the exact head SHA.
4. For application/runtime changes, confirm the exact-head Cloudflare non-Production build / Preview or exact version artifact and all runtime/cache/security proofs required by the diff. Treat a stale or failed deployed-source proof as a failed gate, not as `N/A`.
5. Apply this Standing Production Release Gate in full, including the Vercel non-authoritative rule from `docs/VERCEL_COST_CONTROL.md`.
6. Mark the PR ready if needed, then merge using the repository-safe method, normally squash.
7. Allow only the existing reviewed Cloudflare Production application release triggered by the merge. Do not manually dispatch or promote a release by implication.
8. Observe the resulting Cloudflare Production version/build and perform bounded public/runtime smoke appropriate to the change when tooling permits.
9. If the release fails, diagnose without changing Production data/secrets or bypassing release controls. Use a safe reviewed rollback/revert path when clearly available; otherwise stop at the smallest real approval boundary.
10. Record the merge SHA, Cloudflare release disposition, exact-head evidence, and any rollback action in the task result.

A failed required check, Cloudflare Preview/version proof, runtime/cache/security proof, or Production release is not permission to bypass the gate. Repair safely or stop at a true boundary.
