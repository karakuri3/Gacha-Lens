# Gacha Lens Ordered TODO

Updated: 2026-09-08 JST — active Supabase restriction; Production freeze; repository-only prerequisites validated

The company infrastructure migration is complete. Do not restart it.

## DONE — company infrastructure migration

- [x] move Gacha Lens Production runtime to Cloudflare
- [x] complete authoritative DNS/domain cutover
- [x] stop routine Vercel Git build cost
- [x] complete scoped Supabase Stage 5 hardening
- [x] preserve rollback paths and final cutover evidence

## DONE — technical Egress mitigation

### #249 shared edge reuse
- [x] release bounded shared Cloudflare cache policies
- [x] prove strict Preview `MISS -> HIT -> HIT`
- [x] release to Cloudflare Production
- [x] verify warm same-URL requests do not repeat the former backend bundle

### #251 unique-path cold-read scope
- [x] scope public detail/related signal reads to relevant variant identities
- [x] preserve required set-listing safety semantics
- [x] preserve rendered semantics
- [x] measure representative signal JSON reduction: detail -65.5%, related -48.1%
- [x] remove temporary diagnostics before Production
- [x] release to Cloudflare Production

### Post-release technical observation
- [x] observe ~0.0104 GB/day org-wide burn before enforcement
- [x] confirm known sitemap fingerprint remained nearly flat (`681,256 -> 681,290` over ~36.3h)
- [x] classify original amplification as technically controlled
- [x] keep paid-plan requirement unestablished

## INCIDENT — 2026-09-08 Fair Use restriction

Provider evidence:
- [x] record `All services are restricted`
- [x] record reason `Egress Exceeded`
- [x] record organization Egress `25.242 / 5 GB`
- [x] obtain project attribution: Gacha `23.003 GB`, Beach `0.444 GB`
- [x] determine restriction is best explained by historical current-cycle overage, not renewed post-fix burn
- [x] update #219
- [x] update #238 to Production-freeze state
- [x] avoid speculative Production workaround / paid upgrade / transfer-as-evasion

## ACTIVE P0 — mandatory 2026-09-12 reset gate (#219/#238)

Do not attempt to clear this before fresh provider evidence exists.

After reset and any short provider-side clear delay:
- [ ] confirm organization/project restriction is cleared
- [ ] confirm no HTTP 402 remains
- [ ] read fresh-cycle **Gacha-filtered** uncached Egress
- [ ] measure burn over a meaningful fresh interval
- [ ] verify Free-plan-compatible burn with safety margin
- [ ] perform minimal public/runtime smoke without load-heavy diagnostics
- [ ] confirm no recurrence of the former sitemap/runtime amplifier
- [ ] update #219 with fresh evidence
- [ ] update #238 and close freeze only if all gates are green
- [ ] synchronize #250 canonical docs from the fresh post-reset state

If restriction does not clear after reset:
- [ ] preserve freeze
- [ ] obtain provider-side status/billing evidence before making changes
- [ ] do not buy Pro without separate current-price/terms review + explicit approval
- [ ] do not use organization/project transfer as quota evasion

## ACTIVE GOVERNANCE — #262 / authorized Draft #265

The replacement Cloudflare standing policy is already implemented. Do not recreate it.

Current evidence:
- [x] Cloudflare confirmed as Production runtime
- [x] routine Vercel Git builds intentionally disabled for cost control
- [x] main still has stale Vercel-specific standing release wording
- [x] user explicitly authorized the #262 policy alignment; authorization is recorded in Draft #265
- [x] Draft #265 exact head `c8d671abc9be785f3c6c34a3ff6ceef858e07d3a`
- [x] seven active policy/test files aligned to Cloudflare
- [x] PR Code Quality `34045587975` SUCCESS
- [x] strengthened self-review complete
- [x] independent Reviewer/Verifier packet posted
- [ ] independent Reviewer/Verifier result
- [ ] wait for #219/#238 Production freeze clearance
- [ ] re-fetch main/head and refresh exact-head evidence if stale
- [ ] merge #265 only through the applicable safe path; #265 cannot authorize its own merge
- [ ] close #262 only after the reviewed Cloudflare standing policy is on main

The existing authorization does **not** authorize bypass of #219/#238, manual Cloudflare promotion/dispatch, Production DB/data/schema changes, Secrets/Variables, paid/destructive actions, auth-boundary changes, or new Production-capable lanes.

Do **not** re-enable routine Vercel builds merely to satisfy old wording.

## DONE — #273 repository technical validation

Draft #273 exact head: `42c8f9934a92cda0be5fd58f2dccc7d4db17299c`.

- [x] add `forecast_snapshots` fresh-replay baseline before hardening migration
- [x] avoid editing already-applied historical migrations
- [x] static schema/security/order tests
- [x] DB-backed Production-contract parity proof on disposable Supabase
- [x] Code Quality SUCCESS
- [x] vinext SUCCESS
- [x] Foundation SUCCESS
- [x] prove downstream compatibility with current #269 in #279
- [x] create independent Reviewer packet without moving head

Remaining #273 gates:
- [ ] obtain independent review
- [ ] wait for #219/#238 freeze clearance
- [ ] ensure #265/#262 governance gate is resolved before relying on standing release authority
- [ ] re-read fresh Production catalog + migration history before any release
- [ ] design/approve exact Production migration-history reconciliation
- [ ] explicitly reject blind `db push` if remote/local history still differs
- [ ] apply/reconcile only under a separate Production change approval

## DONE — #269 repository technical validation

Draft #269 exact head: `574a9a4c10c3fd6cd275229c95c9b3adef8de84f`.

- [x] durable one-time authorization claim
- [x] replay/reopen/reset prevention
- [x] 1..10 target / 2-phase / 3-attempt budget enforcement
- [x] serial provider-attempt reservation
- [x] discovery-before-affiliate-enrichment
- [x] whole-batch stop after terminal/ambiguous/exhausted retry
- [x] service-role-only private ledger
- [x] no plaintext approval persistence
- [x] terminal reason/evidence binding including `retry_exhausted`
- [x] stable explicit name for PostgreSQL-truncated constraint
- [x] exact-head Code Quality run `34195356451` SUCCESS
- [x] vinext `34195356549` SUCCESS
- [x] #279 disposable Foundation `34195410881` SUCCESS including cleanup
- [x] 22 migrations from empty DB
- [x] Foundation 14/14 PASS, skip0
- [x] data-source/ledger DB 11/11 PASS, skip0
- [x] final catalog 0 findings
- [x] Next build PASS
- [x] create independent Reviewer packet without moving exact head
- [x] close validation-only #278/#279 without merge

Remaining #269 gates:
- [ ] obtain independent review
- [ ] obtain #273 independent review + approved release/reconciliation
- [ ] wait for #219/#238 freeze clearance
- [ ] ensure #265/#262 release governance is authoritative on main before relying on standing release authority
- [ ] fresh #264 cohort recompute after the relevant main/data state is final
- [ ] fresh #267 provider-read plan bound to then-current main
- [ ] configuration readiness check without exposing secrets
- [ ] obtain exact new human provider-read approval
- [ ] only then consider implementing/running a live provider executor under a separately bounded task

**No provider call or affiliate persistence is currently authorized.**

## Independent review boundary

- [x] strengthened Lead self-review completed
- [x] Reviewer/Verifier packet posted on #265
- [x] Reviewer packet posted on #273/#269
- [ ] independent Reviewer/Verifier result #265
- [ ] independent Reviewer result #273
- [ ] independent Reviewer result #269

Do not mark these complete using another Lead/self-review pass.

GitHub Copilot code review has previously been treated as a billable AI-credit boundary in this repository. Request it only after explicit owner approval. If a non-billable genuinely independent reviewer becomes available, it may be used without weakening the review scope.

## Canonical docs — #250

- [x] update `HANDOFF.md` to 2026-09-08 restriction + #265/#273/#269 state
- [x] update `STATUS.md`
- [x] update `DECISIONS.md`
- [x] update `TODO.md`
- [x] record authorized Draft #265 instead of treating #262 as unimplemented policy work
- [x] unify the post-reset release train in all canonical docs
- [ ] keep #250 Draft while Production freeze is active
- [ ] after post-reset P0 PASS, refresh once more with final evidence before any main merge

## Mandatory post-reset release train

Do not release opportunistically after the restriction clears. Default order:

### 1. P0 closure
- [ ] complete the 2026-09-12 #219/#238 evidence gate
- [ ] synchronize #250 from fresh post-reset evidence

### 2. Release governance — #265
- [ ] independent Reviewer/Verifier
- [ ] refresh exact-head evidence if needed
- [ ] land #265 safely
- [ ] close #262 only after policy is authoritative on main

### 3. CI proof authority — #258
- [ ] re-confirm current deployed Production source
- [ ] repin if Production moved
- [ ] fresh exact-head Code Quality/runtime/cache proof
- [ ] obtain applicable workflow-file approval/review boundary
- [ ] land #258

### 4. Migration reproducibility — #273
- [ ] independent review
- [ ] fresh Production catalog/history parity check
- [ ] approve exact migration-history reconciliation
- [ ] land/reconcile without blind `db push`
- [ ] confirm current-main Foundation baseline green
- [ ] then close #270/#271 if their closure gates are satisfied

### 5. User-value routing — #253
- [ ] rebase/revalidate onto then-current main
- [ ] exact Cloudflare Preview/browser/runtime proof for Japanese category pages
- [ ] release through the then-authoritative policy

### 6. Official-ingestion reliability — #261
- [ ] rebase/revalidate onto then-current main
- [ ] obtain applicable Production approval because the next natural F0 schedule may enter its bounded write path
- [ ] release
- [ ] observe the next **natural** bounded F0 run; do not force a workflow dispatch
- [ ] canonical sync after the natural-run result

### 7. Fresh business scorecard
- [ ] recompute traffic, clicks, affiliate coverage, data freshness and request efficiency
- [ ] if monetization coverage still dominates, proceed `#264 -> #267 -> #269`
- [ ] rebind every layer to then-current main/data
- [ ] never reuse old provider approval tokens

### 8. Data Scale R5 HOLD
- [ ] keep #257/#260 on HOLD unless the fresh scorecard shows depth expansion again outranks monetization coverage

This queue is a planning/order contract only. It grants no merge, Production mutation, workflow change, provider call, Secret/Variable action, or paid operation.

## Cross-project failure-domain follow-up

After restriction clears:
- [ ] obtain a fresh complete Beach backup
- [ ] verify backup is green
- [ ] transfer the **existing** Beach Supabase project to a dedicated Free organization under the Beach workstream
- [ ] verify Beach post-transfer health

Do not create a replacement Beach database and do not transfer during active restriction as a quota-evasion tactic.

## Allowed while freeze is active

- [x] isolated non-main feature/design/research work
- [x] disposable/local tests
- [x] non-Production Preview validation
- [x] docs, review and planning

## HOLD — Production actions

- [ ] DO NOT merge Production runtime changes to `main`
- [ ] DO NOT apply Production DB/schema/data/migration-history changes
- [ ] DO NOT change DNS/Auth/write/admin surfaces by implication
- [ ] DO NOT change Secrets/Variables by implication
- [ ] DO NOT run provider/load-generating experiments
- [ ] DO NOT perform paid plan/billing changes without explicit approval
- [ ] DO NOT reuse consumed prior authority
- [ ] DO NOT dispatch/change workflows without applicable approval
- [ ] DO NOT scrape Mercari or Amazon
- [ ] DO NOT touch `supabase/.temp/cli-latest`
- [ ] keep `.github/workflows/gacha-ingestion.yml` disabled
- [ ] no automatic RPC retry
- [ ] no direct main push
