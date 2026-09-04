# Final Infrastructure Cutover — 2026-09-05

Status: CUTOVER IN PROGRESS

This record intentionally triggers the first `main` build after the Cloudflare CI/CD safety guard was converted from the Stage 4 POC-only commands to normal production-branch behavior.

## Preconditions

- Stage 4 Cloudflare runtime / portable P0 cache: PASS.
- Stage 5 Supabase isolated hardening: PASS.
- PR #235 Cloudflare runtime migration: merged to `main`.
- Production Supabase hardening applied and postflight verified.
- PR #247 synchronized the three Production migration files back into Git history.

## Production Supabase postflight

- server-only target tables with direct anon/authenticated API grants: 0
- service_role CRUD target coverage: 13/13
- intentional public tables preserved: 4/4
- `pg_graphql`: removed with non-CASCADE drop after zero application reference preflight
- intentionally HOLD: `pg_net` relocation, Candidate B global PUBLIC function-default revoke, FK-index work, unused-index cleanup

## Cloudflare cutover gate

Cloudflare build configuration now uses `main` as the Production branch. The POC-only shell guard has been removed from the build/deploy/version commands. Non-production branches remain version/preview builds rather than Production deploys.

Final completion is gated on:
1. this exact `main` commit building and deploying successfully on Cloudflare,
2. `gachalens.com` and `www.gachalens.com` being served by the intended Cloudflare Worker,
3. P0 smoke of homepage, stock/restock paths, and representative `/series/[slug]`, including the URL that returned a Vercel `x-next-cache-tags` 500 before cutover,
4. Production error/log check and rollback path confirmation,
5. canonical handoff/state documents being marked normal-development-ready.
