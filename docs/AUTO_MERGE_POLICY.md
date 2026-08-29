# Gacha Lens Auto-Merge Policy

Status: authoritative merge exception for Agent OS v1

This policy implements the user's standing preference that safe, reversible, non-Production pull requests should not require a separate human message saying “merge it” every time.

For merge decisions, this file is explicitly referenced by `AGENTS.md` and overrides older lower-precedence Agent OS text that says every merge must be human-performed. It does not weaken any Production, secrets, destructive-action, paid-operation, workflow-dispatch, or major-product-decision boundary.

## Default

Use a pull request. Never direct-push autonomous work to `main`.

An Agent may move an eligible Draft PR to ready state and merge it to `main` without asking the human again only when the complete Auto-Merge Gate below passes.

Default merge method: squash unless repository constraints require another non-destructive method.

## Auto-Merge Gate

Every item must be true and evidenced in the PR or CI:

- the task is bounded, safe, reversible, and non-Production
- acceptance criteria are satisfied
- focused tests pass
- no task-induced regression remains; any baseline/environment limitation is independently classified with evidence
- lint passes
- applicable typecheck passes or is correctly `N/A`
- non-Production build passes, or an unchanged verified environment limitation is documented and unrelated to the diff
- `git diff --check` passes
- the complete diff has been reviewed and contains no unexpected changes
- secret scan/review finds no secret values
- Production actions: 0
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
- no stop condition from `AGENTS.md`, `docs/AGENT_OS.md`, or the task contract applies

## Always require human approval

Do not autonomously merge when the PR or required next step includes any of the following:

- Production deployment, promotion, gate change, or Production write
- Production database migration, schema change, backfill, cleanup, seed, reset, or data mutation
- GitHub Actions `workflow_dispatch`
- Repository, Vercel, Supabase, or other Secrets / Variables changes
- a new or materially changed Production-capable workflow/schedule
- external paid action or purchase
- destructive cleanup, irreversible action, broad deletion, or shared-history rewrite
- direct push to `main`
- a major product/specification decision or unresolved material ambiguity
- changes to Agent OS safety/approval boundaries, unless the current explicit human request authorizes that exact policy change
- any task whose risk cannot be confidently classified as safe, reversible, and non-Production

## Merge procedure

1. Re-fetch and inspect the latest `main` before final merge.
2. Reconcile relevant base drift without force-pushing shared history.
3. Run or confirm the full Agent Done Gate and Auto-Merge Gate.
4. Confirm required GitHub checks are successful and no blocking review remains.
5. Mark the PR ready if it is still Draft.
6. Merge using the repository-safe merge method, normally squash.
7. Record the merged PR and merge SHA in the task result.
8. Do not automatically delete branches/worktrees unless a separate safe cleanup policy explicitly allows it.

If any gate fails, return to the normal autonomous repair loop when the failure is safely repairable. Ask the human only when a true approval/stop boundary is reached.

## Queue meaning

`Ready for Human` should be interpreted narrowly as “a human decision is actually required.” A PR that satisfies this Auto-Merge Gate should proceed from Verification to merge without waiting for a routine human acknowledgement.
