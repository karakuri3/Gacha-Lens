# Company Infrastructure Migration Priority

Updated: 2026-09-04 JST

This document is the company-level authority for the current Vercel -> Cloudflare / Supabase hardening program. Project-local P0 work must not silently replace this order.

## Executive priority order

1. Stop avoidable Vercel spend — DONE for the immediate build-churn incident; keep cost-aware build discipline active.
2. Create Cloudflare parallel environments — ACTIVE / substantially established.
3. Fully validate beach-match-manager on Cloudflare first — CURRENT TOP EXECUTION PRIORITY.
4. Validate Gacha Lens on Cloudflare including Next.js/vinext runtime compatibility — NEXT after Beach acceptance.
5. Validate Supabase hardening in an isolated/rehearsal environment before Production changes.
6. If all acceptance gates pass, cut over `gachalens.com` with rollback ready.
7. Only after stable cutover/rollback proof, downgrade or cancel Vercel Pro.

## Current verified state

### Vercel cost containment
- Build-churn controls were added to Gacha Lens and beach-match-manager.
- The multi-commit docs-only `ignoreCommand` bug was fixed so an unavailable previous SHA fails safe by building rather than causing deployment failure or incorrectly skipping a needed build.
- Do not weaken release/CI/security gates merely to save build cost.

### Cloudflare parallel environment
- Cloudflare account is authenticated and available.
- Beach Cloudflare Pages project exists: `beach-match-manager`.
- Isolated Cloudflare production branch for the POC is `infra/cloudflare-poc`; this is not the public Production cutover.
- Pages build config: `npm run build`, output `dist`, repo root.
- Required browser-safe envs are configured: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`, `VITE_R3_05_NATIVE_MATCH_WRITER=true`, `VITE_R3_05_NATIVE_HISTORY_EDITOR=false`.
- Public isolated URL exists and renders: `https://beach-match-manager.pages.dev/`.
- Deployment source at verification: commit `aebed0155ccef98cfff85547996b06ffab46ea64` on `infra/cloudflare-poc`.
- Beach Draft PR #211 remains open and unmerged.

### Beach validation already proven
- GitHub exact-head Quality Gate for the POC branch previously succeeded.
- Cloudflare deployment succeeded and the app renders through `pages.dev`.
- Direct navigation to `/mypage` returns the SPA instead of a host-level 404, proving Pages SPA fallback behavior for a deep path.
- `public/_headers` on the POC branch preserves CSP, HSTS, nosniff, DENY framing, strict referrer policy, permissions policy, COOP, and DNS prefetch off; CSP allows only the intended Supabase/Sentry endpoints plus self/data/blob where required.
- Cloudflare project currently has no custom domain attached; public Production remains Vercel.

### Beach validation still required before Step 3 can be closed
- Interactive authenticated flow on the Cloudflare URL: sign-up/login/session persistence and logout.
- Supabase-backed read/write smoke using the Cloudflare origin, including a representative native match-write path with the current feature flags.
- Verify history editor remains OFF.
- Verify notifications/profile/follow or other auth-dependent representative flows do not regress.
- Sentry smoke from the Cloudflare origin and absence of CSP blocking.
- Final security-header verification from the served response and final diff/main-drift review.
- Record acceptance evidence, then decide whether PR #211 should be merged; do not attach custom domain yet.

### Gacha Cloudflare state
- Draft PR #235 remains open and unmerged.
- vinext compatibility/build workflow previously succeeded at exact head `3c541b07dc3776b0c5bab6c660dbaa15ce7722db`.
- POC separated Node-only child-process ingestion execution from the web runtime; scheduled ingestion ownership remains GitHub Actions.
- Real Cloudflare Workers runtime/`workers.dev` parity is NOT yet proven.
- No `gachalens.com` DNS/custom-domain cutover has occurred.

### Gacha Supabase egress P0 relationship to this roadmap
- Repeated public product-detail Supabase reads remain a real cost/reliability issue and must be solved before final Gacha cutover/release acceptance if it remains reproducible.
- However, it is subordinate to this company-level sequence: finish Beach Cloudflare acceptance first, then perform Gacha Cloudflare runtime validation while resolving the P0 in the smallest portable way.
- Do not spend additional builds on already-rejected `unstable_cache`/alias variants.
- Prefer a portable solution compatible with eventual Cloudflare runtime; do not introduce a new paid Vercel-only dependency without explicit approval.

### Supabase hardening
- Hardening findings must be rehearsed/isolated before Production changes.
- Do not mechanically remove unused indexes or alter RLS/SECURITY DEFINER functions merely because an advisor emits a warning.
- Beach leaked-password protection remains a settings hardening item.
- Gacha missing FK-covering indexes and extension/schema warnings require workload/rehearsal evidence before Production action.

## Non-negotiable cutover gates

Do not change `gachalens.com`, cancel/downgrade Vercel Pro, or remove the Vercel rollback path until:
1. Beach Cloudflare acceptance is complete.
2. Gacha real Cloudflare runtime parity is complete.
3. Supabase hardening selected changes pass isolated rehearsal.
4. Security headers/auth/data flows/monitoring are verified.
5. Rollback steps are documented and tested/reasonably proven.
6. Production cutover receives applicable approval.
7. Post-cutover smoke and short stability/cost observation pass.

## Thread handoff rule

A new ChatGPT thread working on Gacha Lens or infrastructure must read this file before deciding execution order. If a local P0 document conflicts with this sequence, this company-level priority document wins unless the user explicitly changes the priority.

Immediate next action: finish Step 3, Beach Cloudflare full validation. Do not resume speculative Gacha cache experiments until Beach acceptance is closed or a Beach blocker requires Gacha work in parallel.
