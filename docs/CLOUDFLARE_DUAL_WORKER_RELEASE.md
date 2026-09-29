# Cloudflare dual-Worker release integrity

Issue: #430 Phase A2

## Authority

Production authority after the final cutover is exactly one Worker:

`gachalens.com -> gacha-lens-public`

The existing `gacha-lens` Worker becomes the App plane. It remains available for exact-head/version inspection and as the Service Binding target, but it must not be treated as a second Production custom-domain authority.

The bootstrap PR does **not** move the custom domain.

## Worker roles

| Route class | Owner | Bootstrap behavior |
| --- | --- | --- |
| Public runtime diagnostics | Public Worker | served directly |
| Public documents planned for Phase A2 | Public Worker | not enabled yet |
| `/review` | conditional | not enabled yet; later cookie-free requests stay public and cookie-bearing requests delegate |
| Review login/logout and review mutation APIs | App Worker | not enabled on Public authority until allowlisted delegation lands |
| Ingestion/admin/internal mutation APIs | App Worker | not enabled on Public authority until allowlisted delegation lands |
| Unknown routes | explicitly rejected | Public bootstrap returns 404; no catch-all proxy |

The source of truth for the bootstrap matrix is `workers/public/src/route-contract.js`.

## Exact source identity

Both planes must embed the full 40-character Git SHA.

App Worker source identity remains:

`/api/runtime-diagnostics/release-source`

Public Worker source identity is:

`/api/runtime-diagnostics/release-source`

and includes `plane: "public"`.

Public -> App delegation proof is:

`/api/runtime-diagnostics/app-delegation`

The delegation diagnostic has no user-controlled target. It calls exactly:

1. App `/api/runtime-diagnostics/release-source`
2. App `/review`

It forwards neither Authorization nor Cookie headers.

A Public/App SHA mismatch returns HTTP 409 and is never normalized to success.

## Pull-request proof

Cloudflare Worker Previews currently cannot bind a Preview of Worker A to the matching Preview of Worker B. A Preview Service Binding calls Worker B's Production deployment.

Therefore a PR must not claim exact-head Service Binding proof from two Cloudflare Previews.

PR gates are split deliberately:

1. Existing App Worker exact-head Cloudflare Preview remains required and unchanged.
2. Public Worker exact-head Cloudflare Preview becomes required after `gacha-lens-public` is connected to the repository.
3. Exact-head Public -> App Service Binding is proven in CI with both Worker configs built from the same checked-out SHA and run together by Wrangler.
4. A live Public Preview binding to the Production App is diagnostic-only. If its App SHA differs from the PR SHA, HTTP 409 is the expected fail-closed result.

This preserves #426 exact-head Preview capability instead of weakening it around a platform limitation.


## Public Worker Workers Builds settings

The Public Worker must be created as `gacha-lens-public`; the dashboard Worker name must match `workers/public/wrangler.jsonc`.

Use the existing GitHub integration and no new repository secret.

Production and preview may share this build command because the release gate skips non-`main` branches:

```sh
npm ci --ignore-scripts --prefix .github/vinext-toolchain &&
node scripts/cloudflare-public-build-gate.mjs &&
node scripts/build-public-worker.mjs
```

Production deploy command:

```sh
.github/vinext-toolchain/node_modules/.bin/wrangler deploy --config workers/public/wrangler.jsonc
```

Until the locked Wrangler toolchain is intentionally reviewed again, PR validation should use a version upload instead of the newer Worker Preview command:

```sh
.github/vinext-toolchain/node_modules/.bin/wrangler versions upload --config workers/public/wrangler.jsonc
```

This keeps the locked `wrangler@4.131.1`; no root dependency or #480 toolchain change is required.

The Public production build command enforces App-before-Public ordering by polling the existing App production source identity for the exact `WORKERS_CI_COMMIT_SHA`. Bounded deploy waiting is release orchestration, not a runtime/cold-request retry.

## Production release order

Production may be called green only in this order:

1. Build App Worker from exact main SHA X.
2. Deploy App Worker X.
3. Read App runtime source identity and require X.
4. Build Public Worker from the same exact main SHA X.
5. Deploy Public Worker X with Service Binding `APP -> gacha-lens`.
6. Read Public runtime source identity and require X.
7. Call Public delegation diagnostic and require App source X.
8. Require `gachalens.com/api/runtime-diagnostics/release-source` to report Public plane, SHA X.
9. Run representative Production QA.
10. Mark exact-main release proof PASS.

Any mixed SHA is failure. Public must never be promoted first.

## Deployment failure behavior

If App X fails to build or deploy, Public X is not deployed.

If App X succeeds but Public X fails, release proof remains failed. Existing Public deployment stays authoritative.

If Public X deploys but binding identity is not App X, release proof fails immediately and Public is rolled back.

Vercel status is not consulted.

## Rollback

Rollback is configuration/version based; database rollback is not required.

1. Roll Public Worker back to its previous known-good version.
2. If the Public deployment or binding is bad, restore its previous `APP` binding configuration.
3. Roll App Worker back to its previous known-good version if App itself caused the failure.
4. During pre-cutover/bootstrap, `gachalens.com` remains on the existing App Worker.
5. After final cutover, custom-domain authority can be returned to the previous App Worker only as an emergency rollback, and release proof must record that the Public-plane authority invariant is temporarily not satisfied.
6. Any Public/App SHA skew is visible through the release identity and delegation diagnostic.

## Free-plan boundary

No Workers Paid feature is required.

Current documented Workers Free limits relevant to Phase A2:

- 100,000 Worker requests/day account limit
- 10 ms CPU per HTTP invocation
- 50 external subrequests per invocation
- 1,000 internal-service subrequests per invocation
- 100 Workers/account
- 20,000 Static Assets files per Worker version

Service Bindings do not add a separate usage charge.

Bootstrap request shape:

- Public diagnostic without delegation: 1 Public invocation, 0 subrequests.
- Delegation diagnostic: 1 Public invocation + 2 fixed App Service Binding calls.
- Future App-owned delegated request: 1 Public invocation + 1 App invocation.
- Future Public-owned document: 1 Public invocation; App invocation 0.

Before custom-domain cutover, cold CPU and subrequest counts must be measured on the real Public Worker.

## Data safety

Bootstrap performs no Supabase access.

Later public rendering may reuse the existing `SUPABASE_SERVICE_ROLE_KEY` only under the separately defined fixed read-only allowlist. This bootstrap does not add or change credentials.

Database constraints for Phase A2:

- Production writes: 0
- schema changes: 0
- RLS changes: 0
- new policies: 0
- new views: 0
- new RPCs: 0
