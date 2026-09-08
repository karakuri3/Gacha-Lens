# Gacha Lens Status

Updated: 2026-09-08 JST — Production Supabase restriction active; non-Production development allowed; repository-only prerequisites validated

## Executive state

- Company infrastructure migration: **COMPLETE**.
- Production runtime: Cloudflare Worker `gacha-lens` on `https://gachalens.com`.
- Production `main`: `83b0b36e5d0172f3ea6964206edad6480a13b4bb`.
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`).
- Issue #219: **OPEN — Fair Use restriction/post-reset gate**.
- Issue #238: **OPEN — Production freeze ACTIVE**.
- Issue #262: **OPEN — replacement policy is implemented in authorized Draft #265, but independent review + post-freeze landing remain pending**.
- Draft #265 exact head: `c8d671abc9be785f3c6c34a3ff6ceef858e07d3a`; Code Quality PASS; independent Reviewer/Verifier pending.
- P0 runtime amplification mitigation #249/#251: **RELEASED / TECHNICALLY PASS**.
- Routine Production runtime/DB changes: **FROZEN**.
- Isolated non-Production feature/research/docs/review/test work: **ALLOWED**.
- #273 Foundation repair: **repository validation PASS / independent review pending / Production history reconciliation not authorized**.
- #269 affiliate authorization ledger: **repository validation PASS / independent review pending / provider execution not authorized**.

## Egress mitigation — still technically valid

### #249 — shared edge reuse
- main `397584fabe633b511cc060ae85335dc4e85fa81d`
- Production Cloudflare build SUCCESS
- strict Preview `MISS -> HIT -> HIT` PASS

### #251 — unique-path cold-read scope
- main `83b0b36e5d0172f3ea6964206edad6480a13b4bb`
- Production Cloudflare build SUCCESS
- representative signal JSON reduction: detail **65.5%**, related **48.1%**
- rendered semantics preserved

Before restriction enforcement, observed organization burn was about **0.0104 GB/day**, far below the internal `<=0.12 GB/day` target. The known sitemap fingerprint also remained almost flat: `681,256 -> 681,290` over ~36.3h (+34, under 1 call/hour average), with no stats reset.

## Supabase Fair Use restriction — current truth

Provider-side evidence recorded 2026-09-08:
- cycle: **2026-08-12 -> 2026-09-12**
- plan: Free
- state: **All services are restricted**
- reason: **Egress Exceeded**
- organization Egress: **25.242 / 5 GB (505%)**
- Cached Egress: **0.087 / 5 GB**
- Gacha Lens project Egress: **23.003 GB**
- Beach project Egress: **0.444 GB**
- provider warns requests may return HTTP **402**

Interpretation:
- Gacha Lens is the dominant historical contributor to this cycle's shared-org Egress;
- post-mitigation burn evidence remains low;
- restriction is best classified as delayed current-cycle enforcement, not evidence of renewed runtime amplification;
- do not make speculative Production rewrites or paid-plan changes solely to work around this historical-cycle state.

## Freeze boundary

Allowed:
- isolated branches
- disposable/local DB validation
- Preview deployments that do not mutate Production
- static/repository testing
- docs/review/planning
- low-impact read-only observation

Frozen:
- Production runtime merges to `main`
- Production DB/schema/data/migration-history changes
- DNS/Auth/write/admin changes
- Secrets/Variables changes
- paid billing/plan actions without explicit approval
- provider experiments or load-generating diagnostics

## Release governance — #262 / Draft #265

Cloudflare is now the live Production runtime, but current main still carries standing Vercel-specific release wording. Routine Vercel Git builds remain intentionally disabled after cutover for cost control.

The replacement policy has already been implemented in **authorized Draft #265**:
- exact head `c8d671abc9be785f3c6c34a3ff6ceef858e07d3a`;
- explicit #262 policy-change authorization is recorded in the PR;
- seven active policy/test files aligned to Cloudflare;
- Code Quality `34045587975`: SUCCESS;
- self-review and independent Reviewer/Verifier packet present;
- independent Reviewer/Verifier result: **PENDING**;
- mergeable: true.

Current classification: **IMPLEMENTED / VALIDATED / NOT YET AUTHORITATIVE ON MAIN**.

The narrow prior policy-change authorization does not bypass the active freeze or authorize #265 to merge/release itself. After #219/#238 clear, re-fetch main/head, refresh exact-head evidence if needed, obtain genuine independent review (or a fresh #265-specific substitution if explicitly granted), then land #265 through the applicable safe path. Only after that should #262 close and standing Cloudflare release authority be relied upon.

Do not re-enable Vercel builds merely to satisfy stale wording.

## #273 Foundation repair

Draft #273 exact head: `42c8f9934a92cda0be5fd58f2dccc7d4db17299c`.

Evidence:
- Code Quality `34193107686`: SUCCESS
- vinext `34193107664`: SUCCESS
- Foundation `34193107736`: SUCCESS
- downstream combined disposable proof #279: SUCCESS

Purpose: restore the Production-existing `forecast_snapshots` baseline before the hardening migration so fresh repository replay succeeds without editing already-applied historical migrations.

Remaining:
- independent review
- post-freeze fresh Production catalog parity check
- separately approved migration-history reconciliation strategy
- no blind Production `db push`

## #269 durable affiliate provider-read authorization ledger

Exact head: `574a9a4c10c3fd6cd275229c95c9b3adef8de84f`.

Evidence:
- exact-head Code Quality `34195356451`: SUCCESS
- exact-head vinext `34195356549`: SUCCESS
- disposable Foundation #279 / `34195410881`: SUCCESS including cleanup
- empty DB: 22 migrations applied
- Foundation: **14/14 PASS, skipped 0**
- data-source/ledger DB: **11/11 PASS, skipped 0**
- final catalog: 0 findings
- Next build: PASS

Key safety properties:
- atomic one-time exact head/digest claim
- no plaintext approval storage
- replay/reopen/reset blocked
- 1..10 targets × two phases × max three attempts
- discovery-before-enrichment
- serial attempt reservation
- whole-batch fail-close on terminal/ambiguous/exhausted retry
- terminal reason/evidence binding (`provider_terminal_failure`, `ambiguous_transport`, `retry_exhausted`)
- service-role-only private ledger

Remaining:
- independent review
- #273 release/reconciliation gate
- #219/#238 freeze clearance
- #265/#262 release-governance resolution before standing release authority is usable
- fresh #264/#267 rebind
- configuration readiness preflight
- exact new human provider-read approval

Provider calls/persistence are **NOT AUTHORIZED**.

## Mandatory post-reset order

After the **2026-09-12 reset** and any provider clear delay:
1. close the P0 evidence gate: no 402, fresh Gacha-filtered Egress low, minimal smoke green, no amplification recurrence; update #219/#238/#250;
2. independently review/revalidate and land #265, then close #262;
3. revalidate and land #258 so runtime/cache proof is pinned to the then-current deployed source, under its workflow-change boundary;
4. independently review #273, re-read Production catalog/history, approve the exact reconciliation strategy, then land/reconcile without blind `db push`;
5. rebase/revalidate #253 and release the Japanese stored-category routing fix;
6. rebase/revalidate #261, obtain the applicable Production approval, release, then observe the next natural bounded F0 run without forcing it;
7. recompute the business scorecard. If monetization coverage still dominates, proceed `#264 -> #267 -> #269` with fresh main/data binding and no reused approval token;
8. keep R5 Data Scale `#257/#260` on HOLD unless fresh evidence makes depth expansion higher priority.

This order does not itself authorize any merge, Production mutation, workflow change, provider call, Secret/Variable action, or paid operation.

## Production infrastructure remains otherwise valid

- authoritative DNS: Cloudflare
- apex: Worker Custom Domain -> `gacha-lens`
- `www`: Cloudflare redirect to apex
- Vercel: registrar and non-live rollback artifact only
- Stage 5 Supabase hardening recommended subset: applied and verified
- Workers Logs: disabled; do not claim a Worker log-stream review

## Hard approval boundaries

- no direct main push
- no paid/destructive action without approval
- no Production DB/schema/data/history mutation by implication
- no workflow dispatch/change by implication
- no Secrets/Variables change by implication
- keep `.github/workflows/gacha-ingestion.yml` disabled
- never touch `supabase/.temp/cli-latest`
- no automatic RPC retry
