# Gacha Lens Canonical Handoff

Updated: 2026-09-06 JST — technical Egress P0 mitigation PASS; current-cycle Fair Use risk remains

The company infrastructure Final Release/Cutover remains complete. The pre-final-cutover checkpoint is preserved at `docs/history/2026-09-05-pre-final-cutover-HANDOFF.md` and in Git history.

## Resume protocol

If a fresh thread receives only **「Gacha Lens続けて」**:

1. Read this file plus `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `docs/FINAL_CUTOVER_2026-09-05.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch current `main`, Issues #219/#238, recent PRs, Cloudflare Production state, and the minimum Supabase evidence needed for the next gate.
3. **Do not resume the company infrastructure migration. It is complete.** Cloudflare is the Production runtime and authoritative DNS.
4. Do not recreate P0 implementation work: #249 and #251 are already merged and live; implementation Issue #239 is closed/completed.
5. Issue #219 remains open only for historical current-billing-cycle/Fair Use stabilization. Issue #238 is partially relaxed: non-Production feature work may proceed; Production runtime merges remain frozen until #219 final gate.
6. Production data writes, migrations/schema/backfills, provider execution, workflow dispatch/change, Secrets/Variables, paid/destructive actions, and ineligible merges/releases still require their applicable approval. Consumed #228 authority remains non-reusable.
7. After every future major Production/recovery/security/release milestone, synchronize `HANDOFF / STATUS / DECISIONS / TODO` before the next major phase.

## Current Production state

- Repository: `karakuri3/Gacha-Lens`
- Production URL: `https://gachalens.com`
- Production runtime: Cloudflare Worker `gacha-lens`
- authoritative DNS: Cloudflare
- registrar: Vercel; hosting is non-live rollback artifact only
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)
- old inactive Supabase project `ihcudkfspzuixsqsvoku`: never confuse with Production

### Released P0 commits

PR #249 — shared edge reuse:
- main `397584fabe633b511cc060ae85335dc4e85fa81d`
- Cloudflare Production build `f1d61310-7e7e-44f5-8c3e-4eb791aca5ac` — SUCCESS
- strict Preview proof `MISS -> HIT -> HIT`

PR #251 — scoped unique-path cold reads:
- explicitly approved and squash-merged to main `83b0b36e5d0172f3ea6964206edad6480a13b4bb`
- Cloudflare Production build `6a86ca27-a105-410b-8862-308e4a2aca8e` — SUCCESS
- Production version `00e608fa-153c-40ef-b8b9-d5700c270066`

## What is now live

- expensive `/categories`, `/brands`, `/franchises` no-query roots: 24h shared Cloudflare cache
- `/series` no-query and first-page facet landings: 30m shared cache
- series detail: 30m shared cache
- sitemap documents: 24h shared cache
- query/search/pagination/auth/cookie/Next-internal requests remain outside the bounded shared-document policy
- known branded error HTML is not promoted into shared cache
- detail/related signal reads use relevant `variant_id` / `matched_variant_id` scope instead of broad sibling-series signal hydration
- series-level complete/partial/popular set listings retain required persisted safety metadata
- public Supabase coordinates resolve environment-first with safe public fallback; service-role credentials remain environment-only

## Verification evidence

Pre-Production / Preview:
- repository test/lint and vinext compatibility PASS
- exact Cloudflare Preview build PASS
- Japanese detail/related semantics PASS
- strict byte-identical `MISS -> HIT -> HIT` proof PASS
- bounded A/B for #251 preserved semantic snapshots while reducing representative signal JSON by **65.5% on detail** and **48.1% on related**
- temporary diagnostic route removed before Production candidacy

Post-Production:
- #249 and #251 Cloudflare main builds both succeeded
- representative Japanese detail renders full live data
- controlled same-URL Production detail reload repeated three times produced one observed backend detail bundle rather than three separately repeated warm bundles, consistent with edge reuse
- distinct cold product paths can still cause scoped backend work by design
- no HTTP 402 currently observed

Workers Logs remain disabled; this handoff does **not** claim a Workers log-stream review.

## Supabase Egress final operational gate

Current organization Usage:
- Free plan
- cycle: 2026-08-12–2026-09-12
- uncached Egress: **25.114 GB / 5 GB**
- Cached Egress: **0.085 GB / 5 GB**
- banner: **Grace period is over**

Post-#249 Production baseline was 25.108 GB around 02:31 JST. By ~16:18 JST Usage was 25.114 GB: +0.006 GB over ~13.78h.

Observed approximate org-wide rate:
- **0.00044 GB/hour**
- **0.0104 GB/day**

This is far below the conservative `<=0.12 GB/day` target and is strong evidence the technical amplification is controlled.

The remaining risk is historical current-cycle state: the 25.114 GB cumulative usage cannot be rolled back, and Supabase says grace is over. Until that legacy overage risk clears, do not declare the operational P0 fully closed.

Current classification:
- #249 shared edge mitigation: **DONE / Production PASS**
- #251 scoped cold-read mitigation: **DONE / Production PASS**
- post-release burn rate: **PASS-like with large margin**
- paid plan required: **NOT ESTABLISHED**
- #219: **OPEN — billing-cycle/Fair Use stabilization only**
- #238: **OPEN / PARTIALLY RELAXED**
- #239: **CLOSED / COMPLETED**

## Development boundary now

Allowed:
- normal feature/design/research work on isolated branches
- Cloudflare Preview deployments and tests
- docs/review/planning
- non-Production work that does not obscure the P0 observation signal

Still frozen:
- Production runtime merges to `main`
- Production DB/schema/data changes
- DNS/Auth/write/admin surface changes
- Secrets/Variables changes
- unrelated Production load/migration experiments
- paid plan/billing changes without explicit approval

## Next action when resuming

Continue read-only monitoring of Supabase Usage/project health. Prefer final closure after the **2026-09-12 billing-cycle reset** confirms:
1. no 402 restriction;
2. quota resets as expected;
3. post-reset burn remains Free-plan compatible.

On final PASS:
1. record final evidence and close #219;
2. close #238 and fully reopen routine Production development;
3. finalize canonical docs / Draft docs PR #250 under its merge approval boundary;
4. explicitly state that this P0 thread is complete and normal Gacha Lens Production development may resume.

If 402 appears before reset:
- keep #219/#238 open;
- verify whether reset clears it;
- do not upgrade to Pro without separate explicit owner approval.

## Hard boundaries

- no direct main push
- no paid/destructive action without applicable approval
- no Production DB/schema/data mutation by implication
- no provider refresh/write by implication
- no workflow dispatch/change by implication
- no Secrets/Variables change by implication
- keep `.github/workflows/gacha-ingestion.yml` disabled
- never touch `supabase/.temp/cli-latest`
- no automatic RPC retry
