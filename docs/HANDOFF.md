# Gacha Lens Canonical Handoff

Updated: 2026-09-08 JST — Supabase Fair Use restriction active; Production freeze active; repository-only affiliate prerequisites validated

The company infrastructure Final Release/Cutover remains complete. Historical checkpoints remain in `docs/history/` and Git history.

## Resume protocol

If a fresh thread receives only **「Gacha Lens続けて」**:

1. Read this file plus `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `docs/FINAL_CUTOVER_2026-09-05.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch current `main`, Issues #219/#238, Draft PRs #250/#273/#269, their latest comments/reviews, and only the minimum Production evidence required for the next gate.
3. **Do not resume the company infrastructure migration. It is complete.** Cloudflare is the Production runtime and authoritative DNS.
4. **Do not perform a Production workaround for the current Supabase restriction.** The restriction is the delayed effect of historical current-cycle Egress; released P0 mitigations remain technically PASS-like.
5. Non-Production branch/Preview/test/docs/review work is allowed. Production runtime merges and Production DB/schema/data/history changes remain frozen under #219/#238.
6. Do not merge/apply #273 or #269, call affiliate providers, alter Secrets/Variables, dispatch/change workflows, or perform paid/destructive actions without the separate applicable approval/gate.
7. After every major Production/recovery/security/release milestone, synchronize `HANDOFF / STATUS / DECISIONS / TODO` before starting the next major phase.

## Production infrastructure

- Repository: `karakuri3/Gacha-Lens`
- current `main`: `83b0b36e5d0172f3ea6964206edad6480a13b4bb`
- Production URL: `https://gachalens.com`
- Production runtime: Cloudflare Worker `gacha-lens`
- authoritative DNS: Cloudflare
- registrar: Vercel; hosting is non-live rollback artifact only
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)
- old inactive Supabase project `ihcudkfspzuixsqsvoku`: never confuse with Production

## Released Egress mitigation remains valid

PR #249 — shared edge reuse:
- main `397584fabe633b511cc060ae85335dc4e85fa81d`
- Cloudflare Production build SUCCESS
- strict `MISS -> HIT -> HIT` cache proof PASS

PR #251 — scoped unique-path cold reads:
- main `83b0b36e5d0172f3ea6964206edad6480a13b4bb`
- Cloudflare Production build SUCCESS
- representative signal JSON reduction: detail **-65.5%**, related **-48.1%**, rendered semantics preserved

Post-mitigation observation before enforcement showed roughly `25.108 -> 25.114 GB` over ~13.78h, about **0.0104 GB/day org-wide**, far below the internal `<=0.12 GB/day` operating target. The known sitemap/runtime amplifier has not returned to its former regime.

## Supabase Fair Use incident — current truth

Provider-side evidence recorded 2026-09-08 in #219:
- billing cycle: **2026-08-12 -> 2026-09-12**
- plan: Free
- organization state: **All services are restricted**
- reason: **Egress Exceeded**
- organization uncached Egress: **25.242 / 5 GB (505%)**
- organization Cached Egress: **0.087 / 5 GB**
- `gacha-lens-tokyo`: **23.003 GB Egress**
- `beach-match-manager`: **0.444 GB Egress**
- dashboard states project requests can respond with HTTP **402** while restricted

Interpretation:
- Gacha Lens accounts for about 91% of current-cycle organization Egress;
- the restriction is best supported as delayed enforcement of historical pre/post-fix accumulated usage, not proof that the released mitigation failed;
- do not add speculative runtime rewrites solely because restriction is now active;
- do not buy Pro or attempt project/org transfer as quota evasion without a separately approved decision.

## Freeze state

Issue #219: **OPEN — active restriction / post-reset evidence gate**.

Issue #238: **OPEN — Production freeze active**.

Allowed:
- isolated non-main feature/research/design work
- local/disposable DB testing
- Cloudflare/Vercel Preview work that does not mutate Production
- docs/review/planning/static analysis
- low-impact read-only evidence collection

Frozen:
- Production runtime merges to `main`
- Production DB/schema/data/migration-history changes
- DNS/Auth/admin/write-surface changes
- Secrets/Variables changes
- paid plan/billing changes without explicit owner approval
- provider-call/load-generating experiments
- unrelated Production releases intended to bypass restriction

## Repository-only Foundation repair — #273

Draft PR #273: `fix: restore forecast snapshots migration baseline`
- exact head: `42c8f9934a92cda0be5fd58f2dccc7d4db17299c`
- Code Quality `34193107686`: SUCCESS
- vinext `34193107664`: SUCCESS
- Foundation `34193107736`: SUCCESS
- downstream combined proof via #279: SUCCESS
- independent review: **PENDING**
- Production migration/history reconciliation: **NOT AUTHORIZED / POST-FREEZE ONLY**

Purpose: restore `forecast_snapshots` in fresh migration replay immediately before hardening migration `20260904152326`, without editing already-applied historical migrations.

## Repository-only affiliate authorization ledger — #269

Draft PR #269 exact head:
`574a9a4c10c3fd6cd275229c95c9b3adef8de84f`

Current contract:
- durable one-time `(head_sha, batch_digest)` claim
- no plaintext approval storage
- 1..10 targets, two phases each, max three attempts per phase
- serial attempt reservation
- replay/reopen/reset blocked
- discovery-before-affiliate-enrichment
- whole-batch fail-close after terminal/ambiguous/exhausted retry
- service-role-only private ledger
- terminal reasons bound to durable attempt evidence, including `retry_exhausted`

Current proof:
- exact-head Code Quality #278 / run `34195356451`: SUCCESS
- exact-head vinext `34195356549`: SUCCESS
- disposable DB proof #279 / Foundation `34195410881`: SUCCESS including cleanup
- 22 migrations from empty DB
- Foundation **14/14 PASS, skipped 0**
- data-source/ledger DB **11/11 PASS, skipped 0**
- final catalog 0 findings
- FK transaction/rollback/zero residue PASS
- Next production build PASS
- #278 and #279 are closed evidence-only PRs; do not merge them
- independent review: **PENDING**

No provider executor/live affiliate read is authorized. Even eventual #269 merge would not itself authorize provider execution.

A future provider read still requires:
1. independent review of #269;
2. independent review + approved release/reconciliation of #273;
3. #219/#238 post-reset Production gate clearance;
4. fresh #264/#267 rebind to then-current main/data;
5. configuration readiness check without exposing secrets;
6. exact new human provider-read approval.

GitHub Copilot code review has previously been treated in this repository as a billable AI-credit boundary. Do not request it without explicit owner approval. Self-review must not be represented as independent review.

## Next mandatory gate

After the **2026-09-12 billing-cycle reset** and any short provider-side clearing delay:
1. confirm organization/project restriction is actually cleared and no 402 remains;
2. read fresh-cycle **Gacha-filtered** Egress;
3. verify low Free-plan-compatible burn with safety margin;
4. perform minimal public/runtime smoke without load-heavy diagnostics;
5. verify no recurrence of the former amplification;
6. update #219/#238 and these canonical docs from fresh evidence;
7. only then consider reopening Production merges and separately releasing/reconciling #273/#269.

## Cross-project failure-domain follow-up

After restriction clears and a fresh complete backup is green, the existing Beach Supabase project is intended to move to a dedicated Free organization so Beach and Gacha Lens no longer share the same quota/failure domain. This is a future Project Transfer, not a replacement database and not an active-restriction workaround.

## Hard boundaries

- no direct main push
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- no automatic RPC retry
- no paid/destructive action without applicable approval
- no Production DB/schema/data/history mutation by implication
- no provider refresh/write by implication
- no workflow dispatch/change by implication
- no Secrets/Variables change by implication
- consumed prior Production authority remains non-reusable
