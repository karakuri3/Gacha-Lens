# Gacha Lens Status

Updated: 2026-09-06 JST — Egress amplification technically mitigated; historical billing-cycle risk remains

The company infrastructure migration remains complete. The full pre-cutover checkpoint is preserved at `docs/history/2026-09-05-pre-final-cutover-STATUS.md` and in Git history.

## Executive state

- Company infrastructure migration: **COMPLETE**.
- Production web runtime: Cloudflare Worker `gacha-lens` on `https://gachalens.com`.
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`).
- Issue #219 Supabase Egress: **TECHNICAL MITIGATION PASS / BILLING-CYCLE STABILIZATION OPEN**.
- Issue #238 change freeze: **PARTIALLY RELAXED** — non-Production development allowed; Production runtime merges remain frozen.
- Issue #239 implementation lane: **CLOSED / COMPLETED** by #249 + #251.
- Normal feature development: **allowed on isolated branches/Previews**; routine Production runtime releases wait for #219 final gate.

## Production mitigation — PASS

### PR #249 — shared edge reuse

- main commit: `397584fabe633b511cc060ae85335dc4e85fa81d`
- Cloudflare Production build: `f1d61310-7e7e-44f5-8c3e-4eb791aca5ac` — SUCCESS
- strict Preview cache proof: byte-identical `MISS -> HIT -> HIT`
- expensive discovery roots bounded by shared Cloudflare cache policies
- Japanese detail and public runtime smoke PASS

### PR #251 — unique-path cold-read scope

- explicitly approved and squash-merged to main: `83b0b36e5d0172f3ea6964206edad6480a13b4bb`
- Cloudflare Production build: `6a86ca27-a105-410b-8862-308e4a2aca8e` — SUCCESS
- Production version: `00e608fa-153c-40ef-b8b9-d5700c270066`
- detail/related public signal reads scoped to relevant `variant_id` / `matched_variant_id` identities
- series-level set listings that require persisted safety metadata remain preserved
- bounded Preview A/B preserved rendered semantics while reducing representative signal JSON by **65.5% on detail** and **48.1% on related**
- temporary diagnostics removed before Production candidacy

A controlled same-URL Production detail reload repeated three times produced one observed detail-shaped backend bundle rather than three separately repeated warm bundles, consistent with edge reuse. Distinct cold product paths can still produce scoped backend work by design.

## Supabase Usage — current truth

Current organization Usage:
- plan: Free
- billing cycle: 2026-08-12–2026-09-12
- uncached Egress: **25.114 GB / 5 GB**
- Cached Egress: **0.085 GB / 5 GB**
- Supabase banner: **Grace period is over**
- HTTP 402: **not currently observed**

Post-#249 Production baseline was 25.108 GB around 02:31 JST. By ~16:18 JST Usage was 25.114 GB: +0.006 GB over ~13.78h.

Approximate org-wide observed rate:
- **0.00044 GB/hour**
- **0.0104 GB/day**

This is far below the conservative operating target `<=0.12 GB/day` and is strong evidence that the original read-amplification problem is technically controlled.

Important distinction: the 25.114 GB cumulative value contains historical pre-fix traffic and cannot be reduced retroactively. The remaining risk is current-cycle Fair Use enforcement before the billing-cycle reset, not an identified unresolved read amplifier.

## Current decision

- edge/shared-cache implementation: **PASS**
- unique-path cold-read reduction: **PASS**
- post-release burn rate: **PASS-like with large margin**
- paid plan required: **NOT ESTABLISHED**
- historical current-cycle 402 risk: **OPEN until cleared**
- #219: keep OPEN for the residual billing-cycle gate
- #238: keep OPEN but partially relaxed
- #239: CLOSED / completed

## Allowed now

- feature/design/research work on non-main branches
- Cloudflare Preview validation
- tests, docs, reviews, planning
- work that does not mutate Production resources or obscure the P0 observation window

## Still frozen until #219 final gate

- Production runtime merges to `main`
- Production DB/schema/data changes
- DNS/Auth/write/admin-surface changes
- Secrets/Variables changes
- paid plan/billing changes without explicit approval
- unrelated Production migrations or load-generating experiments

## Final gate

Prefer final closure after the 2026-09-12 billing-cycle reset confirms:
1. no HTTP 402/Fair Use restriction;
2. Egress quota resets as expected;
3. low post-reset burn remains compatible with the Free plan;
4. #219 and #238 can be closed and routine Production development fully reopened.

Do not buy a paid plan merely to erase historical usage. Any paid-plan change requires current evidence and explicit owner approval.

## Production infrastructure state remains valid

- authoritative DNS: Cloudflare (`lady.ns.cloudflare.com`, `tony.ns.cloudflare.com`)
- apex: Worker Custom Domain -> `gacha-lens`
- `www`: Cloudflare 301 redirect to apex with path/query preservation
- Vercel: registrar and non-live rollback artifact only; routine Git builds disabled
- Stage 5 Supabase hardening recommended subset: applied and verified
- Workers Logs: disabled; do not claim log-stream review
- Cloudflare deployment history retains prior versions for rollback

## Approval boundaries

- no direct main push
- no paid/destructive action without applicable approval
- no Production DB/schema/data mutation by implication
- no workflow dispatch/change by implication
- no Secrets/Variables change by implication
- consumed #228 authority remains non-reusable
- keep `.github/workflows/gacha-ingestion.yml` disabled
- never touch `supabase/.temp/cli-latest`
- no automatic RPC retry
