# Final Infrastructure Cutover — 2026-09-05

Status: **COMPLETE — NORMAL DEVELOPMENT READY**

This is the final release/cutover record for the company-infrastructure migration lane covering Gacha Lens Cloudflare runtime/P0 cache promotion and the scoped Stage 5 Supabase Production hardening.

## Preconditions — PASS

- Stage 4 Cloudflare runtime / portable P0 cache: PASS.
- Stage 5 Supabase isolated hardening: PASS.
- PR #235 Cloudflare runtime migration: merged to `main`.
- Production Supabase recommended subset: applied and postflight verified.
- PR #247 synchronized the three Production migration files back into Git history.

## Production Supabase closeout — PASS

- server-only target tables with direct anon/authenticated API grants: **0**
- service_role CRUD target coverage: **13/13**
- intentional public tables preserved: **4/4**
- scoped future-object default privileges: Candidate A applied
- `pg_graphql`: removed with non-CASCADE drop after zero application-dependency preflight
- Production migrations synchronized: `20260904152326`, `20260904152339`, `20260904152405`

Intentionally HOLD:
- `pg_net` relocation
- Candidate B role-global PUBLIC function-default revoke
- FK/index work not separately justified for current workload
- unused-index cleanup

## Cloudflare Production release — PASS

- final cutover source main: `dfd70c59d1d880643f3658510a8a4c363eccc2a7`
- Worker: `gacha-lens`
- verified active version: `811ab60a`
- traffic: **100%**
- Cloudflare zone for `gachalens.com`: Active
- authoritative nameservers: `lady.ns.cloudflare.com`, `tony.ns.cloudflare.com`
- apex `gachalens.com`: Worker Custom Domain / Production
- `www.gachalens.com`: Cloudflare proxied placeholder A `192.0.2.1` + Active 301 redirect to apex
- `www` path/query preservation: verified on HTTP and HTTPS
- prior Vercel apex/www/wildcard web A routes: removed
- undeclared test subdomain: DNS resolution fails rather than falling through to Vercel

Domain registration remains at Vercel. Registrar ownership/renewal is intentionally separate from authoritative DNS and web runtime.

## P0 Production smoke — PASS

Verified on the real Production domain after cutover:
- `/`
- `/ranking`
- `/schedule`
- `/series`
- `/stock`
- `/restocks`
- `/robots.txt`
- `/sitemap.xml`
- representative Japanese `/series/[slug]`

The representative series URL that returned a Vercel `x-next-cache-tags` invalid-character 500 before cutover renders successfully through Cloudflare Production.

## Observability / rollback — PASS WITH EXPLICIT LIMITATION

- Cloudflare error metrics inspected for the cutover window: zero errors visible.
- Workers Logs are currently disabled. Therefore this release does **not** claim a Worker log-stream review.
- Cloudflare Deployments exposes prior Worker versions; application rollback can redeploy a known-good prior version.
- Database hardening is independently verified and is not coupled to an application rollback.
- DNS/provider rollback remains possible but is not the first-line rollback after a successful authoritative-DNS cutover.

## Vercel closeout — PASS

Vercel is no longer routine Production hosting for Gacha Lens.

- connected Vercel project `gachalens`: `live: false`
- no `gachalens.com` custom Production domain remains; only Vercel-owned `.vercel.app` domains remain
- latest observed target-production deployment: canceled/non-live
- repository `vercel.json` is set by this closeout to `ignoreCommand: "exit 0"`; per Vercel's documented semantics, exit code 0 skips the build
- automatic Git-triggered Vercel builds are therefore disabled to prevent post-migration build-cost regression
- Vercel project may remain temporarily as a non-live rollback/stabilization artifact
- Vercel remains registrar unless/until a separate transfer decision is made

## Canonical-state gate — PASS ON MERGE OF THIS CLOSEOUT

This closeout updates:
- `docs/HANDOFF.md`
- `docs/STATUS.md`
- `docs/DECISIONS.md`
- `docs/TODO.md`
- this final cutover record
- `docs/VERCEL_COST_CONTROL.md`
- `vercel.json`

The prior four canonical files are preserved byte-for-byte under `docs/history/2026-09-05-pre-final-cutover-*`.

## Final decision

**Company infrastructure migration: COMPLETE.**

**Normal development: READY.**

This does not close unrelated operational work. Issue #219 Supabase Egress measurement remains open until the billed-byte trajectory is actually observed to be controlled. Existing Production/provider/workflow/paid/destructive approval boundaries remain unchanged.
