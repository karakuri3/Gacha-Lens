# Gacha Lens Auto-Merge Policy

Status: authoritative merge exception for Agent OS v1

This policy implements the user's standing preference that safe, reversible pull requests should not require a separate human message saying “merge it” every time.

For merge decisions, this file is explicitly referenced by `AGENTS.md` and overrides older lower-precedence Agent OS text that says every merge must be human-performed. A merge whose only Production consequence is the repository's normal Vercel Production deployment may also proceed without a repeated human acknowledgement only when `docs/PRODUCTION_RELEASE_POLICY.md` passes in full. This does not weaken database, secrets, destructive-action, paid-operation, workflow-dispatch, or major-product-decision boundaries.

## Default

Use a pull request. Never direct-push autonomous work to `main`.

An Agent may move an eligible Draft PR to ready state and merge it to `main` without asking the human again only when the complete Auto-Merge Gate below passes. If merging triggers Vercel Production, the Standing Production Release Gate must also pass.

Default merge method: squash unless repository constraints require another non-destructive method.

## Auto-Merge Gate

Every item must be true and evidenced in the PR or CI:

- the task is bounded, safe, reversible, and non-Production before merge; any Production consequence of merge is limited to an eligible normal Vercel release under `docs/PRODUCTION_RELEASE_POLICY.md`
- acceptance criteria are satisfied
- focused tests pass
- no task-induced regression remains; any baseline/environment limitation is independently classified with evidence
- lint passes
- applicable typecheck passes or is correctly `N/A`
- non-Production build passes, or an unchanged verified environment limitation is documented and unrelated to the diff
- `git diff --check` passes
- the complete diff has been reviewed and contains no unexpected changes
- secret scan/review finds no secret values
- Production actions before merge: 0
- Production DB writes/migrations/backfills/cleanup/schema actions: 0
- workflow dispatches: 0
- Secrets / Variables changes: 0
- paid operations: 0
- destructive or irreversible actions: 0
- direct `main` pushes: 0
- no unresolved blocking/major Reviewer finding remains
- no material conflict with authoritative project docs remains
- required GitHub status checks for the head commit are successful
- the PR is mergeable and its base is current enough that intervening `main` changes have been inspected for overlap
- no stop condition from `AGENTS.md`, `docs/AGENT_OS.md`, the Production Release Policy, or the task contract applies

## Always require human approval

Do not autonomously merge when the PR or required next step includes any of the following:

- a Production deployment or release that is not eligible under `docs/PRODUCTION_RELEASE_POLICY.md`
- Production promotion/gate changes or direct Production writes outside the eligible normal Vercel release
- Production database migration, schema change, backfill, cleanup, seed, reset, or data mutation
- GitHub Actions `workflow_dispatch`
- Repository, Vercel, Supabase, or other Secrets / Variables changes
- a new or materially changed Production-capable workflow/schedule/cron/automatic ingestion lane
- external paid action or purchase
- destructive cleanup, irreversible action, broad deletion, or shared-history rewrite
- direct push to `main`
- a major product/specification decision or unresolved material ambiguity
- changes to Agent OS, Auto-Merge, or Production Release safety/approval boundaries, unless the current explicit human request authorizes that exact policy change
- any task whose risk cannot be confidently classified as safe and reversible

## Merge procedure

1. Re-fetch and inspect the latest `main` before final merge.
2. Reconcile relevant base drift without force-pushing shared history.
3. Run or confirm the full Agent Done Gate and Auto-Merge Gate.
4. If merge triggers Vercel Production, also run the complete Standing Production Release Gate.
5. Confirm required GitHub checks are successful and no blocking review remains.
6. Mark the PR ready if it is still Draft.
7. Merge using the repository-safe merge method, normally squash.
8. If authorized by the Production Release Policy, allow and observe the normal Vercel Production deployment.
9. Record the merged PR, merge SHA, and release disposition in the task result.
10. Do not automatically delete branches/worktrees unless a separate safe cleanup policy explicitly allows it.

If any gate fails, return to the normal autonomous repair loop when the failure is safely repairable. Ask the human only when a true approval/stop boundary is reached.

## Queue meaning

`Ready for Human` should be interpreted narrowly as “a human decision is actually required.” A PR that satisfies the Auto-Merge Gate and, when applicable, the Standing Production Release Gate should proceed from Verification through merge/release without waiting for a routine human acknowledgement.
