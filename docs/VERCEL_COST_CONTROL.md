# Vercel cost control after Cloudflare cutover

Status: Production hosting migrated to Cloudflare on 2026-09-05.

## Automatic Git builds

`vercel.json` uses:

```json
"ignoreCommand": "exit 0"
```

Vercel documents exit code 0 for `ignoreCommand` as **ignore/skip the build** and exit code 1 as continue. Therefore routine Git pushes/PRs must not create Vercel builds after this checkpoint.

This supersedes the old policy that skipped Markdown-only builds but still built code/config changes. That old policy was appropriate while Vercel was Production; it is no longer appropriate after Cloudflare became Production.

## Current role of Vercel

- Vercel is **not** the Production runtime for `gachalens.com`.
- The `gachalens` Vercel project may remain temporarily as a non-live rollback/stabilization artifact.
- Only Vercel-owned `.vercel.app` domains remain attached in the connected project snapshot; `gachalens.com` is not a Vercel custom Production domain.
- A manual rollback/re-activation is a separate deliberate action. Do not weaken the automatic build skip merely to obtain routine previews.

## Registrar is separate

The `gachalens.com` registration/renewal remains at Vercel while authoritative DNS and runtime are Cloudflare. Do not delete or transfer the registered domain merely because hosting moved.

`_domainconnect.gachalens.com -> _domainconnect.vercel-dns.com` may remain while Vercel is registrar; it is not a Production web route.

## Future changes

Do not remove the unconditional build skip unless one of these is explicitly true:
1. Vercel is being used for a deliberate rollback rehearsal/incident response;
2. the company has made a new hosting decision with current cost evidence; or
3. a bounded one-off Vercel build is specifically approved and the skip is restored immediately afterward.

Normal application Preview/Production validation now belongs to the Cloudflare release path and repository CI.
